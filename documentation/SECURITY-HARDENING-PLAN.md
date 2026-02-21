# Security Hardening - Implementation Plan

**Date**: 2026-02-21  
**Status**: Proposed  
**Priority**: High (current next work item)  
**Tracks**: [99-potential-gaps.md](./99-potential-gaps.md) Security section; Snyk Code `javascript/NoRateLimitingForExpensiveWebOperation`

---

## Summary

This plan introduces immediate hardening for request-path resource protection in both app and API packages. The scope is:

- Request payload size limits in `createApp()` and `createApi()`
- Route-level throttling on app admin endpoints only
- Health endpoints remain unthrottled and always reachable
- Removal of per-request logger-construction fallback in error middleware

The objective is to reduce denial-of-service risk from expensive unbounded operations while keeping existing contracts stable.

---

## Problem Statement

Snyk Code reported `javascript/NoRateLimitingForExpensiveWebOperation` against request-handling paths that can become expensive under burst traffic:

- `core/app/src/controllers/admin-controller.js`
- `core/app/src/middlewares/errorHandler.js`

Related API error path behavior also uses request-path logger fallback construction:

- `core/api/src/middlewares/error-handler.js`

### Risk

- Unbounded request rate on expensive handlers increases CPU, memory, and I/O pressure.
- Large payload parsing without explicit limits can amplify memory pressure.
- Request-path logger fallback creation can add repeated work on failure-heavy paths.

---

## Design Decisions

1. Enforce request size limits in both app and API factories.
2. Apply throttling only to app admin endpoints (`/admin`, `/admin/config`, `/admin/api-health`) for v1.
3. Keep `/healthz`, `/readyz`, and `/livez` unthrottled.
4. Remove request-path fallback logger construction from error middleware.
5. Preserve event-loop safety: no new sync/blocking work in request paths.

---

## Planned Public Config Surface

### App (`createConfig()`)

| Config Key                 | Env Var                          | Default | Purpose                                          |
| -------------------------- | -------------------------------- | ------- | ------------------------------------------------ |
| `jsonBodyLimit`            | `APP_JSON_BODY_LIMIT`            | `100kb` | `express.json({ limit })` ceiling                |
| `urlencodedBodyLimit`      | `APP_URLENCODED_BODY_LIMIT`      | `100kb` | `express.urlencoded({ limit })` ceiling          |
| `urlencodedParameterLimit` | `APP_URLENCODED_PARAMETER_LIMIT` | `1000`  | `express.urlencoded({ parameterLimit })` ceiling |
| `adminRateLimitWindowMs`   | `APP_ADMIN_RATE_LIMIT_WINDOW_MS` | `60000` | Fixed-window duration for admin throttle         |
| `adminRateLimitMax`        | `APP_ADMIN_RATE_LIMIT_MAX`       | `60`    | Max admin requests per window                    |

### API (`createApiConfig()`)

| Config Key                 | Env Var                          | Default | Purpose                                          |
| -------------------------- | -------------------------------- | ------- | ------------------------------------------------ |
| `jsonBodyLimit`            | `API_JSON_BODY_LIMIT`            | `100kb` | `express.json({ limit })` ceiling                |
| `urlencodedBodyLimit`      | `API_URLENCODED_BODY_LIMIT`      | `100kb` | `express.urlencoded({ limit })` ceiling          |
| `urlencodedParameterLimit` | `API_URLENCODED_PARAMETER_LIMIT` | `1000`  | `express.urlencoded({ parameterLimit })` ceiling |

No breaking signature changes are planned. Existing defaults continue to work, with new safety ceilings applied by default.

---

## Implementation Phases

### Phase 1 - Config and Env Parsing

- Add new app keys in `core/app/src/config/env.js`
- Add new API keys in `core/api/src/config/env.js`
- Parse numeric values with explicit `Number(...)` conversion where needed
- Preserve existing override > env > default precedence

### Phase 2 - Request Parser Limit Wiring

- Update `core/app/src/app-factory.js`:
  - `express.json({ limit: config.jsonBodyLimit })`
  - `express.urlencoded({ extended: true, limit: config.urlencodedBodyLimit, parameterLimit: config.urlencodedParameterLimit })`
