# glowing-fishstick

> **A composable Express.js application framework distributed as an npm module**

> **Modular Structure:**
>
> - The root package provides documentation, development scripts, and a monorepo structure.
> - The main application logic is in [`core/app`](core/app), distributed as `@glowing-fishstick/app`.
> - Shared utilities and types are in [`core/shared`](core/shared), distributed as `@glowing-fishstick/shared`.
>
> See the individual module READMEs for usage details.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)

## Overview

`glowing-fishstick` is a demonstration of how to transform a traditional Express.js template into a proper, versioned npm module. Instead of copying and pasting template code into every new project, you can depend on this module via `npm install` and compose your application using a plugin-based architecture.

### Problem Statement

Traditional template systems for Express.js applications suffer from:

- **Template drift** — manual updates across multiple projects
- **Coupling** — app-specific code mixed with core template logic
- **Difficult upgrades** — no semantic versioning, no dependency management

### Solution

This module provides:

- ✅ **Factory functions** for creating Express apps and HTTP servers
- ✅ **Plugin contract** for adding custom routes, middleware, and views
- ✅ **Built-in routes** for health checks, admin dashboard, and landing page
- ✅ **Configuration management** with environment variable support
- ✅ **Graceful shutdown** for Kubernetes/container environments
- ✅ **Functional programming patterns** for testability and composability

---

## Installation

```bash
npm install @glowing-fishstick/app
```

**Requirements:**

- Node.js >= 22
- ES Modules support (`"type": "module"` in package.json)

Note on repository layout and installs

- This repository is organized as a workspace containing the packages consumed by an application. The recommended consumer import is the published package name `@glowing-fishstick/app` (Option A: workspace is the source; consumers install the package).
- For local development inside this repository, package linkage is used so that `import { ... } from '@glowing-fishstick/app'` resolves to the local `core/app` package. You may also import directly from the local source (`../../index.js`) for quick experiments, but examples and docs use the package name to mirror real-world consumption.

---

## Quick Start

### 1. Create a minimal server

```js
// server.js
import { createApp, createServer, createConfig } from '@glowing-fishstick/app';

const config = createConfig({
  appName: 'my-app',
  port: 3000,
});

const app = createApp(config);
const { server, close } = createServer(app, config);
```

### 2. Run your application

```bash
node server.js
```

Visit `http://localhost:3000` to see your application running with built-in routes:

- `/` — Landing page
- `/healthz` — Kubernetes health check
- `/admin` — Admin dashboard
- `/admin/config` — Configuration viewer

---

## API Reference

### `createApp(config, plugins = [])`

Factory function that builds and returns a configured Express application.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `config` | `object` | Frozen configuration object from `createConfig()` |
| `plugins` | `Array<Plugin>` | Plugin functions to extend the app (optional) |

**Returns:** `Express` — Configured Express app instance

**Example:**

```js
const app = createApp(config, [myPlugin]);
```

**Built-in features:**

- EJS view engine with layouts
- JSON and URL-encoded body parsing
- Static file serving from `src/public/`
- Core routes (health, admin, landing)
- Error handling middleware (404 + generic error handler)

---

### `createServer(app, config)`

Factory function that starts an HTTP server and sets up graceful shutdown handlers.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `app` | `Express` | Express app instance from `createApp()` |
| `config` | `object` | Configuration object (reads `port`) |

**Returns:** `{ server, close }`
| Property | Type | Description |
|---|---|---|
| `server` | `http.Server` | Node.js HTTP server instance |
| `close` | `() => Promise<void>` | Graceful shutdown function |

**Example:**

```js
const { server, close } = createServer(app, config);

// Graceful shutdown on SIGTERM/SIGINT is automatic
// Or manually close:
await close();
```

---

### `createConfig(overrides = {}, env = process.env)`

Pure factory function that builds a frozen configuration object from environment variables and overrides.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `overrides` | `object` | Consumer-provided config values (highest priority) |
| `env` | `object` | Environment variable source (defaults to `process.env`) |

