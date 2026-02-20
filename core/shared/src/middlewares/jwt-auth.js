/**
 * @module middlewares/jwt-auth
 * @description Express middleware that validates bearer JWT tokens.
 */

import { verifyToken } from '../auth/jwt.js';

/**
 * Create JWT auth middleware.
 *
 * @param {string} secret - JWT verification secret.
 * @returns {import('express').RequestHandler}
 */
export function jwtAuthMiddleware(secret) {
  return (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      // WHY: Keep the auth contract strict at middleware boundary so downstream
      // handlers can assume req.auth exists when this middleware passes.
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          error: {
            message: 'Missing or invalid authorization header',
            code: 'UNAUTHORIZED',
          },
        });
        return;
      }

      const token = authHeader.slice(7);
      const decoded = verifyToken(token, secret);
      req.auth = decoded;
      next();
    } catch (error) {
      let message = null;
      // WHY: Token parsing outcomes are collapsed into auth-domain messages that
      // clients already key on for refresh/re-auth behavior.
      if (error.name === 'TokenExpiredError') {
        message = 'Token expired';
      } else if (error.name === 'JsonWebTokenError') {
        message = 'Invalid token';
      }

      res.status(401).json({
        error: {
          message,
          code: 'UNAUTHORIZED',
        },
      });
    }
  };
}
