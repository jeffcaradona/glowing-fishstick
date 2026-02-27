# Potential Gaps & Future Enhancements

This document tracks potential server composability features and architectural gaps identified during development. These are candidates for future implementation as needs arise.

---

## Current / In-Flight Work

### Feature: CLI Template Generator (`@glowing-fishstick/generator`)

**Status**: ✓ Complete — MVP implemented at `core/generator/`

**Description**: Added a globally-installable CLI tool (`fishstick-create`) that scaffolds new glowing-fishstick applications and APIs from templates in `core/generator/templates/`. Uses `commander` for argument parsing and `handlebars` for `{{ }}` placeholder rendering. Built-in `node:readline/promises`, `node:fs/promises`, and `node:child_process` handle prompts, file I/O, and git/npm steps.

**Changes Implemented**:

- [core/generator/package.json](../core/generator/package.json): Package definition with `"bin": { "fishstick-create": "./bin/cli.js" }` ✓
- [core/generator/bin/cli.js](../core/generator/bin/cli.js): CLI entry point (commander) ✓
- [core/generator/src/generator.js](../core/generator/src/generator.js): Orchestrator — validates, prompts, scaffolds, runs git init + npm install ✓
- [core/generator/src/scaffolder.js](../core/generator/src/scaffolder.js): Recursive copy + Handlebars render; `.eta` files copied verbatim ✓
- [core/generator/src/validators.js](../core/generator/src/validators.js): Project name, port, template, directory validation ✓
- [core/generator/src/prompts.js](../core/generator/src/prompts.js): Interactive prompts via `node:readline/promises` ✓
- [core/generator/templates/app/](../core/generator/templates/app/): App template with Handlebars placeholders ✓
- [core/generator/templates/api/](../core/generator/templates/api/): API template with Handlebars placeholders ✓
- [core/generator/README.md](../core/generator/README.md): Package documentation ✓
- Tests: `tests/unit/validators.test.js`, `tests/unit/scaffolder.test.js`, `tests/integration/cli.test.js` ✓

**Key decisions**:

- Handlebars `{{ }}` avoids collision with Eta's `<%= %>` in `.eta` template files
- `.eta` files copied verbatim (Eta runtime resolves expressions, not the generator)
- Generated `package.json` dev scripts have monorepo `--watch ../core/*` paths removed for standalone use
- `coreVersion` stamped from generator's own `package.json` into generated dependency versions

**Benefit**: New users can scaffold a working app in under 30 seconds with zero manual edits. Eliminates setup errors and ensures generated projects follow framework best practices.

---

### Refactor: Logger Module Extraction (`core/modules/*` ownership boundary)

**Status**: ✓ Complete — logger implementation moved to `core/modules/logger` and published as `@glowing-fishstick/logger`

**Description**: Extracted logger implementation ownership from shared internals into `core/modules/logger`. `core/shared` remains the compatibility layer and curated public API, continuing to re-export logger utilities as the primary consumer import boundary.

**Changes Implemented**:

- [logger.js](../core/modules/logger/src/logger.js): Canonical logger implementation (`createLogger`, `createRequestLogger`) ✓
- [package.json](../core/modules/logger/package.json): Dedicated logger package boundary `@glowing-fishstick/logger` ✓
- [index.js](../core/shared/index.js): Re-export logger API from `@glowing-fishstick/logger` to preserve compatibility ✓

**Benefit**: Clear ownership boundaries (`core/modules/*`) for implementation code while preserving stable consumer ergonomics through `core/shared`.

---

### Feature: Database Schema Migration System & Input Validation

**Status**: ✓ Complete — Production-grade, version-tracked migrations and application-level validation implemented

**Description**: Added a production-grade database migration system to the API package for safe schema evolution with built-in data validation and rollback protection. Existing databases are upgraded via atomic table rebuilds with pre-migration validation; fresh installs use the latest constraints. Complemented by application-level input validation in routes, providing user-friendly 400 errors before data reaches SQLite.

**Rationale**: SQLite doesn't support ALTER TABLE for adding constraints, making table rebuilds necessary for schema evolution. Pre-migration validation prevents silent data corruption. Atomic transactions ensure schema is never partially upgraded. Fail-on-startup behavior forces operator intervention on data violations (production best practice).

**Implementation**:

**Database Migration System** (`api/src/database/db.js`):

