/**
 * @module app/config/env
 * @description App-specific configuration overrides.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read at startup (before the server accepts traffic) — sync I/O is safe here.
const { version } = JSON.parse(
  readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
);

/**
 * Overrides merged into the core config via createConfig().
 * Points `viewsDir` at the app's own views directory so the app
 * can provide custom templates alongside the core views.
 */
export const appOverrides = {
  appName: 'task_manager',
  appVersion: version,
  viewsDir: path.join(__dirname, '..', 'views'),
  publicDir: path.join(__dirname, '..', 'public'),
  /** Base URL of the tasks REST API (api/ workspace). Override via API_URL env var. */
  apiUrl: process.env.API_URL ?? 'http://localhost:3001',
};
