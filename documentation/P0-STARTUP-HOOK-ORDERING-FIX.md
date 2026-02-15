# P0 Fix: Startup Hook Ordering Race Condition

**Issue Date:** February 15, 2026  
**Status:** ✅ RESOLVED  
**Priority:** P0 (Critical)

## Problem Statement

The startup hook lifecycle had a critical race condition that made the lifecycle API contract unreliable:

### Root Cause
- `createServer()` factory executed startup hooks **immediately** during function execution (via IIFE)
- Consumer code called `registerStartupHook()` **after** `createServer()` returned
- This ordering guaranteed that consumer hooks would either be skipped or race with startup execution

### Code Flow (Before Fix)
```
Consumer Call Stack:
  1. createServer(app, config)     // Call begins
  2. [IIFE runs HERE]              // Startup hooks execute synchronously
  3. return { ..., registerStartupHook, ... }
  4. registerStartupHook(hook)     // Called AFTER step 2 — TOO LATE!
```

### Impact
- Entry-point specific startup hooks (database connections, cache warming, feature flags) could not reliably run
- Plugins' startup hooks ran, but consumer app hooks often missed their window
- Unpredictable behavior made the lifecycle API unreliable for production use

---

## Solution

### Implementation
Wrapped the startup IIFE in `setImmediate()` to defer execution to the **next event loop iteration**:

**File:** [core/shared/src/server-factory.js](../core/shared/src/server-factory.js#L149-L172)

```javascript
// Defer startup execution to the next event loop iteration via setImmediate().
// This allows consumer code to register startup hooks synchronously after
// createServer() returns, before the startup sequence begins.
setImmediate(async () => {
  try {
    for (const hook of startupHooks) {
      try {
        await hook();
      } catch (err) {
        console.error('Error in startup hook:', err.message);
      }
    }
    console.log('Startup sequence completed.');
    
    server.listen(port, () => {
      console.log(`${config.appName ?? 'app'} listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error('Startup failed:', err.message);
    process.exit(1);
  }
});
```

### How It Works
1. `createServer(app, config)` schedules startup via `setImmediate()`
2. Function returns immediately
3. Consumer code runs synchronously and calls `registerStartupHook()`
4. Consumer's synchronous code completes
5. Event loop continues, `setImmediate()` callback fires
6. All hooks (plugin + consumer) execute in FIFO order
7. Server listens once startup completes

---

## Verification

### Test Coverage
Created comprehensive integration tests: [tests/integration/startup-hook-ordering.test.js](../tests/integration/startup-hook-ordering.test.js)

✅ **Test Results (All Passing):**
- ✓ Consumer hooks execute in FIFO order before server listens
- ✓ No hooks are skipped due to timing
- ✓ Hook errors don't block subsequent hooks
- ✓ App-level and server-level hooks mix correctly

### End-to-End Verification
Consumer app (`app/src/server.js`) startup confirms fix:

```
Initializing task manager resources…        ← Plugin startup hook
Entry-point startup initialization…         ← Consumer hook (NOW WORKS!)
Startup sequence completed.
task_manager listening on http://localhost:3000
```

---

## API Contract (Updated)

### `createServer(app, config)`

**Returns:** `{ server, close, registerStartupHook, registerShutdownHook }`

**Startup Hook Lifecycle (NEW BEHAVIOR):**
```
1. createServer() called
2. Returns with hook registration methods
3. Consumer registers hooks synchronously
4. setImmediate() fires (event loop continues)
5. All hooks execute sequentially in FIFO order
6. Server listens once startup complete
```

**Example Usage:**
```javascript
const { registerStartupHook } = createServer(app, config);

// This hook WILL execute (was previously unreliable)
registerStartupHook(async () => {
  console.log('Database connecting…');
  // await db.connect();
});
```

---

## Files Modified

1. **[core/shared/src/server-factory.js](../core/shared/src/server-factory.js)**
   - Wrapped startup IIFE in `setImmediate()` for deferred execution
   - Added comments explaining the fix and P0 reference

2. **[documentation/00-project-specs.md](../documentation/00-project-specs.md)**
   - Updated `createServer()` public API section
   - Added detailed startup hook lifecycle explanation
   - Included example demonstrating proper hook registration

3. **[documentation/99-potential-gaps.md](../documentation/99-potential-gaps.md)**
   - Marked "Migrate Startup/Shutdown Hooks" as ✓ Complete
   - Documented the P0 race condition fix details
   - Moved to "Completed" section in prioritization

4. **[tests/integration/startup-hook-ordering.test.js](../tests/integration/startup-hook-ordering.test.js)** (NEW)
   - 4 integration tests validating the fix
   - All tests passing

---

## Node.js Event Loop Mechanics

This fix leverages Node.js event loop scheduling:

- **Synchronous code** → Executes immediately in current tick
- **`setImmediate()`** → Schedules for next iteration of event loop (after I/O events)
- **`process.nextTick()`** → Would execute too early (before consumer registration)

Using `setImmediate()` ensures:
- Consumer registration code runs synchronously
- Then event loop continues
- Then deferred startup sequence begins with complete hook registry

---

## Testing & Stability

✅ **Tests All Passing:**
```
Test Files  1 passed (1)
Tests       4 passed (4)
Duration    831ms
```

✅ **Consumer App Verified:** Startup hooks execute reliably

✅ **No Breaking Changes:** API contract preserved, behavior corrected

---

## References

- **Issue Type:** Race Condition (Startup Lifecycle)
- **Severity:** P0 (Critical)
- **Root Cause:** Synchronous startup execution vs. asynchronous hook registration
- **Solution Pattern:** setImmediate() deferral for event loop serialization
- **Impact:** Lifecycle API now reliable for production use
