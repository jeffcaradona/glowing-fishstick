/**
 * @module app
 * @description Express application factory. Composes middleware, core
 * routes, consumer plugins, and error handling into a single app instance.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';

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

  // ── Startup hooks registry ──────────────────────────────────
  // Plugins can register async initialization functions here.
  app.startupHooks = [];

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
  app.locals.shuttingdown = false; // Used by health route to signal graceful shutdown mode.

  // ── Shutdown hooks registry ──────────────────────────────────
  // Plugins can register async cleanup functions here.
  app.shutdownHooks = [];

  // ── Navigation links (mutable — plugins may append) ─────────
  app.locals.navLinks = [
    { label: 'Home', url: '/' },
    { label: 'Admin', url: '/admin' },
  ];

  // ── Built-in middleware ──────────────────────────────────────
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  // ── Shutdown rejection middleware ────────────────────────────
  // Return 503 Service Unavailable for new requests during shutdown.
  app.use((req, res, next) => {
    if (app.locals.shuttingdown) {
      res.status(503).set('Connection', 'close').json({
        error: 'Server is shutting down',
        message: 'Please retry your request',
      });
      return;
    }
    next();
  });

  // ── Core routes ──────────────────────────────────────────────
  app.use(healthRoutes());
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
