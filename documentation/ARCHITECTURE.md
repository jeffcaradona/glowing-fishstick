# Architecture Map — glowing-fishstick

> **Purpose:** A single-page navigation aid. Read this when you are lost, before touching anything.  
> **Keep it short.** Detail lives in `documentation/00-project-specs.md` and individual source files.

---

## Core Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Consumer entrypoint  (app/src/server.js, api/src/server.js)│
│                                                             │
│  1. createLogger()          ← @glowing-fishstick/shared     │
│  2. createConfig(overrides) ← @glowing-fishstick/app|api    │
│  3. createApp|Api(config, [plugins])  ← factory             │
│  4. createServer(app, config)         ← @glowing-fishstick/shared │
│     └─ setImmediate → run startup hooks → server.listen()  │
└─────────────────────────────────────────────────────────────┘
                 │ HTTP request arrives
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Express middleware stack  (order is load-bearing)          │
│                                                             │
│  1. x-powered-by disabled                                   │
│  2. createRequestIdMiddleware()   — x-request-id header     │
│  3. createRequestLogger()        — Pino request logging     │
│  4. express.json / urlencoded    — body parsing with limits │
│  5. express.static               — (app only)               │
│  6. healthRoutes()               — /healthz /readyz /livez  │
│  7. createEnforcementMiddleware() — (api only) JWT + origin │
│  8. createAdminThrottle()        — rate-limit hot paths     │
│  9. shutdownGate                 — reject during shutdown   │
│ 10. core routes (index, admin, metrics)                     │
│ 11. plugin loop                  — consumer plugins         │
│ 12. notFoundHandler / errorHandler                          │
└─────────────────────────────────────────────────────────────┘
                 │ SIGTERM / SIGINT
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Graceful shutdown sequence                                 │
│                                                             │
│  1. app.emit('shutdown')   — health → 503, gate → 503       │
│  2. shutdown hooks (FIFO)  — db close, cache flush, etc.    │
│  3. server.close()         — drain in-flight requests       │
│  4. timeout (30 s)         — destroy lingering sockets      │
│  5. process.exit(0|1)                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Folder Responsibilities

```
/
├── app/                    Consumer example — full-stack HTML app (task manager)
│   └── src/
│       ├── server.js       Entrypoint: wires config + plugin + server
│       ├── app.js          taskManagerApplicationPlugin — adds routes, nav links
│       ├── config/env.js   App-specific config overrides (spread into createConfig)
│       ├── routes/         Consumer route handlers
│       ├── services/       Business logic (task CRUD)
│       └── views/          ETA templates
│
├── api/                    Consumer example — JSON REST API (task API)
│   └── src/
│       ├── server.js       Entrypoint: wires config + plugin + server
│       ├── api.js          taskApiPlugin — adds routes
│       ├── config/env.js   API-specific config overrides
│       ├── database/       SQLite via DatabaseSync; schema migrations on startup
│       ├── routes/         JSON route handlers
│       ├── services/       Business logic (task CRUD)
│       └── validation/     Input validation (task-validation.js); shared by routes
│
├── core/
│   ├── app/                @glowing-fishstick/app — HTML/view framework package
│   │   └── src/
│   │       ├── app-factory.js      createApp() — assembles full middleware stack
│   │       ├── config/env.js       createConfig() — layered config factory
│   │       ├── controllers/        admin-controller.js (dashboard, config viewer)
│   │       ├── engines/            ETA view engine adapter
│   │       ├── errors/             AppError hierarchy + factory functions
│   │       ├── middlewares/        errorHandler, notFoundHandler
│   │       ├── routes/             health.js, index.js, admin.js
│   │       └── views/              Core ETA templates (layout, admin, health)
│   │
│   ├── api/                @glowing-fishstick/api — JSON API framework package
│   │   └── src/
│   │       ├── api-factory.js      createApi() — assembles API middleware stack
│   │       ├── config/env.js       createApiConfig() — layered config factory
│   │       ├── middlewares/        enforcement.js (JWT+origin), error-handler.js
│   │       └── routes/             health.js, index.js, metrics.js
│   │
│   ├── shared/             @glowing-fishstick/shared — cross-package utilities
│   │   └── src/
│   │       ├── server-factory.js   createServer() — HTTP + graceful shutdown
│   │       ├── hook-registry.js    createHookRegistry() — FIFO lifecycle hooks
│   │       ├── registry-store.js   WeakMap-based app→registries private storage
│   │       ├── request-id.js       createRequestIdMiddleware()
│   │       ├── service-container.js createServiceContainer() — DI map
│   │       ├── auth/jwt.js         generateToken / verifyToken
│   │       ├── middlewares/
│   │       │   ├── admin-throttle.js  createAdminThrottle() — fixed-window rate limit
│   │       │   └── jwt-auth.js        jwtAuthMiddleware
│   │       └── utils/              formatters, error-utils
│   │
│   └── modules/
│       └── logger/         @glowing-fishstick/logger — Pino structured logging
│           └── src/logger.js  createLogger(), createRequestLogger()
│
├── tests/                  Integration tests (Vitest + Supertest)
│   └── integration/        graceful-shutdown, startup-hook-ordering, …
│
├── documentation/          All planning and reference docs
│   ├── ARCHITECTURE.md     ← you are here
│   ├── HARDENING.md        Cookbook: CSP, secrets, DB timeouts, signing
│   ├── 00-project-specs.md Full public API surface and design decisions
│   └── 99-potential-gaps.md Backlog and implementation status
│
└── core/generator/         CLI scaffolding tool + starter templates
```

