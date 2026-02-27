/**
 * @module middlewares/errorHandler
 * @description Express error-handling middleware for 404 catch-all and
 * generic error responses. Content-negotiates between HTML and JSON.
 *
 * WHY (intentional duplication): The API counterpart lives at
 * core/api/src/middlewares/error-handler.js and is JSON-only. This app
 * version adds HTML content-negotiation via Eta view rendering, which
 * the API package does not need. Consolidating would require a template-
 * method abstraction that obscures two simple, clear implementations.
 * Sonar flags ~85% similarity; the difference (HTML rendering) is the
 * reason both exist.
 *
 * VERIFY IF CHANGED: Keep the logging/error-envelope structure aligned
 * with the API counterpart; diverge only on response format.
 */

import { createNotFoundError } from '../errors/appError.js';

/**
 * Catch-all middleware that creates a 404 AppError for any unmatched
 * route and forwards it to the error handler.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function notFoundHandler(req, res, next) {
  next(createNotFoundError(`Cannot find ${req.originalUrl}`));
}

/**
 * Express 4-argument error middleware. Content-negotiates the response:
 * - `text/html`        → renders an EJS error view.
 * - `application/json` → returns a JSON error envelope.
 *
 * Non-operational (unexpected) errors are logged and surfaced as a
 * generic 500 response.
 *
 * @param {Error}  err
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  // WHY: Non-operational errors are masked to avoid leaking internals.
  const message = err.isOperational ? err.message : 'Internal server error';
  // WHY: Logger is startup-injected via app.locals to avoid per-request
  // object instantiation on error paths (Snyk javascript/NoRateLimitingForExpensiveWebOperation).
  // Fallback to console.error preserves error visibility without allocation overhead.
  const logger = req.app?.locals?.logger;
  const logError = logger
    ? (meta, msg) => logger.error(meta, msg)
    : (meta, msg) => console.error(msg, meta);

  if (!err.isOperational) {
    logError(
      {
        err,
        method: req.method,
        path: req.path,
        reqId: req.id || req.headers['x-request-id'],
      },
      'Unexpected error',
    );
  }

  res.status(statusCode);

  // WHY: Browser endpoints prefer HTML; machine callers still get JSON.
  if (req.accepts('html')) {
    res.render('errors/404', { message, statusCode }, (renderErr, html) => {
      if (renderErr) {
        res.type('text/plain').send(`${statusCode} — ${message}`);
        return;
      }
      res.send(html);
    });
    return;
  }

  res.json({ error: { code, message, statusCode } });
}
