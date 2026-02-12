/**
 * @module routes/health
 * @description Kubernetes-style health-probe routes.
 */

import { Router } from 'express';

/**
 * Create a router with health-check endpoints.
 *
 * @returns {import('express').Router}
 */
export function healthRoutes() {
  const router = Router();

  /** Basic liveness check. */
  router.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  /** Readiness check — extensible to verify DB, cache, etc. */
  router.get('/readyz', (_req, res) => {
    res.json({ status: 'ready' });
  });

  /** Liveness check — extensible for deep health verification. */
  router.get('/livez', (_req, res) => {
    res.json({ status: 'alive' });
  });

  return router;
}
