# Project Specification — glowing-fishstick

> **Version:** 0.0.1  
> **Last Updated:** 2026-02-11  
> **Status:** Pre-implementation

---

## 1. Problem Statement

We have a template system at work that is an Express.js application with batteries-included middleware, routes, views, and configuration. Updates to this template are painful because implementation-specific routes and customizations are added directly by developers into the template source. This coupling means the template is distributed manually as a download rather than as a versioned npm package.

**Goal:** Turn the template into a proper, versioned npm module (e.g. `@glowing-fishstick/app`) that exports a composable factory. Consuming applications (e.g. `task_manager`) depend on it via `npm install`, provide their own routes/middleware/views/config through a plugin contract, and ship a thin `server.js` entrypoint that boots the composed app.

This eliminates template drift:

- Template updates become npm version bumps.
- App-specific changes live in the app repo, not in the template.
- Conflicts disappear because developers no longer edit the core template directly.

---

## 2. Architectural Principles

### 2.1 Functional Programming First

The codebase leans toward functional programming paradigms. Pragmatic exceptions are made where JavaScript's runtime semantics demand it (e.g. custom errors extending `Error`).

| Guideline                                | Rationale                                                                                                                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Factories over classes**               | `createApp()`, `createServer()`, `createConfig()` — all return plain objects or Express instances, not class instances.                                                                                         |
| **Contracts as shapes**                  | A "plugin" is any function matching `(app, config) => void`. A "config" is a plain frozen object with documented keys. No interfaces to implement, just shapes to conform to — documented via JSDoc `@typedef`. |
| **Custom errors extend `Error`**         | The one pragmatic exception. JS error handling (`instanceof`, stack traces, `catch` semantics) requires class extension. A factory `createAppError()` wraps construction so consumers never use `new` directly. |
| **Pure functions where possible**        | Config validation, env loading, health-check logic, config filtering — all pure functions that take input and return output with no side effects.                                                               |
| **Dependency injection via arguments**   | Middleware, route handlers, and plugins receive their dependencies (config, logger, etc.) as function arguments — no module-level singletons.                                                                   |
| **Composition over middleware chaining** | Build the middleware stack as a composable array of functions applied in order — each testable in isolation, easy to reorder or replace in consuming apps.                                                      |

### 2.2 Why Not Pure OOP

- Deep inheritance hierarchies are hard to test and refactor.
- Factory + plain-object patterns compose better and are simpler to mock/stub.
- Plugin functions are easier to unit test than class lifecycle hooks.
- Stress and smoke tests benefit from being able to spin up/tear down app instances without class ceremony.

---

## 3. Module System

- **ES Modules** (`"type": "module"` in `package.json`).
- All files use `import`/`export` syntax.

---

## 4. Public API Surface

The app package public entry point is `core/app/index.js` and re-exports the following:

```js
// core/app/index.js
export { createApp } from './src/app-factory.js';
export { createServer, createLogger, createRequestLogger } from '@glowing-fishstick/shared';
export { createConfig, filterSensitiveKeys } from './src/config/env.js';
export {
  createAppError,
  createNotFoundError,
  createValidationError,
} from './src/errors/appError.js';
```

`createServer` and logger utilities are re-exported through the shared package boundary:

```js
// core/shared/index.js
export { createServer } from './src/server-factory.js';
export { createHookRegistry } from './src/hook-registry.js';
export { storeRegistries } from './src/registry-store.js';
export { createLogger, createRequestLogger } from './src/logger.js';
```

Source-of-truth file mapping for this public API surface:

- `createApp` → `core/app/src/app-factory.js`
- `createConfig` / `filterSensitiveKeys` → `core/app/src/config/env.js`
- `errors` (`createAppError`, `createNotFoundError`, `createValidationError`) → `core/app/src/errors/appError.js`
- `createServer` implementation → `core/shared/src/server-factory.js` (re-exported via the `@glowing-fishstick/shared` package boundary)
- `createLogger` / `createRequestLogger` → `core/shared/src/logger.js` (re-exported via the `@glowing-fishstick/shared` package boundary)

### 4.1 `createApp(config, plugins = [])`

