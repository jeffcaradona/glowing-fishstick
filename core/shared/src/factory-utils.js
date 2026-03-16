/**
 * @module factory-utils
 * @description Shared factory utilities used by both the app-factory and
 * api-factory to set up lifecycle hook registries and graceful-shutdown
 * request gating.
 *
 * WHY: Both factories contain identical boilerplate for creating hook
 * registries, attaching register methods, storing registries, and building
 * a shutdown-gate middleware. Extracting these focused utilities removes
 * Sonar-flagged duplication without creating a "base factory" abstraction
 * that would obscure the auditable middleware stack (forbidden by AGENTS-readable.md).
 *
 * Each factory retains full control of middleware ordering and app-specific
 * setup; only the mechanical plumbing is shared.
 *
 * VERIFY IF CHANGED: Both core/web-app/src/app-factory.js and
 * core/service-api/src/api-factory.js depend on these utilities.
 */

import { createHookRegistry } from './hook-registry.js';
import { storeRegistries } from './registry-store.js';

/**
 * Create startup and shutdown hook registries, attach convenience
 * methods to the Express app, and store them via the WeakMap-based
 * registry store for server-factory access.
 *
 * @param {import('express').Express} app
 * @returns {{ startupRegistry: object, shutdownRegistry: object }}
 */
export function attachHookRegistries(app) {
  const startupRegistry = createHookRegistry();
  const shutdownRegistry = createHookRegistry();

  app.registerStartupHook = (hook) => startupRegistry.register(hook);
  app.registerShutdownHook = (hook) => shutdownRegistry.register(hook);

  // WHY: WeakMap-based store keeps registries private; only server-factory
  // retrieves them, preventing consumer code from bypassing the public API.
  storeRegistries(app, startupRegistry, shutdownRegistry);

  return { startupRegistry, shutdownRegistry };
}

/**
 * Create a shutdown-gate middleware and wire it to the app's 'shutdown'
 * event. When activated, the middleware rejects new requests with 503.
 *
 * WHY: 503 + Connection: close tells clients and load balancers to stop
 * routing traffic to this instance while in-flight requests drain.
 *
 * @param {import('express').Express} app
 * @returns {import('express').RequestHandler} Middleware to mount at the
 *          desired position in the middleware stack.
 */
export function createShutdownGate(app) {
  let isShuttingDown = false;

  app.on('shutdown', () => {
    isShuttingDown = true;
  });

  return (_req, res, next) => {
    if (isShuttingDown) {
      res.status(503).set('Connection', 'close').json({
        error: 'Server is shutting down',
        message: 'Please retry your request',
      });
      return;
    }
    next();
  };
}
