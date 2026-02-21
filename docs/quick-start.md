# Quick Start

## Installation

Install the main framework package:

```bash
npm install @glowing-fishstick/app
```

For a JSON-first API server:

```bash
npm install @glowing-fishstick/api
```

For shared utilities (formatters, JWT helpers, logger):

```bash
npm install @glowing-fishstick/shared
```

For the logger module directly:

```bash
npm install @glowing-fishstick/logger
```

**Requirements:**

- Node.js >= 22
- ES Modules (`"type": "module"` in your `package.json`)

---

## Create a Minimal Server

```js title="server.js"
import { createApp, createServer, createConfig } from '@glowing-fishstick/app';

const config = createConfig({
  appName: 'my-app',
  port: 3000,
});

const app = createApp(config);
const { server, close } = createServer(app, config);
```

```bash
node server.js
```

Visit `http://localhost:3000` — built-in routes are already available:

- `/` — Landing page
- `/healthz` — Kubernetes health check
- `/admin` — Admin dashboard
- `/admin/config` — Configuration viewer

---

## Add a Plugin

```js title="plugins/task-manager.js"
export function taskManagerPlugin(app, config) {
  // Register a navigation link
  app.locals.navLinks.push({ label: 'Tasks', url: '/tasks' });

  // Add a route
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

```js title="server.js"
import 'dotenv/config';
import { createApp, createServer, createConfig } from '@glowing-fishstick/app';
import { taskManagerPlugin } from './plugins/task-manager.js';

const config = createConfig({ appName: 'Task Manager', appVersion: '1.0.0' });
const app = createApp(config, [taskManagerPlugin]);
const { server, close } = createServer(app, config);

export { server, close };
```

---

## Environment Variables

Create a `.env` file in your project root:

```env
PORT=3000
NODE_ENV=development
APP_NAME=my-application
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

Load it in your application:

```js
import 'dotenv/config';
import { createConfig } from '@glowing-fishstick/app';

const config = createConfig();
```

---

## Using Custom Views

Pass a `viewsDir` in your config to provide custom Eta templates:

```js
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = createConfig({
  viewsDir: path.join(__dirname, 'views'),
});
```

Your views take priority, with the core module's views as fallback.

The module uses Eta with partials for layouts:

```eta
<%~ include('../layouts/header') %>
  <h1>My Custom Page</h1>
<%~ include('../layouts/footer') %>
```
