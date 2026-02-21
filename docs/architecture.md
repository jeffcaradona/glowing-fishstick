# Architecture

## Functional Programming First

This framework follows functional programming principles throughout:

| Principle | Implementation |
|-----------|---------------|
| **Factory functions** | `createApp()`, `createServer()`, `createConfig()` instead of classes |
| **Pure functions** | Config, validation, and filtering functions have no side effects |
| **Dependency injection** | Dependencies passed via function arguments, not globals |
| **Composition** | Plugins as plain functions composed into the app |
| **Immutability** | Config objects are frozen after creation |

**Why functional?**

- Easier to test — pure functions need no mocks or stubs
- Better composability — plugins are plain functions
- Simpler reasoning — no hidden state or `this` context complexity

---

## Middleware Pipeline

```
Request
  → Body Parsers
  → Static Files
  → Core Routes (health, admin, landing)
  → Plugins (in array order)
  → 404 Handler
  → Error Handler
  → Response
```

---

## Graceful Shutdown (Kubernetes-ready)

The framework includes a production-ready shutdown sequence:

1. SIGTERM/SIGINT signal received
2. App emits `'shutdown'` event
3. Health checks return 503 (not ready)
4. New requests rejected with 503
5. In-flight requests allowed to complete
6. Shutdown hooks execute (FIFO)
7. Server stops accepting connections
8. Timeout enforced (default 30s); lingering connections destroyed
9. Process exits

---

## Lifecycle Hook Registry

The hook registry manages startup and shutdown sequences:

- **App-level hooks** — Registered by plugins for feature-specific initialization
- **Entry-point hooks** — Registered at `server.js` level for cross-cutting concerns
- **Execution order** — FIFO (first registered, first executed)
- **Error isolation** — Errors in one hook don't prevent subsequent hooks
- **Deferred startup** — `setImmediate()` prevents race conditions

---

## Package Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                     Consumer App                        │
│  import { createApp } from '@glowing-fishstick/app'     │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────▼───────────┐
          │  @glowing-fishstick/app│
          │  - createApp()         │
          │  - createServer()      │
          │  - createConfig()      │
          │  - built-in routes     │
          └────────────┬───────────┘
                       │
     ┌─────────────────▼────────────────┐
     │    @glowing-fishstick/shared     │
     │  - request IDs                   │
     │  - lifecycle registries          │
     │  - formatters                    │
     │  - JWT helpers                   │
     │  - logger re-exports             │
     └─────────────────┬────────────────┘
                       │
          ┌────────────▼───────────┐
          │ @glowing-fishstick/    │
          │        logger          │
          │  - Pino factory        │
          │  - request logging     │
          └────────────────────────┘
```

---

## Event Loop Safety

This framework strictly avoids blocking the event loop in request-handling paths.

!!! danger "Never block the event loop in routes or middleware"

    ```js
    // ❌ NEVER — blocks the event loop
    const data = fs.readFileSync('./data.json');

    // ✅ Always use async I/O
    const data = await fs.promises.readFile('./data.json', 'utf-8');
    ```

For startup-only initialization (before the server accepts traffic), synchronous operations are permitted and must be documented with an explanatory comment.

---

## V8 Optimization

The framework is designed to stay V8-friendly in hot paths:

- **Stable object shapes** — Expected fields initialized early; no dynamic field addition/removal
- **Monomorphic call sites** — Hot functions receive consistent argument types
- **No dynamic code** — No `eval`, `new Function`, or `with` statements
- **Predictable serialization** — JSON operations in hot paths are lean
