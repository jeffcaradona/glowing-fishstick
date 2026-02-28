/**
 * @module middlewares/error-handler
 * @description JSON-first error handling middleware for API routes.
 *
 * WHY (intentional duplication): The app counterpart lives at
 * core/web-app/src/middlewares/errorHandler.js and adds HTML content-
 * negotiation via Eta view rendering. This API version is JSON-only,
 * which keeps it lean for machine callers. Consolidating would require
 * a template-method abstraction that obscures two simple, clear
 * implementations. Sonar flags ~85% similarity; the difference
 * (JSON-only vs HTML+JSON) is the reason both exist.
 *
 * VERIFY IF CHANGED: Keep the logging/error-envelope structure aligned
 * with the app counterpart; diverge only on response format.
 */

import { normalizeError, resolveErrorLogger, logUnexpectedError } from '@glowing-fishstick/shared';

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
  const { statusCode, code, message } = normalizeError(err);
  const logFn = resolveErrorLogger(req);

  if (!err.isOperational) {
    logUnexpectedError(req, err, logFn, 'Unexpected API error');
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
