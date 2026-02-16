/**
 * @module routes/health
 * @description Kubernetes-style health-probe routes.
 */

import { Router } from 'express';

/**
 * Create a router with health-check endpoints.
 *
 * @param {import('express').Express} app - Express app instance for shutdown event listener.
 * @returns {import('express').Router}
 */
export function healthRoutes(app) {
  const router = Router();

  // Track shutdown state
  let isShuttingDown = false;
  if (app) {
    app.on('shutdown', () => {
      isShuttingDown = true;
    });
  }

  /** Basic liveness check. */
  router.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  /** Readiness check — returns not-ready during shutdown. */
  router.get('/readyz', (_req, res) => {
    if (isShuttingDown) {
      return res.status(503).json({ status: 'not-ready', reason: 'shutdown in progress' });
    }
    res.json({ status: 'ready' });
  });

  /** Liveness check — extensible for deep health verification. */
  router.get('/livez', (_req, res) => {
    res.json({ status: 'alive' });
  });

  return router;
}
