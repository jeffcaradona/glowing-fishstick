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
      status: 'ok',
    });
  });

  router.get('/metrics/memory', (_req, res) => {
    const memoryUsage = process.memoryUsage();
    res.json({
      status: 'ok',
      memoryUsage: {
        rss: memoryUsage.rss,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
      },
    });
  });

  router.get('/metrics/runtime', (_req, res) => {
    res.json({
      status: 'ok',
      nodeVersion: process.version,
      uptimeSeconds: process.uptime(),
    });
  });

  return router;
}
