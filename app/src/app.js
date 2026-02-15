/**
 * @module app/app
 * @description App plugin — mounts task_manager routes and middleware
 * onto the core app.
 */

import { taskRoutes } from './routes/router.js';

/**
 * Plugin that registers task_manager-specific routes.
 *
 * @param {import('express').Express} app    - Express app instance.
 * @param {object}                    config - Frozen config object.
 */
export function taskManagerApplicationPlugin(app, config) {
  // Register app nav link
  app.locals.navLinks.push({ label: 'Tasks', url: '/tasks' });

  app.use(taskRoutes(config));

  // ── Optional: Register startup hook for initialization ─────────────
  // Use app.registerStartupHook() to add async initialization tasks:
   app.registerStartupHook(async () => {
     console.log('Initializing task manager resources…');
     // Connect to databases, initialize caches, etc.
   });

  // ── Optional: Register shutdown hook for cleanup ──────────────────
  // Use app.registerShutdownHook() to add async cleanup tasks:
   app.registerShutdownHook(async () => {
     console.log('Cleaning up task manager resources…');
     // Close database connections, clear caches, etc.
   });
}

