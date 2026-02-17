# V1 DI API — Review Response

> Reviewed against current codebase state (branch: `feature/dependencyInjectionAPI`)
>
> Status: Pre-implementation review. No container code exists yet.

---

## Overall Assessment

The proposal is well-structured and aligns strongly with the project's existing design principles. The factory function shape, error class conventions, async-first semantics, and plugin contract stability are all correct. The conformance test matrix is a good foundation. The issues below must be addressed before or during implementation — one is critical.

---

## 1. Critical: Frozen Config Prevents Late Attachment of `config.services`

**Section affected:** 5.1, 9 (Rollout plan)

`createConfig()` in both `core/app/src/config/env.js` and `core/api/src/config/env.js` returns `Object.freeze(config)`. A frozen object rejects property assignment at runtime (or silently in non-strict mode). The proposal describes `config.services` as the integration point, but it cannot be attached after creation.

**Required fix:** The service container must be created *inside* the config factory and included in the object literal before `Object.freeze()` is called.

```js
// core/app/src/config/env.js
import { createServiceContainer } from '@glowing-fishstick/shared';

export function createConfig(overrides = {}, env = process.env) {
  const logger = overrides.logger;
  const config = {
    // ... existing fields ...
    services: overrides.services ?? createServiceContainer({ logger }),
    ...overrides,
  };
  return Object.freeze(config);
}
```

Because `Object.freeze` is shallow, `config.services.register(...)` continues to work — the container object itself remains mutable. Only the reference at `config.services` is frozen (i.e., you cannot replace the container, which is desirable).

**Both config factories must be updated:** `core/app/src/config/env.js` and `core/api/src/config/env.js`.

**Rollout plan update (Step 3):** Rewrite from "Inject `config.services` by default" to "Include `services: createServiceContainer({ logger })` in the config object literal before `Object.freeze()`."

> **Resolution (v2):** ✅ Addressed. Section 5.1 now explicitly states the container must be created inside the config factory before `Object.freeze()`, includes the correct code example, and Step 3 of the rollout plan was rewritten to match.

---

## 2. Medium: Transient Lifecycle + `dispose` — GC Risk Unaddressed

**Section affected:** 3.3 (Runtime semantics — Dispose)

The spec states: "Container MUST call registered `dispose` callbacks for successfully created instances only."

For singleton services this is well-defined: one instance, one disposal. For transient services, each `resolve` call creates a new instance. If a transient service registers a `dispose` callback, the container must hold a strong reference to every created instance to call its disposer at shutdown. This prevents garbage collection of those instances for the lifetime of the container — a potential memory leak if transients are resolved in request paths.

**Recommendation:** Add a clarifying paragraph to Section 3.3 under "Dispose" stating one of the following:

**Option A (restrict):** "`dispose` callbacks for transient services are not supported in v1. Registering a `dispose` on a transient service SHOULD throw a `TypeError` at `register` time."

**Option B (document the trade-off):** "For transient services with `dispose` callbacks, the container retains a strong reference to every resolved instance. Callers SHOULD NOT register `dispose` callbacks on transient services resolved in request paths. This behavior is intentional and may be revisited in a future version."

Option A is simpler and avoids the ambiguity for v1.

> **Resolution (v2):** ✅ Addressed. Option A was adopted. Section 3.2 adds `// v1 rule: dispose is only valid for singleton lifecycle.` and Section 3.3 under Register adds: *"In v1, `dispose` is only supported for singleton services. Registering `dispose` with `lifecycle: 'transient'` MUST throw `TypeError`."*

---

## 3. Medium: Error Class Location

**Section affected:** 4 (Error model), 9 (Rollout plan)

The 6 required error classes must be co-located with the container implementation. The proposal is silent on which package boundary they belong to. The existing `AppError` lives in `core/app/src/errors/appError.js`, but the container must be accessible from both `core/app` and `core/api`. Placing errors in `core/app` would create an awkward cross-package dependency for the api config factory.

**Recommendation:** Implement the container and all 6 error classes together in `core/shared/src/service-container.js` (or a subdirectory). Export via `core/shared/index.js`:

```js
export { createServiceContainer } from './src/service-container.js';
// Error classes exported if consumers need to instanceof-check them:
export {
  ServiceAlreadyRegisteredError,
  ServiceNotFoundError,
  ServiceCircularDependencyError,
  ServiceResolutionError,
  ServiceDisposeError,
  ServiceAggregateDisposeError,
} from './src/service-container.js';
```

Add to rollout plan Step 2: "Export `createServiceContainer` and all service error classes via `@glowing-fishstick/shared` package boundary."

> **Resolution (v2):** ✅ Addressed. Section 4 now explicitly states all error classes SHOULD be defined in `core/shared/src/service-container.js` and exported via `core/shared/index.js`. Step 2 of the rollout plan was updated to match.

---

