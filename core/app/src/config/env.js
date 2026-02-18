/**
 * @module config/env
 * @description Configuration factory and utilities for the core module.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createServiceContainer } from '@glowing-fishstick/shared';

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

  const config = {
    port: Number(overrides.port ?? env.PORT ?? DEFAULTS.port),
    nodeEnv: overrides.nodeEnv ?? env.NODE_ENV ?? DEFAULTS.nodeEnv,
    appName: overrides.appName ?? env.APP_NAME ?? DEFAULTS.appName,
    appVersion: overrides.appVersion ?? env.APP_VERSION ?? DEFAULTS.appVersion,
    frameworkVersion: FRAMEWORK_VERSION,
    apiBaseUrl: overrides.apiBaseUrl ?? env.API_BASE_URL ?? defaultApiBaseUrl,
    apiHealthPath: overrides.apiHealthPath ?? env.API_HEALTH_PATH ?? DEFAULTS.apiHealthPath,
    apiHealthTimeoutMs: Number(
      overrides.apiHealthTimeoutMs ?? env.API_HEALTH_TIMEOUT_MS ?? DEFAULTS.apiHealthTimeoutMs,
    ),
    services: overrides.services ?? createServiceContainer({ logger: overrides.logger }),
    ...overrides,
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
export function filterSensitiveKeys(config) {
  return Object.fromEntries(
    Object.entries(config)
      .filter(([key]) => !SENSITIVE_PATTERN.test(key))
      .map(([key, value]) => {
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
