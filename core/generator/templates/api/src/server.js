/**
 * @module api/server
 * @description Thin API entrypoint for local development.
 */

import { createApi, createApiConfig } from '@glowing-fishstick/api';
import { createServer, createLogger } from '@glowing-fishstick/shared';
import { myApiPlugin } from './api.js';
import { apiOverrides } from './config/env.js';

const logger = createLogger({ name: 'my-api' });
const config = createApiConfig({ ...apiOverrides, logger });
const app = createApi(config, [myApiPlugin]);

const { server, close, registerStartupHook, registerShutdownHook } = createServer(app, config);

registerStartupHook(async () => {
  logger.info('API entry-point startup initialization...');
});

registerShutdownHook(async () => {
  logger.info('API entry-point shutdown cleanup...');
});

export { server, close };
