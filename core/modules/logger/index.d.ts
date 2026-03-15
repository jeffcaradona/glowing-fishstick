// Type declarations for @glowing-fishstick/logger

import type { Logger } from 'pino';
import type { RequestHandler } from 'express';

/**
 * Options for createLogger()
 */
export interface LoggerOptions {
  /** Logger name (used for context and file naming). Defaults to 'app'. */
  name?: string;

  /**
   * Minimum log level.
   * Accepted values: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
   * Defaults to LOG_LEVEL environment variable or 'info'
   */
  logLevel?: string;

  /** Directory for log files. Defaults to process.cwd()/logs */
  logDir?: string;

  /**
   * Enable file logging in development mode.
   * In production, logs are JSON to stdout only.
   * Defaults to true.
   */
  enableFile?: boolean;
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
 * Create a Pino logger instance.
 *
 * In development mode (NODE_ENV=development):
 * - Logs to stdout with pretty formatting (colorized, human-readable)
 * - Logs to file in JSON format (./logs/<name>.log)
 *
 * In production mode:
 * - Logs to stdout in JSON format only (for container log collection)
 *
 * @param options - Configuration options
 * @returns Pino logger instance
 *
 * @example
 * import { createLogger } from '@glowing-fishstick/logger';
 * const logger = createLogger({ name: 'server', logLevel: 'debug' });
 * logger.info('Server listening', { port: 3000 });
 */
export function createLogger(options?: LoggerOptions): Logger;

/**
 * Create an HTTP request/response logging middleware.
 * Logs incoming requests and outgoing responses with timing and status.
 * Automatically generates request IDs if not already present.
 *
 * @param logger - Logger instance to use
 * @param options - Middleware options
 * @returns Express middleware function
 *
 * @example
 * import { createLogger, createRequestLogger } from '@glowing-fishstick/logger';
 * const logger = createLogger({ name: 'http' });
 * app.use(createRequestLogger(logger));
 */
export function createRequestLogger(logger: Logger, options?: RequestLoggerOptions): RequestHandler;
