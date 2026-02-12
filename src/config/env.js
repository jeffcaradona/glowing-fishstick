/**
 * @module config/env
 * @description Configuration factory and utilities for the core module.
 */

/**
 * Regex pattern matching sensitive key names that should be filtered
 * from config output (case-insensitive).
 */
const SENSITIVE_PATTERN = /SECRET|KEY|PASSWORD|TOKEN|CREDENTIAL/i;

/**
 * Default configuration values.
 * @type {Readonly<Record<string, string|number>>}
 */
const DEFAULTS = Object.freeze({
  port: 3000,
  nodeEnv: 'development',
  appName: 'app',
  appVersion: '0.0.0',
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
  const config = {
    port: Number(overrides.port ?? env.PORT ?? DEFAULTS.port),
    nodeEnv: overrides.nodeEnv ?? env.NODE_ENV ?? DEFAULTS.nodeEnv,
    appName: overrides.appName ?? env.APP_NAME ?? DEFAULTS.appName,
    appVersion: overrides.appVersion ?? env.APP_VERSION ?? DEFAULTS.appVersion,
    ...overrides,
  };

  return Object.freeze(config);
}

/**
 * Return a shallow copy of `config` with keys matching the sensitive
 * pattern removed. Used by the admin config viewer to prevent
 * accidental secret exposure.
 *
 * @param {object} config - The configuration object to filter.
 * @returns {object} A new object with sensitive keys removed.
 */
export function filterSensitiveKeys(config) {
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => !SENSITIVE_PATTERN.test(key)),
  );
}