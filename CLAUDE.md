# Claude Code Instructions: glowing-fishstick

POC Express.js framework distributed as npm modules. Solves "template drift" via composable, plugin-based architecture. See AGENTS.md for all coding constraints, event-loop safety, PR checklists, and WHY-commenting rules — those rules are non-negotiable and not repeated here.

## Repository (npm workspaces monorepo)

core/app/ → @glowing-fishstick/app | core/shared/ → @glowing-fishstick/shared | core/api/ → @glowing-fishstick/api
app/ → consumer example | api/ → API consumer scaffold | template/ → starter templates | tests/ → Vitest integration tests

- Root package is NOT runtime-installable. Consumer examples import from `@glowing-fishstick/*` packages.
- `app/` demonstrates how external projects consume the published modules.

## Architecture (factory + plugin + hooks)

**Factory pattern everywhere** — no classes (exception: `AppError` for `instanceof`):
`createServer(app, config)` · `createApp(config, [plugins])` · `createConfig(overrides, env)` · `createLogger(config)` · `createHookRegistry()`

**Plugin contract:** `(app, config) => void` — plain functions that add routes, register hooks, push nav links. Execute after core routes, before 404.

**Lifecycle hooks:** FIFO, error-isolated, `setImmediate`-deferred startup. Register via `app.registerStartupHook()` / `app.registerShutdownHook()`.

**Graceful shutdown sequence:** SIGTERM → app 'shutdown' event → health returns 503 → reject new requests → drain in-flight → run shutdown hooks (FIFO) → stop listening → timeout (30s) → destroy lingering connections → exit.

## Critical files

### Core infrastructure
- `core/shared/src/server-factory.js` — HTTP server + graceful shutdown
- `core/shared/src/hook-registry.js` — lifecycle management
- `core/shared/src/registry-store.js` — WeakMap-based privacy
- `core/modules/logger/src/` — Pino structured logging

### Application framework
- `core/app/src/app-factory.js` — Express app composition
- `core/app/src/config/env.js` — configuration factory
- `core/app/src/errors/appError.js` — error classes
- `core/app/src/middlewares/errorHandler.js` — error middleware
- `core/app/src/routes/health.js` — `/healthz`, `/readyz`, `/livez`

### Consumer examples
- `app/src/server.js` — entry point (composition demo)
- `app/src/app.js` — task manager plugin

### Key tests
- `tests/integration/graceful-shutdown.test.js`
- `tests/integration/startup-hook-ordering.test.js`

## Tech stack

Node.js ≥ 22, ESM, Express 5.x, EJS templates, Pino logging, dotenv.
Dev: Vitest + Supertest, ESLint v10 (flat config), Prettier, Nodemon.

## Testing

Vitest + Supertest. `npm run test:all` for full suite, `npm run test:integration`, `npm run test:unit`.
All features need integration tests covering success + error paths. Test hook ordering and shutdown for lifecycle changes.

## Code quality

ESLint: semicolons, single quotes, 100-char width, trailing commas. `no-param-reassign` disabled in `*-factory.js`.
Prettier: 100 chars, 2-space indent, single quotes, es5 trailing commas.
Run: `npm run lint` · `npm run format` · `npm run test:all`

## Workflows

**Adding features:** Read existing patterns → create plugin (don't modify core) → factory functions → lifecycle hooks → integration tests → sync 4 docs (README, DEV_APP_README, 00-project-specs, 99-potential-gaps) → validate.

**Modifying core:** Understand impact on all consumers → maintain backward compat → update `app/` and `api/` → sync docs → run full test suite.

**Adding routes:** Use `express.Router()`, async handlers, `try/catch` with `next(err)`, request-scoped logging via `req.log`.

**Adding config:** Spread `coreCreateConfig(overrides, env)` + consumer-specific fields in consumer's `config/env.js`.

## When in doubt

Read `core/app/src/app-factory.js` and `app/src/app.js` for canonical patterns.
Factories over classes. Async everywhere. Tests for lifecycle. Sync all 4 docs.
Quality > velocity.
