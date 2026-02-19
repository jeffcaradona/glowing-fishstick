/**
 * @module logger
 * @description Pino logger factory and middleware for structured logging.
 *
 * Features:
 * - Development: pretty console output + JSON file logging
 * - Production: JSON to stdout for container log collection
 * - Automatic logs/ directory creation in consumer app root
 * - Configurable log levels, directory, and behavior
 * - Optional HTTP request/response logging middleware
 * - Request ID generation and tracking
 *
 * @example
 * // Basic usage with defaults
 * import { createLogger } from '@glowing-fishstick/shared';
 * const logger = createLogger();
 * logger.info('Server starting...');
 *
 * @example
 * // Custom configuration
 * const logger = createLogger({
 *   name: 'my-service',
 *   logLevel: 'debug',
 *   logDir: './logs'
 * });
 *
 * @example
 * // With HTTP request logging middleware
 * import { createLogger, createRequestLogger } from '@glowing-fishstick/shared';
 * const logger = createLogger({ name: 'http' });
 * app.use(createRequestLogger(logger));
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';

/**
 * Create a Pino logger instance.
 *
 * In development mode (NODE_ENV=development):
 * - Logs to stdout with pretty formatting (colorized, human-readable)
 * - Logs to file in JSON format (./logs/<name>.log)
 *
 * In production mode:
 * - Logs to stdout in JSON format only (for container log collection)
 *
 * @param {object} [options] - Configuration options
 * @param {string} [options.name='app'] - Logger name (used for file naming
 *   and context)
 * @param {string} [options.logLevel] - Minimum log level
 *   (trace|debug|info|warn|error|fatal). Defaults to LOG_LEVEL env var or 'info'
 * @param {string} [options.logDir] - Directory for log files. Defaults to
 *   process.cwd()/logs
 * @param {boolean} [options.enableFile=true] - Enable file logging in
 *   development mode
 * @returns {import('pino').Logger} Pino logger instance
 *
 * @example
 * const logger = createLogger({ name: 'server', logLevel: 'debug' });
 * logger.debug('Detailed trace info');
 * logger.info('Server listening', { port: 3000 });
 * logger.error({ err: new Error('failure') }, 'Operation failed');
 */
export function createLogger(options = {}) {
  const { name = 'app', logLevel, logDir, enableFile = true } = options;

  const isDevelopment = process.env.NODE_ENV === 'development';
  const level = logLevel || process.env.LOG_LEVEL || 'info';

  const pinoOptions = {
    name,
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  // Production: JSON to stdout only
  if (!isDevelopment) {
    return pino(pinoOptions);
  }

  // Development: multistream (pretty stdout + optional JSON file)
  const streams = [
    {
      level,
      stream: pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }),
    },
  ];

  // Add file stream if enabled
  if (enableFile) {
    const baseLogDir = logDir || path.resolve(process.cwd(), 'logs');

    // Ensure logs directory exists
    try {
      fs.mkdirSync(baseLogDir, { recursive: true });
    } catch (error) {
      // If directory creation fails, log to console (logger not yet ready)
      console.error(`Failed to create log directory at ${baseLogDir}:`, error);
    }

    // Sanitize filename: replace colons (Windows reserved char) with hyphens
    const sanitizedName = name.replaceAll(':', '-');
    const logFile = path.join(baseLogDir, `${sanitizedName}.log`);

    streams.push({
      level,
      stream: fs.createWriteStream(logFile, { flags: 'a' }),
    });
  }

  return pino(pinoOptions, pino.multistream(streams));
}

/**
 * Create an HTTP request/response logging middleware.
 * Logs incoming requests and outgoing responses with timing and status.
 * Automatically generates request IDs if not already present.
 *
 * @param {import('pino').Logger} logger - Logger instance to use
 * @param {object} [options] - Middleware options
 * @param {boolean} [options.generateRequestId=true] - Auto-generate request IDs
 * @returns {Function} Express middleware
 *
 * @example
 * import { createLogger, createRequestLogger } from '@glowing-fishstick/shared';
 * const logger = createLogger({ name: 'http' });
 * app.use(createRequestLogger(logger));
 *
 * @example
 * // Disable automatic request ID generation (if using separate middleware)
 * import { createRequestIdMiddleware } from '@glowing-fishstick/shared';
 * app.use(createRequestIdMiddleware());
 * app.use(createRequestLogger(logger, { generateRequestId: false }));
 *
 * @example
 * // Output (development):
 * [2026-02-15 10:23:45] INFO (http): Request received
 *   method: "GET"
 *   pathname: "/api/tasks"
 *   reqId: "abc123"
 * [2026-02-15 10:23:45] INFO (http): Response sent
 *   method: "GET"
 *   pathname: "/api/tasks"
 *   status: 200
 *   duration: 15
 *   reqId: "abc123"
 */
export function createRequestLogger(logger, options = {}) {
  const { generateRequestId = true } = options;

  if (!logger || typeof logger.info !== 'function') {
    throw new TypeError('createRequestLogger requires a valid logger instance');
  }

  return (req, res, next) => {
    // Generate request ID if not present and option is enabled
    if (generateRequestId && !req.id) {
      req.id = req.headers['x-request-id'] || crypto.randomUUID();
      res.setHeader('x-request-id', req.id);
    }

    const startTime = Date.now();
    const method = req.method;
    const pathname = req.path;
    const reqId = req.id || req.headers['x-request-id'];

    // Log incoming request
    logger.info(
      {
        type: 'http.request',
        method,
        pathname,
        reqId,
      },
      'Request received',
    );

    // Log response completion via lifecycle event instead of monkey-patching res.end.
    // Using 'finish' preserves the full res.end contract and avoids conflicts with
    // other middleware or APM tools that observe response methods.
    res.once('finish', () => {
      const duration = Date.now() - startTime;
      const status = res.statusCode;

      logger.info(
        {
          type: 'http.response',
          method,
          pathname,
          status,
          duration,
          reqId,
        },
        'Response sent',
      );
    });

    next();
  };
}
