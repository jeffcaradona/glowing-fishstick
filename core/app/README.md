# @glowing-fishstick/app

> Core application factory and configuration module for the glowing-fishstick framework.

## Overview

This package provides the main application factory, server factory, configuration utilities, and error handling for building composable Express.js applications. It is designed to be consumed as an npm module by downstream apps.

## Features

- Factory functions for creating Express apps and HTTP servers
- Plugin contract for custom routes, middleware, and views
- Built-in health, admin, and landing routes
- Configuration management with environment variable support
- Graceful shutdown for container environments
- Functional programming patterns for testability and composability

## Usage

Install via npm (when published):

```bash
npm install @glowing-fishstick/app
```

Import and compose your app:

```js
import { createApp, createServer, createConfig } from '@glowing-fishstick/app';
import { myPlugin } from './my-plugin.js';

const config = createConfig({ appName: 'my-app' });
const app = createApp(config, [myPlugin]);
const { server, close } = createServer(app, config);
```

## API Reference

See the main [glowing-fishstick documentation](../../README.md) for full API details.

## License

MIT