- Tracks applied migrations in `schema_versions` table: `version` (PK), `applied_at` (timestamp), `description` (text)
- Migrations defined as array of `{ version, description, up }` objects at module scope
- `up` is a function receiving `DatabaseSync` handle; executes within `BEGIN TRANSACTION / COMMIT` block
- Runs automatically during `open()` startup hook, **before traffic arrives**
- **Pre-migration validation**: Before rebuilding table, scans existing data for constraint violations
- **Atomic execution**: Each migration is all-or-nothing via transactions; `ROLLBACK` on failure keeps schema unchanged
- **Fail-on-startup**: If validation fails, app refuses to start with clear error listing sample bad records and fix options
- **Idempotent**: Already-applied migrations are skipped; safe to call on every startup

**Migration v1**: Rebuild tasks table with CHECK constraints

- Pre-validation scans for: title > 255 chars, description > 4000 chars, done ∉ {0,1}
- If violations found, throws error with sample IDs + lengths + fix instructions (DELETE or UPDATE options)
- If clean, rebuilds via official SQLite 12-step pattern: `CREATE TABLE tasks_new... INSERT... DROP... RENAME`
- Base schema for fresh installs includes all CHECK constraints at creation time

**Error handling on data violations**:

```
Migration v1 failed: existing data violates new constraints:
  title (max 255 characters): 2 record(s)
    Samples: id=5, length=320 | id=8, length=1024
  description (max 4000 characters): 1 record(s)
    Samples: id=10, length=5000

Fix the data manually:
  Option A: DELETE FROM tasks WHERE length(title) > 255;
  Option B: UPDATE tasks SET title = substr(title, 1, 255) WHERE length(title) > 255;
Then restart the app to retry migration.
Or delete api/data/tasks.db for a fresh start.
```

App refuses to start; operator has full visibility and control over cleanup.

**Input Validation Module** (`api/src/validation/task-validation.js`):

- Exports frozen `LIMITS`: `{ TITLE_MAX: 255, DESCRIPTION_MAX: 4000 }`
- `validateTaskInput(data, opts)`: Type, length, presence checks; returns `{ valid, errors: string[] }`
- `validateId(raw)`: Parses + validates numeric IDs; rejects NaN, negative, non-integer; returns `{ valid, id, error? }`
- Reusable across routes, services, tests; composable error reporting

**Route Integration** (`api/src/routes/router.js`):

- POST `/api/tasks`: Validates title presence/length/type; returns 400 with `{ error: string }` if invalid
- PATCH `/api/tasks/:id`: Validates all provided fields; per-field error reporting
- All `:id` routes (GET, PATCH, DELETE): Validate `:id` parameter; return 400 for invalid format, 404 for not-found
- Database layer executes only after all validation succeeds

**Input Constraints**:
| Field | Max Length | Type | Required | Notes |
|-------|---|---|---|---|
| `title` | 255 chars | string | Yes | Non-empty after trim |
| `description` | 4000 chars | string | No | Nullable |
| `done` | — | boolean/0/1 | No | Defaults to 0 |
| `id` (URL) | — | integer | Yes | Positive, non-NaN |

**Defense-in-Depth**:

1. Application validation (400 errors, user-friendly, fast feedback at route layer)
2. Database CHECK constraints (safety net, prevents malformed data at storage)
3. SQLite TEXT limit (effectively unbounded ~1 GB default, last resort)

**WHY this design? (Production best practices)**:

- **Pre-validation prevents corruption**: Operator sees violations before schema change; can fix or start fresh
- **Atomic migrations are reversible**: If migration fails, schema is unchanged; operator can fix data and retry
- **Fail-on-startup forces intervention**: App won't run with broken data; no silent errors or degraded service
- **Explicit operator control**: Data cleanup is manual, not automated; prevents surprise truncations
- **SQLite-compliant**: Uses official 12-step rebuild pattern; works with WAL mode, journal modes
- **Synchronous OK here**: Migrations run at startup before traffic; acceptable exception per AGENTS.md

**Management notes**:

- Table rebuilds acquire brief exclusive locks; on large tables may take seconds
- Idempotent `runMigrations()` safe on every app restart
- Test with both empty databases (fresh install) and pre-populated databases (violation scenarios)

**Benefit**: Safe schema evolution, zero silent data loss, operator visibility, production-grade error handling, testable migration contracts.

---

### Refactor: Migrate Startup/Shutdown Hooks from `app.locals` to Closures

