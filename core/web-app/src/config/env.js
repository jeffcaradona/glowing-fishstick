/**
 * @module config/env
 * @description Configuration factory and utilities for the core module.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createServiceContainer, createLogger } from '@glowing-fishstick/shared';

/**
 * Regex pattern matching sensitive key names that should be filtered
 * from config output (case-insensitive).
 */
const SENSITIVE_PATTERN = /SECRET|KEY|PASSWORD|TOKEN|CREDENTIAL/i;

/**
 * Repository root directory - discovered by traversing up looking for jsconfig.json.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read at startup (before the server accepts traffic) — sync I/O is safe here.
const FRAMEWORK_VERSION = JSON.parse(
  readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
).version;

const REPO_ROOT = (() => {
  let current = __dirname;
  const root = path.parse(current).root;
  while (current !== root) {
    try {
      // Check if jsconfig.json exists in this directory (repo root marker)
      const configPath = path.join(current, 'jsconfig.json');
      if (existsSync(configPath)) {
        return current;
      }
      // Also check for package.json with expected repo structure
      const pkgPath = path.join(current, 'package.json');
      if (existsSync(pkgPath)) {
        const content = readFileSync(pkgPath, 'utf8');
        if (
          content.includes('"name"') &&
          (content.includes('glowing-fishstick') || content.includes('"type": "module"'))
        ) {
          // Check if core/ subdirectory exists to confirm repo root
          if (existsSync(path.join(current, 'core'))) {
            return current;
          }
        }
      }
    } catch {
      // Continue traversing
    }
    current = path.dirname(current);
  }
  return root;
})();

/**
 * Default configuration values.
 * @type {Readonly<Record<string, string|number>>}
 */
const DEFAULTS = Object.freeze({
  port: 3000,
  nodeEnv: 'development',
  appName: 'app',
  appVersion: '0.0.0',
  apiHealthPath: '/readyz',
  apiHealthTimeoutMs: 3000,
  jsonBodyLimit: '100kb',
  urlencodedBodyLimit: '100kb',
  urlencodedParameterLimit: 1000,
  adminRateLimitWindowMs: 60000,
  adminRateLimitMax: 60,
});

/**
 * @typedef {object} AppConfig
 * @property {number}  port       - HTTP listen port.
 * @property {string}  nodeEnv    - Runtime environment (development | production | test).
 * @property {string}  appName    - Human-readable application name.
 * @property {string}  appVersion - Semantic version of the consuming application.
 */

/**
 * Build a frozen configuration object by layering defaults, environment
 * variables, and explicit overrides (highest priority).
 *
 * @param {object} [overrides={}] - Consumer-provided config values.
 * @param {object} [env=process.env] - Environment variable source (injectable for tests).
 * @returns {Readonly<AppConfig>} Frozen configuration object.
 */
