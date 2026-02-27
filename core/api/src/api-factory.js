/**
 * @module api
 * @description Express API factory. Composes middleware, enforcement,
 * metrics routes, consumer plugins, and error handling into a single
 * API app instance.
 *
 * WHY (intentional parity with core/app/src/app-factory.js): Both
 * factories share ~40 lines of middleware linking (hook registries,
 * request ID, body parsers, health routes, shutdown rejection, throttle
 * mounting, plugin loop). This duplication is deliberate — middleware
 * order is load-bearing and differs (JWT enforcement and origin blocking
 * are API-only; view engine, static files, navLinks are app-only).
 * Abstracting the shared lines into a base function would require
 * callback hooks that obscure the explicit, auditable middleware stack.
 *
 * VERIFY IF CHANGED: Review app-factory.js for parallel changes that
 * should stay in sync (body-parser config, health routes, shutdown gate).
 */
import express from 'express';

import {
  createHookRegistry,
  storeRegistries,
  createRequestIdMiddleware,
  createRequestLogger,
  createAdminThrottle,
} from '@glowing-fishstick/shared';
import { healthRoutes } from './routes/health.js';
import { metricsRoutes } from './routes/metrics.js';
import { indexRoutes } from './routes/index.js';
import { notFoundHandler, errorHandler } from './middlewares/error-handler.js';
import { createEnforcementMiddleware } from './middlewares/enforcement.js';

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
  // WHY: Fail fast at boot so we never run with a policy/config mismatch.
  if (config.requireJwt && !config.jwtSecret) {
    throw new Error('JWT_SECRET is required when API_REQUIRE_JWT is enabled');
  }

  const app = express();

  // WHY: Hide framework fingerprinting header to reduce low-effort probing.
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

  // WHY: Enforce payload ceilings to prevent OOM from unbounded body parsing.
  // Express returns 413 Payload Too Large when limits are breached.
  app.use(express.json({ limit: config.jsonBodyLimit }));
  app.use(
    express.urlencoded({
      extended: true,
      limit: config.urlencodedBodyLimit,
      parameterLimit: config.urlencodedParameterLimit,
    }),
  );

  // Health checks run before enforcement and shutdown gate.
  app.use(healthRoutes(app));

  // Enforcement: browser-origin block and JWT verification for all non-health routes.
  // Must be mounted before metricsRoutes and indexRoutes — not via the plugin loop.
  app.use(createEnforcementMiddleware(config));

  // WHY: Metrics endpoints are expensive (process.memoryUsage, runtime data).
  // Throttle to prevent burst-driven resource exhaustion.
  // Mounted after health routes and enforcement so health stays available
  // and enforcement still gates unauthenticated traffic.
  app.use(
    createAdminThrottle({
      windowMs: config.adminRateLimitWindowMs,
      max: config.adminRateLimitMax,
      paths: ['/metrics/memory', '/metrics/runtime'],
    }),
  );

  app.use(metricsRoutes(config));

  // Reject new non-health traffic during shutdown.
  app.use((_req, res, next) => {
    if (isShuttingDown) {
      // WHY: 503 + Connection: close tells callers to fail over during drain.
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
