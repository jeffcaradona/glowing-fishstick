/**
 * @module middlewares/error-handler
 * @description JSON-first error handling middleware for API routes.
 */

import { createLogger } from '@glowing-fishstick/shared';

/**
 * Create and forward a 404 error for unmatched routes.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
export function notFoundHandler(req, _res, next) {
  const err = new Error(`Cannot find ${req.originalUrl}`);
  err.code = 'NOT_FOUND';
  err.statusCode = 404;
  err.isOperational = true;
  next(err);
}

/**
 * Deterministic JSON error handler.
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  // WHY: Non-operational failures are intentionally hidden from callers.
  const message = err.isOperational ? err.message : 'Internal server error';
  const logger = req.app?.locals?.logger || createLogger({ name: 'api-error-handler' });

  if (!err.isOperational) {
    logger.error(
      {
        err,
        method: req.method,
        path: req.path,
        reqId: req.id || req.headers['x-request-id'],
      },
      'Unexpected API error',
    );
  }

  // WHY: API clients depend on a stable error envelope for retries/telemetry.
  res.status(statusCode).json({
    error: {
      code,
      message,
      statusCode,
    },
  });
}
