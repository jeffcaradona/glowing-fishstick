# App — Local Development Guide

> **Using the `app/` directory for local development and testing**

This document explains how to use the `app/` directory to run the example app locally, which demonstrates how a consuming application would use the `@glowing-fishstick/app` package in production.

---

## Overview

The `app/` directory simulates a real-world consumer application (like a "Task Manager") that depends on the core `@glowing-fishstick/app` package. It demonstrates:

- ✅ How to compose the core module with custom plugins
- ✅ How to provide application-specific routes and views
- ✅ How to override or extend configuration
- ✅ How a thin `server.js` entrypoint boots the composed application

**In production**, a consumer would install the published packages via npm:

```bash
npm install @glowing-fishstick/app @glowing-fishstick/shared
```

`@glowing-fishstick/shared` is the compatibility layer and primary public entry for logger utilities; logger implementation ownership lives in `@glowing-fishstick/logger`.

**For local development**, the `app/` directory simulates a consumer importing the package by name:

```js
import { createApp, createServer, createConfig } from '@glowing-fishstick/app';
```

In this repository the package name is resolved via workspace package linkage (or `npm link`/monorepo tooling). Consumer-facing examples should continue to import by package name to mirror real usage boundaries.

---

## Directory Structure

```
app/
├── DEV_APP_README.md          # This file
├── package.json               # App metadata (optional)
└── src/
    ├── server.js              # Entrypoint — composes & boots the app
    ├── app.js                 # App plugin (custom routes/middleware)
    ├── config/
    │   └── env.js             # App-specific config overrides
    ├── routes/
    │   └── router.js          # Task manager routes
    └── views/
        └── tasks/             # Task manager views (Eta templates)
```

---

## Running the App

### 1. Install Dependencies

From the **repository root**:

```bash
npm install
```

### 2. Start the App Server

**Option A: Standard mode**

```bash
npm run start:app
```

**Option B: Development mode (with auto-restart)**

```bash
npm run dev:app
```

This runs:

```bash
nodemon --exec node app/src/server.js
```

### 3. Access the Application

Open your browser to:

- **http://localhost:3000** — Landing page
- **http://localhost:3000/healthz** — Health check
- **http://localhost:3000/admin** — Admin dashboard (includes app + API memory usage)
- **http://localhost:3000/admin/config** — Configuration viewer
- **http://localhost:3000/admin/api-health** — App passthrough endpoint for API readiness checks
- **http://localhost:3000/tasks** — Task manager (app plugin)

---

## How It Works

### Entry Point: `app/src/server.js`

This is the main file that composes the application. The actual entrypoint imports the workspace package by name:

```js
import { createApp, createServer, createConfig } from '@glowing-fishstick/app';
import { createLogger } from '@glowing-fishstick/shared';
import { taskManagerApplicationPlugin } from './app.js';
import { appOverrides } from './config/env.js';

const logger = createLogger({ name: 'task-manager' });
const config = createConfig({ ...appOverrides, logger });
const app = createApp(config, [taskManagerApplicationPlugin]);
const { server, close, registerStartupHook, registerShutdownHook } = createServer(app, config);

export { server, close };
```

**Key points:**

1. Imports the workspace package (`@glowing-fishstick/app`) to simulate a consumer dependency
2. Applies app-specific configuration overrides
3. Passes the app plugin to `createApp()`
4. Exports `server` and `close` for testing

---

### App Plugin: `app/src/app.js`

The plugin adds task manager functionality to the core application:

```js
import { taskRoutes } from './routes/router.js';

export function taskManagerApplicationPlugin(app, config) {
  // Add navigation link
  app.locals.navLinks.push({ label: 'Tasks', url: '/tasks' });

  // Mount task routes
  app.use(taskRoutes(config));
}
```

**What it does:**

- Adds a "Tasks" link to the navigation
- Mounts custom routes at `/tasks`
- Follows the plugin contract: `(app, config) => void`

---

### Configuration Overrides: `app/src/config/env.js`

App-specific configuration values:

```js
export const appOverrides = {
  appName: 'Task Manager',
  appVersion: '1.0.0',
  // Add any app-specific overrides here
};
```

