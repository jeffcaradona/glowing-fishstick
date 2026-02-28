/**
 * @module api/config/env
 * @description API-specific configuration overrides.
 */

export const apiOverrides = Object.freeze({
  appName: '{{appName}}',
  appVersion: '0.0.1',
  port: Number(process.env.PORT || {{port}}),
});
