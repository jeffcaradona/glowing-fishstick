# Application Development Guide

## Lifecycle Hooks Architecture

The glowing-fishstick framework uses a **two-level startup and shutdown hook system** to support both plugin-level and entry-point-level initialization/cleanup tasks.

### Understanding the Hook Levels

#### App-Level Hooks (Plugin Responsibility)

App-level hooks are registered by plugins via `app.registerStartupHook()` and `app.registerShutdownHook()`. These should encapsulate **infrastructure initialization** that the plugin or other plugins depend on.

**When to use app-level hooks:**

- Database connection pooling
- Cache initialization
- External service clients (API clients, message queues, etc.)
- Data validation or schema setup
- Any cross-plugin shared resources

**Scope:** Runs during `createApp()` plugin iteration — all plugin infrastructure is available to the app.

#### Entry-Point Hooks (Server Responsibility)

Entry-point hooks are registered at the server level via `registerStartupHook()` and `registerShutdownHook()`. These run **after** all app-level hooks and should encapsulate **deployment-specific setup** that depends on the app being fully initialized.

**When to use entry-point hooks:**

- Monitoring/observability bootstrap (after all services are ready)
- Deployment-specific environment setup
- Tasks that must run once all plugins are initialized
- Dependency injection resolution
- Any logic that depends on app-level resources being ready

**Scope:** Runs after `createApp()` and `createServer()` are called — all app resources are available.

---

### Execution Order

```
1. JavaScript entrypoint (server.js) executes
2. createApp(config, [plugins]) called
   └─ Each plugin's app.registerStartupHook() called
      └─ Startup hooks registered on app-level registry
3. createServer(app, config) called
   └─ App-level registry wrapped and queued as first startup hook
   └─ Returns { registerStartupHook, ... }
4. registerStartupHook() called at entry-point level
   └─ Entry-point hooks registered on server-level registry
5. setImmediate() defers startup execution:
   ├─ Queue: [app-level-hook-1, app-level-hook-2, ..., entry-point-hook-1, entry-point-hook-2, ...]
   ├─ Execute all in FIFO order
   └─ Then server.listen(port) starts accepting connections
```

---

### Pattern Examples

#### Plugin: Database Connection Pool

**When:** Initialize a database pool that other plugins and routes depend on.

```javascript
// plugins/database-plugin.js
export function databasePlugin(app, config) {
  const logger = config.logger;

  // Initialize the pool
  const pool = new DatabasePool(config.databaseUrl);

  // Register startup hook for app-level infrastructure
  app.registerStartupHook(async () => {
    logger.info('Connecting to database…');
    await pool.connect();
    // Make pool available to routes
    app.locals.db = pool;
  });

  // Register shutdown hook for cleanup
  app.registerShutdownHook(async () => {
    logger.info('Closing database connection…');
    await pool.close();
  });

  // Routes can now safely assume app.locals.db is available
  app.use('/api/users', userRoutes);
}
```

#### Plugin: Cache Service

**When:** Initialize a cache that multiple routes depend on.

```javascript
// plugins/cache-plugin.js
export function cachePlugin(app, config) {
  const logger = config.logger;
  const cache = new CacheService(config.redisUrl);

  app.registerStartupHook(async () => {
    logger.info('Initializing cache…');
    await cache.connect();
    app.locals.cache = cache;
  });

  app.registerShutdownHook(async () => {
    logger.info('Flushing and closing cache…');
    await cache.flush();
    await cache.close();
  });
}
```

#### Entry-Point: Deployment Configuration

**When:** After all app plugins are initialized, set up deployment-specific monitoring or configuration.

```javascript
// server.js
import { createApp, createServer, createConfig, createLogger } from '@glowing-fishstick/app';
import { databasePlugin } from './plugins/database-plugin.js';
import { cachePlugin } from './plugins/cache-plugin.js';

const logger = createLogger({ name: 'my-app' });
const config = createConfig({ logger /* ... */ });
const app = createApp(config, [databasePlugin, cachePlugin]);
const { registerStartupHook, registerShutdownHook } = createServer(app, config);

// Entry-point hooks NOW run after all app plugins are initialized
/**
 * At this point, app.locals.db and app.locals.cache are available
 * because app-level plugin hooks already executed.
 */
registerStartupHook(async () => {
  logger.info('Initializing monitoring…');

  // Safe to access app resources
  const db = app.locals.db;
  const cache = app.locals.cache;

  // Setup monitoring that depends on all app services
  await setupPrometheus({ db, cache });
  await setupHealthChecks(app);
});

registerShutdownHook(async () => {
  logger.info('Graceful shutdown cleanup…');
  // Any final deployment-specific cleanup
});
```

---

### Dependency Chain Example

```
Execution Timeline:

Time →
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[server.js] ————————————→ [Starts event loop]

              [createApp()]
              ├─ databasePlugin runs
              │ └─ registerStartupHook() queued: "Connect DB"
              ├─ cachePlugin runs
              │ └─ registerStartupHook() queued: "Init cache"

              [createServer()]
              ├─ Wraps app-level registry: [DB hook, Cache hook]
              │
              [registerStartupHook()] from server.js
              └─ registerStartupHook() queued: "Setup monitoring"

              Queue: [DB hook, Cache hook, Monitoring hook]

              [setImmediate() fires]
              ├─ 1. Connect DB ✓
              ├─ 2. Init cache ✓
              ├─ 3. Setup monitoring ✓ (can now use DB + cache)
              └─ 4. server.listen(3000) ✓

```

---

### Sharing State Between Hooks

Use `app.locals` to share state between plugins and with entry-point hooks:

```javascript
// plugin.js
app.registerStartupHook(async () => {
  app.locals.sharedResource = await initializeResource();
});

// server.js (entry-point)
registerStartupHook(async () => {
  // Safe to access because app-level hooks already ran
  const resource = app.locals.sharedResource;
  await setupWithResource(resource);
});
```

---

### Error Handling

Errors in individual hooks are logged but do not prevent subsequent hooks from executing:

```javascript
app.registerStartupHook(async () => {
  throw new Error('Optional service failed');
  // Logged as error by framework logger, but other hooks still run
});

app.registerStartupHook(async () => {
  const logger = config.logger;
  logger.info('This still runs even if previous hook failed');
});
```

---

### Best Practices

| Practice                                    | Rationale                                                       |
| ------------------------------------------- | --------------------------------------------------------------- |
| **App-level:** Initialize shared resources  | Ensures all plugins have access to common infrastructure        |
| **Entry-point:** Setup deployment specifics | Orchestration/bootstrap that depends on app being ready         |
| **Use FIFO order explicitly**               | If plugin B depends on plugin A's resources, register A first   |
| **Log hook execution**                      | Makes startup/shutdown sequence visible in logs                 |
| **Handle errors gracefully**                | Assume individual hooks might fail; don't block others          |
| **Keep hooks fast**                         | Slow startup hooks delay server listening                       |
| **Avoid circular dependencies**             | If hook A depends on resource from hook B, order them correctly |

---

## See Also

- [00-project-specs.md](./00-project-specs.md) — Full API reference for `createApp()`, `createServer()`
- [P0-STARTUP-HOOK-ORDERING-FIX.md](./P0-STARTUP-HOOK-ORDERING-FIX.md) — Technical details of the setImmediate() race condition fix
- [P1-PRIVATE-LIFECYCLE-REGISTRITES.md](./P1-PRIVATE-LIFECYCLE-REGISTRITES.md) — WeakMap-based registry privacy implementation