**Configuration priority** (highest wins):

1. `appOverrides` (this file)
2. Environment variables (`.env` or `process.env`)
3. Built-in defaults from the core module

---

### Service Container: `config.services`

`createConfig()` attaches a service container to `config.services`. Plugins register shared services (database pools, cache clients, etc.) and resolve them by name. The container handles singleton caching, concurrent deduplication, and LIFO disposal.

**Registering and resolving a service:**

```js
export function myPlugin(app, config) {
  // Register a singleton DB pool with a dispose callback
  config.services.register('db', async () => createPool(config.dbUrl), {
    dispose: (pool) => pool.end(),
  });

  // Route handler resolves the service on demand
  app.get('/records', async (req, res, next) => {
    try {
      const db = await config.services.resolve('db');
      res.json(await db.query('SELECT * FROM records'));
    } catch (err) {
      next(err);
    }
  });
}
```

**Startup warmup pattern** — pre-resolve singletons before the server accepts requests:

```js
export function myPlugin(app, config) {
  config.services.register('db', async () => createPool(config.dbUrl), {
    dispose: (pool) => pool.end(),
  });

  // Resolving during startup caches the instance; subsequent resolves are instant
  app.registerStartupHook(async () => {
    await config.services.resolve('db');
  });
}
```

**Shutdown dispose pattern** — cleanly release resources on graceful shutdown:

```js
// In server.js entry point (runs after all plugin shutdown hooks)
const { registerShutdownHook } = createServer(app, config);

registerShutdownHook(async () => {
  await config.services.dispose(); // runs disposers in LIFO order
});
```

**Injecting a test container:**

```js
import { createServiceContainer } from '@glowing-fishstick/shared';
import { createConfig } from '@glowing-fishstick/app';

const testContainer = createServiceContainer();
testContainer.registerValue('db', mockDb);

const config = createConfig({ services: testContainer });
// Plugins will resolve from testContainer instead of the real DB pool
```

---

### Custom Routes: `app/src/routes/router.js`

The task manager routes demonstrate how to add application-specific endpoints:

```js
import { Router } from 'express';

export function taskRoutes(config) {
  const router = Router();

  router.get('/tasks', (req, res) => {
    res.render('tasks/list', {
      appName: config.appName,
      tasks: [...],
    });
  });

  return router;
}
```

---

### Development Workflow

### 1. Make Changes to Core Module

Edit files in the core packages under `core/`:

```
core/app/src/
|-- app-factory.js
|-- config/
|-- controllers/
|-- middlewares/
|-- routes/
`-- views/

core/shared/src/
|-- auth/
|-- hook-registry.js
|-- middlewares/
|-- server-factory.js
`-- other shared utilities
```

### 2. Test with App

Run the app to see your changes:

```bash
npm run dev:app
```

The app will automatically restart when you modify files (via `nodemon`).

### 3. Verify Changes

- Visit the routes in your browser
- Check the admin dashboard at `/admin`
- Verify configuration at `/admin/config`
- Use the dashboard health button to trigger the API passthrough check at `/admin/api-health`
- Test health endpoints at `/healthz`, `/readyz`, `/livez`

### 4. Run Tests

Run the test suite to ensure your changes don't break existing functionality:

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:smoke
```

---

## Using the Logger

The framework provides a Pino-based logger that's automatically available via configuration. The logger supports environment-aware formatting:

- **Development**: Pretty console output + JSON file logs in `logs/` directory
- **Production**: JSON-formatted logs to stdout for container log collection

Logger imports in this guide use `@glowing-fishstick/shared` (curated API). Internally, those exports are sourced from the dedicated `@glowing-fishstick/logger` module.

### Basic Logger Usage

The logger is passed through the config and is available in all plugins:

```js
export function myPlugin(app, config) {
  const logger = config.logger;

  app.registerStartupHook(async () => {
    logger.info('Plugin initializing...');
    // Initialization code
  });

  app.registerShutdownHook(async () => {
    logger.info('Plugin shutting down...');
    // Cleanup code
  });
}
```

### Structured Logging

Pino supports structured logging with metadata objects:

```js
// Log with metadata
logger.info({ userId: 123, action: 'login' }, 'User logged in');