- Update `core/api/src/api-factory.js` with equivalent limits

### Phase 3 - Admin Throttling Middleware

- Add app middleware for fixed-window, in-memory, process-local admin throttling
- Mount before admin route handlers, only for:
  - `/admin`
  - `/admin/config`
  - `/admin/api-health`
- Return `429` with deterministic JSON payload for throttled requests

### Phase 4 - Error Middleware Logger Hardening

- Remove `createLogger()` fallback construction in:
  - `core/app/src/middlewares/errorHandler.js`
  - `core/api/src/middlewares/error-handler.js`
- Use startup-injected logger path (`req.app?.locals?.logger`) and safe fallback strategy decided in code review (for example console or guarded no-op path)
- Ensure error responses remain unchanged

### Phase 5 - Tests and Verification

- Add/extend integration tests for parser limits (`413`), throttling (`429`), and health endpoint availability
- Keep existing admin/enforcement suites passing
- Validate no JWT enforcement regressions

### Phase 6 - Documentation and Final Validation

- Update config/env docs in package readmes/spec docs
- Run validation commands and capture residual risk if any findings remain

---

## Acceptance Criteria

- Oversized payloads return `413` in app and API.
- Repeated admin requests exceed threshold and return `429`.
- `/healthz`, `/readyz`, `/livez` stay available under admin throttling pressure.
- No per-request logger instantiation in error middleware.
- Lint, tests, and security scan pass, or residual risk is explicitly documented.

---

## Test Cases and Scenarios

### App Parser Limits

1. `POST` JSON payload over `APP_JSON_BODY_LIMIT` -> `413`
2. URL-encoded payload over `APP_URLENCODED_BODY_LIMIT` -> `413`
3. URL-encoded parameter count over `APP_URLENCODED_PARAMETER_LIMIT` -> `413`

### API Parser Limits

1. `POST` JSON payload over `API_JSON_BODY_LIMIT` -> `413`
2. URL-encoded payload over `API_URLENCODED_BODY_LIMIT` -> `413`
3. URL-encoded parameter count over `API_URLENCODED_PARAMETER_LIMIT` -> `413`

### Admin Throttling

1. Burst `GET /admin` over threshold -> `429`
2. Burst `GET /admin/config` over threshold -> `429`
3. Burst `GET /admin/api-health` over threshold -> `429`

### Health Availability

1. While admin routes are throttled, `/healthz` returns expected status
2. While admin routes are throttled, `/readyz` returns expected status
3. While admin routes are throttled, `/livez` returns expected status

### Error Handler Behavior

1. Unexpected errors still log through configured startup logger path
2. No logger factory construction is performed in request-path middleware

### Regression

1. Existing admin route tests remain green
2. Existing API enforcement tests remain green
3. No JWT policy behavior changes (`API_BLOCK_BROWSER_ORIGIN`, `API_REQUIRE_JWT`)

---

## Assumptions and Defaults

1. v1 throttling is process-local in-memory fixed-window (no shared store).
2. Default throttle is `60` requests per `60000` ms for admin endpoints.
3. Security hardening is the immediate next implementation milestone.
4. Health check extensibility and auth remain queued after this hardening work.
5. Distributed throttling (for example Redis-backed counters) is out of scope for this plan.

---

## Start Here After a Pause

If work is resumed later, start in this order:

1. Review this plan: `documentation/SECURITY-HARDENING-PLAN.md`
2. Confirm backlog status: `documentation/99-potential-gaps.md`
3. Inspect current config factories:
   - `core/app/src/config/env.js`
   - `core/api/src/config/env.js`
4. Inspect middleware wiring:
   - `core/app/src/app-factory.js`
   - `core/api/src/api-factory.js`
   - `core/app/src/middlewares/errorHandler.js`
   - `core/api/src/middlewares/error-handler.js`
5. Run baseline checks:

```bash
npm run lint
npm run test:all
rg -n "\\b(readFileSync|writeFileSync|appendFileSync|existsSync|readdirSync|statSync|lstatSync|mkdirSync|rmSync|unlinkSync|execSync|spawnSync|pbkdf2Sync|scryptSync)\\b" app core api
```

6. Implement phases in order and keep docs synchronized before merge.
