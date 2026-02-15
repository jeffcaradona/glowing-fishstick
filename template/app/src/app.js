/**
 * @module app
 * @description Application plugin — mounts app routes and middleware
 * onto the core glowing-fishstick app.
 */

import { myRoutes } from './routes/router.js';

/**
 * Plugin that registers application-specific routes.
 *
 * @param {import('express').Express} app    - Express app instance
 * @param {object}                    config - Frozen config object
 */
export function myApplicationPlugin(app, config) {
  // Optional: Register app nav link
  app.locals.navLinks = app.locals.navLinks || [];
  app.locals.navLinks.push({ label: 'My App', url: '/my-feature' });

  // Mount routes
  app.use(myRoutes(config));

  // ── Optional: Register startup hook for initialization ─────────────
  // Use app.registerStartupHook() to add async initialization tasks:
  app.registerStartupHook(async () => {
    console.log('Initializing application resources…');
    // Connect to databases, initialize caches, etc.
  });

  // ── Optional: Register shutdown hook for cleanup ──────────────────
  // Use app.registerShutdownHook() to add async cleanup tasks:
  app.registerShutdownHook(async () => {
    console.log('Cleaning up application resources…');
    // Close database connections, clear caches, etc.
  });
}