---

## What Must Never Happen

| Rule                                                                    | Reason                                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| No `*Sync` filesystem/crypto/child-process APIs in routes or middleware | Blocks the event loop; kills throughput under load                           |
| No mixed sync/async callback timing in public APIs                      | Creates non-deterministic call ordering and hidden race conditions           |
| No logger instantiation inside request-path middleware                  | Repeated allocation on every request; use `req.app.locals.logger`            |
| No importing from root package as a runtime dependency                  | Root `package.json` is workspace tooling only — not a publishable package    |
| No consumer code in `core/*` packages                                   | `core/*` must be template-agnostic and reusable across any app               |
| No sharing secrets via config viewer (`/admin/config`)                  | `filterSensitiveKeys()` removes them; never bypass it                        |
| No surfacing errors through multiple paths (throw AND callback)         | Guarantees callers have one predictable error channel                        |
| No unbounded body parsing                                               | Express body parsers must always have `limit` set (already wired via config) |
| No bypassing enforcement middleware in API                              | `createEnforcementMiddleware()` must mount before routes, not in plugin loop |

---

## Common Change Recipes

### Add an endpoint to the consumer app

1. Add a route file in `app/src/routes/`.
2. Mount it inside `taskManagerApplicationPlugin` in `app/src/app.js`:
   ```js
   import { myRoutes } from './routes/my-routes.js';
   // inside the plugin function:
   app.use(myRoutes(config));
   ```
3. Add a service function in `app/src/services/` if business logic is needed.
4. Write an integration test in `tests/integration/` using Supertest.

### Add an endpoint to the consumer API

Same pattern as above but in `api/src/`:

1. Add a route file in `api/src/routes/`.
2. Mount it in `taskApiPlugin` in `api/src/api.js`.
3. Add input validation in `api/src/validation/` using the same shape as `task-validation.js`.
4. Call the DB via `api/src/services/` — never directly from a route handler.

### Add a stored procedure / database call

1. Define the query as a named function in `api/src/services/task-service.js` (or a new service file).
2. Accept the `db` handle as an argument — never import the singleton inside the function.
3. Add a schema migration in `api/src/database/db.js` if the schema changes:
   - Add an entry to the `migrations` array with an incremented `version`.
   - The `up` function receives the `DatabaseSync` handle and runs inside a transaction.
   - Pre-validate existing data before destructive schema changes.
4. Add/extend integration tests to cover the new query and any 400/404 paths.

### Add request validation to a route

1. Add validation logic to `api/src/validation/task-validation.js` (or create a sibling file).
2. Export a pure function: `validateX(data) => { valid: boolean, errors: string[] }`.
3. Call it at the top of the route handler before any DB access:
   ```js
   const { valid, errors } = validateX(req.body);
   if (!valid) return res.status(400).json({ error: errors.join('; ') });
   ```
4. Test the 400 path explicitly.

### Add a config key

1. Add a default to the `DEFAULTS` object in the relevant `config/env.js`.
2. Wire the layered resolution in `createConfig()` / `createApiConfig()`:
   ```js
   myKey: overrides.myKey ?? env.MY_ENV_VAR ?? DEFAULTS.myKey,
   ```
3. Update `documentation/00-project-specs.md` config table.
4. Update `README.md` if it is a public/consumer-facing key.

### Add a lifecycle hook (startup or shutdown)

In the consumer entrypoint (`server.js`):

```js
registerStartupHook(async () => {
  // WHY: Initialize <resource> before traffic arrives.
  await myResource.connect();
});

registerShutdownHook(async () => {
  // WHY: Release <resource> before process exits.
  await myResource.close();
});
```

For plugin-level hooks, use `app.registerStartupHook()` / `app.registerShutdownHook()` (attached by `attachHookRegistries` in the factory).

### Add a plugin

1. Export a plugin function from your app/api source:
   ```js
   export function myPlugin(app, config) {
     app.use(myRoutes(config));
     app.registerStartupHook(async () => {
       /* init */
     });
   }
   ```
2. Pass it to `createApp(config, [myPlugin])` or `createApi(config, [myPlugin])` in `server.js`.
3. Plugins execute **after** core routes and **before** the error handlers — order within the array matters.
