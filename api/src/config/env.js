/**
 * @module api/config/env
 * @description Local app overrides for the api workspace.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read at startup (before the server accepts traffic) — sync I/O is safe here.
const { version } = JSON.parse(
  readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
);

export const appOverrides = Object.freeze({
  appName: 'glowing-fishstick-tasks-api',
  appVersion: version,
  port: Number(process.env.PORT || 3001),
});
