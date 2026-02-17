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
