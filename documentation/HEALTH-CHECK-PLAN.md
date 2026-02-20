# Health Check Extensibility — Implementation Plan

**Date**: 2026-02-19
**Status**: Proposed
**Priority**: Medium (next in queue after completed items)
**Tracks**: [99-potential-gaps.md](./99-potential-gaps.md) § Health Check Extensibility (#3)

---

## Summary

Add a `createHealthCheckRegistry()` factory to `@glowing-fishstick/shared` that lets plugins register named, async health checks via `app.registerHealthCheck(name, fn, opts)`. Checks execute concurrently with per-check timeouts and critical/non-critical classification. `/readyz` returns 503 only when critical checks fail; `/livez` aggregates all checks for deep verification; `/healthz` stays static. The duplicate health route in `core/app` and `core/api` is deduplicated into `core/shared`.

---

## Design Decisions

| Decision                      | Choice                                                                                | Rationale                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Deduplicate health routes** | Move to `core/shared`; both factories import from there                               | `core/app` and `core/api` have identical copies today — single source of truth eliminates drift                    |
| **`/healthz` behavior**       | Stays static (`{ status: "ok" }`, always 200)                                         | Liveness probes must be cheap and must never flap due to dependency state; K8s will kill the pod if liveness fails |
| **Critical vs non-critical**  | Critical failure → 503 on `/readyz`; non-critical → reported but still 200            | Enables graceful degradation; K8s stops routing traffic only for critical failures                                 |
| **Per-check timeout**         | Default 5 s per check, overridable at registration                                    | Prevents a hung dependency (e.g., unresponsive DB) from blocking the entire health response                        |
| **Registry storage**          | Separate `storeHealthRegistry`/`getHealthRegistry` alongside existing store functions | No breaking changes to `storeRegistries`/`getRegistries` signatures                                                |
| **`/livez` role**             | Runs all checks and returns full aggregate for deep health verification               | Fulfills the spec promise in `00-project-specs.md` Section 7.1                                                     |

---

## API Design

### Registration (Plugin / Consumer Side)

```javascript
// In a plugin function: (app, config) => void
app.registerHealthCheck(
  'database',
  async () => {
    const ok = await db.ping();
    return { healthy: ok, message: ok ? 'connected' : 'unreachable' };
  },
  { critical: true, timeout: 3000 },
);

app.registerHealthCheck(
  'cache',
  async () => {
    const ok = await redis.ping();
    return { healthy: ok };
  },
  { critical: false },
); // non-critical — degraded but still serving
```

#### `app.registerHealthCheck(name, checkFn, opts?)`

| Parameter       | Type                                                 | Required             | Description                                |
| --------------- | ---------------------------------------------------- | -------------------- | ------------------------------------------ |
| `name`          | `string`                                             | Yes                  | Unique identifier for the check            |
| `checkFn`       | `async () => { healthy: boolean, message?: string }` | Yes                  | Async function that performs the check     |
| `opts.critical` | `boolean`                                            | No (default: `true`) | Whether failure makes `/readyz` return 503 |
| `opts.timeout`  | `number`                                             | No (default: `5000`) | Per-check timeout in milliseconds          |

- Duplicate `name` throws `HealthCheckAlreadyRegisteredError`.
- Non-function `checkFn` or missing `name` throws `TypeError`.

### Factory (Internal)

```javascript
import { createHealthCheckRegistry } from '@glowing-fishstick/shared';

const registry = createHealthCheckRegistry({ defaultTimeout: 5000 });
registry.register('my-check', checkFn, { critical: true });

const result = await registry.execute(logger);
// → {
//     healthy: true,
//     checks: [
//       { name: 'my-check', healthy: true, critical: true, message: 'ok', duration: 12 }
//     ]
//   }
```

#### `createHealthCheckRegistry(options?)`

| Option           | Type     | Default | Description                     |
| ---------------- | -------- | ------- | ------------------------------- |
| `defaultTimeout` | `number` | `5000`  | Default per-check timeout in ms |

Returns `{ register, execute, getChecks }`:

| Method      | Signature                                    | Description                                   |
| ----------- | -------------------------------------------- | --------------------------------------------- |
| `register`  | `(name, checkFn, opts?) → void`              | Register a named health check                 |
| `execute`   | `(logger?) → Promise<{ healthy, checks[] }>` | Run all checks concurrently, return aggregate |
| `getChecks` | `() → [{ name, critical, timeout }]`         | Introspect registered checks (no execution)   |

### Error Classes

| Class                               | Thrown When                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `HealthCheckAlreadyRegisteredError` | `register()` called with a name that already exists                                                                           |
| `HealthCheckTimeoutError`           | Internal — used to signal per-check timeout (caught and converted to `{ healthy: false, message: 'Health check timed out' }`) |

---

## Endpoint Behavior After Implementation

### `/healthz` — Liveness (unchanged)

```
GET /healthz → 200 { status: "ok" }
```

Always 200. Never runs registered checks. Cheap probe for K8s liveness.

### `/readyz` — Readiness (extended)

**During shutdown** (existing behavior preserved):

```
GET /readyz → 503 { status: "not-ready", reason: "shutdown in progress" }
```

**Normal operation, no checks registered** (backward compatible):

```
GET /readyz → 200 { status: "ready" }
```

**Normal operation, checks registered**:

```
GET /readyz → 200 {
  "status": "ready",
  "checks": [
    { "name": "database", "healthy": true, "critical": true, "duration": 12 },
    { "name": "cache", "healthy": false, "critical": false, "message": "timeout", "duration": 5001 }
  ]
}
```

**Critical check fails**:

```
GET /readyz → 503 {
  "status": "not-ready",
  "checks": [
    { "name": "database", "healthy": false, "critical": true, "message": "connection refused", "duration": 43 },
    { "name": "cache", "healthy": true, "critical": false, "duration": 2 }
  ]
}
```

### `/livez` — Deep Health Verification (extended)

**No checks registered** (backward compatible):

```
GET /livez → 200 { status: "alive" }
```

**Checks registered**:

```
GET /livez → 200 {
  "status": "alive",
  "checks": [
    { "name": "database", "healthy": true, "critical": true, "duration": 11 },
    { "name": "cache", "healthy": true, "critical": false, "duration": 3 }
  ]
}
```

Same aggregate logic as `/readyz` — returns 503 only if a critical check fails. Intended for dashboards and deep health visibility rather than K8s probes.

---

## Implementation Phases

### Phase 1 — Health Check Registry Factory

**New file**: `core/shared/src/health-check-registry.js`

- `createHealthCheckRegistry(options?)` factory following the `createHookRegistry()` pattern in [core/shared/src/hook-registry.js](../core/shared/src/hook-registry.js)
- Closure-based privacy (same as hook registry)
- `register(name, checkFn, opts?)`:
  - Validates `name` is a non-empty string
  - Validates `checkFn` is a function
  - Throws `HealthCheckAlreadyRegisteredError` on duplicate name
  - Stores `{ name, checkFn, critical: opts?.critical ?? true, timeout: opts?.timeout ?? defaultTimeout }`
- `execute(logger?)`:
  - Runs all checks concurrently via `Promise.allSettled` with per-check `AbortSignal.timeout()` or `Promise.race` timeout wrapper
  - Each check result: `{ name, healthy, critical, message?, duration }`
  - A check that throws → `{ healthy: false, message: err.message }`
  - A check that times out → `{ healthy: false, message: 'Health check timed out' }`
  - Aggregate `healthy` = `true` unless any critical check has `healthy: false`
  - Logs individual check failures at `warn` level (if logger provided)
- `getChecks()`:
  - Returns array of `{ name, critical, timeout }` for introspection
- Error classes defined and exported from the same module:
  - `HealthCheckAlreadyRegisteredError extends Error`
  - `HealthCheckTimeoutError extends Error`

**Estimated size**: ~100–130 lines

---

### Phase 2 — Registry Storage

**Modified file**: `core/shared/src/registry-store.js`

Add a second module-scoped `WeakMap` for health registries:

```javascript
const healthRegistryMap = new WeakMap();

export function storeHealthRegistry(app, healthRegistry) {
  if (!healthRegistry) {
    throw new TypeError('storeHealthRegistry: healthRegistry must be provided');
  }
  healthRegistryMap.set(app, healthRegistry);
}

export function getHealthRegistry(app) {
  return healthRegistryMap.get(app) || null;
}
```

- Existing `storeRegistries`/`getRegistries` are **untouched** — no breaking changes.
- Same WeakMap GC-safe privacy pattern.

**Modified file**: `core/shared/index.js`

Add new exports:

```javascript
export { storeHealthRegistry, getHealthRegistry } from './src/registry-store.js';
export {
  createHealthCheckRegistry,
  HealthCheckAlreadyRegisteredError,
  HealthCheckTimeoutError,
} from './src/health-check-registry.js';
```

---

### Phase 3 — Deduplicate Health Routes into Shared

**New file**: `core/shared/src/routes/health.js`

Move and extend the existing health route implementation:

```javascript
import { Router } from 'express';
import { getHealthRegistry } from '../registry-store.js';

export function healthRoutes(app) {
  const router = Router();
  let isShuttingDown = false;

  if (app) {
    app.on('shutdown', () => {
      isShuttingDown = true;
    });
  }

  // /healthz — static liveness (never runs checks)
  router.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // /readyz — readiness with optional health check aggregation
  router.get('/readyz', async (_req, res) => {
    if (isShuttingDown) {
      return res.status(503).json({ status: 'not-ready', reason: 'shutdown in progress' });
    }
    const registry = getHealthRegistry(app);
    if (!registry) {
      return res.json({ status: 'ready' });
    }
    const result = await registry.execute();
    const status = result.healthy ? 'ready' : 'not-ready';
    const code = result.healthy ? 200 : 503;
    res.status(code).json({ status, checks: result.checks });
  });

  // /livez — deep health verification
  router.get('/livez', async (_req, res) => {
    const registry = getHealthRegistry(app);
    if (!registry) {
      return res.json({ status: 'alive' });
    }
    const result = await registry.execute();
    const status = result.healthy ? 'alive' : 'degraded';
    const code = result.healthy ? 200 : 503;
    res.status(code).json({ status, checks: result.checks });
  });

  return router;
}
```

**Deleted file**: `core/api/src/routes/health.js` — replaced with import from `@glowing-fishstick/shared`

**Modified or replaced file**: `core/app/src/routes/health.js` — either delete and update import, or re-export from shared

---

### Phase 4 — Wire into App and API Factories

**Modified file**: `core/app/src/app-factory.js`

```diff
+ import {
+   createHealthCheckRegistry,
+   storeHealthRegistry,
+ } from '@glowing-fishstick/shared';

  export function createApp(config, plugins = []) {
    // ... existing setup ...

    const startupRegistry = createHookRegistry();
    const shutdownRegistry = createHookRegistry();
+   const healthRegistry = createHealthCheckRegistry({
+     defaultTimeout: config.healthCheckTimeout ?? 5000,
+   });

    app.registerStartupHook = (hook) => startupRegistry.register(hook);
    app.registerShutdownHook = (hook) => shutdownRegistry.register(hook);
+   app.registerHealthCheck = (name, fn, opts) => healthRegistry.register(name, fn, opts);

    storeRegistries(app, startupRegistry, shutdownRegistry);
+   storeHealthRegistry(app, healthRegistry);

    // ... rest unchanged ...
  }
```

**Modified file**: `core/api/src/api-factory.js` — mirror the same changes.

**Modified file**: `core/app/src/config/env.js` (optional)

Add `healthCheckTimeout` config key:

```javascript
healthCheckTimeout: parseInt(env.HEALTH_CHECK_TIMEOUT, 10) || 5000,
```

---

### Phase 5 — Tests

#### Unit Tests

**New file**: `core/shared/tests/unit/health-check-registry.test.js`

| #   | Test Case                                            | Assertion                                                                                        |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Register and execute a single healthy check          | `result.healthy === true`, checks array has 1 entry                                              |
| 2   | Register and execute a single unhealthy check        | `result.healthy === false` (critical by default)                                                 |
| 3   | Concurrent execution                                 | Multiple checks run in parallel (verify via timing, not sequentially)                            |
| 4   | Duplicate name throws                                | `HealthCheckAlreadyRegisteredError` on second `register()` with same name                        |
| 5   | Check that throws is treated as unhealthy            | `check.healthy === false`, `check.message` contains error info                                   |
| 6   | Per-check timeout                                    | Slow check returns `{ healthy: false, message: 'Health check timed out' }` within timeout window |
| 7   | Critical check failure → aggregate unhealthy         | `result.healthy === false`                                                                       |
| 8   | Non-critical check failure → aggregate still healthy | `result.healthy === true`                                                                        |
| 9   | Mixed critical/non-critical                          | Aggregate follows critical checks only                                                           |
| 10  | `getChecks()` introspection                          | Returns registered check metadata without executing                                              |
| 11  | `execute()` returns duration per check               | Each check has a numeric `duration` field                                                        |
| 12  | Empty registry                                       | `{ healthy: true, checks: [] }`                                                                  |
| 13  | Invalid registration — non-function                  | Throws `TypeError`                                                                               |
| 14  | Invalid registration — missing name                  | Throws `TypeError`                                                                               |
| 15  | Invalid registration — empty string name             | Throws `TypeError`                                                                               |
| 16  | Default timeout is overridden by per-check timeout   | Per-check timeout takes precedence                                                               |

**Estimated**: ~16 test cases, ~200–250 lines

#### Integration Tests

**New file**: `core/app/tests/integration/health-check-extensibility.test.js`

| #   | Test Case                                               | Assertion                                                       |
| --- | ------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Plugin registers a health check → `/readyz` includes it | Response body contains `checks` array with the registered check |
| 2   | Critical unhealthy check → `/readyz` returns 503        | Status 503, `status: "not-ready"`                               |
| 3   | Non-critical unhealthy check → `/readyz` returns 200    | Status 200, `status: "ready"`, check listed as unhealthy        |
| 4   | `/livez` returns full check details                     | All checks present in response                                  |
| 5   | `/healthz` unaffected by registered checks              | Always 200 `{ status: "ok" }` regardless of check state         |
| 6   | Shutdown overrides check results                        | `/readyz` returns 503 during shutdown even if all checks pass   |
| 7   | No checks registered → backward compatible              | Existing response format preserved                              |
| 8   | Multiple plugins register checks → all aggregated       | All checks from all plugins appear in response                  |

**Estimated**: ~8 test cases, ~150–200 lines

---

### Phase 6 — Documentation Updates

1. **[documentation/00-project-specs.md](./00-project-specs.md)** — Section 7.1:
   - Document `app.registerHealthCheck(name, checkFn, opts)` API
   - Update `/readyz` and `/livez` descriptions to reflect extensibility and response schemas
   - Add response body examples showing `checks` array

2. **[documentation/99-potential-gaps.md](./99-potential-gaps.md)**:
   - Move Health Check Extensibility (#3) to the **✓ Completed** section
   - Add implementation summary with file references:
     - `health-check-registry.js` — factory
     - `registry-store.js` — storage extensions
     - `core/shared/src/routes/health.js` — deduplicated routes
     - `app-factory.js` / `api-factory.js` — wiring
   - Note deduplication of health routes from app/api into shared

3. **[README.md](../README.md)** — If health endpoints are documented, add brief note about extensibility

4. **[app/DEV_APP_README.md](../app/DEV_APP_README.md)** — Add example showing plugin health check registration

---

### Phase 7 — Security Scan

- Run Snyk code scan on all new/modified first-party code per [snyk_rules.instructions.md](../.github/instructions/snyk_rules.instructions.md)
- Rescan after any fixes until clean
- No new dependencies introduced — risk surface is minimal

---

## Files Changed Summary

| File                                                            | Action                  | Description                                                        |
| --------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| `core/shared/src/health-check-registry.js`                      | **Create**              | Health check registry factory + error classes                      |
| `core/shared/src/registry-store.js`                             | **Modify**              | Add `storeHealthRegistry` / `getHealthRegistry`                    |
| `core/shared/src/routes/health.js`                              | **Create**              | Deduplicated + extended health routes                              |
| `core/shared/index.js`                                          | **Modify**              | Export new factory, store functions, error classes, health routes  |
| `core/app/src/app-factory.js`                                   | **Modify**              | Create health registry, expose `app.registerHealthCheck`, store it |
| `core/app/src/routes/health.js`                                 | **Delete or re-export** | Replaced by shared implementation                                  |
| `core/app/src/config/env.js`                                    | **Modify**              | Add `healthCheckTimeout` config key                                |
| `core/api/src/api-factory.js`                                   | **Modify**              | Mirror app-factory health registry wiring                          |
| `core/api/src/routes/health.js`                                 | **Delete**              | Replaced by shared implementation                                  |
| `core/shared/tests/unit/health-check-registry.test.js`          | **Create**              | ~16 unit tests                                                     |
| `core/app/tests/integration/health-check-extensibility.test.js` | **Create**              | ~8 integration tests                                               |
| `documentation/00-project-specs.md`                             | **Modify**              | Update Section 7.1 with extensibility API                          |
| `documentation/99-potential-gaps.md`                            | **Modify**              | Mark #3 as completed                                               |
| `README.md`                                                     | **Modify**              | Note extensible health checks (if applicable)                      |
| `app/DEV_APP_README.md`                                         | **Modify**              | Add plugin health check example                                    |

---

## Verification Checklist

```bash
# All existing tests still pass (backward compatibility)
npm run test:all

# New unit tests pass
npx vitest run core/shared/tests/unit/health-check-registry.test.js

# New integration tests pass
npx vitest run core/app/tests/integration/health-check-extensibility.test.js

# Code quality
npm run lint
npm run format

# No sync APIs in new code
rg -n "\b(readFileSync|writeFileSync|execSync)\b" core/shared/src/health-check-registry.js core/shared/src/routes/health.js

# No anti-patterns
rg -n "eval\(|new Function\(|with\s*\(" core/shared/src/health-check-registry.js core/shared/src/routes/health.js

# Confirm deduplication — healthRoutes defined only in shared
rg "healthRoutes" core/app core/api core/shared

# Documentation consistency
rg "from '../../index.js'" README.md app/DEV_APP_README.md documentation/*.md
```

---

## Backward Compatibility

- **No breaking changes**: All new functionality is additive
- **No checks registered → identical behavior**: `/healthz`, `/readyz`, `/livez` return the same responses as today when no health checks are registered
- **Existing `storeRegistries`/`getRegistries` untouched**: New storage functions added alongside
- **Plugin contract unchanged**: `(app, config) => void` — `app.registerHealthCheck` is an additional method, not required
- **Shutdown behavior preserved**: `/readyz` still returns 503 during shutdown regardless of check state

---

## Estimated Effort

| Phase                         | Estimate                            |
| ----------------------------- | ----------------------------------- |
| Phase 1 — Registry factory    | ~100–130 lines                      |
| Phase 2 — Registry storage    | ~20 lines (modifications)           |
| Phase 3 — Route deduplication | ~50 lines (new shared route)        |
| Phase 4 — Factory wiring      | ~15 lines per factory (2 factories) |
| Phase 5 — Tests               | ~400–450 lines (unit + integration) |
| Phase 6 — Documentation       | ~50–100 lines of doc updates        |
| Phase 7 — Security scan       | Scan + fix cycle                    |
| **Total new code**            | **~650–800 lines**                  |
