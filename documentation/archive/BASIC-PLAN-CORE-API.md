# Basic Plan: Build the `core/api` Abstraction Module

This document is a copilot-friendly implementation plan for `core/api` as a **framework-level abstraction**, not app-specific business routes.

## Clarification

`task_manager` routes and domain logic belong in the sample consuming app (`app/`).

`core/api` should provide reusable API infrastructure for any consumer app, including:

- Service registration/composition
- Request logging + request context wiring
- Health/readiness extensibility
- Error normalization and response shaping
- Lifecycle integration (startup/shutdown)

---

## Goal

Create a thin, composable API module that can be mounted by any app plugin and provides common API capabilities out of the box.

### Non-goal

Do **not** embed task-specific CRUD endpoints or business/domain models in `core/api`.

---

## Phase 1 (MVP) Scope

1. `createApiModule(config, dependencies)` factory.
2. Router scaffolding for API base path (`/api`).
3. Standard middleware pipeline:
   - request ID propagation
   - structured request logging hooks
   - JSON parsing + validation error mapping
4. Framework-level health endpoints:
   - `/api/healthz` (liveness)
   - `/api/readyz` (readiness with extensible checks)
5. Service registry abstraction for app/plugin service wiring.
6. API error contract + centralized error handler.

Out of scope for MVP:

- App/domain endpoints (e.g., tasks, users, orders)
- DB-specific repository implementations
- Cache vendor-specific adapters

---

## Proposed Module Layout

```text
core/api/
  package.json
  index.js
  src/
    api-module-factory.js
    router/
      create-api-router.js
    middleware/
      request-context.js
      request-logger.js
      error-handler.js
      not-found.js
    health/
      health-router.js
      readiness-registry.js
    services/
      service-registry.js
    errors/
      api-error.js
      map-error.js
    contracts/
      service-contracts.md
      health-check-contracts.md
```

Design principle: keep `core/api` **infrastructure-only** and let consumer apps mount their own domain routers under `/api/*`.

---

## Step-by-Step Implementation Plan

### Step 1 — Bootstrap `core/api` package

- Create workspace package at `core/api`.
- Export `createApiModule` from `index.js`.
- Add `core/api` to root workspace config.

**Definition of done**

- Package imports cleanly from workspace.
- `createApiModule` returns mountable router + helper utilities.

### Step 2 — Implement service registry abstraction

- Create a lightweight registry that allows:
  - `registerService(name, instance)`
  - `getService(name)`
  - `hasService(name)`
  - optional `listServices()`
- Expose registry to downstream routers through dependency injection.

**Definition of done**

- Consumer plugin can register DB/cache/logger clients once and reuse them across routes.

### Step 3 — Add API middleware pipeline

- Request context middleware (requestId/correlation metadata).
- Request logging middleware integration with existing logger.
- Standardized JSON parse/validation failure handling.

**Definition of done**

- Every API request has consistent context + structured logs.
- Middleware can be enabled/disabled via config flags.

### Step 4 — Add health/readiness extensibility

- `/api/healthz`: always-on liveness check.
- `/api/readyz`: readiness endpoint backed by a registry of checks.
- Enable plugins to register checks (DB ping, cache ping, etc.) without editing core route code.

**Definition of done**

- Readiness returns `503` if a critical registered check fails.
- Health checks are composable and testable in isolation.

### Step 5 — Standardize API error contract

- Implement framework error type (`ApiError`).
- Normalize unknown errors to structured responses.
- Canonical response envelope for failures.

**Definition of done**

- All API errors conform to one shape with code/message/details.
- Internal exceptions do not leak stack traces in production mode.

### Step 6 — Composition API for consumers

- Provide helpers to mount consumer routers under `/api`.
- Provide helper to inject registry/services into router factories.
- Keep domain ownership with consumer app modules.

**Definition of done**

- Sample app can mount `/api/tasks` from `app/` while using `core/api` middleware + services.

### Step 7 — Tests + docs

- Unit tests:
  - service registry behavior
  - readiness registry behavior
  - error mapping behavior
- Integration tests:
  - middleware stack order
  - `/api/healthz` and `/api/readyz`
  - standardized error response contract
- Add usage examples in README.

**Definition of done**

- Test suite validates abstraction behavior without depending on any task domain logic.

---

## API Abstraction Contract (MVP Draft)

### Success envelope (recommended)

```json
{ "data": {}, "meta": {} }
```

### Error envelope (required)

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

### Health endpoints

- `GET /api/healthz`
  - `200 { "status": "ok" }`
- `GET /api/readyz`
  - `200 { "status": "ready", "checks": [...] }`
  - `503 { "status": "not-ready", "checks": [...] }`

---

## Copilot Prompt Starter

Use this prompt in Copilot Chat:

> Build `core/api` as an infrastructure package (not domain routes).
> Create `createApiModule(config, dependencies)` that returns a mountable `/api` router with request-context middleware, request logging hooks, health/readiness routes, readiness check registry, and standardized error handling.
> Add a service registry abstraction so consumer apps can register DB/cache services and consume them in app-owned routers.
> Include unit/integration tests for middleware order, readiness checks, and error response contracts.

---

## Risks & Mitigations

- **Risk:** Domain logic leaks into `core/api`.
  - **Mitigation:** enforce boundary rule: business routes stay in consuming app modules.
- **Risk:** Tight coupling to a specific DB/cache vendor.
  - **Mitigation:** registry + contracts only in `core/api`; vendor adapters in app/infrastructure modules.
- **Risk:** Fragmented error responses across routers.
  - **Mitigation:** route all API errors through one core error mapper/handler.

---

## Immediate Next Action

Implement **Step 1–3** in one PR (bootstrap + registry + middleware), then **Step 4–5** in a second PR (health/readiness + error contract).
