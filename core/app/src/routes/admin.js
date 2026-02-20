/**
 * @module routes/admin
 * @description Admin route wiring for dashboard, config, and API health checks.
 */

import { Router } from 'express';
import { filterSensitiveKeys } from '../config/env.js';
import { createAdminController } from '../controllers/admin-controller.js';

/**
 * Create a router for admin pages.
 *
 * @param {object} config - Frozen app config.
 * @returns {import('express').Router}
 */
export function adminRoutes(config) {
  const router = Router();
  const controller = createAdminController({
    config,
    filterSensitiveKeys,
    // WHY: Keep route wiring thin and centralize upstream-call behavior in one
    // place so auth/header policies can be changed without touching handlers.
    buildApiRequestOptions: (_req, context) => ({
      method: 'GET',
      signal: context.signal,
    }),
  });

  router.get('/admin', controller.renderDashboard);
  router.get('/admin/config', controller.renderConfig);
  router.get('/admin/api-health', controller.checkApiHealth);

  return router;
}
