/**
 * @module app/config/env
 * @description App-specific configuration overrides.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Overrides merged into the core config via createConfig().
 * Points `viewsDir` at the app's own views directory so the app
 * can provide custom templates alongside the core views.
 */
export const appOverrides = {
  appName: 'task_manager',
  appVersion: '1.0.0',
  viewsDir: path.join(__dirname, '..', 'views'),
};
