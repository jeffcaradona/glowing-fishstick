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
 * @param {object}                    config - Config object (reads `port`).
 * @returns {{ server: http.Server, close: () => Promise<void> }}
 */
export function createServer(app, config) {
  const port = config.port || 3000;
  const server = http.createServer(app);

  server.listen(port, () => {
    console.log(`${config.appName ?? 'app'} listening on http://localhost:${port}`);
  });

  /**
   * Gracefully close the server — stop accepting new connections,
   * wait for in-flight requests to finish, then resolve.
   *
   * @returns {Promise<void>}
   */
  const close = () =>
    new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

  // ── Kubernetes / container lifecycle signals ─────────────────
  const shutdown = async () => {
    console.log('Shutdown signal received — closing server…');
    try {
      await close();
      console.log('Server closed.');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return { server, close };
}
