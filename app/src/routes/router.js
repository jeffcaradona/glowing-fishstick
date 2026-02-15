/**
 * @module app/routes/router
 * @description App-specific routes for the task_manager application.
 */

import { Router } from 'express';

/**
 * Create a router with task_manager routes.
 *
 * @param {object} config - Frozen app config.
 * @returns {import('express').Router}
 */
export function taskRoutes(config) {
  const router = Router();

  router.get('/tasks', (_req, res) => {
    res.render('tasks/list', { appName: config.appName, scripts: ['/js/tasks/list.js'] });
  });

  return router;
}
