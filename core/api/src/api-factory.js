import express from 'express';

import {
  createHookRegistry,
  storeRegistries,
  createRequestIdMiddleware,
  createRequestLogger,
} from '@glowing-fishstick/shared';
import { healthRoutes } from './routes/health.js';
import { metricsRoutes } from './routes/metrics.js';
import { indexRoutes } from './routes/index.js';
import { notFoundHandler, errorHandler } from './middlewares/error-handler.js';

/**
 * @typedef {(app: import('express').Express, config: object) => void} Plugin
 */

/**
 * Build and return a configured API app instance.
 *
 * @param {object} config
 * @param {Plugin[]} [plugins=[]]
 * @returns {import('express').Express}
 */
export function createApi(config, plugins = []) {
  const app = express();

  app.disable('x-powered-by');

  const startupRegistry = createHookRegistry();
  const shutdownRegistry = createHookRegistry();

  app.registerStartupHook = (hook) => startupRegistry.register(hook);
  app.registerShutdownHook = (hook) => shutdownRegistry.register(hook);

  storeRegistries(app, startupRegistry, shutdownRegistry);

  if (config.logger) {
    app.locals.logger = config.logger;
  }

  let isShuttingDown = false;
  app.on('shutdown', () => {
    isShuttingDown = true;
  });

  app.use(createRequestIdMiddleware());

  const enableRequestLogging = config.enableRequestLogging ?? true;
  if (enableRequestLogging && config.logger) {
    app.use(createRequestLogger(config.logger, { generateRequestId: false }));
  }

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health checks run before shutdown gate.
  app.use(healthRoutes(app));
  app.use(metricsRoutes(config));

  // Reject new non-health traffic during shutdown.
  app.use((_req, res, next) => {
    if (isShuttingDown) {
      res.status(503).set('Connection', 'close').json({
        error: 'Server is shutting down',
        message: 'Please retry your request',
      });
      return;
    }

    next();
  });

  app.use(indexRoutes(config));

  for (const plugin of plugins) {
    plugin(app, config);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