export function createConfig(overrides = {}, env = process.env) {
  const defaultApiBaseUrl = `http://localhost:${Number(env.API_PORT ?? 3001)}`;

  const appName = overrides.appName ?? env.APP_NAME ?? DEFAULTS.appName;

  // WHY: Consumer-provided logger always wins. When unset, auto-construct one from
  // optional knobs so consumers can opt into structured logging without importing
  // createLogger themselves. Defaults match @glowing-fishstick/logger (level via
  // LOG_LEVEL env or 'info'; file transport off by default).
  const logLevel = overrides.logLevel ?? env.LOG_LEVEL;
  const logDir = overrides.logDir ?? env.LOG_DIR;
  const enableFileLogging =
    overrides.enableFileLogging ??
    (env.ENABLE_FILE_LOGGING ? env.ENABLE_FILE_LOGGING === 'true' : undefined);
  const logRedact = overrides.logRedact;
  const logger =
    overrides.logger ??
    createLogger({
      name: appName,
      ...(logLevel ? { level: logLevel } : {}),
      ...(logDir ? { logDir } : {}),
      ...(enableFileLogging === undefined ? {} : { enableFile: enableFileLogging }),
      ...(logRedact ? { redact: logRedact } : {}),
    });

  const config = {
    port: Number(overrides.port ?? env.PORT ?? DEFAULTS.port),
    nodeEnv: overrides.nodeEnv ?? env.NODE_ENV ?? DEFAULTS.nodeEnv,
    appName,
    appVersion: overrides.appVersion ?? env.APP_VERSION ?? DEFAULTS.appVersion,
    frameworkVersion: FRAMEWORK_VERSION,
    apiBaseUrl: overrides.apiBaseUrl ?? env.API_BASE_URL ?? defaultApiBaseUrl,
    apiHealthPath: overrides.apiHealthPath ?? env.API_HEALTH_PATH ?? DEFAULTS.apiHealthPath,
    apiHealthTimeoutMs: Number(
      overrides.apiHealthTimeoutMs ?? env.API_HEALTH_TIMEOUT_MS ?? DEFAULTS.apiHealthTimeoutMs,
    ),
    // WHY: Enforce request payload ceilings to prevent OOM from unbounded body parsing.
    jsonBodyLimit: overrides.jsonBodyLimit ?? env.APP_JSON_BODY_LIMIT ?? DEFAULTS.jsonBodyLimit,
    urlencodedBodyLimit:
      overrides.urlencodedBodyLimit ??
      env.APP_URLENCODED_BODY_LIMIT ??
      DEFAULTS.urlencodedBodyLimit,
    urlencodedParameterLimit: Number(
      overrides.urlencodedParameterLimit ??
        env.APP_URLENCODED_PARAMETER_LIMIT ??
        DEFAULTS.urlencodedParameterLimit,
    ),
    // WHY: Admin endpoints are expensive (dashboard fetches, config reads).
    // Fixed-window throttle prevents burst-driven resource exhaustion.
    adminRateLimitWindowMs: Number(
      overrides.adminRateLimitWindowMs ??
        env.APP_ADMIN_RATE_LIMIT_WINDOW_MS ??
        DEFAULTS.adminRateLimitWindowMs,
    ),
    adminRateLimitMax: Number(
      overrides.adminRateLimitMax ?? env.APP_ADMIN_RATE_LIMIT_MAX ?? DEFAULTS.adminRateLimitMax,
    ),
    services: overrides.services ?? createServiceContainer({ logger }),
    ...overrides,
    // WHY: spread overrides above for forward-compat, then re-assert the resolved
    // logger/services so consumer-injected values still win without leaving the
    // auto-constructed instances dangling.
    logger: overrides.logger ?? logger,
  };

  return Object.freeze(config);
}

/**
 * Return a shallow copy of `config` with keys matching the sensitive
 * pattern removed and absolute paths converted to repo-relative paths.
 * Used by the admin config viewer to prevent accidental secret exposure
 * and to display paths in a more readable format.
 *
 * @param {object} config - The configuration object to filter.
 * @returns {object} A new object with sensitive keys removed and paths normalized.
 */
// WHY: Runtime singletons injected into config (e.g. winston Logger, ServiceContainer)
// contain circular structures that throw inside the admin config template's
// JSON.stringify call. Pre-Winston Pino loggers serialized cleanly; Winston does not.
// Replace these with short, stable placeholders so the admin UI can still surface
// which runtime objects are present without crashing on serialization.
const NON_SERIALIZABLE_KEYS = new Set(['logger', 'services']);

export function filterSensitiveKeys(config) {
  return Object.fromEntries(
    Object.entries(config)
      .filter(([key]) => !SENSITIVE_PATTERN.test(key))
      .map(([key, value]) => {
        if (NON_SERIALIZABLE_KEYS.has(key) && value && typeof value === 'object') {
          return [key, `[${value.constructor?.name ?? 'Object'}]`];
        }
        // Convert absolute paths to repo-relative paths for display
        if (typeof value === 'string' && path.isAbsolute(value)) {
          try {
            const relativePath = path.relative(REPO_ROOT, value);
            // Only use relative path if it doesn't start with '..' (outside repo)
            if (!relativePath.startsWith('..')) {
              // Normalize to forward slashes for cross-platform display
              return [key, relativePath.replaceAll('\\', '/')];
            }
          } catch {
            // If conversion fails, keep original value
          }
        }
        return [key, value];
      }),
  );
}
