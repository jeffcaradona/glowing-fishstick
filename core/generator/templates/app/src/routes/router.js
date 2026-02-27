/**
 * @module routes/router
 * @description Application routes.
 */

import { Router } from 'express';

/**
 * Create a router with application routes.
 *
 * @param {object} config - Frozen app config
 * @returns {import('express').Router}
 */
export function myRoutes(config) {
  const router = Router();

  router.get('/my-feature', (_req, res) => {
    res.render('my-feature', { appName: config.appName });
  });

  return router;
}