**Status**: ✓ Complete — Encapsulation implemented (P0 startup ordering race fix + P1 WeakMap privacy)

**Description**: Moved `app.startupHooks` and `app.shutdownHooks` from mutable `app.locals` arrays to encapsulated closures. Exposed via `app.registerStartupHook()` and `app.registerShutdownHook()` methods. Fixed race-prone startup hook ordering by deferring hook execution via `setImmediate()`. Enforced true registry privacy via WeakMap-based storage, preventing external mutation through underscore fields.

**Rationale**: Lifecycle registries should be private and immutable to prevent accidental mutation or overwriting by plugins. Consumer hooks must be registerable synchronously after `createServer()` returns, before the startup sequence begins. Internal state (like graceful shutdown) uses events, not `app.locals`.

**Changes Implemented**:

- [app-factory.js](../core/app/src/app-factory.js): Create private hook registries in closure; expose register methods on app object; store registries via WeakMap ✓
- [server-factory.js](../core/shared/src/server-factory.js): Retrieve registries via `getRegistries()` instead of underscore fields; defer startup execution via `setImmediate()` to allow consumer hook registration ✓
- [registry-store.js](../core/shared/src/registry-store.js): WeakMap-based private registry storage — `storeRegistries()` / `getRegistries()` ✓
- [shared/index.js](../core/shared/index.js): Export `storeRegistries` for cross-package access ✓
- [app.js](../app/src/app.js): Plugin examples use `app.registerStartupHook()` / `app.registerShutdownHook()` ✓

**Fix Details (P0 — Startup Hook Ordering)**:

- **Issue**: `createServer()` IIFE executed synchronously during factory call, before consumer code could register hooks.
- **Solution**: Wrap startup sequence in `setImmediate()` to defer to next event loop tick, guaranteeing consumer hook registration happens first.
- **Impact**: Lifecycle API contract now reliable; plugins and consumers can depend on hook registration order without race conditions.
- **Docs**: [P0-STARTUP-HOOK-ORDERING-FIX.md](./archive/2026-02/P0-STARTUP-HOOK-ORDERING-FIX.md)

**Fix Details (P1 — Private Lifecycle Registries)**:

- **Issue**: Registries exposed via `app._startupRegistry` / `app._shutdownRegistry` underscore fields — externally mutable.
- **Solution**: Replace underscore fields with a module-level `WeakMap` in `registry-store.js`. Only internal infrastructure can access registries.
- **Impact**: True language-level privacy; external code cannot access or mutate registries. Auto-garbage-collection via WeakMap.
- **Docs**: [P1-PRIVATE-LIFECYCLE-REGISTRITES.md](./archive/2026-02/P1-PRIVATE-LIFECYCLE-REGISTRITES.md)

**Benefit**: Cleaner API contract, prevents plugin bugs, keeps `app.locals` focused on observable state, reliable startup hook execution order, language-enforced registry privacy.

---

## 1. Request-Level Context/Storage

**Description**: Track request-scoped metadata across async boundaries using Node's `AsyncLocalStorage`.

**Use Cases**:

- Request IDs for distributed tracing
- User context propagation through middleware chain
- Correlation IDs for logging
- Request-specific state in async handlers

**Rationale**: Currently, passing context through deep async call stacks requires manual threading or reliance on globals. AsyncLocalStorage provides clean isolation per request.

**Potential Impact**: Medium — Enables better observability and debugging without invasive plumbing.

---

## 2. Dependency Injection / Service Container

**Status**: ✓ Complete — v1 implemented in `core/shared/src/service-container.js`

**Description**: Lightweight service registry for plugins to register and consume shared services (DB pools, cache instances, external clients) without module-level singletons or circular dependencies.

**Implemented**:

- `createServiceContainer({ logger? })` factory exported from `@glowing-fishstick/shared`
- `config.services` attached to both app (`createConfig`) and api (`createApiConfig`) config objects
- Singleton + transient lifecycles with concurrent-resolve deduplication
- Circular dependency detection via resolution-chain set threading
- LIFO disposal with `ServiceAggregateDisposeError` on partial failure
- 6 error classes: `ServiceAlreadyRegisteredError`, `ServiceNotFoundError`, `ServiceCircularDependencyError`, `ServiceResolutionError`, `ServiceDisposeError`, `ServiceAggregateDisposeError`
- Full conformance test suite (16 tests across §7.1–§7.3)

