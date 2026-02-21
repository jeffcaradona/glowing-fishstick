# Plugin System

Plugins extend the core application with custom routes, middleware, and business logic without modifying core code.

## Plugin Contract

A plugin is a plain function with this signature:

```js
/**
 * @typedef {(app: Express, config: object) => void} Plugin
 */
```

## Creating a Plugin

```js title="my-plugin.js"
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

## Using Plugins

```js
import { createApp, createConfig } from '@glowing-fishstick/app';
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

---

## Service Container (`config.services`)

Every config object exposes a service container at `config.services`. Plugins use it to register and share singleton services (database pools, cache clients, etc.) without module-level globals.

### Registering a Service

```js title="plugin-a.js"
export function pluginA(app, config) {
  config.services.register('db', async () => createPool(config.dbUrl), {
    dispose: (pool) => pool.end(),
  });

  // Pre-warm the pool on startup
  app.registerStartupHook(async () => {
    await config.services.resolve('db');
  });

  // Release resources on shutdown
  app.registerShutdownHook(async () => {
    await config.services.dispose();
  });
}
```

### Consuming a Service

```js title="plugin-b.js"
export function pluginB(app, config) {
  app.get('/items', async (req, res, next) => {
    try {
      const db = await config.services.resolve('db');
      res.json(await db.query('SELECT * FROM items'));
    } catch (err) {
      next(err);
    }
  });
}
```

### Testing with a Mock Service

```js
import { createServiceContainer } from '@glowing-fishstick/shared';

const testContainer = createServiceContainer();
testContainer.registerValue('db', mockDb);
const config = createConfig({ services: testContainer });
```

---

## Plugin Best Practices

| ✅ Do | ❌ Don't |
|-------|---------|
| Add new routes and middleware | Modify or remove core routes |
| Read config values | Mutate the config object (it's frozen) |
| Mount sub-applications | Call `app.listen()` |
| Register services via `config.services.register()` | |
| Pre-warm services in startup hooks | |
| Dispose the container in shutdown hooks | |

---

## Lifecycle Hooks

Plugins can register startup and shutdown hooks to manage resources:

```js
export function dbPlugin(app, config) {
  app.registerStartupHook(async () => {
    // Runs before the server starts accepting traffic
    await connectDatabase(config.dbUrl);
  });

  app.registerShutdownHook(async () => {
    // Runs when the server is shutting down
    await disconnectDatabase();
  });
}
```

**Hook execution properties:**

- **Order**: FIFO (first registered, first executed)
- **Error isolation**: Errors in one hook don't prevent subsequent hooks from running
- **Timing**: `setImmediate()` is used internally to prevent race conditions
