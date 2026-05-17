/**
 * @module middlewares/error-utils
 * @description Shared error normalization and logging utilities used by
 * both the app and API error-handler middlewares.
 *
 * WHY: The app error handler (HTML + JSON content-negotiation) and the
 * API error handler (JSON-only) intentionally diverge on response format
 * but share identical normalization and logging logic. Extracting those
 * shared lines here satisfies Sonar's duplication threshold without
 * consolidating the handlers themselves (which AGENTS-readable.md forbids).
 *
 * VERIFY IF CHANGED: Both core/web-app/src/middlewares/errorHandler.js and
 * core/service-api/src/middlewares/error-handler.js depend on these utilities.
 */

/**
 * Normalize a thrown error into a stable envelope shape.
 *
 * @param {Error} err - The error thrown or passed to next().
 * @returns {{ statusCode: number, code: string, message: string }}
 */
export function normalizeError(err) {
  return {
    statusCode: err.statusCode || 500,
    code: err.code || 'INTERNAL_ERROR',
    // WHY: Non-operational errors are masked to avoid leaking internals.
    message: err.isOperational ? err.message : 'Internal server error',
  };
}

/**
 * Resolve the appropriate log function from Express request context.
 *
 * WHY: Logger is startup-injected via app.locals to avoid per-request
 * object instantiation on error paths (Snyk javascript/NoRateLimitingForExpensiveWebOperation).
 * Fallback to console.error preserves error visibility without allocation overhead.
 *
 * WHY (signature): Callers pass `(meta, msg)` for ergonomic reasons (meta is
 * usually the larger object literal). We flip to native Winston `(msg, meta)`
 * inside this helper so call sites in app and api error handlers stay untouched.
 *
 * @param {import('express').Request} req
 * @returns {(meta: object, msg: string) => void}
 */
export function resolveErrorLogger(req) {
  const logger = req.app?.locals?.logger;
  return logger ? (meta, msg) => logger.error(msg, meta) : (meta, msg) => console.error(msg, meta);
}

/**
 * Log an unexpected (non-operational) error with request context.
 *
 * @param {import('express').Request} req
 * @param {Error}  err
 * @param {(meta: object, msg: string) => void} logFn - From resolveErrorLogger().
 * @param {string} [label='Unexpected error'] - Log message label.
 */
export function logUnexpectedError(req, err, logFn, label = 'Unexpected error') {
  logFn(
    {
      // WHY: Winston's format.errors({ stack: true }) only unwraps an Error passed
      // as the top-level meta value; nested Error instances inside a meta object
      // lose all non-enumerable properties (message, name, stack) during JSON
      // serialization and surface as `"err":{}`, hiding the actual failure.
      // Explicitly extract the fields so logs are always actionable.
      err: serializeError(err),
      method: req.method,
      path: req.path,
      reqId: req.id || req.headers['x-request-id'],
    },
    label,
  );
}

/**
 * Serialize an Error (or unknown thrown value) into a plain object that
 * survives JSON serialization without losing message/name/stack.
 *
 * @param {unknown} err
 * @returns {object}
 */
export function serializeError(err) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      // WHY: Preserve common operational-error metadata (AppError.statusCode/code,
      // upstream cause) so downstream log consumers can filter without re-parsing.
      ...(err.code === undefined ? {} : { code: err.code }),
      ...(err.statusCode === undefined ? {} : { statusCode: err.statusCode }),
      ...(err.cause === undefined ? {} : { cause: serializeError(err.cause) }),
    };
  }
  return { value: err };
}