Factory function that builds and returns a configured Express `app` instance.

**Parameters:**

| Name      | Type                           | Description                                 |
| --------- | ------------------------------ | ------------------------------------------- |
| `config`  | `object`                       | Frozen config object from `createConfig()`. |
| `plugins` | `Array<(app, config) => void>` | Plugin functions applied after core setup.  |

**Behavior:**

1. Creates an Express app.
2. Sets EJS as the view engine with `src/views/` as default views directory.
3. Applies built-in middleware (JSON body parser, URL-encoded parser, static file serving).
4. Mounts core routes: health (`/healthz`, `/readyz`, `/livez`), landing page (`/`), admin (`/admin`, `/admin/config`).
5. Iterates `plugins`, calling each as `plugin(app, config)`.
6. Mounts error-handling middleware (404 catch-all, generic error handler).
7. Returns the Express `app` instance.

**Overridable options (via config):**

| Key        | Default                                   | Description                                  |
| ---------- | ----------------------------------------- | -------------------------------------------- |
| `viewsDir` | `src/views/` (resolved from package root) | Path to additional/override views directory. |

### 4.2 `createServer(app, config)`

Factory function that starts the Express app listening and returns a server contract.

**Parameters:**

| Name     | Type          | Description                          |
| -------- | ------------- | ------------------------------------ |
| `app`    | `Express app` | The app instance from `createApp()`. |
| `config` | `object`      | Config object (reads `port`).        |

**Returns:** `{ server, close, registerStartupHook, registerShutdownHook }`

| Property               | Type                                  | Description                                                                                                             |
| ---------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `server`               | `http.Server`                         | The underlying Node.js HTTP server.                                                                                     |
| `close`                | `() => Promise<void>`                 | Graceful shutdown function. Handles `SIGTERM`/`SIGINT` for K8s pod lifecycle.                                           |
| `registerStartupHook`  | `(hook: () => Promise<void>) => void` | Register an async hook to run during startup, before the server begins listening. Hooks run sequentially in FIFO order. |
| `registerShutdownHook` | `(hook: () => Promise<void>) => void` | Register an async hook to run during graceful shutdown, before the server closes. Hooks run sequentially in FIFO order. |

**Startup Hook Lifecycle:**

Startup hooks are executed **sequentially in FIFO order** after `createServer()` returns, before the server binds to the port. This allows consumers to:

1. Call `createServer(app, config)`
2. Register startup hooks synchronously via `registerStartupHook()`
3. Hooks execute in background (non-blocking), and server starts listening once all hooks complete
4. Any hook errors are logged but do not block subsequent hooks

**Two-Level Hook Architecture:**

Startup hooks come from two sources and execute in a defined sequence:

| Level              | Source                                     | Registered By                                         | Purpose                                                                              | Examples                                                             |
| ------------------ | ------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **1. App-level**   | Plugins (via `app.registerStartupHook()`)  | `createApp(config, [plugin1, plugin2, ...])`          | Infrastructure initialization — database connections, cache warming, service clients | DB pool setup, cache initialization, external API clients            |
| **2. Entry-point** | Server-level (via `registerStartupHook()`) | `createServer(app, config)` → `registerStartupHook()` | Deployment-specific setup that depends on app being initialized                      | Config finalization, monitoring bootstrap, deployment-specific tasks |

**Execution Order Example:**

```
createApp()
  ├─ plugin1.registerStartupHook(() => init database)        ← App-level hook #1
  └─ plugin2.registerStartupHook(() => init cache)           ← App-level hook #2

createServer(app, config)
  ├─ [internally] wraps app-level registry                   ← Queued first
  └─ registerStartupHook(() => setup monitoring)             ← Entry-point hook

setImmediate() fires:
  1. app-level hooks execute (FIFO order)
  2. entry-point hooks execute (FIFO order)
  3. server.listen(port)
```

**Why This Order?**

Entry-point hooks can safely depend on app resources that plugin hooks initialized. This creates a clear dependency chain: infrastructure (app) → orchestration (entry-point).

**Shutdown Hook Lifecycle:**

Shutdown hooks are executed **sequentially in FIFO order** when the process receives `SIGTERM` or `SIGINT`, before the server closes connections.

