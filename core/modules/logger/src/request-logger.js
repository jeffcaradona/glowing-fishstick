/**
 * @module logger/request-logger
 * @description Express HTTP request/response logging middleware.
 *
 * Logs incoming requests and outgoing responses with timing, status, and request ID.
 * Uses native Winston call signature: `logger.info(message, meta)`.
 */

import crypto from 'node:crypto';

/**
 * Create an HTTP request/response logging middleware.
 * Automatically generates request IDs if not already present.
 *
 * @param {import('winston').Logger} logger - Winston logger instance
 * @param {object} [options] - Middleware options
 * @param {boolean} [options.generateRequestId=true] - Auto-generate request IDs
 * @returns {Function} Express middleware
 */
export function createRequestLogger(logger, options = {}) {
  const { generateRequestId = true } = options;

  if (!logger || typeof logger.info !== 'function') {
    throw new TypeError('createRequestLogger requires a valid logger instance');
  }

  return (req, res, next) => {
    if (generateRequestId && !req.id) {
      req.id = req.headers['x-request-id'] || crypto.randomUUID();
      res.setHeader('x-request-id', req.id);
    }

    const startTime = Date.now();
    const method = req.method;
    const pathname = req.path;
    const reqId = req.id || req.headers['x-request-id'];

    logger.info('Request received', {
      type: 'http.request',
      method,
      pathname,
      reqId,
    });

    // WHY: Use 'finish' event instead of monkey-patching res.end. Preserves the full
    // res.end contract and avoids conflicts with other middleware / APM tools.
    res.once('finish', () => {
      const duration = Date.now() - startTime;
      const status = res.statusCode;

      logger.info('Response sent', {
        type: 'http.response',
        method,
        pathname,
        status,
        duration,
        reqId,
      });
    });

    next();
  };
}
