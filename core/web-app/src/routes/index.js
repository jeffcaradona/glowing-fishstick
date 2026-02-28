/**
 * @module routes/index
 * @description Landing-page route.
 */

import { Router } from 'express';

/**
 * Create a router for the default landing page.
 *
 * @param {object} config - Frozen app config.
 * @returns {import('express').Router}
 */
export function indexRoutes(config) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.render('index', {
      appName: config.appName,
      welcomeMessage: `Welcome to ${config.appName}`,
    });
  });

  return router;
}