**Example:**

```js
const { server, close, registerStartupHook, registerShutdownHook } = createServer(app, config);

// Register hooks AFTER createServer() returns, before startup begins
registerStartupHook(async () => {
  console.log('Connecting to database…');
  // await db.connect();
});

registerShutdownHook(async () => {
  console.log('Closing database connection…');
  // await db.close();
});
```

### 4.3 `createConfig(overrides = {}, env = process.env)`

Pure factory function that builds a frozen configuration object.

**Parameters:**

| Name        | Type     | Description                                                                                 |
| ----------- | -------- | ------------------------------------------------------------------------------------------- |
| `overrides` | `object` | Consumer-provided config values merged on top of env + defaults.                            |
| `env`       | `object` | Environment variable source. Defaults to `process.env`. Accepts a plain object for testing. |

**Defaults:**

| Key          | Default         | Env Var       |
| ------------ | --------------- | ------------- |
| `port`       | `3000`          | `PORT`        |
| `nodeEnv`    | `'development'` | `NODE_ENV`    |
| `appName`    | `'app'`         | `APP_NAME`    |
| `appVersion` | `'0.0.0'`       | `APP_VERSION` |

**Returns:** A `Object.freeze()`'d plain object. Throws if required validation fails.

### 4.4 `filterSensitiveKeys(config)`

Pure function that returns a shallow copy of `config` with keys matching `SECRET|KEY|PASSWORD|TOKEN|CREDENTIAL` (case-insensitive) removed. Used by the admin config viewer.

### 4.4.1 `formatUptime(seconds)`

**Module:** `@glowing-fishstick/shared`
**File:** `core/shared/src/utils/formatters.js`

Pure function that formats duration in seconds into human-readable format. Automatically selects appropriate time units based on duration.

**Signature:**

```js
formatUptime(seconds: number): string
```

**Unit selection logic:**

- `< 60s`: Seconds only ("45s")
- `60s - 3599s`: Minutes and seconds ("5m 23s")
- `3600s - 86399s`: Hours and minutes ("2h 15m")
- `≥ 86400s`: Days, hours, and minutes ("3d 5h 30m")

**Edge cases:** Returns `"0s"` for negative, `NaN`, `Infinity`, or non-number inputs. Floors decimal values.

**Example usage:**

```js
import { formatUptime } from '@glowing-fishstick/shared';

const uptime = formatUptime(process.uptime());
// After 1 hour: "1h 0m"
// After 2 days: "2d 0h 0m"
```

### 4.5 Error Factories

```js
createAppError(code, message, statusCode); // → AppError instance
createNotFoundError(message); // → AppError with status 404
createValidationError(message); // → AppError with status 400
```

`AppError extends Error` is the single class in the codebase. The factories wrap construction so consumers never call `new` directly.

---

## 5. Plugin Contract

A plugin is a plain function with the signature:

```js
/**
 * @typedef {(app: Express, config: object) => void} Plugin
 */
```

Plugins are called **in array order** after core routes are mounted but **before** error-handling middleware. This means plugins can:

- Add new routes.
- Add middleware that applies to subsequent plugin routes.
- Read config values.
- Mount sub-applications.

Plugins should **not**:

