/**
 * @module app
 * @description App plugin that mounts template routes.
 */

import { myRoutes } from './routes/router.js';

/**
 * @param {import('express').Express} app
 * @param {object} config
 */
export function myApplicationPlugin(app, config) {
  const logger = config.logger;

  app.locals.navLinks.push({ label: 'My Feature', url: '/my-feature' });

  app.registerStartupHook(async () => {
    logger?.info('Initializing application resources...');
  });

  app.registerShutdownHook(async () => {
    logger?.info('Cleaning up application resources...');
  });

  app.use(myRoutes(config));
}
