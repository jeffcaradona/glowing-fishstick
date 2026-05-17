/**
 * @module logger/logger
 * @description Winston logger factory.
 *
 * Features:
 * - Development: colorized printf console output + optional JSON file logging
 * - Production: JSON to stdout for container log collection
 * - Optional redaction of sensitive fields (dotted paths)
 * - Optional custom transports override
 *
 * Exported call signature is native Winston: `logger.info(message, meta)`.
 *
 * @example
 * import { createLogger } from '@glowing-fishstick/logger';
 * const logger = createLogger({ name: 'server', level: 'debug' });
 * logger.info('Server listening', { port: 3000 });
 * logger.error('Operation failed', { err: new Error('boom') });
 */

import fs from 'node:fs';
import path from 'node:path';
import winston from 'winston';

const { format, transports: winstonTransports } = winston;

/**
 * Walk a meta object and replace values at the given dotted paths with '[REDACTED]'.
 * Returns a new object; never mutates input. Used by the redaction format.
 *
 * WHY: Winston has no built-in redaction. We implement a minimal, path-based masker
 * that mirrors the most common Pino `redact` use case (auth headers, tokens) without
 * pulling in additional dependencies.
 *
 * @param {object} info - Winston log info object
 * @param {string[]} paths - Dotted paths to redact (e.g. 'req.headers.authorization')
 * @returns {object} New info object with redactions applied
 */
function redactPaths(info, paths) {
  if (!paths.length) return info;
  // Shallow-clone the top level so we can mutate nested structures safely without
  // disturbing the caller's meta object.
  const cloned = { ...info };
  for (const dotted of paths) {
    const segments = dotted.split('.');
    let cursor = cloned;
    let parent = null;
    let lastKey = null;
    for (let i = 0; i < segments.length; i += 1) {
      const key = segments[i];
      if (cursor == null || typeof cursor !== 'object' || !(key in cursor)) {
        cursor = undefined;
        break;
      }
      // Clone each level we descend into so we don't mutate caller-owned objects.
      const next = cursor[key];
      if (i < segments.length - 1) {
        const cloneNext = next && typeof next === 'object' ? { ...next } : next;
        cursor[key] = cloneNext;
        cursor = cloneNext;
      } else {
        parent = cursor;
        lastKey = key;
      }
    }
    if (parent && lastKey != null && lastKey in parent) {
      parent[lastKey] = '[REDACTED]';
    }
  }
  return cloned;
}

/**
 * Build the redaction format. Returns a no-op format when paths is empty.
 *
 * @param {string[]} paths
 * @returns {import('logform').Format}
 */
function createRedactFormat(paths) {
  return format((info) => (paths.length ? redactPaths(info, paths) : info))();
}

/**
 * Dev printf format: human-readable line with appended JSON meta when present.
 * WHY: Winston's default printf is sparse; this mirrors the previous pino-pretty
 * developer ergonomics (timestamp, level, name, message, meta).
 */
const devPrintf = format.printf((info) => {
  const { timestamp, level, message, name, stack, ...rest } = info;
  // Symbol-keyed Winston internals (level, splat) are filtered automatically by
  // destructure; only enumerable string keys appear in `rest`.
  const metaKeys = Object.keys(rest);
  const metaPart = metaKeys.length ? ` ${JSON.stringify(rest)}` : '';
  const stackPart = stack ? `\n${stack}` : '';
  const namePart = name ? ` [${name}]` : '';
  return `${timestamp} ${level}${namePart} ${message}${metaPart}${stackPart}`;
});

/**
 * Create a Winston logger instance.
 *
 * In development mode (NODE_ENV=development):
 * - Console: colorized printf
 * - Optional file: JSON
 *
 * In production:
 * - Console: JSON (for container log collectors)
 *
 * @param {object} [options] - Configuration options
 * @param {string} [options.name='app'] - Logger name (logged as `name`; used for file naming)
 * @param {string} [options.level] - Minimum log level. Defaults to LOG_LEVEL env var or 'info'
 * @param {string} [options.logDir] - Directory for log files. Defaults to process.cwd()/logs
 * @param {boolean} [options.enableFile=false] - Enable file transport (JSON)
 * @param {string[]} [options.redact=[]] - Dotted paths to mask with '[REDACTED]'
 * @param {import('winston').transport[]} [options.transports] - Override transports entirely
 *   (useful for tests; suppresses Console + File construction)
 * @returns {import('winston').Logger} Winston logger instance
 *
 * @example
 * const logger = createLogger({ name: 'server', level: 'debug' });
 * logger.debug('Detailed trace info');
 * logger.info('Server listening', { port: 3000 });
 * logger.error('Operation failed', { err: new Error('boom') });
 */
export function createLogger(options = {}) {
  const {
    name = 'app',
    level,
    logDir,
    enableFile = false,
    redact = [],
    transports: transportsOverride,
  } = options;

  const env = process.env.NODE_ENV;
  const isProduction = env === 'production';
  const isTest = env === 'test';
  const resolvedLevel = level || process.env.LOG_LEVEL || 'info';

  // Logger-level formats are applied BEFORE any transport-specific format.
  // WHY: placing redaction + error/stack serialization here ensures consumer-supplied
  // `transports` (e.g. test transports) also get redaction applied automatically.
  // - errors({ stack: true }) ensures Error meta serializes with `stack`; without
  //   this Winston serializes Error instances as `{}`. Matches Pino's default
  //   err serializer behavior consumers depend on.
  const loggerFormat = format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    createRedactFormat(redact),
  );

  let transports;
  if (transportsOverride) {
    transports = transportsOverride;
  } else if (isProduction) {
    transports = [
      new winstonTransports.Console({
        format: format.json(),
      }),
    ];
  } else {
    // Dev / test default: colorized console.
    // WHY: colorize disabled in test mode to keep test output clean and free of ANSI noise.
    const consoleFormats = [];
    if (!isTest) {
      consoleFormats.push(format.colorize());
    }
    consoleFormats.push(devPrintf);
    transports = [new winstonTransports.Console({ format: format.combine(...consoleFormats) })];

    if (enableFile) {
      const baseLogDir = logDir || path.resolve(process.cwd(), 'logs');
      try {
        fs.mkdirSync(baseLogDir, { recursive: true });
      } catch (error) {
        // Logger is not yet constructed; fall back to console.error so the user sees the cause.
        console.error(`Failed to create log directory at ${baseLogDir}:`, error);
      }
      // Sanitize filename: replace colons (Windows reserved char) with hyphens.
      const sanitizedName = name.replaceAll(':', '-');
      const logFile = path.join(baseLogDir, `${sanitizedName}.log`);
      transports.push(
        new winstonTransports.File({
          filename: logFile,
          format: format.json(),
        }),
      );
    }
  }

  return winston.createLogger({
    level: resolvedLevel,
    defaultMeta: { name },
    format: loggerFormat,
    transports,
  });
}
