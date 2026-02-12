/**
 * @module routes/admin
 * @description Admin dashboard and config viewer routes.
 */

import { Router } from 'express';
import { filterSensitiveKeys } from '../config/env.js';

/**
 * Create a router for admin pages.
 *
 * @param {object} config - Frozen app config.
 * @returns {import('express').Router}
 */
export function adminRoutes(config) {
  const router = Router();

  /** Admin dashboard — app info, uptime, memory. */
  router.get('/admin', (_req, res) => {
    res.render('admin/dashboard', {
      appName: config.appName,
      appVersion: config.appVersion,
      uptime: process.uptime(),
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
    });
  });

  /** Config viewer — non-sensitive values only. */
  router.get('/admin/config', (_req, res) => {
    res.render('admin/config', {
      config: filterSensitiveKeys(config),
    });
  });

  return router;
}