## 4. Low: LIFO Dispose vs FIFO Hook Execution — Document the Distinction

**Section affected:** 3.3 (Runtime semantics — Dispose)

The existing hook registry executes hooks in FIFO order (both startup and shutdown). The proposal correctly specifies LIFO for service disposal ("reverse creation order"). These are different systems with intentionally different semantics, and that is fine — but a developer encountering both in the same codebase will notice the apparent contradiction.

**Recommendation:** Add a brief note to Section 3.3 under "Dispose": "Disposal intentionally uses LIFO (reverse creation order) to tear down dependents before their dependencies. This differs from lifecycle hooks, which use FIFO for predictable sequential execution."

> **Resolution (v2):** ✅ Addressed. Section 3.3 now ends with: *"Disposal intentionally uses LIFO so dependents are torn down before dependencies. This differs from lifecycle hook registries (startup/shutdown) that execute FIFO for predictable sequential orchestration."*

---

## 5. Low: Plugin Registration Convention Not Documented

**Section affected:** 5.2 (Plugin usage contract)

The proposal solves *instance* ordering — lazy `resolve` ensures a service is initialized before its consumer, regardless of plugin order. However, *registration* ordering still matters: only one plugin may register a given service name; duplicates throw `ServiceAlreadyRegisteredError`. Plugin authors need to know this is a constraint.

**Recommendation:** Add to Section 5.2:

> Each service name MUST be registered by exactly one plugin. Plugin authors are responsible for coordinating ownership of service names (e.g., via naming conventions such as `'db'`, `'cache'`, `'mailer'`). Attempting to register a name already registered by another plugin will throw `ServiceAlreadyRegisteredError`.

> **Resolution (v2):** ✅ Addressed. Section 5.2 now includes: *"Each service name MUST be owned by exactly one plugin (or one core registration point). If multiple plugins register the same service name, `ServiceAlreadyRegisteredError` is expected."*

---

## 6. Low: `ServiceProviderContext.logger` — Threading Through Config

**Section affected:** 3.2 (Types — `ServiceProviderContext`), 9 (Rollout plan)

`ServiceProviderContext` exposes a `logger` property. In the current codebase, the logger lives at `config.logger`. The container needs the logger available at construction time so it can thread it into `ctx` during `resolve`.

This is straightforward but should be made explicit. The factory signature should be:

```js
function createServiceContainer(options?: {
  logger?: { debug?: Function; info?: Function; warn?: Function; error?: Function };
  strict?: boolean;
}): ServiceContainer;
```

And the config factory wires it:

```js
services: overrides.services ?? createServiceContainer({ logger: overrides.logger })
```

The `overrides.logger` reference is safe here because the logger is passed in via overrides before the config object is frozen.

Add to rollout plan Step 1: "Pass `logger` option to `createServiceContainer` from the config factory so that service providers receive it via `ServiceProviderContext`."

> **Resolution (v2):** ✅ Addressed. Step 1 of the rollout plan now explicitly states to pass `logger` into `createServiceContainer({ logger })`. Step 3 shows the wiring in the config factory snippet.

---

## 7. Low: `keys()` Missing from Conformance Test Matrix

**Section affected:** 7.1 (Core behavior)

The `ServiceContainer` interface (Section 3.2) includes `keys(): string[]`, but no corresponding conformance test exists in Section 7.

**Recommendation:** Add test 16 to Section 7.1:

> 16. `keys()` returns all registered service names (regardless of initialization state)

> **Resolution (v2):** ✅ Addressed. Added as test 9 in Section 7.1. Remaining tests renumber through 16 total (was 15).

---

## Summary

| # | Concern | Severity | Action Required | Resolution |
|---|---------|----------|-----------------|------------|
| 1 | Frozen config prevents `config.services` late-attachment | **Critical** | Create container inside config factory before `Object.freeze()` | ✅ v2 |
| 2 | Transient + `dispose` GC/memory risk unspecified | **Medium** | Add clarifying paragraph to Section 3.3; recommend Option A (disallow in v1) | ✅ v2 (Option A) |
| 3 | Error class package location unspecified | **Medium** | Place in `core/shared/src/`; export via `@glowing-fishstick/shared` | ✅ v2 |
| 4 | LIFO dispose vs FIFO hooks — undocumented divergence | **Low** | Add a brief explanatory note to Section 3.3 | ✅ v2 |
| 5 | Plugin service name ownership convention implicit | **Low** | Add ownership guidance to Section 5.2 | ✅ v2 |
| 6 | Logger threading into `ServiceProviderContext` not called out | **Low** | Note in rollout plan Step 1 and show wiring in config factory | ✅ v2 |
| 7 | `keys()` absent from conformance test matrix | **Low** | Add as test 16 in Section 7.1 | ✅ v2 |

All concerns from the initial review have been incorporated into the v2 proposal. No changes to the public `ServiceContainer` interface were required. The proposal is ready to proceed to implementation.