- Modify or remove core routes.
- Mutate the config object (it's frozen).
- Call `app.listen()` (that's `createServer`'s job).

**Example plugin:**

```js
// task_manager-plugin.js
export function task_managerPlugin(app, config) {
  app.get('/task_manager/dashboard', (req, res) => {
    res.render('task_manager/dashboard', { appName: config.appName });
  });
}
```

---

## 6. Directory Structure

```
glowing-fishstick/
├── jsconfig.json
├── LICENSE
├── package.json                # Root package
├── README.md
│
├── app/                        # Example consuming application ("task_manager")
│   ├── DEV_APP_README.md
│   ├── package.json            # App package
│   └── src/
│       ├── app.js              # task_managerPlugin — custom routes/middleware
│       ├── server.js           # Thin entrypoint — composes & boots
│       ├── config/
│       │   └── env.js          # App-specific config overrides
│       ├── controllers/
│       ├── models/
│       ├── routes/
│       │   └── router.js
│       ├── utils/
│       └── views/
│           ├── index.ejs
│           └── tasks/
│               └── list.ejs
│
├── core/
│   ├── app/
│   │   ├── index.js            # Core module entry
│   │   ├── package.json
│   │   └── src/
│   │       ├── app-factory.js  # createApp() factory
│   │       ├── config/
│   │       │   └── env.js      # createConfig(), filterSensitiveKeys()
│   │       ├── errors/
│   │       │   └── appError.js # AppError class + factory functions
│   │       ├── middlewares/
│   │       │   └── errorHandler.js # notFoundHandler(), errorHandler()
│   │       ├── public/
│   │       │   └── css/
│   │       │       └── style.css
│   │       ├── routes/
│   │       │   ├── admin.js
│   │       │   ├── health.js
│   │       │   └── index.js
│   │       └── views/
│   │           ├── index.ejs
│   │           ├── admin/
│   │           │   ├── config.ejs
│   │           │   └── dashboard.ejs
│   │           ├── errors/
│   │           │   └── 404.ejs
│   │           └── layouts/
│   │               ├── footer.ejs
│   │               └── header.ejs
│   └── shared/
│       ├── README.md
│       └── src/
│           └── server-factory.js # createServer() factory
│
├── documentation/
│   └── 00-project-specs.md
│
└── scripts/
```

│ ├── controllers/ # App-specific controllers
│ ├── models/ # App-specific models
│ ├── services/ # App-specific business logic
│ └── views/ # App-specific views
│
├── tests/
│ ├── unit/ # Pure function & factory tests
│ ├── integration/ # supertest against createApp()
│ ├── smoke/ # Boot createServer(), hit endpoints, shut down
│ └── stress/ # Load testing (autocannon or similar)
│
└── documentation/
└── 00-project-specs.md # This file

````

---

## 7. Core Routes

### 7.1 Kubernetes Health Probes

| Route      | Method | Response              | Purpose                                                  |
| ---------- | ------ | --------------------- | -------------------------------------------------------- |
| `/healthz` | GET    | `{ status: "ok" }`    | Basic liveness check.                                    |
| `/readyz`  | GET    | `{ status: "ready" }` | Readiness check. Extensible to verify DB, cache, etc.    |
| `/livez`   | GET    | `{ status: "alive" }` | Liveness check. Extensible for deep health verification. |

All return HTTP 200 with `Content-Type: application/json`.

### 7.2 Landing Page

| Route | Method | Response          | Purpose                                                   |
| ----- | ------ | ----------------- | --------------------------------------------------------- |
| `/`   | GET    | Rendered EJS view | Default index page with app name, welcome message, links. |

### 7.3 Admin

| Route           | Method | Response          | Purpose                                                                                   |
| --------------- | ------ | ----------------- | ----------------------------------------------------------------------------------------- |
| `/admin`        | GET    | Rendered EJS view | Dashboard: app name, version, uptime, Node.js version, memory usage, placeholder cards.   |
| `/admin/config` | GET    | Rendered EJS view | Config viewer: table of non-sensitive config values (filtered via `filterSensitiveKeys`). |

---

## 8. Built-in Middleware

| Middleware                               | Source                            | Behavior                                                                                                                         |
| ---------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `express.json()`                         | Express built-in                  | Parses JSON request bodies.                                                                                                      |
| `express.urlencoded({ extended: true })` | Express built-in                  | Parses URL-encoded form data.                                                                                                    |
| `express.static()`                       | Express built-in                  | Serves static files from `src/public/`.                                                                                          |
| `notFoundHandler()`                      | `src/middlewares/errorHandler.js` | Catches unmatched routes, creates a 404 `AppError`, forwards to error handler.                                                   |
| `errorHandler()`                         | `src/middlewares/errorHandler.js` | Express 4-arg error middleware. Content-negotiates: renders EJS error view for `text/html`, returns JSON for `application/json`. |

Middleware is applied in this order:

1. Body parsers (JSON, URL-encoded)
2. Static file serving
3. Core routes (health, landing, admin)
4. **Plugin routes** (consumer-provided)
5. 404 catch-all
6. Error handler

---

## 9. Views (EJS)

- **View engine:** EJS (`ejs` npm package).
- **Default views directory:** `src/views/` (resolved from the package root).
- **Consumer override:** Pass `viewsDir` in config to point to additional views. The consumer's views directory is set as the primary, with the core views as fallback.

### 9.1 Layout Pattern

EJS does not have a built-in layout/block system. We use `<%- include() %>` partials:

```ejs
<%- include('../layouts/header') %>
  <!-- page-specific content -->
<%- include('../layouts/footer') %>
````

### 9.2 View Inventory

| View            | Path                  | Data                                                            |
| --------------- | --------------------- | --------------------------------------------------------------- |
| Layout header   | `layouts/header.ejs`  | `appName`, `navLinks`                                           |
| Layout footer   | `layouts/footer.ejs`  | —                                                               |
| Landing page    | `index.ejs`           | `appName`, `welcomeMessage`                                     |
| Admin dashboard | `admin/dashboard.ejs` | `appName`, `appVersion`, `uptime`, `nodeVersion`, `memoryUsage` |
| Admin config    | `admin/config.ejs`    | `config` (filtered)                                             |
| 404 error       | `errors/404.ejs`      | `message`, `statusCode`                                         |

---

## 10. Configuration & Environment

### 10.1 `.env` File (local development)

```env
PORT=3000
NODE_ENV=development
APP_NAME=glowing-fishstick
APP_VERSION=0.0.1
```

### 10.2 Config Layering

Priority (highest wins):

1. `overrides` argument passed to `createConfig()` by the consuming app.
2. Environment variables (`process.env` or injected `env` object).
3. Built-in defaults.

### 10.3 Sensitive Key Filtering

The `filterSensitiveKeys()` function removes any key whose name matches (case-insensitive):

```
SECRET | KEY | PASSWORD | TOKEN | CREDENTIAL
```

This is used by the `/admin/config` route to prevent accidental exposure.

---

## 11. Error Handling

### 11.1 AppError

```js
class AppError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.code = code; // e.g. 'NOT_FOUND', 'VALIDATION_ERROR'
    this.statusCode = statusCode; // e.g. 404, 400
    this.isOperational = true; // Distinguishes expected errors from bugs
  }
}
```

### 11.2 Error Factories

| Factory                                     | Code                 | Status         |
| ------------------------------------------- | -------------------- | -------------- |
| `createAppError(code, message, statusCode)` | caller-defined       | caller-defined |
| `createNotFoundError(message)`              | `'NOT_FOUND'`        | `404`          |
| `createValidationError(message)`            | `'VALIDATION_ERROR'` | `400`          |

### 11.3 Error Middleware Behavior

- If `req.accepts('html')` → render `errors/404.ejs` (or generic error view).
- If `req.accepts('json')` → return `{ error: { code, message, statusCode } }`.
- Non-operational errors (unexpected) log the stack and return a generic 500.

---

## 12. Testing Strategy

### 12.1 Test Levels

| Level           | Directory            | What's Tested                                                                                                                          | Tools                               |
| --------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Unit**        | `tests/unit/`        | Pure functions, factories, error constructors, config validation, `filterSensitiveKeys`, route handler logic (extracted as functions). | `vitest` or `node:test`             |
| **Integration** | `tests/integration/` | `createApp()` composed with test config + `supertest` — full HTTP request/response cycle without a running server.                     | `supertest`, test runner            |
| **Smoke**       | `tests/smoke/`       | `createServer()` booted on a random port — hit health endpoints, verify responses, graceful shutdown.                                  | test runner, `fetch` or `supertest` |
| **Stress**      | `tests/stress/`      | Load testing against a running instance. Validates performance and stability under concurrency.                                        | `autocannon` or similar             |

### 12.2 Testability by Design

The FP-first architecture directly supports testability:

- **Pure functions** → call with input, assert output. No setup/teardown.
- **Factories** → call `createApp()` with mock config, get a real app instance to test against. No global state to reset.
- **DI via arguments** → pass mock logger, mock config, mock env object. No monkey-patching `process.env`.
- **Plugin isolation** → test a plugin by creating a minimal app, applying only that plugin, and asserting its routes/behavior.
- **Server lifecycle** → `createServer()` returns `{ close }` for deterministic teardown in tests.

---

## 13. Dependencies

### 13.1 Production

| Package   | Purpose              |
| --------- | -------------------- |
| `express` | HTTP framework       |
| `ejs`     | View/template engine |
| `dotenv`  | `.env` file loading  |

### 13.2 Development

| Package                   | Purpose                               |
| ------------------------- | ------------------------------------- |
| `vitest` (or `node:test`) | Test runner                           |
| `supertest`               | HTTP assertions for integration tests |
| `nodemon`                 | Auto-restart during development       |

---

## 14. npm Scripts

**Root (`glowing-fishstick/`):**

```json
{
  "start:app": "node app/src/server.js",
  "dev:app": "nodemon --exec node app/src/server.js",
  "test": "vitest",
  "test:unit": "vitest run --reporter=verbose tests/unit",
  "test:integration": "vitest run --reporter=verbose tests/integration",
  "test:smoke": "vitest run --reporter=verbose tests/smoke",
  "test:all": "vitest run --reporter=verbose",
  "lint": "eslint .",
  "format": "prettier --write ."
}
```

**App (`app/package.json`):**

The app has its own `package.json` and can be run/tested independently.

---

## 15. Graceful Shutdown

`createServer()` registers handlers for `SIGTERM` and `SIGINT` to support Kubernetes pod lifecycle:

1. Stop accepting new connections.
2. Wait for in-flight requests to complete (with a timeout).
3. Exit cleanly.

The `close()` function returned by `createServer` can also be called programmatically (e.g. in tests).

---

## 16. App Example ("task_manager")

The `app/` directory simulates how a consuming application would use the core module. It demonstrates a standalone application with its own `package.json` and `src/` directory.

**App entrypoint:**

```js
// app/src/server.js
import { createApp, createServer, createConfig } from '@glowing-fishstick/app';
import { task_managerPlugin } from './app.js';

