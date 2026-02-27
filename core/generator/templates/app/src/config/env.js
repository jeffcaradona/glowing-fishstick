/**
 * @module config/env
 * @description Application-specific configuration overrides.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Overrides merged into the core config via createConfig().
 * Customize these values for your application.
 */
export const appOverrides = {
  appName: 'my-app',
  appVersion: '0.0.1',
  viewsDir: path.join(__dirname, '..', 'views'),
  publicDir: path.join(__dirname, '..', 'public'),
  // apiBaseUrl: 'http://localhost:3001',
  // apiHealthPath: '/readyz',
  // apiHealthTimeoutMs: 3000,
};
