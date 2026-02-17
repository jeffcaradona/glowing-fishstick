/**
 * @module server
 * @description Thin app entrypoint for local development.
 */

import { createApp, createServer, createConfig } from '@glowing-fishstick/app';
import { createLogger } from '@glowing-fishstick/shared';
import { myApplicationPlugin } from './app.js';
import { appOverrides } from './config/env.js';

const logger = createLogger({ name: 'my-app' });
const config = createConfig({ ...appOverrides, logger });
const app = createApp(config, [myApplicationPlugin]);
const { server, close, registerStartupHook, registerShutdownHook } = createServer(app, config);

registerStartupHook(async () => {
  logger.info('Entry-point startup initialization...');
});

registerShutdownHook(async () => {
  logger.info('Entry-point shutdown cleanup...');
});

export { server, close };
