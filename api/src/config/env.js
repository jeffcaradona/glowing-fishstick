/**
 * @module api/config/env
 * @description Local app overrides for the api workspace.
 */

export const appOverrides = Object.freeze({
  appName: 'glowing-fishstick-tasks-api',
  appVersion: '0.0.1',
  port: Number(process.env.PORT || 3001),
});
