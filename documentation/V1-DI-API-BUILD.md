# V1 DI API — Build Plan

> Scope: Minimal, backward-compatible service container for app/api plugin ecosystems.
>
> Source spec: `V1-DI-API-PROPOSAL.md` (v4)
> Review record: `V1-DI-API-RESPONSE.md` (V1–V3 responses incorporated; V4 response items deferred)

---

## Scope fence

This build plan implements the v4 proposal as written. It incorporates all resolved concerns from V1–V3 review responses (concerns 1–10). V4 response concerns (11–14) are explicitly **out of scope** — they refine specification language and conformance test coverage beyond what is needed for a correct, minimal implementation. If any of them surface as real issues during implementation, they can be addressed in a follow-up patch without API changes.

| V4 concern | Disposition | Rationale |
|---|---|---|
| 11 — `ServiceResolutionError` throw conditions | Deferred | Error class exists with `(name, cause)` signature; wrapping provider failures is the obvious behavior. |
| 12 — `has()` conformance test | Deferred | Trivial boolean lookup; tested implicitly. Can add later. |
| 13 — `ServiceDisposeError` has no throw site | Deferred | Forward-compatibility stub by design. |
| 14 — `registerValue` semantics/test split | Deferred | Tautological; covered by test 1. |

---

## Pre-implementation checklist

Before writing code, verify:

- [ ] Branch: `feature/dependencyInjectionAPI` exists and is clean
- [ ] `npm install` succeeds at workspace root
- [ ] `npm run test:all` passes (no pre-existing failures)
- [ ] `npm run lint && npm run format` pass

---

## Build steps

### Step 1 — Implement container + error classes

**File:** `core/shared/src/service-container.js` (new)

Create a single module containing:

#### 1a. Error classes (6 total)

All extend `Error`. All set `.name` to match the class name for stable `instanceof` / serialization.

```
ServiceAlreadyRegisteredError(name)          → message: `Service "${name}" is already registered`
ServiceNotFoundError(name)                   → message: `Service "${name}" is not registered`
ServiceCircularDependencyError(path: string[]) → message: `Circular dependency detected: ${path.join(' → ')}`
ServiceResolutionError(name, cause)          → message: `Failed to resolve service "${name}"`, options: { cause }
ServiceDisposeError(name, cause)             → message: `Failed to dispose service "${name}"`, options: { cause }
ServiceAggregateDisposeError(errors)         → message: `Failed to dispose ${errors.length} service(s)`, .errors = errors
```

Convention notes:
- Use ES2022 `{ cause }` option for `ServiceResolutionError` and `ServiceDisposeError` to enable standard error chaining.
- `ServiceAggregateDisposeError.errors` entries are `{ name: string, cause: unknown }` where `cause` is the **raw** error from the disposer.
- `ServiceDisposeError` is exported for forward compatibility; no v1 code path throws it directly.

#### 1b. Factory function `createServiceContainer(options?)`

**Signature:** `createServiceContainer({ logger? }) → ServiceContainer`

Internal data structures:

| Structure | Type | Purpose |
|---|---|---|
| `registry` | `Map<string, { provider, lifecycle, dispose?, metadata? }>` | Registration metadata |
| `singletonCache` | `Map<string, unknown>` | Resolved singleton instances |
| `inflightResolves` | `Map<string, Promise<unknown>>` | Deduplication of concurrent singleton init |
| `creationOrder` | `string[]` | Tracks singleton init order for LIFO dispose |
| `disposed` | `boolean` | Idempotency guard |

**Methods to implement:**

| Method | Key behaviors |
|---|---|
| `register(name, provider, options?)` | Validate name (non-empty string → `TypeError`). Check duplicate → `ServiceAlreadyRegisteredError`. Default lifecycle to `'singleton'`. Reject `dispose` + `lifecycle: 'transient'` → `TypeError`. If provider is not a function, wrap in `() => provider`. Store in `registry`. |
| `registerValue(name, value, options?)` | Convenience for pre-initialized singletons. Internally: `register(name, value, { ...options, lifecycle: 'singleton' })` — the non-function provider path stores value directly. Also pre-populate `singletonCache` and `creationOrder` so it's immediately resolved and included in dispose. |
| `resolve(name)` | Always returns `Promise`. Unknown → reject `ServiceNotFoundError`. If singleton and cached → return cached. If singleton and in-flight → return in-flight promise. Detect cycles via resolution stack (thread-local set passed through `ctx.resolve`) → `ServiceCircularDependencyError`. On provider failure → reject `ServiceResolutionError(name, cause)`, clear cache. On success → cache, push to `creationOrder`. Transient → call provider, no cache. |
| `has(name)` | `registry.has(name)` — sync boolean. |
| `keys()` | `[...registry.keys()]`. |
| `dispose()` | If already disposed, resolve immediately (idempotent). Reverse `creationOrder`, iterate. For each name with a registered `dispose` callback and an entry in `singletonCache`, call the disposer. Collect `{ name, cause }` for failures. Continue through all. If any failures, reject with `ServiceAggregateDisposeError(errors)`. Clear all maps. Set `disposed = true`. |

