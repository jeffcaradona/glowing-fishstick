# Demo Application — Local Development Guide

> **Using the `app/` directory for local development and testing**

This document explains how to use the `app/` directory to run a demo application locally, which demonstrates how a consuming application would use the `glowing-fishstick` module in production.

---

## Overview

The `app/` directory simulates a real-world consumer application (like a "Task Manager") that depends on the core `glowing-fishstick` module. It demonstrates:

- ✅ How to compose the core module with custom plugins
- ✅ How to provide application-specific routes and views
- ✅ How to override or extend configuration
- ✅ How a thin `server.js` entrypoint boots the composed application

**In production**, a consumer would install `glowing-fishstick` via npm:
```bash
npm install glowing-fishstick
```

**For local development**, the `app/` directory imports directly from the source:
```js
import { createApp, createServer, createConfig } from '../../index.js';
```

This allows you to develop and test the core module alongside a demo application without publishing to npm.

---

## Directory Structure

```
app/
├── DEV_APP_README.md          # This file
├── package.json               # Demo app metadata (optional)
└── src/
    ├── server.js              # Entrypoint — composes & boots the app
    ├── app.js                 # Demo plugin (custom routes/middleware)
    ├── config/
    │   └── env.js             # Demo-specific config overrides
    ├── routes/
    │   └── router.js          # Task manager routes
    └── views/
        └── tasks/             # Task manager views (EJS templates)
```

---

## Running the Demo Application

### 1. Install Dependencies

From the **repository root**:

```bash
npm install
```

### 2. Start the Demo Server

**Option A: Standard mode**
```bash
npm run start:demo
```

**Option B: Development mode (with auto-restart)**
```bash
npm run dev:demo
```

This runs:
```bash
nodemon --exec node app/src/server.js
```

### 3. Access the Application

Open your browser to:
- **http://localhost:3000** — Landing page
- **http://localhost:3000/healthz** — Health check
- **http://localhost:3000/admin** — Admin dashboard
- **http://localhost:3000/admin/config** — Configuration viewer
- **http://localhost:3000/tasks** — Task manager (demo plugin)

---

## How It Works

### Entry Point: `app/src/server.js`

This is the main file that composes the application:

```js
import { createApp, createServer, createConfig } from '../../index.js';
import { taskManagerApplicationPlugin } from './app.js';
import { demoOverrides } from './config/env.js';

// 1. Create configuration with demo overrides
const config = createConfig(demoOverrides);

// 2. Create Express app with demo plugin
const app = createApp(config, [taskManagerApplicationPlugin]);

// 3. Start HTTP server
const { server, close } = createServer(app, config);

export { server, close };
```

**Key points:**
1. Imports from the local module (`../../index.js`)
2. Applies demo-specific configuration overrides
3. Passes the demo plugin to `createApp()`
4. Exports `server` and `close` for testing

---

### Demo Plugin: `app/src/app.js`

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

Demo-specific configuration values:

```js
export const demoOverrides = {
  appName: 'Task Manager Demo',
  appVersion: '1.0.0',
  // Add any demo-specific overrides here
};
```

**Configuration priority** (highest wins):
1. `demoOverrides` (this file)
2. Environment variables (`.env` or `process.env`)
3. Built-in defaults from the core module

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

## Development Workflow

### 1. Make Changes to Core Module

Edit files in the `src/` directory (core module):
```
src/
├── app-factory.js
├── server-factory.js
├── config/env.js
├── routes/
├── middlewares/
└── views/
```

### 2. Test with Demo App

Run the demo application to see your changes:
```bash
npm run dev:demo
```

The demo app will automatically restart when you modify files (via `nodemon`).

### 3. Verify Changes

- Visit the routes in your browser
- Check the admin dashboard at `/admin`
- Verify configuration at `/admin/config`
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

## Environment Variables

Create a `.env` file in the **repository root** (not in `app/`):

```env
PORT=3000
NODE_ENV=development
APP_NAME=Task Manager Demo
APP_VERSION=1.0.0
```

The demo application will use these values when it calls `createConfig()`.

---

## Adding New Demo Features

### Adding a New Route

1. **Create the route** in `app/src/routes/router.js`:
```js
router.get('/tasks/:id', (req, res) => {
  res.render('tasks/detail', { taskId: req.params.id });
});
```

2. **Create the view** in `app/src/views/tasks/detail.ejs`:
```ejs
<%- include('../../../src/views/layouts/header') %>
  <h1>Task Details</h1>
  <p>Task ID: <%= taskId %></p>
<%- include('../../../src/views/layouts/footer') %>
```

3. **Test it** by visiting `http://localhost:3000/tasks/123`

### Adding a New Plugin

1. **Create a plugin file** in `app/src/plugins/`:
```js
// app/src/plugins/analytics.js
export function analyticsPlugin(app, config) {
  app.use((req, res, next) => {
    console.log(`[Analytics] ${req.method} ${req.path}`);
    next();
  });
}
```

2. **Add it to `server.js`**:
```js
import { analyticsPlugin } from './plugins/analytics.js';

const app = createApp(config, [
  taskManagerApplicationPlugin,
  analyticsPlugin,
]);
```

---

## Simulating Production Usage

The `app/` directory structure mirrors how a real application would consume the module in production.

**Production scenario:**

1. **Install the module** via npm:
```json
{
  "dependencies": {
    "glowing-fishstick": "^0.0.1"
  }
}
```

2. **Import from the module**:
```js
import { createApp, createServer, createConfig } from 'glowing-fishstick';
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
PORT=8080 npm run start:demo
```

### Changes not reflected

**Make sure you're using dev mode:**
```bash
npm run dev:demo  # Not start:demo
```

**Check nodemon is watching the right files:**
```bash
# Manually restart by typing 'rs' in the terminal
```

### Views not rendering

**Check view paths:**
- Core views: `src/views/`
- Demo views: `app/src/views/`
- Use relative includes: `<%- include('../../../src/views/layouts/header') %>`

---

## Testing the Demo App

You can test the demo application just like you would test any Express app:

```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { server, close } from './app/src/server.js';

describe('Demo App', () => {
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

| Aspect | Local Dev (`app/`) | Production |
|---|---|---|
| **Module source** | Local import `../../index.js` | npm package `glowing-fishstick` |
| **Configuration** | `.env` in repo root | Environment variables or config service |
| **Dependencies** | Shared `node_modules` | App's own `package.json` |
| **Purpose** | Development and testing | Real application deployment |

---

## Next Steps

1. **Modify the demo plugin** to add your own features
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