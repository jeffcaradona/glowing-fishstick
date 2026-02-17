/**
 * @module api/api
 * @description API plugin registration for local consumer workspace.
 */

import { taskApiRoutes } from './routes/router.js';

/**
 * @param {import('express').Express} app
 * @param {object} config
 */
export function taskApiPlugin(app, config) {
  const logger = config.logger;

  app.registerStartupHook(async () => {
    logger?.info('Initializing task API resources...');
  });

  app.registerShutdownHook(async () => {
    logger?.info('Cleaning up task API resources...');
  });

  app.use(taskApiRoutes());
}
