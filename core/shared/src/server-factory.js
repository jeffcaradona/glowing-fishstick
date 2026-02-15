/**
 * @module server
 * @description HTTP server factory with graceful shutdown support for
 * Kubernetes pod lifecycle (SIGTERM / SIGINT).
 */

import http from 'node:http';

import { getRegistries } from './registry-store.js';
import { createLogger } from './logger.js';

/**
 * Start an HTTP server for the given Express app.
 *
 * @param {import('express').Express} app    - Configured Express app from createApp().
 * @param {object}                    config - Config object (reads `port`, `shutdownTimeout`).
 * @returns {object} Object with `server`, `close`, `registerStartupHook`, and
 *   `registerShutdownHook` properties. `close()` returns a Promise<void> for graceful
 *   shutdown; hooks receive and return Promise<void>.
 *
 * @description On SIGTERM/SIGINT, the app emits a 'shutdown' event that built-in and
 *   custom middleware, plugins, and routes can listen to via `app.on('shutdown', callback)`.
 */
export function createServer(app, config) {
  const port = config.port || 3000;
  const shutdownTimeout = config.shutdownTimeout ?? 30000; // 30 seconds default
  const allowProcessExit = config.allowProcessExit ?? true; // Disable in tests
  const logger = config.logger || createLogger({ name: 'server' });
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
        logger.warn(
          { shutdownTimeout, remainingConnections: activeConnections.size },
          'Shutdown timeout exceeded; forcing remaining connections closed.',
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

  // Register app's startup and shutdown registries (if any)
  const appRegistries = getRegistries(app);
  if (appRegistries) {
    registerStartupHook(() => appRegistries.startupRegistry.execute(logger));
    registerShutdownHook(() => appRegistries.shutdownRegistry.execute(logger));
  }

  // ── Kubernetes / container lifecycle signals ─────────────────
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.info('Shutdown signal received — closing server…');

    // Emit shutdown event — middleware and plugins listen and react.
    app.emit('shutdown');

    try {
      // 1. Run all registered shutdown hooks (FIFO order)
      for (const hook of shutdownHooks) {
        try {
          await hook();
        } catch (err) {
          logger.error({ err }, 'Error in shutdown hook');
        }
      }

      // 2. Close server (stops accepting new connections, waits for in-flight requests)
      //    App middleware sends Connection: close header on HTTP responses during shutdown.
      //    (See app-factory.js shutdown rejection middleware)
      await close();

      logger.info('Server closed successfully.');
      if (allowProcessExit) {
        process.exit(0);
      }
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      if (allowProcessExit) {
        process.exit(1);
      }
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
          logger.error({ err }, 'Error in startup hook');
        }
      }
      logger.info('Startup sequence completed.');

      // Start listening only after initialization succeeds
      server.listen(port, () => {
        logger.info({ port }, `${config.appName ?? 'app'} listening on http://localhost:${port}`);
      });
    } catch (err) {
      logger.error({ err }, 'Startup failed');
      process.exit(1);
    }
  });

  return { server, close, registerStartupHook, registerShutdownHook };
}
