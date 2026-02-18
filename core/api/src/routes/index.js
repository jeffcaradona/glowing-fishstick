/**
 * @module routes/index
 * @description Core JSON-first routes for API module.
 */

import { Router } from 'express';

/**
 * Create core API routes.
 *
 * @param {object} config
 * @returns {import('express').Router}
 */
export function indexRoutes(config) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      name: config.appName,
      version: config.appVersion,
      frameworkVersion: config.frameworkVersion,
      status: 'ok',
    });
  });

  return router;
}
