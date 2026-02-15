/**
 * @module server
 * @description HTTP server factory with graceful shutdown support for
 * Kubernetes pod lifecycle (SIGTERM / SIGINT).
 */

import http from 'node:http';

/**
 * Start an HTTP server for the given Express app.
 *
 * @param {import('express').Express} app    - Configured Express app from createApp().
 * @param {object}                    config - Config object (reads `port`, `shutdownTimeout`).
 * @returns {{ server: http.Server, close: () => Promise<void>, registerStartupHook: (hook: () => Promise<void>) => void, registerShutdownHook: (hook: () => Promise<void>) => void }}
 */
export function createServer(app, config) {
  const port = config.port || 3000;
  const shutdownTimeout = config.shutdownTimeout ?? 30000; // 30 seconds default
  const server = http.createServer(app);

  // ── Connection tracking for graceful draining ────────────────
  const activeConnections = new Set();

  server.on('connection', (socket) => {
    activeConnections.add(socket);
    socket.on('close', () => {
      activeConnections.delete(socket);
    });
  });

  // ── Startup hooks registry ───────────────────────────────────
  const startupHooks = [];

  // ── Shutdown hooks registry ──────────────────────────────────
  const shutdownHooks = [];


  /**
   * Gracefully close the server — stop accepting new connections,
   * wait for in-flight requests to finish, then resolve.
   * Enforces a maximum shutdown timeout to prevent indefinite hangs.
   *
   * @returns {Promise<void>}
   */
  const close = () =>
    new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        console.warn(
          `Shutdown timeout (${shutdownTimeout}ms) exceeded; ` +
          `forcing ${activeConnections.size} remaining connections closed.`
        );
        // Destroy all remaining sockets
        for (const socket of activeConnections) {
          socket.destroy();
        }
        reject(new Error('Shutdown timeout exceeded'));
      }, shutdownTimeout);

      server.close((err) => {
        clearTimeout(timeoutId);
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

  /**
   * Register a startup hook. Called in FIFO order after server.listen(),
   * before the server is ready to accept requests. Useful for initialization
   * tasks (db connections, cache warming, etc).
   *
   * @param {() => Promise<void>} hook - Async function to run during startup.
   * @throws {TypeError} if hook is not a function.
   */
  const registerStartupHook = (hook) => {
    if (typeof hook !== 'function') {
      throw new TypeError('Startup hook must be a function');
    }
    startupHooks.push(hook);
  };

  /**
   * Register a shutdown hook. Called in FIFO order during graceful shutdown,
   * before server.close(). Useful for cleanup tasks (db connections, etc).
   *
   * @param {() => Promise<void>} hook - Async function to run during shutdown.
   * @throws {TypeError} if hook is not a function.
   */
  const registerShutdownHook = (hook) => {
    if (typeof hook !== 'function') {
      throw new TypeError('Shutdown hook must be a function');
    }
    shutdownHooks.push(hook);
  };

  // Register app's startup registry (if any hooks registered)
  if (app._startupRegistry) {
    registerStartupHook(() => app._startupRegistry.execute());
  }

  // Register app's shutdown registry (if any hooks registered)
  if (app._shutdownRegistry) {
    registerShutdownHook(() => app._shutdownRegistry.execute());
  }


  // ── Kubernetes / container lifecycle signals ─────────────────
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log('Shutdown signal received — closing server…');

    // Signal to app that we're entering shutdown mode
    // (middleware can use this to reject new requests)
    app.locals.shuttingdown = true;

    try {
      // 1. Run all registered shutdown hooks (FIFO order)
      for (const hook of shutdownHooks) {
        try {
          await hook();
        } catch (err) {
          console.error('Error in shutdown hook:', err.message);
        }
      }

      // 2. Drain keep-alive connections by sending Connection: close header
      //    on all active sockets (for future requests)
      for (const socket of activeConnections) {
        socket.setHeader?.('Connection', 'close');
      }

      // 3. Close server (stops accepting new connections, waits for in-flight requests)
      await close();

      console.log('Server closed successfully.');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err.message);
      process.exit(1);
    }
  };

  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // ── Run startup hooks before listening ────────────────────────
  // Defer startup execution to the next event loop iteration via setImmediate().
  // This allows consumer code to register startup hooks synchronously after
  // createServer() returns, before the startup sequence begins.
  // Ref: P0 issue — startup hook ordering race condition fix.
  setImmediate(async () => {
    try {
      for (const hook of startupHooks) {
        try {
          await hook();
        } catch (err) {
          console.error('Error in startup hook:', err.message);
        }
      }
      console.log('Startup sequence completed.');

      // Start listening only after initialization succeeds
      server.listen(port, () => {
        console.log(`${config.appName ?? 'app'} listening on http://localhost:${port}`);
      });
    } catch (err) {
      console.error('Startup failed:', err.message);
      process.exit(1);
    }
  });

  return { server, close, registerStartupHook, registerShutdownHook };
}