const config = createConfig({
  appName: 'task_manager',
  appVersion: '1.0.0',
});

const app = createApp(config, [task_managerPlugin]);
const { server, close } = createServer(app, config);
```

**App plugin (custom routes):**

```js
// app/src/app.js
export function task_managerPlugin(app, config) {
  app.get('/tasks', (req, res) => {
    res.render('tasks/list', { appName: config.appName });
  });
}
```

**In production:**

The app's `package.json` would depend on:

```json
{
  "dependencies": {
    "@glowing-fishstick/app": "^0.0.1"
  }
}
```

And the import would be:

```js
import { createApp, createServer, createConfig } from '@glowing-fishstick/app';
```

---

## 17. Future Considerations

- **Authentication/authorization middleware** as a core plugin or opt-in module.
- **Database connection factory** following the same pattern — `createDb(config)` returns `{ pool, close }`.
- **CLI scaffolding tool** — `npx create-core-app task_manager` to generate the consumer boilerplate.
- **OpenAPI/Swagger** auto-generation from route metadata.
- **Asset pipeline** for frontend builds (Vite, esbuild) as an optional plugin.

## 18. Logger Implementation

**Status**: ✅ Implemented (P3-LOGGER-IMPLEMENTATION)

The framework includes a Pino-based logger with environment-aware formatting and optional HTTP request logging middleware.

### Features

- **Development mode**: Pretty-printed console output + JSON file logs
- **Production mode**: JSON-formatted logs to stdout for container log collection
- **Automatic directory creation**: Creates `logs/` in consumer app root (process.cwd())
- **Structured logging**: Metadata objects for rich contextual logging
- **Optional injection**: Accepts `config.logger` or creates sensible default
- **Pluggable middleware**: Optional HTTP request/response logging

### API

#### `createLogger(options)`

Factory function that creates a Pino logger instance.

**Parameters**:

| Name                 | Type      | Default                         | Description                                               |
| -------------------- | --------- | ------------------------------- | --------------------------------------------------------- |
| `options.name`       | `string`  | `'app'`                         | Logger name for context and file naming                   |
| `options.logLevel`   | `string`  | `'info'` or `LOG_LEVEL` env var | Minimum log level: trace\|debug\|info\|warn\|error\|fatal |
| `options.logDir`     | `string`  | `process.cwd()/logs`            | Directory for log files                                   |
| `options.enableFile` | `boolean` | `true`                          | Enable file logging in development mode                   |

**Returns**: `pino.Logger` instance

**Example**:

```js
import { createLogger } from '@glowing-fishstick/app';

