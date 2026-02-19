/**
 * @module middlewares/enforcement
 * @description App-only access enforcement for non-health API routes.
 *
 * Evaluation order (per policy):
 *  1. Health routes always bypass enforcement.
 *  2. If blockBrowserOrigin is enabled and Origin header is present → 403.
 *  3. If requireJwt is enabled and bearer token is missing or invalid → 401.
 *  4. Otherwise continue.
 */

import { verifyToken } from '@glowing-fishstick/shared';

const HEALTH_PATHS = new Set(['/healthz', '/readyz', '/livez']);

/**
 * Create enforcement middleware based on the supplied config flags.
 *
 * @param {object} config
 * @param {boolean} config.blockBrowserOrigin
 * @param {boolean} config.requireJwt
 * @param {string}  config.jwtSecret
 * @returns {import('express').RequestHandler}
 */
export function createEnforcementMiddleware(config) {
  const { blockBrowserOrigin, requireJwt, jwtSecret } = config;

  return (req, res, next) => {
    if (HEALTH_PATHS.has(req.path)) {
      return next();
    }

    if (blockBrowserOrigin && req.headers.origin) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Browser-origin requests are not permitted',
          statusCode: 403,
        },
      });
      return;
    }

    if (requireJwt) {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid authorization header',
            statusCode: 401,
          },
        });
        return;
      }

      try {
        verifyToken(authHeader.slice(7), jwtSecret);
      } catch {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token', statusCode: 401 },
        });
        return;
      }
    }

    next();
  };
}
