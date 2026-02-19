/**
 * @module app
 * @description Express application factory. Composes middleware, core
 * routes, consumer plugins, and error handling into a single app instance.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';

import {
  createHookRegistry,
  storeRegistries,
  createRequestIdMiddleware,
  createRequestLogger,
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

  app.disable('x-powered-by');

  // ── Startup/shutdown hook registries ────────────────────────
  // Private registries for lifecycle management; exposed via methods.
  const startupRegistry = createHookRegistry();
  const shutdownRegistry = createHookRegistry();

  // Register hook methods on app object
  app.registerStartupHook = (hook) => startupRegistry.register(hook);
  app.registerShutdownHook = (hook) => shutdownRegistry.register(hook);

  // Store registries using WeakMap for private access by server-factory
  storeRegistries(app, startupRegistry, shutdownRegistry);

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

  // ── Graceful shutdown state (closure-based, not polluting app.locals) ───
  let isShuttingDown = false;

  app.on('shutdown', () => {
    isShuttingDown = true;
  });

  // ── Built-in middleware ──────────────────────────────────────
  // Request ID generation (always enabled for tracing)
  app.use(createRequestIdMiddleware());

  // Request logging (configurable, default: enabled)
  const enableRequestLogging = config.enableRequestLogging ?? true;
  if (enableRequestLogging && config.logger) {
    app.use(createRequestLogger(config.logger, { generateRequestId: false }));
  }

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
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
  app.use((_req, res, next) => {
    // Check if shutdown has started
    if (isShuttingDown) {
      // New request during shutdown - reject with 503
      res.status(503).set('Connection', 'close').json({
        error: 'Server is shutting down',
        message: 'Please retry your request',
      });
      return;
    }

    next();
  });

  // ── Core routes ──────────────────────────────────────────────
  app.use(indexRoutes(config));
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
