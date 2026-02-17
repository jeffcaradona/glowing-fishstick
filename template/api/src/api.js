/**
 * @module api/api
 * @description API plugin that mounts template API routes.
 */

import { myApiRoutes } from './routes/router.js';

/**
 * @param {import('express').Express} app
 * @param {object} config
 */
export function myApiPlugin(app, config) {
  const logger = config.logger;

  app.registerStartupHook(async () => {
    logger?.info('Initializing API resources...');
  });

  app.registerShutdownHook(async () => {
    logger?.info('Cleaning up API resources...');
  });

  app.use(myApiRoutes());
}
