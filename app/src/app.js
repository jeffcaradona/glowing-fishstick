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
}
