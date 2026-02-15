# P1 Fix: Private Lifecycle Registries via WeakMap

**Issue Date:** February 15, 2026
**Status:** ✅ RESOLVED
**Priority:** P1 (High)

## Problem Statement

`createApp()` advertised private lifecycle registries, but exposed them via public underscore fields on the Express app object:

```javascript
// app-factory.js (BEFORE)
app._startupRegistry = startupRegistry;
app._shutdownRegistry = shutdownRegistry;
```

### Impact

- Any plugin or external code could access, overwrite, or mutate registries via `app._startupRegistry` and `app._shutdownRegistry`
- Underscore convention signals intent but does not enforce privacy
- Registry objects exposed `.register()` and `.execute()` — external code could call `.execute()` directly, bypassing the lifecycle contract
- Violated the encapsulation goal established in the P0 closure-based refactor

---

## Solution

### Approach: WeakMap-Based Registry Storage

Replaced underscore fields with a module-level `WeakMap` that maps app instances to their registries. Only code that imports from `registry-store.js` can access registries — external code has no path to reach them.

**Why WeakMap over alternatives:**

- **Symbol keys**: Still visible via `Object.getOwnPropertySymbols()` — not fully private
- **Wrapper methods on app**: Would still expose execute capability on the public app object
- **WeakMap**: True privacy at the language level; entries auto-garbage-collect when app is destroyed

### Implementation

**New file:** [core/shared/src/registry-store.js](../core/shared/src/registry-store.js)

```javascript
const registryMap = new WeakMap();

export function storeRegistries(app, startupRegistry, shutdownRegistry) {
  registryMap.set(app, { startupRegistry, shutdownRegistry });
}

export function getRegistries(app) {
  return registryMap.get(app) || null;
}
```

**Updated:** [core/app/src/app-factory.js](../core/app/src/app-factory.js)

```javascript
// BEFORE:
app._startupRegistry = startupRegistry;
app._shutdownRegistry = shutdownRegistry;

// AFTER:
storeRegistries(app, startupRegistry, shutdownRegistry);
```

**Updated:** [core/shared/src/server-factory.js](../core/shared/src/server-factory.js)

```javascript
// BEFORE:
if (app._startupRegistry) {
  registerStartupHook(() => app._startupRegistry.execute());
}
if (app._shutdownRegistry) {
  registerShutdownHook(() => app._shutdownRegistry.execute());
}

// AFTER:
const appRegistries = getRegistries(app);
if (appRegistries) {
  registerStartupHook(() => appRegistries.startupRegistry.execute());
  registerShutdownHook(() => appRegistries.shutdownRegistry.execute());
}
```

**Updated:** [core/shared/index.js](../core/shared/index.js)

Added `storeRegistries` to public exports (consumed only by `@glowing-fishstick/app` internals).

---

## Files Modified

1. **[core/shared/src/registry-store.js](../core/shared/src/registry-store.js)** (NEW)
   - WeakMap-based private storage for lifecycle registries
   - `storeRegistries()` and `getRegistries()` functions

2. **[core/shared/index.js](../core/shared/index.js)**
   - Added `storeRegistries` export for cross-package access

3. **[core/app/src/app-factory.js](../core/app/src/app-factory.js)**
   - Replaced `app._startupRegistry` / `app._shutdownRegistry` assignments with `storeRegistries()` call
   - Added `storeRegistries` import from `@glowing-fishstick/shared`

4. **[core/shared/src/server-factory.js](../core/shared/src/server-factory.js)**
   - Replaced `app._startupRegistry` / `app._shutdownRegistry` access with `getRegistries()` call
   - Added `getRegistries` import from `./registry-store.js`

---

## What Did NOT Change

- **Public API**: `app.registerStartupHook()` and `app.registerShutdownHook()` remain unchanged
- **Consumer/plugin code**: No changes required — plugins and templates already use only public methods
- **Hook execution semantics**: FIFO order, error resilience, `setImmediate()` deferral all preserved
- **Test suite**: All 4 integration tests pass without modification

---

## Verification

✅ **Tests All Passing:**

```
Test Files  1 passed (1)
Tests       4 passed (4)
```

✅ **Privacy enforced:** `app._startupRegistry` returns `undefined` — registries are inaccessible from external code

✅ **No breaking changes:** All consumer code, plugins, and templates use public API only

---

## References

- **Predecessor:** [P0 — Startup Hook Ordering Race Condition](./P0-STARTUP-HOOK-ORDERING-FIX.md)
- **Related:** [99-potential-gaps.md — Migrate Startup/Shutdown Hooks](./99-potential-gaps.md)
- **Issue Type:** Encapsulation / Security
- **Severity:** P1 (High)
- **Root Cause:** Underscore-convention privacy does not prevent external mutation
- **Solution Pattern:** WeakMap for language-level private cross-module state
