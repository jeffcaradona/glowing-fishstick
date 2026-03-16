# Claude Code Instructions: glowing-fishstick

POC Express.js framework distributed as npm modules. Solves "template drift" via composable, plugin-based architecture. See AGENTS.md (RDF triples, machine-optimized) or AGENTS-readable.md (human-readable) for all coding constraints, event-loop safety, PR checklists, and WHY-commenting rules — those rules are non-negotiable and not repeated here.

## Repository (npm workspaces monorepo)

core/web-app/ → @glowing-fishstick/app | core/shared/ → @glowing-fishstick/shared | core/service-api/ → @glowing-fishstick/api
sandbox/app/ → consumer example | sandbox/api/ → API consumer scaffold | core/generator/ → CLI scaffolding tool + starter templates | tests/ → Vitest integration tests

- Root package is NOT runtime-installable. Consumer examples import from `@glowing-fishstick/*` packages.
- `sandbox/app/` demonstrates how external projects consume the published modules.

## Architecture (factory + plugin + hooks)

**Factory pattern everywhere** — no classes (exception: `AppError` for `instanceof`):
`createServer(app, config)` · `createApp(config, [plugins])` · `createConfig(overrides, env)` · `createLogger(config)` · `createHookRegistry()`

**Plugin contract:** `(app, config) => void` — plain functions that add routes, register hooks, push nav links. Execute after core routes, before 404.

**Lifecycle hooks:** FIFO, error-isolated, `setImmediate`-deferred startup. Register via `app.registerStartupHook()` / `app.registerShutdownHook()`.

**Graceful shutdown sequence:** SIGTERM → app 'shutdown' event → health returns 503 → reject new requests → drain in-flight → run shutdown hooks (FIFO) → stop listening → timeout (30s) → destroy lingering connections → exit.

## Non-negotiables snapshot

- `AGENTS-readable.md` is canonical; this file is a compact map, not a substitute.
- Keep consumer examples on published package boundaries (`@glowing-fishstick/*`), not root imports.
- No blocking sync APIs in request paths; preserve async-consistent contracts and single-path error handling.
- Keep routes thin and move heavy work to services/workers.
- WHY-comments are mandatory for non-trivial decisions.
- **Reuse-first**: before building any new service, utility, or infrastructure, check `config.services` (DI container), `@glowing-fishstick/shared` exports, `@glowing-fishstick/logger`, and existing `package.json` dependencies.
- **Discoverability**: new exports require a README table entry + `index.d.ts` update. Config-injected properties need documented usage examples.

## Critical files

### Core infrastructure

- `core/shared/src/server-factory.js` — HTTP server + graceful shutdown
- `core/shared/src/hook-registry.js` — lifecycle management
- `core/shared/src/registry-store.js` — WeakMap-based privacy
- `core/modules/logger/src/` — Pino structured logging

### Application framework

- `core/web-app/src/app-factory.js` — Express app composition
- `core/web-app/src/config/env.js` — configuration factory
- `core/web-app/src/errors/appError.js` — error classes
- `core/web-app/src/middlewares/errorHandler.js` — error middleware
- `core/web-app/src/routes/health.js` — `/healthz`, `/readyz`, `/livez`

### Consumer examples

- `sandbox/app/src/server.js` — entry point (composition demo)
- `sandbox/app/src/app.js` — task manager plugin

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

**Modifying core:** Understand impact on all consumers → maintain backward compat → update `sandbox/app/` and `sandbox/api/` → sync docs → run full test suite.

**Adding routes:** Use `express.Router()`, async handlers, `try/catch` with `next(err)`, request-scoped logging via `req.log`.

**Adding config:** Spread `coreCreateConfig(overrides, env)` + consumer-specific fields in consumer's `config/env.js`.

## Intentional code duplication

Some code appears in both `core/web-app` and `core/service-api` by design. Sonar reports duplication for these pairs; changes should follow the guidelines below rather than blindly consolidating.

### Consolidated (shared)

- **`createAdminThrottle`** — Canonical source: `core/shared/src/middlewares/admin-throttle.js`. Both `core/web-app` and `core/service-api` import from `@glowing-fishstick/shared`. Local files (`core/*/src/middlewares/admin-throttle.js`) are re-export stubs that preserve the original import path.

### Intentionally separate (do not consolidate)

- **Error handlers** (`core/web-app/src/middlewares/errorHandler.js` vs `core/service-api/src/middlewares/error-handler.js`): App adds HTML content-negotiation via Eta; API is JSON-only. Keep logging/error-envelope structure aligned; diverge only on response format.
- **Factories** (`core/web-app/src/app-factory.js` vs `core/service-api/src/api-factory.js`): ~40 lines of shared middleware linking (hook registries, request ID, body parsers, health routes, shutdown gate, throttle, plugin loop). Middleware order is load-bearing and differs (view engine/static files vs JWT/origin enforcement). Abstraction would obscure the auditable middleware stack.
- **Security hardening tests** (`core/*/tests/integration/security-hardening.test.js`): Parallel test structure validates each framework independently. Each package must prove its own security contract; shared harness would obscure which implementation is under test.

## When in doubt

Read `core/web-app/src/app-factory.js` and `sandbox/app/src/app.js` for canonical patterns.
Factories over classes. Async everywhere. Tests for lifecycle. Sync all 4 docs.
Quality > velocity.
