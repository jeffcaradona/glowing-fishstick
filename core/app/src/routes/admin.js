/**
 * @module routes/admin
 * @description Admin dashboard and config viewer routes.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Router } from 'express';
import { filterSensitiveKeys } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
      scripts: ['/js/admin/dashboard.js'],
    });
  });

  /** Config viewer — non-sensitive values only. */
  router.get('/admin/config', (_req, res) => {
    const coreViewsDir = path.join(__dirname, '..', 'views');
    const coreViewsDirRelative = path.relative(process.cwd(), coreViewsDir).replace(/\\/g, '/');
    const appViewsDirRelative = config.viewsDir ? path.relative(process.cwd(), config.viewsDir).replace(/\\/g, '/') : null;
    
    res.render('admin/config', {
      config: filterSensitiveKeys(config),
      viewsDirs: {
        app: appViewsDirRelative,
        core: coreViewsDirRelative,
      },
    });
  });

  return router;
}