**Default configuration:**
| Key | Default | Environment Variable |
|---|---|---|
| `port` | `3000` | `PORT` |
| `nodeEnv` | `'development'` | `NODE_ENV` |
| `appName` | `'app'` | `APP_NAME` |
| `appVersion` | `'0.0.0'` | `APP_VERSION` |

**Example:**

```js
const config = createConfig({
  appName: 'task-manager',
  appVersion: '1.0.0',
  port: 8080,
});
```

---

### `filterSensitiveKeys(config)`

Pure function that returns a shallow copy of the config object with sensitive keys removed.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `config` | `object` | Configuration object to filter |

**Returns:** `object` — Config with sensitive keys removed

**Filtered patterns (case-insensitive):**

- `SECRET`
- `KEY`
- `PASSWORD`
- `TOKEN`
- `CREDENTIAL`

**Example:**

```js
const safeConfig = filterSensitiveKeys(config);
// { appName: 'my-app', port: 3000 }
// (DATABASE_PASSWORD would be removed)
```

---

### Error Factories

#### `createAppError(code, message, statusCode)`

Creates an operational application error.

**Example:**

```js
import { createAppError } from 'glowing-fishstick';

throw createAppError('INVALID_INPUT', 'Missing required field: email', 400);
```

#### `createNotFoundError(message)`

Creates a 404 Not Found error.

**Example:**

```js
throw createNotFoundError('User not found');
```

#### `createValidationError(message)`

Creates a 400 Bad Request validation error.

**Example:**

```js
throw createValidationError('Email format is invalid');
```

---

## Plugin System

Plugins extend the core application with custom routes, middleware, and business logic.

### Plugin Contract

A plugin is a function with this signature:

```js
/**
 * @typedef {(app: Express, config: object) => void} Plugin
 */
```

### Creating a Plugin

```js
// my-plugin.js
export function myPlugin(app, config) {
  // Add custom routes
  app.get('/tasks', (req, res) => {
    res.json({ tasks: [] });
  });

  // Add middleware
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });

  // Add navigation links
  app.locals.navLinks.push({ label: 'Tasks', url: '/tasks' });
}
```

### Using Plugins

```js
import { createApp, createConfig } from 'glowing-fishstick';
import { myPlugin } from './my-plugin.js';
import { analyticsPlugin } from './analytics-plugin.js';

const config = createConfig();
const app = createApp(config, [myPlugin, analyticsPlugin]);
```

**Plugin execution order:**

1. Built-in middleware (body parsers, static files)
2. Core routes (health, admin, landing)
3. **Your plugins** (in array order)
4. Error handling middleware (404 + error handler)

**Plugin best practices:**

- ✅ Add new routes and middleware
- ✅ Read config values
- ✅ Mount sub-applications
- ❌ Don't modify or remove core routes
- ❌ Don't mutate the config object (it's frozen)
- ❌ Don't call `app.listen()` (use `createServer` instead)

---

## Built-in Routes

### Health Checks (Kubernetes-ready)

| Route      | Method | Response              | Purpose            |
| ---------- | ------ | --------------------- | ------------------ |
| `/healthz` | GET    | `{ status: "ok" }`    | Basic health check |
| `/readyz`  | GET    | `{ status: "ready" }` | Readiness probe    |
| `/livez`   | GET    | `{ status: "alive" }` | Liveness probe     |

### Landing Page

| Route | Method | Response           |
| ----- | ------ | ------------------ |
| `/`   | GET    | Rendered HTML page |

### Admin Dashboard

| Route           | Method | Response      | Purpose                                        |
| --------------- | ------ | ------------- | ---------------------------------------------- |
| `/admin`        | GET    | Rendered HTML | Dashboard with app info                        |
| `/admin/config` | GET    | Rendered HTML | Configuration viewer (sensitive keys filtered) |

---

## Environment Variables

Create a `.env` file in your project root:

```env
PORT=3000
NODE_ENV=development
APP_NAME=my-application
APP_VERSION=1.0.0
```

Load it in your application:

```js
import 'dotenv/config';
import { createConfig } from 'glowing-fishstick';

const config = createConfig();
```

**Workspace Package Map**

