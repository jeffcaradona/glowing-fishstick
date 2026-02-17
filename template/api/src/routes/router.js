/**
 * @module api/routes/router
 * @description Template API routes.
 */

import { Router } from 'express';

export function myApiRoutes() {
  const router = Router();

  router.get('/api/my-feature', (_req, res) => {
    res.json({
      status: 'ok',
      feature: 'my-feature',
      message: 'Hello from my API template route',
    });
  });

  return router;
}