**Circular detection approach:**

Pass a `Set<string>` (resolution path) through the internal resolve call. When `resolve` is called from within a provider via `ctx.resolve`, the set is forwarded. If the name is already in the set, throw `ServiceCircularDependencyError` with the path array. The set is scoped to a single top-level `resolve()` call chain — concurrent independent resolves get independent sets.

**`ServiceProviderContext` shape passed to providers:**

```js
{
  resolve: (name) => internalResolve(name, resolvingSet),
  has: (name) => registry.has(name),
  logger: options?.logger,
}
```

No `config` field (removed in v4 — unreachable by construction order; closure capture covers the use case).

#### 1c. Module exports

The file exports the factory and all 6 error classes as named exports.

---

### Step 2 — Export from `@glowing-fishstick/shared`

**File:** `core/shared/index.js`

Add exports:

```js
export {
  createServiceContainer,
  ServiceAlreadyRegisteredError,
  ServiceNotFoundError,
  ServiceCircularDependencyError,
  ServiceResolutionError,
  ServiceDisposeError,
  ServiceAggregateDisposeError,
} from './src/service-container.js';
```

Append after existing exports. No existing exports are modified.

---

### Step 3 — Wire into config factories

#### 3a. App config: `core/app/src/config/env.js`

Add import at top:

```js
import { createServiceContainer } from '@glowing-fishstick/shared';
```

Inside `createConfig()`, add `services` field to the config object literal **before** the `...overrides` spread and **before** `Object.freeze()`:

```js
const config = {
  // ... existing fields ...
  services: overrides.services ?? createServiceContainer({ logger: overrides.logger }),
  ...overrides,
};
```

The `...overrides` spread comes last so a caller can inject a test container via `overrides.services`.

#### 3b. API config: `core/api/src/config/env.js`

Same pattern. Add import:

```js
import { createServiceContainer } from '@glowing-fishstick/shared';
```

Add `services` field inside `createApiConfig()`:

```js
const config = {
  // ... existing fields ...
  services: overrides.services ?? createServiceContainer({ logger: overrides.logger }),
  ...overrides,
};
```

#### Freeze compatibility note

`Object.freeze` is shallow. The `services` reference on the config object is frozen (cannot be replaced), but the container's own methods remain callable. This is desirable — plugins can `register`/`resolve` but cannot swap the container.

---

### Step 4 — Unit tests for container

**File:** `core/shared/tests/unit/service-container.test.js` (new)

Framework: Vitest. Import from `../../src/service-container.js`.

Tests map directly to the conformance matrix (Section 7 of the proposal):

#### 7.1 Core behavior

| # | Test description | Key assertions |
|---|---|---|
| 1 | Registers and resolves plain value service | `registerValue('cfg', { a: 1 })` → `resolve('cfg')` returns `{ a: 1 }`. Result is a `Promise`. |
| 2 | Registers and resolves async provider service | `register('db', async () => mockDb)` → `resolve('db')` returns `mockDb`. |
| 3 | Singleton provider executes once across many resolves | Provider spy called once despite 3 sequential `resolve()` calls. All return same reference. |
| 4 | Concurrent singleton resolves dedupe to single provider invocation | `Promise.all([resolve('x'), resolve('x'), resolve('x')])` → provider spy called once. |
| 5 | Transient provider executes per resolve | `register('t', () => ({}), { lifecycle: 'transient' })` → two resolves return different references. Provider spy called twice. |
| 6 | Duplicate registration throws `ServiceAlreadyRegisteredError` | Second `register('x', ...)` throws. Verify `error.name === 'ServiceAlreadyRegisteredError'`. |
| 7 | Unknown service rejects with `ServiceNotFoundError` | `resolve('nope')` rejects. Verify `error.name === 'ServiceNotFoundError'`. |
| 8 | Circular dependency rejects with `ServiceCircularDependencyError` + path | A resolves B, B resolves A. Verify rejection, `error.name`, and `error.path` includes both names. |
| 9 | `keys()` returns all registered names regardless of init state | Register 3 services, resolve 1. `keys()` returns all 3. |

#### 7.2 Lifecycle behavior

| # | Test description | Key assertions |
|---|---|---|
| 10 | `dispose()` runs disposers for initialized services only | Register A (with disposer) and B (with disposer). Resolve only A. Dispose. Only A's disposer called. |
| 11 | Disposal order is reverse creation order (LIFO) | Register and resolve A, then B, then C (all with disposers). Dispose. Disposer call order: C, B, A. |
| 12 | Dispose is idempotent | Call `dispose()` twice. Second call resolves without error. Disposers called exactly once total. |
| 13 | Dispose continues after one disposer failure, returns aggregate error | B's disposer throws. A and C disposers succeed. Verify rejection with `ServiceAggregateDisposeError`, `.errors` length 1, `.errors[0].cause` is the raw throw. |

#### Additional unit tests (input validation)