const logger = createLogger({
  name: 'my-service',
  logLevel: 'debug',
  logDir: './logs',
});

logger.info('Server starting');
logger.error({ err: new Error('failure'), userId: 123 }, 'Operation failed');
```

#### `createRequestLogger(logger)`

Factory function that creates Express middleware for HTTP request/response logging.

**Parameters**:

| Name     | Type          | Description                        |
| -------- | ------------- | ---------------------------------- |
| `logger` | `pino.Logger` | Logger instance to use for logging |

**Returns**: Express middleware function

**Example**:

```js
import { createLogger, createRequestLogger } from '@glowing-fishstick/app';

const logger = createLogger({ name: 'http' });
app.use(createRequestLogger(logger));
```

### Usage in Consumer Apps

**Basic (auto-created logger)**:

```js
import { createApp, createServer, createConfig } from '@glowing-fishstick/app';

const config = createConfig({ port: 3000 });
const app = createApp(config);
const { server } = createServer(app, config);
// Logger automatically created with sensible defaults
```

**Custom logger**:

```js
import { createApp, createServer, createConfig, createLogger } from '@glowing-fishstick/app';

const logger = createLogger({ name: 'my-app', logLevel: 'debug' });
const config = createConfig({ port: 3000, logger });
const app = createApp(config);
const { server } = createServer(app, config);
```

**In plugins**:

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

### Integration Points

The logger is injected via `config.logger` and used throughout the framework:

- **server-factory.js**: Startup/shutdown lifecycle logging
- **hook-registry.js**: Hook execution error logging
- **errorHandler.js**: Unexpected HTTP error logging
- **app-factory.js**: Request ID generation (always enabled) and HTTP request logging (enabled by default)
- **Consumer plugins**: Available via `config.logger` in all plugin functions
- **Consumer entrypoints**: Available for app-specific logging

### Request Logging

HTTP request/response logging is **enabled by default** when a logger is provided:

```js
const logger = createLogger({ name: 'my-app' });
const config = createConfig({ logger, port: 3000 });
const app = createApp(config);
// Request logging automatically enabled
```

**Features:**

- Automatic request ID generation (UUID) for each request
- Request IDs available as `req.id` and in `x-request-id` response header
- Logs method, path, status, duration, and request ID
- Configurable via `config.enableRequestLogging` (default: `true`)

**To disable:**

```js
const config = createConfig({
  logger,
  enableRequestLogging: false, // Disable HTTP logging
});
```

**Standalone usage:**

```js
import { createRequestIdMiddleware, createRequestLogger } from '@glowing-fishstick/app';

// Request ID generation (always recommended)
app.use(createRequestIdMiddleware());

// HTTP logging with custom logger
const httpLogger = createLogger({ name: 'http', logLevel: 'debug' });
app.use(createRequestLogger(httpLogger, { generateRequestId: false }));
```

### Log Output Examples

**Development (pretty-printed)**:

```
[2026-02-15 10:23:45] INFO (server): Startup sequence completed
[2026-02-15 10:23:45] INFO (server): app listening on http://localhost:3000
  port: 3000
[2026-02-15 10:23:47] ERROR (server): Error in startup hook
  err: {
    "type": "Error",
    "message": "Connection refused"
  }
```

**Production (JSON)**:

```json
{"level":30,"time":1739615025000,"name":"server","msg":"Startup sequence completed"}
{"level":30,"time":1739615025100,"name":"server","port":3000,"msg":"app listening on http://localhost:3000"}
{"level":50,"time":1739615027000,"name":"server","err":{"type":"Error","message":"Connection refused"},"msg":"Error in startup hook"}
```
