/**
 * @module app/server
 * @description Thin entrypoint — composes the core module with app
 * plugins and boots the server.
 */


import { createApp, createServer, createConfig } from '@glowing-fishstick/app';
import { taskManagerApplicationPlugin } from './app.js';
import { appOverrides } from './config/env.js';

const config = createConfig(appOverrides);
const app = createApp(config, [taskManagerApplicationPlugin]);
const { server, close } = createServer(app, config);

export { server, close };
