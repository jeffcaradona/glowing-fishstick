/**
 * @module demo/server
 * @description Thin entrypoint — composes the core module with demo
 * plugins and boots the server.
 */

import { createApp, createServer, createConfig } from '../../index.js';
import { taskManagerApplicationPlugin } from './app.js';
import { demoOverrides } from './config/env.js';

const config = createConfig(demoOverrides);
const app = createApp(config, [taskManagerApplicationPlugin]);
const { server, close } = createServer(app, config);

export { server, close };