**v1 constraints** (not implemented — deferred by design):

- No request-scoped containers
- No `ctx.config` on provider context (use closure capture)
- `dispose()` tracks initialized singletons only (transients are not tracked)
- No strict-mode toggle

---

## 3. Health Check Extensibility

**Description**: Allow plugins to register custom health checks beyond the core liveness probe (e.g., database connectivity, cache status, external service dependencies).

**Use Cases**:

- Plugin health endpoints (e.g., `/health/db`, `/health/cache`)
- Aggregate health status (`/health` returns 503 if any critical check fails)
- Plugin-specific startup readiness checks
- Graceful degradation (non-critical failures don't block startup)

**Rationale**: Currently, `healthRoutes()` is static. Dynamic registration enables comprehensive system health visibility without coupling plugins to core health logic.

**Potential Impact**: Medium — Important for production observability and Kubernetes liveness probes.

---

## 4. Error Handling Customization

**Description**: Allow plugins to contribute custom error handlers, error type definitions, or error response transformations.

**Use Cases**:

- Plugins defining domain-specific errors (ValidationError, NotFoundError)
- Custom error response formatting per error type
- Error logging/monitoring integrations
- HTTP status code mapping for custom errors

**Rationale**: Currently, error handling is centralized in core middleware. Plugins may need to catch and transform their own errors before the global handler.

**Potential Impact**: Medium — Needed for sophisticated error handling in microservice architectures.

---

## 5. Config Validation

**Description**: Enforce schema validation of plugin configuration at startup to catch misconfigurations early before runtime failures.

**Use Cases**:

- Plugins declaring required vs. optional config keys
- Type validation (string, number, boolean, etc.)
- Default value provision
- Early error reporting during `createApp()`

**Rationale**: Silent config failures are hard to debug. Upfront validation prevents hours of troubleshooting.

**Potential Impact**: Low-Medium — Improves developer experience and reduces production incidents.

---

## 6. Plugin Prerequisites / Ordering

**Description**: Allow plugins to declare dependencies on other plugins, ensuring correct initialization order.

**Use Cases**:

- Plugin A requires Plugin B to run first
- Async dependency resolution (e.g., "wait for DB plugin before app logic plugin")
- Validation that prerequisites are met before loading dependent plugins

**Rationale**: Currently, plugins run in array order with no dependency awareness. Explicit ordering prevents subtle bugs when plugins are reordered.

**Potential Impact**: Low-Medium — Matters more as plugin count grows; avoids subtle initialization-order bugs.

---

## Prioritization Notes

**✓ Completed**:

- Migrate Startup/Shutdown Hooks to Closures — Encapsulation and startup ordering semantics finalized (P0)
- Private Lifecycle Registries via WeakMap — Language-enforced encapsulation replacing underscore fields (P1)
- `@glowing-fishstick/api` Thin MVP Slice — Implemented `createApi`/`createApiConfig`, core middleware stack, JSON-first error handling, and integration tests
- API health passthrough (phase 1) — Implemented fixed app endpoint (`/admin/api-health`) to probe API readiness (`/readyz`) without exposing generic proxying
- Admin route decomposition + JWT primitives (phase 2) — Moved admin route business logic into controllers and promoted shared JWT helpers/middleware (`generateToken`, `verifyToken`, `jwtAuthMiddleware`) into the published shared package boundary
- API app-access enforcement (phase 3) — Implemented non-health route enforcement in `core/api` via `API_BLOCK_BROWSER_ORIGIN` and `API_REQUIRE_JWT`, fail-fast `JWT_SECRET` guard, and app-side JWT rotation with shutdown cleanup in `app/src/services/tasks-api.js`
- Dependency Injection / Service Container (#2) — v1 implemented with singleton/transient lifecycles, circular detection, LIFO disposal, and 6 error classes; `config.services` wired into both app and api factories
- Logger module extraction (`core/modules/*` ownership boundary) — Moved logger implementation to `core/modules/logger` / `@glowing-fishstick/logger`; kept `@glowing-fishstick/shared` as compatibility + curated public API
- Database Schema Migration System & Input Validation — Version-tracked migrations in `api/src/database/db.js` with automatic startup execution; application-level validation in routes and dedicated validation module; CHECK constraints for defense-in-depth
- Security hardening (Snyk `javascript/NoRateLimitingForExpensiveWebOperation`) — Payload limits (`jsonBodyLimit`, `urlencodedBodyLimit`, `urlencodedParameterLimit`), fixed-window admin/metrics throttling (`429`), error handler logger hardening (removed per-request `createLogger()` fallback), JWT toggle preserved as opt-in

**High Priority** (near-term):

### Security: Resource Allocation Limits and Throttling (Snyk Code)

**Status**: ✓ Complete — payload limits, admin/metrics throttling, and error handler logger hardening implemented

**Implementation Plan**: [SECURITY-HARDENING-PLAN.md](./SECURITY-HARDENING-PLAN.md)

**Finding**: Snyk Code reported `javascript/NoRateLimitingForExpensiveWebOperation` on request-path code in:

- `core/app/src/middlewares/errorHandler.js`
- `core/app/src/controllers/admin-controller.js`

**Remediation Implemented**:

1. Request body allocation limits in both app and API factories:
   - `express.json({ limit: config.jsonBodyLimit })` (default `100kb`)
   - `express.urlencoded({ limit: config.urlencodedBodyLimit, parameterLimit: config.urlencodedParameterLimit })` (defaults `100kb` / `1000`)

2. Fixed-window, in-memory, process-local throttling:
   - App: `/admin`, `/admin/config`, `/admin/api-health` (default 60 req / 60s)
   - API: `/metrics/memory`, `/metrics/runtime` (default 60 req / 60s)
   - Returns `429` with deterministic JSON error envelope

3. Error handler logger hardening:
   - Removed per-request `createLogger()` fallback from `core/app/src/middlewares/errorHandler.js`
   - Removed per-request `createLogger()` fallback from `core/api/src/middlewares/error-handler.js`
   - Fallback to `console.error` when startup-injected logger is unavailable

4. Integration tests:
   - `413` for oversized JSON, URL-encoded, and excess parameters (app + API)
   - `429` for admin/metrics burst traffic (app + API)
   - Health endpoints (`/healthz`, `/readyz`, `/livez`) remain available under throttle
   - JWT enforcement and browser-origin blocking unaffected (regression tests)
   - Error handler works without per-request logger construction

**Config Surface Added**:

| Package | Config Key                 | Env Var                          | Default |
| ------- | -------------------------- | -------------------------------- | ------- |
| App     | `jsonBodyLimit`            | `APP_JSON_BODY_LIMIT`            | `100kb` |
| App     | `urlencodedBodyLimit`      | `APP_URLENCODED_BODY_LIMIT`      | `100kb` |
| App     | `urlencodedParameterLimit` | `APP_URLENCODED_PARAMETER_LIMIT` | `1000`  |
| App     | `adminRateLimitWindowMs`   | `APP_ADMIN_RATE_LIMIT_WINDOW_MS` | `60000` |
| App     | `adminRateLimitMax`        | `APP_ADMIN_RATE_LIMIT_MAX`       | `60`    |
| API     | `jsonBodyLimit`            | `API_JSON_BODY_LIMIT`            | `100kb` |
| API     | `urlencodedBodyLimit`      | `API_URLENCODED_BODY_LIMIT`      | `100kb` |
| API     | `urlencodedParameterLimit` | `API_URLENCODED_PARAMETER_LIMIT` | `1000`  |
| API     | `adminRateLimitWindowMs`   | `API_ADMIN_RATE_LIMIT_WINDOW_MS` | `60000` |
| API     | `adminRateLimitMax`        | `API_ADMIN_RATE_LIMIT_MAX`       | `60`    |

**Residual Notes**:

- Throttling is process-local (in-memory fixed-window). Distributed throttling (Redis-backed) deferred to future phase.
- ESLint has a pre-existing `ajv` dependency issue unrelated to this work.
- JWT toggle (`API_REQUIRE_JWT`) remains fully optional and composes cleanly with all hardening features.

**Medium Priority** (mid-term):

- Health Check Extensibility (#3)
- Request-Level Context / AsyncLocalStorage (#1)

**Low-Medium Priority** (future):

- Error Handling Customization (#4)
- Config Validation (#5)
- Plugin Prerequisites / Ordering (#6)

---

## Implementation Approach

When implementing any of these, consider:

- **Backward compatibility**: Don't break existing plugin structure
- **Minimal overhead**: Keep the plugin lifecycle simple for simple cases
- **Documentation**: Add examples for each new feature
- **Testing**: Include fixtures demonstrating each feature
