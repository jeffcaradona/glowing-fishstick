// Type declarations for @glowing-fishstick/logger

import type { Logger, transport as WinstonTransport } from 'winston';
import type { RequestHandler } from 'express';

/**
 * Options for createLogger()
 */
export interface LoggerOptions {
  /** Logger name (used for context and file naming). Defaults to 'app'. */
  name?: string;

  /**
   * Minimum log level.
   * Accepted values: 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly'
   * Defaults to LOG_LEVEL environment variable or 'info'
   */
  level?: string;

  /** Directory for log files (when enableFile=true). Defaults to process.cwd()/logs */
  logDir?: string;

  /**
   * Enable JSON file logging. Defaults to false.
   * File transport is only added in non-production mode when this is true.
   */
  enableFile?: boolean;

  /**
   * Dotted paths inside log meta to mask with '[REDACTED]'.
   * Example: ['req.headers.authorization', 'password']
   */
  redact?: string[];

  /**
   * Override transports entirely. When provided, Console + File defaults are NOT
   * constructed. Useful for tests (e.g. silent transports).
   */
  transports?: WinstonTransport[];
}

/**
 * Options for createRequestLogger() middleware
 */
export interface RequestLoggerOptions {
  /**
   * Auto-generate request IDs if not already present.
   * Defaults to true.
   */
  generateRequestId?: boolean;
}

/**
 * Create a Winston logger instance.
 *
 * In development mode: colorized printf console (+ optional JSON file).
 * In production: JSON to stdout only.
 *
 * @param options - Configuration options
 * @returns Winston logger instance
 *
 * @example
 * import { createLogger } from '@glowing-fishstick/logger';
 * const logger = createLogger({ name: 'server', level: 'debug' });
 * logger.info('Server listening', { port: 3000 });
 */
export function createLogger(options?: LoggerOptions): Logger;

/**
 * Create an HTTP request/response logging middleware.
 * Uses native Winston call signature: `logger.info(message, meta)`.
 *
 * @param logger - Winston logger instance
 * @param options - Middleware options
 * @returns Express middleware function
 *
 * @example
 * import { createLogger, createRequestLogger } from '@glowing-fishstick/logger';
 * const logger = createLogger({ name: 'http' });
 * app.use(createRequestLogger(logger));
 */
export function createRequestLogger(logger: Logger, options?: RequestLoggerOptions): RequestHandler;
