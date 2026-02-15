/**
 * @module app
 * @description Express application factory. Composes middleware, core
 * routes, consumer plugins, and error handling into a single app instance.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';

import { createHookRegistry, storeRegistries } from '@glowing-fishstick/shared';
import { healthRoutes } from './routes/health.js';
import { indexRoutes } from './routes/index.js';
import { adminRoutes } from './routes/admin.js';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {(app: import('express').Express, config: object) => void} Plugin
 */

/**
 * Build and return a fully configured Express application.
 *
 * 1. View engine (EJS) setup.
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
  app.set('view engine', 'ejs');

  const coreViewsDir = path.join(__dirname, 'views');

  if (config.viewsDir) {
    // Consumer views take priority; core views are the fallback.
    app.set('views', [config.viewsDir, coreViewsDir]);
  } else {
    app.set('views', coreViewsDir);
  }

  // ── App locals ───────────────────────────────────────────────
  app.locals.navLinks = [
    { label: 'Home', url: '/' },
    { label: 'Admin', url: '/admin' },
  ];

  // ── Graceful shutdown state (closure-based, not polluting app.locals) ───
  let isShuttingDown = false;
  app.on('shutdown', () => {
    isShuttingDown = true;
  });

  // ── Built-in middleware ──────────────────────────────────────
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));
  if (config.publicDir) {
    app.use(express.static(config.publicDir));
  }
  // ── Shutdown rejection middleware ────────────────────────────
  // Return 503 Service Unavailable for new requests during shutdown.
  app.use((req, res, next) => {
    if (isShuttingDown) {
      res.status(503).set('Connection', 'close').json({
        error: 'Server is shutting down',
        message: 'Please retry your request',
      });
      return;
    }
    next();
  });

  // ── Core routes ──────────────────────────────────────────────
  app.use(healthRoutes(app));
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
