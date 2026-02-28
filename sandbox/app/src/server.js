/**
 * @module app/server
 * @description Thin entrypoint — composes the core module with app
 * plugins and boots the server.
 */

import { createApp, createServer, createConfig } from '@glowing-fishstick/app';
import { createLogger } from '@glowing-fishstick/shared';
import { taskManagerApplicationPlugin } from './app.js';
import { appOverrides } from './config/env.js';

const logger = createLogger({ name: 'task-manager' });
const config = createConfig({ ...appOverrides, logger });
const app = createApp(config, [taskManagerApplicationPlugin]);
const { server, close, registerStartupHook, registerShutdownHook } = createServer(app, config);

// ── Optional: Register server-level startup hook ──────────────────
// Use for entry-point-specific initialization (e.g., deployment-specific setup).
// This runs before the server begins listening.
registerStartupHook(async () => {
  logger.info('Entry-point startup initialization…');
  //   // Perform deployment-specific initialization tasks
});

// ── Optional: Register server-level shutdown hook ────────────────
// Use for entry-point-specific cleanup (e.g., graceful resource release).
// This runs during graceful shutdown, before closing connections.
registerShutdownHook(async () => {
  logger.info('Entry-point shutdown cleanup…');
  // Perform deployment-specific cleanup tasks
});

export { server, close };
