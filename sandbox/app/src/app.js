/**
 * @module app/app
 * @description App plugin — mounts task_manager routes and middleware
 * onto the core app.
 */

import { createTasksApiClient } from './services/tasks-api.js';
import { taskRoutes } from './routes/router.js';

/**
 * Plugin that registers task_manager-specific routes.
 *
 * @param {import('express').Express} app    - Express app instance.
 * @param {object}                    config - Frozen config object.
 */
export function taskManagerApplicationPlugin(app, config) {
  const logger = config.logger;

  // HTTP client that talks to the tasks REST API (api/ workspace).
  // Pass `app` so the client can register its JWT rotation-timer shutdown hook.
  const tasksApiClient = createTasksApiClient(config, app);

  app.registerStartupHook(async () => {
    logger?.info({ apiUrl: config.apiUrl }, 'Task manager connecting to API…');
  });

  app.registerShutdownHook(async () => {
    logger?.info('Task manager shutting down…');
  });

  // Register app nav link
  app.locals.navLinks.push({ label: 'Tasks', url: '/tasks' });

  app.use(taskRoutes(config, tasksApiClient));
}
