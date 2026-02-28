/**
 * @module app
 * @description Express application factory. Composes middleware, core
 * routes, consumer plugins, and error handling into a single app instance.
 *
 * WHY (intentional parity with core/service-api/src/api-factory.js): Both
 * factories share ~40 lines of middleware linking (hook registries,
 * request ID, body parsers, health routes, shutdown rejection, throttle
 * mounting, plugin loop). This duplication is deliberate — middleware
 * order is load-bearing and differs (view engine, static files, navLinks
 * are app-only; JWT enforcement and origin blocking are API-only).
 * Abstracting the shared lines into a base function would require
 * callback hooks that obscure the explicit, auditable middleware stack.
 *
 * VERIFY IF CHANGED: Review api-factory.js for parallel changes that
 * should stay in sync (body-parser config, health routes, shutdown gate).
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';

import {
  createRequestIdMiddleware,
  createRequestLogger,
  createAdminThrottle,
  attachHookRegistries,
  createShutdownGate,
} from '@glowing-fishstick/shared';
import { healthRoutes } from './routes/health.js';
import { indexRoutes } from './routes/index.js';
import { adminRoutes } from './routes/admin.js';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js';
import { createEtaEngine } from './engines/eta-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {(app: import('express').Express, config: object) => void} Plugin
 */

/**
 * Build and return a fully configured Express application.
 *
 * 1. View engine (Eta) setup.
 * 2. Built-in middleware (body parsers, static files).
 * 3. Core routes (health, landing, admin).
 * 4. Consumer plugins (in array order).
 * 5. Error-handling middleware (404 + generic handler).
 *
 * @param {object}   config          - Frozen config from createConfig().
 * @param {Plugin[]} [plugins=[]]    - Plugin functions applied after core routes.
 * @returns {import('express').Express} Configured Express app instance.
 */
export function createApp(config, plugins = []) {
  const app = express();

  // WHY: Hide framework fingerprinting header to reduce low-effort probing.
  app.disable('x-powered-by');

  // ── Startup/shutdown hook registries ────────────────────────
  // Private registries for lifecycle management; exposed via methods.
  attachHookRegistries(app);

  // ── View engine ──────────────────────────────────────────────
  const coreViewsDir = path.join(__dirname, 'views');
  const viewDirs = config.viewsDir ? [config.viewsDir, coreViewsDir] : [coreViewsDir];

  app.engine('eta', createEtaEngine(viewDirs));
  app.set('view engine', 'eta');

  // Consumer views take priority; core views are the fallback.
  app.set('views', viewDirs.length === 1 ? viewDirs[0] : viewDirs);

  // Preserve explicit view caching behavior in all environments.
  // (Requires nodemon restart to pick up template edits in development)
  app.enable('view cache');

  // ── App locals ───────────────────────────────────────────────
  app.locals.navLinks = [
    { label: 'Home', url: '/' },
    { label: 'Admin', url: '/admin' },
  ];

  // Pass logger to app.locals for middleware access (e.g., errorHandler)
  if (config.logger) {
    app.locals.logger = config.logger;
  }

  // ── Graceful shutdown state ────────────────────────────────────
  const shutdownGate = createShutdownGate(app);

  // ── Built-in middleware ──────────────────────────────────────
  // Request ID generation (always enabled for tracing)
  app.use(createRequestIdMiddleware());

  // Request logging (configurable, default: enabled)
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
  app.use(express.static(path.join(__dirname, 'public')));
  if (config.publicDir) {
    app.use(express.static(config.publicDir));
  }

  // ── Health routes (before shutdown middleware) ───────────────
  // Health checks need to respond with specific messages during shutdown
  app.use(healthRoutes(app));

  // ── Request tracking + shutdown rejection middleware ─────────
  // Reject new requests during shutdown.
  // Requests that entered the middleware stack BEFORE shutdown began
  // are allowed to complete (shutdown check happens first).
  app.use(shutdownGate);

  // ── Core routes ──────────────────────────────────────────────
  app.use(indexRoutes(config));

  // WHY: Admin endpoints are expensive (dashboard fetches upstream metrics,
  // config viewer reads full config, API health probes external service).
  // Throttle to prevent burst-driven resource exhaustion.
  // Mounted after health routes so /healthz, /readyz, /livez stay available.
  app.use(
    createAdminThrottle({
      windowMs: config.adminRateLimitWindowMs,
      max: config.adminRateLimitMax,
      paths: ['/admin', '/admin/config', '/admin/api-health'],
    }),
  );
  app.use(adminRoutes(config));

  // ── Plugins ──────────────────────────────────────────────────
  for (const plugin of plugins) {
    plugin(app, config);
  }

  // ── Error handling ───────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