// Log errors with context
logger.error({ err: new Error('DB connection failed'), dbHost: 'localhost' }, 'Database error');

// Different log levels
logger.trace('Detailed trace info');
logger.debug('Debug info');
logger.info('Informational message');
logger.warn({ threshold: 100, current: 150 }, 'Threshold exceeded');
logger.error('Error occurred');
logger.fatal('Fatal error - service unavailable');
```

### Custom Logger Configuration

You can create a custom logger with specific options:

```js
import { createLogger } from '@glowing-fishstick/shared';

const logger = createLogger({
  name: 'my-app',
  logLevel: 'debug', // trace|debug|info|warn|error|fatal
  logDir: './logs', // Custom log directory
  enableFile: true, // Enable file logging in development
});

const config = createConfig({ ...appOverrides, logger });
```

### HTTP Request Logging

Request logging is **enabled by default** when you provide a logger via config. The framework automatically:

1. Generates unique request IDs (UUIDs) for each request
2. Logs incoming requests and outgoing responses
3. Tracks request duration and status codes

**To disable request logging:**

```js
import { createConfig } from '@glowing-fishstick/app';
import { createLogger } from '@glowing-fishstick/shared';

const logger = createLogger({ name: 'my-app' });
const config = createConfig({
  ...appOverrides,
  logger,
  enableRequestLogging: false, // Disable HTTP logging
});
```

**Manual request logging middleware:**

If you want more control, disable the built-in logging and add it manually:

```js
import { createLogger, createRequestLogger } from '@glowing-fishstick/shared';

const logger = createLogger({ name: 'http' });

export function requestLoggingPlugin(app, config) {
  // Add HTTP request/response logging with custom options
  app.use(
    createRequestLogger(logger, {
      generateRequestId: false, // Use framework's request ID
    }),
  );
}
```

This logs:

- Incoming requests: method, path, request ID
- Outgoing responses: status code, duration, request ID

**Request IDs:**

Every request automatically gets a unique UUID attached as `req.id` and returned in the `x-request-id` response header. This enables distributed tracing across services.

### Log Output Examples

**Development (pretty-printed):**

```
[2026-02-15 10:23:45] INFO (task-manager): Entry-point startup initialization…
[2026-02-15 10:23:45] INFO (server): Startup sequence completed
[2026-02-15 10:23:45] INFO (server): app listening on http://localhost:3000
  port: 3000
```

**Production (JSON):**

```json
{"level":30,"time":1739615025000,"name":"task-manager","msg":"Entry-point startup initialization…"}
{"level":30,"time":1739615025100,"name":"server","msg":"Startup sequence completed"}
{"level":30,"time":1739615025200,"name":"server","port":3000,"msg":"app listening on http://localhost:3000"}
```

---

## Using Formatting Utilities

The framework provides utility functions for common formatting needs. These are exported from `@glowing-fishstick/shared`.

### Formatting Process Uptime

The `formatUptime` function converts seconds into human-readable duration strings:

```js
import { formatUptime } from '@glowing-fishstick/shared';

// In a route handler
app.get('/status', (req, res) => {
  res.json({
    uptime: formatUptime(process.uptime()),
    // Other status metrics...
  });
});

// Example outputs:
formatUptime(45); // "45s"
formatUptime(323); // "5m 23s"
formatUptime(8130); // "2h 15m"
formatUptime(277530); // "3d 5h 30m"
```

The formatter automatically selects appropriate time units based on duration, making it ideal for displaying server uptime, session duration, or any time-based metrics.

---

## Environment Variables

Create a `.env` file in the **repository root** (not in `app/`):

```env
PORT=3000
NODE_ENV=development
APP_NAME=Task Manager
APP_VERSION=1.0.0
API_BASE_URL=http://localhost:3001
API_HEALTH_PATH=/readyz
API_HEALTH_TIMEOUT_MS=3000
API_URL=http://localhost:3001
API_BLOCK_BROWSER_ORIGIN=false
API_REQUIRE_JWT=false
JWT_SECRET=replace-with-random-secret
JWT_EXPIRES_IN=120s
```

The app will use these values when it calls `createConfig()`.

---

## Adding New App Features

### Adding a New Route

1. **Create the route** in `app/src/routes/router.js`:

```js
router.get('/tasks/:id', (req, res) => {
  res.render('tasks/detail', { taskId: req.params.id });
});
```

2. **Create the view** in `app/src/views/tasks/detail.eta`:

```eta
<%~ include('layouts/header', { appName }) %>
  <h1>Task Details</h1>
  <p>Task ID: <%= taskId %></p>
