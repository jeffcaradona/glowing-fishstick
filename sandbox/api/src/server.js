/**
 * @module api/server
 * @description Thin API entrypoint for local development.
 */

import { createApi, createApiConfig } from '@glowing-fishstick/api';
import { createServer, createLogger } from '@glowing-fishstick/shared';
import { taskApiPlugin } from './api.js';
import { appOverrides } from './config/env.js';

const logger = createLogger({ name: 'task-api' });
const config = createApiConfig({ ...appOverrides, logger });
const app = createApi(config, [taskApiPlugin]);

const { server, close, registerStartupHook, registerShutdownHook } = createServer(app, config);

registerStartupHook(async () => {
  logger.info('Entry-point API startup initialization...');
});

registerShutdownHook(async () => {
  logger.info('Entry-point API shutdown cleanup...');
});

export { server, close };
