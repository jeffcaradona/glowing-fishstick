/**
 * @module config/env
 * @description Configuration factory for the API module.
 */

const DEFAULTS = Object.freeze({
  port: 3001,
  nodeEnv: 'development',
  appName: 'api',
  appVersion: '0.0.0',
  enableRequestLogging: true,
  allowProcessExit: true,
  shutdownTimeout: 30000,
});

/**
 * Build a frozen API config object by layering defaults, env vars,
 * and explicit overrides (highest priority).
 *
 * @param {object} [overrides={}]
 * @param {object} [env=process.env]
 * @returns {Readonly<object>}
 */
export function createApiConfig(overrides = {}, env = process.env) {
  const config = {
    port: Number(overrides.port ?? env.PORT ?? DEFAULTS.port),
    nodeEnv: overrides.nodeEnv ?? env.NODE_ENV ?? DEFAULTS.nodeEnv,
    appName: overrides.appName ?? env.APP_NAME ?? DEFAULTS.appName,
    appVersion: overrides.appVersion ?? env.APP_VERSION ?? DEFAULTS.appVersion,
    enableRequestLogging:
      overrides.enableRequestLogging ??
      (env.ENABLE_REQUEST_LOGGING
        ? env.ENABLE_REQUEST_LOGGING === 'true'
        : DEFAULTS.enableRequestLogging),
    allowProcessExit:
      overrides.allowProcessExit ??
      (env.ALLOW_PROCESS_EXIT ? env.ALLOW_PROCESS_EXIT === 'true' : DEFAULTS.allowProcessExit),
    shutdownTimeout: Number(
      overrides.shutdownTimeout ?? env.SHUTDOWN_TIMEOUT ?? DEFAULTS.shutdownTimeout,
    ),
    logger: overrides.logger,
    ...overrides,
  };

  return Object.freeze(config);
}
