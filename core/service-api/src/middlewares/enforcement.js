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
    // WHY: Health probes must stay reachable without auth/origin constraints so
    // orchestrators can determine liveness/readiness during rollouts.
    if (HEALTH_PATHS.has(req.path)) {
      return next();
    }

    // WHY: Browser-origin traffic is explicitly disallowed for this API surface;
    // same-origin protections are handled in app-tier routes instead.
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
      // WHY: Returning a single 401 shape for missing/malformed auth keeps client
      // retry behavior deterministic and avoids leaking token parsing details.
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
        // WHY: Invalid/expired tokens intentionally map to the same response to
        // prevent token-state probing by unauthenticated callers.
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token', statusCode: 401 },
        });
        return;
      }
    }

    next();
  };
}