| Test description | Key assertions |
|---|---|
| `register` throws `TypeError` for empty string name | Verify `TypeError`. |
| `register` throws `TypeError` for non-string name | Pass `42`. Verify `TypeError`. |
| `register` throws `TypeError` for transient + dispose combo | Verify `TypeError` message references transient lifecycle. |
| Provider failure clears singleton cache, allows retry | First resolve rejects. Fix provider. Second resolve succeeds. |
| `ctx.resolve` and `ctx.has` are available inside providers | Provider asserts `typeof ctx.resolve === 'function'` and `typeof ctx.has === 'function'`. |
| `ctx.logger` is the logger passed to factory | Provider asserts `ctx.logger` identity matches. |

---

### Step 5 — Integration tests for plugin composition

**File:** `core/shared/tests/unit/service-container-integration.test.js` (new)

These tests verify the container works with the app factory and plugin system. They correspond to conformance matrix Section 7.3.

| # | Test description | Approach |
|---|---|---|
| 14 | Plugin A registers service, Plugin B resolves it | Create config with container. Define two plugin functions. Plugin A calls `config.services.register(...)`. Plugin B calls `config.services.resolve(...)` inside a route handler. Use Supertest to hit the route and verify the resolved value. |
| 15 | Startup warmup via hooks executes before server listen | Plugin registers a service and a startup hook that resolves it. Verify the service is cached (provider called) before the first request arrives. |
| 16 | Shutdown hook invokes container dispose | Register shutdown hook with `await config.services.dispose()`. Trigger shutdown. Verify disposers ran. |

---

### Step 6 — Documentation sync

Update the following files per sync rules:

#### 6a. `documentation/00-project-specs.md`

Add a section describing the service container API. Include the factory signature, the `config.services` integration point, and a minimal example. Reference the error classes available via `@glowing-fishstick/shared`.

#### 6b. `app/DEV_APP_README.md`

Add a usage example showing how a consumer plugin registers and resolves a service through `config.services`. Show the startup-hook warmup pattern and the shutdown-hook dispose pattern.

#### 6c. `README.md`

Add a brief mention of the service container in the feature list. Add a minimal code example in the plugin section showing `config.services.register(...)` and `config.services.resolve(...)`.

#### 6d. `documentation/99-potential-gaps.md`

Update implementation status to reflect that the service container is implemented. Note the v1 constraints (no request-scoped containers, no `ctx.config`, singleton-only dispose, no strict mode toggle).

---

### Step 7 — Validation

Run the full validation suite:

```bash
# Tests pass
npm run test:all

# Lint + format clean
npm run lint && npm run format

# No sync blocking APIs introduced
rg -n "\b(readFileSync|writeFileSync|appendFileSync|existsSync|readdirSync|statSync|lstatSync|mkdirSync|rmSync|unlinkSync|execSync|spawnSync|pbkdf2Sync|scryptSync)\b" core/shared/src/service-container.js

# No anti-patterns
rg -n "eval\(|new Function\(|with\s*\(" core/shared/src/service-container.js

# Documentation consistency
rg "from '../../index.js'" README.md app/DEV_APP_README.md documentation/*.md

# Package boundary check
npm pack --dry-run --workspace=core/shared
```

---

## File change summary

| File | Action | Description |
|---|---|---|
| `core/shared/src/service-container.js` | **Create** | Container factory + 6 error classes (~250-350 lines) |
| `core/shared/index.js` | **Edit** | Add 7 named exports |
| `core/app/src/config/env.js` | **Edit** | Add import + `services` field in config literal |
| `core/api/src/config/env.js` | **Edit** | Add import + `services` field in config literal |
| `core/shared/tests/unit/service-container.test.js` | **Create** | Unit tests (conformance 1–13 + validation tests) |
| `core/shared/tests/unit/service-container-integration.test.js` | **Create** | Integration tests (conformance 14–16) |
| `documentation/00-project-specs.md` | **Edit** | Add service container section |
| `app/DEV_APP_README.md` | **Edit** | Add plugin usage example |
| `README.md` | **Edit** | Add feature mention + example |
| `documentation/99-potential-gaps.md` | **Edit** | Update implementation status |

**No existing tests are modified. No existing exports are removed. No plugin signatures change.**

---

## Sequencing and dependencies

```
Step 1 (container impl)
  ↓
Step 2 (shared exports)  ←  Step 1 must exist first
  ↓
Step 3 (config wiring)   ←  Step 2 must be importable
  ↓
Step 4 (unit tests)      ←  Step 1 artifact exists
  ↓
Step 5 (integration)     ←  Steps 2 + 3 wired
  ↓
Step 6 (docs)            ←  Implementation stable
  ↓
Step 7 (validation)      ←  Everything complete
```

Steps 4 and 5 can be developed in parallel with Step 3 if the container module (Step 1) is complete, but tests should be run after Step 3 to validate the full integration path.

---

## Acceptance criteria

- All 16 conformance tests from Section 7 pass
- Input validation tests pass (TypeError on bad name, transient+dispose)
- `npm run test:all` green (no regressions)
- `npm run lint && npm run format` clean
- Zero sync blocking APIs in `service-container.js`
- All 4 documentation files updated with consistent examples
- `config.services` available on both app and api config objects
- Existing plugin `(app, config) => void` contract unchanged