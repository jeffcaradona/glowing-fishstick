import express from 'express';

import {
  createHookRegistry,
  storeRegistries,
  createRequestIdMiddleware,
  createRequestLogger,
} from '@glowing-fishstick/shared';

export function createApi(config, plugins = []) {
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

  // ── Health routes (before shutdown middleware) ───────────────
  // Health checks need to respond with specific messages during shutdown
  //TODO: Setup health routes in api-factory, with shutdown-aware responses.
  //app.use(healthRoutes(app));

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
  //TODO: Setup core routes in api-factory, with config support.
  //app.use(indexRoutes(config));
  //app.use(adminRoutes(config));

  // ── Plugins ──────────────────────────────────────────────────
  for (const plugin of plugins) {
    plugin(app, config);
  }

  // ── Error handling ───────────────────────────────────────────
  //TODO: Add notFoundHandler and errorHandler to api-factory, with logging support.
  //app.use(notFoundHandler);
  //app.use(errorHandler);

  return app;
}