<%~ include('layouts/footer') %>
```

3. **Test it** by visiting `http://localhost:3000/tasks/123`

### Adding a New Plugin

1. **Create a plugin file** in `app/src/plugins/`:

```js
// app/src/plugins/analytics.js
export function analyticsPlugin(app, config) {
  const logger = config.logger;

  app.use((req, res, next) => {
    logger?.info({ method: req.method, path: req.path }, 'Request received');
    next();
  });
}
```

2. **Add it to `server.js`**:

```js
import { analyticsPlugin } from './plugins/analytics.js';

const app = createApp(config, [taskManagerApplicationPlugin, analyticsPlugin]);
```

---

## Simulating Production Usage

The `app/` directory structure mirrors how a real application would consume the module in production.

**Production scenario:**

1. **Install the module** via npm:

```json
{
  "dependencies": {
    "@glowing-fishstick/app": "^0.0.1",
    "@glowing-fishstick/shared": "^0.0.1"
  }
}
```

2. **Import from the module**:

```js
import { createApp, createServer, createConfig } from '@glowing-fishstick/app';
```

3. **Create a plugin**:

```js
export function myPlugin(app, config) {
  app.get('/my-route', (req, res) => {
    res.json({ message: 'Hello from my app' });
  });
}
```

4. **Compose and boot**:

```js
const config = createConfig({ appName: 'My App' });
const app = createApp(config, [myPlugin]);
const { server, close } = createServer(app, config);
```

---

## Troubleshooting

### Server won't start

**Check the port:**

```bash
# See if something is already running on port 3000
lsof -i :3000

# Use a different port
PORT=8080 npm run start:app
```

### Changes not reflected

**Make sure you're using dev mode:**

```bash
npm run dev:app  # Not start:app
```

**Check nodemon is watching the right files:**

```bash
# Manually restart by typing 'rs' in the terminal
```

### Views not rendering

**Check view paths:**

- Core views: `src/views/`
- App views: `app/src/views/`
- Use shared layout includes from the active views chain: `<%~ include('layouts/header', { appName }) %>`

---

## Testing the App

You can test the app just like you would test any Express app:

```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { server, close } from './src/server.js';

describe('App', () => {
  afterAll(async () => {
    await close();
  });

  it('should respond to /tasks', async () => {
    const response = await request(server).get('/tasks');
    expect(response.status).toBe(200);
  });
});
```

---

## Comparing Local Dev vs Production

| Aspect            | Local Dev (`app/`)                                   | Production                              |
| ----------------- | ---------------------------------------------------- | --------------------------------------- |
| **Module source** | Workspace package linkage (`@glowing-fishstick/app`) | npm package (`@glowing-fishstick/app`)  |
| **Configuration** | `.env` in repo root                                  | Environment variables or config service |
| **Dependencies**  | Shared `node_modules`                                | App's own `package.json`                |
| **Purpose**       | Development and testing                              | Real application deployment             |

---

## Next Steps

1. **Modify the app plugin** to add your own features
2. **Create additional plugins** to test composition patterns
3. **Add custom views** to test view overrides
4. **Run the test suite** to ensure everything works
5. **Check the admin dashboard** to verify configuration

---

## Related Documentation

- [Main README](../README.md) — Module overview and API reference
- [Project Specification](../documentation/00-project-specs.md) — Detailed architecture and design decisions

---

## Questions?

If you're building a consuming application:

1. Review the `app/` directory structure as a template
2. Follow the patterns in `app/src/server.js` and `app/src/app.js`
3. Refer to the [Plugin System](../README.md#plugin-system) documentation