- `core/app` — The app factory package. Published as `@glowing-fishstick/app`. Provides `createApp`, `createServer`, `createConfig`, built-in routes, and the plugin system.
- `core/shared` — Shared utilities and supporting code used by `core/app`. Published as `@glowing-fishstick/shared` when distributed separately.
- `app/` — A local consumer example application included in this repository to demonstrate composition, configuration overrides, and plugin usage. It imports the workspace package by name to simulate a real consumer.

These roles reflect the current repository structure and are the intended mapping for consumers and maintainers.

---

## View Customization

### Using Custom Views

Pass a `viewsDir` in your config to provide custom EJS templates:

```js
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = createConfig({
  viewsDir: path.join(__dirname, 'views'),
});
```

Your views will take priority, with the core module's views as fallback.

### View Structure

The module uses EJS with partials for layouts:

```ejs
<%- include('../layouts/header') %>
  <h1>My Custom Page</h1>
<%- include('../layouts/footer') %>
```

---

## Testing

The functional architecture makes testing straightforward:

### Unit Testing

```js
import { describe, it, expect } from 'vitest';
import { createConfig, filterSensitiveKeys } from 'glowing-fishstick';

describe('createConfig', () => {
  it('should merge overrides with defaults', () => {
    const config = createConfig({ appName: 'test' }, {});
    expect(config.appName).toBe('test');
    expect(config.port).toBe(3000); // default
  });
});
```

### Integration Testing

```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp, createConfig } from 'glowing-fishstick';

describe('Health endpoints', () => {
  it('should respond to /healthz', async () => {
    const config = createConfig();
    const app = createApp(config);

    const response = await request(app).get('/healthz');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
```

### Smoke Testing

```js
import { describe, it, expect, afterAll } from 'vitest';
import { createApp, createServer, createConfig } from 'glowing-fishstick';

describe('Server lifecycle', () => {
  it('should start and stop gracefully', async () => {
    const config = createConfig({ port: 0 }); // random port
    const app = createApp(config);
    const { server, close } = createServer(app, config);

    await close(); // Graceful shutdown
  });
});
```

---

## Examples

### Complete Application with Plugin

```js
// server.js
import 'dotenv/config';
import { createApp, createServer, createConfig } from 'glowing-fishstick';
import { taskManagerPlugin } from './plugins/task-manager.js';

const config = createConfig({
  appName: 'Task Manager',
  appVersion: '1.0.0',
});

const app = createApp(config, [taskManagerPlugin]);
const { server, close } = createServer(app, config);

export { server, close };
```

```js
// plugins/task-manager.js
export function taskManagerPlugin(app, config) {
  app.locals.navLinks.push({ label: 'Tasks', url: '/tasks' });

  app.get('/tasks', (req, res) => {
    res.render('tasks/list', {
      appName: config.appName,
      tasks: [
        { id: 1, title: 'Write documentation', done: true },
        { id: 2, title: 'Deploy to production', done: false },
      ],
    });
  });
}
```

---

## Architecture

### Functional Programming First

This module follows functional programming principles:

- ✅ **Factory functions** instead of classes
- ✅ **Pure functions** for config, validation, filtering
- ✅ **Dependency injection** via function arguments
- ✅ **Composition** over inheritance
- ✅ **Immutability** (frozen config objects)

**Why functional?**

- Easier to test (no mocks or stubs needed for pure functions)
- Better composability (plugins as plain functions)
- Simpler reasoning (no hidden state)

### Middleware Pipeline

```
Request → Body Parsers → Static Files → Core Routes → Plugins → 404 Handler → Error Handler → Response
```

---

## Development

See [app/DEV_APP_README.md](app/DEV_APP_README.md) for information on running the app for local development.

---

## Project Status

This is a **proof of concept** and demonstration project showing how to build a composable Express.js framework distributed as an npm module. It is not intended for production use without significant additional development work.

Feel free to explore the concepts and patterns demonstrated here and apply them to your own projects as they best fit your needs.

---

## License

MIT © Jeff Caradona

---

## Related Documentation

- [Project Specification](documentation/00-project-specs.md) — Detailed architectural decisions and design principles
- [App Development README](app/DEV_APP_README.md) — How to use the `app/` directory for local development
