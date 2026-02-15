# Potential Gaps & Future Enhancements

This document tracks potential server composability features and architectural gaps identified during development. These are candidates for future implementation as needs arise.

---

## Current / In-Flight Work

### Refactor: Migrate Startup/Shutdown Hooks from `app.locals` to Closures

**Status**: ✓ Complete — Encapsulation implemented (P0 startup ordering race fix + P1 WeakMap privacy)

**Description**: Moved `app.startupHooks` and `app.shutdownHooks` from mutable `app.locals` arrays to encapsulated closures. Exposed via `app.registerStartupHook()` and `app.registerShutdownHook()` methods. Fixed race-prone startup hook ordering by deferring hook execution via `setImmediate()`. Enforced true registry privacy via WeakMap-based storage, preventing external mutation through underscore fields.

**Rationale**: `app.locals` should be reserved for state (like `shuttingdown` flag). Lifecycle registries should be private and immutable to prevent accidental mutation or overwriting by plugins. Consumer hooks must be registerable synchronously after `createServer()` returns, before the startup sequence begins.

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
- **Docs**: [P0-STARTUP-HOOK-ORDERING-FIX.md](./P0-STARTUP-HOOK-ORDERING-FIX.md)

**Fix Details (P1 — Private Lifecycle Registries)**:

- **Issue**: Registries exposed via `app._startupRegistry` / `app._shutdownRegistry` underscore fields — externally mutable.
- **Solution**: Replace underscore fields with a module-level `WeakMap` in `registry-store.js`. Only internal infrastructure can access registries.
- **Impact**: True language-level privacy; external code cannot access or mutate registries. Auto-garbage-collection via WeakMap.
- **Docs**: [P1-PRIVATE-LIFECYCLE-REGISTRITES.md](./P1-PRIVATE-LIFECYCLE-REGISTRITES.md)

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

**Description**: Provide a lightweight service registry so plugins can register and consume shared services (DB pools, cache instances, external clients) without creating duplicates or circular dependencies.

**Use Cases**:

- Plugins registering singleton database connections
- Shared cache instances across features
- Configuration service accessible to all plugins
- Extensible service discovery

**Rationale**: Without a DI pattern, plugins resort to module-level singletons or loose coupling. A container enables clean decoupling and testability.

**Potential Impact**: High — Becomes essential as the number of plugins and shared resources grows.

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

**High Priority** (near-term):

- Dependency Injection / Service Container (#2)

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
