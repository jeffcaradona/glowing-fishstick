# API App Access Rollout Plan

> Status: Active rollout plan (implementation in progress)
> Internal Version: v3
> Last Updated: 2026-02-19

---

## Revision History

- **v3**: Corrected Stage D default-flip path to `core/api/src/config/env.js`; added explicit middleware ordering requirement in `core/api/src/api-factory.js` so enforcement runs before `metricsRoutes` and `indexRoutes` (not via plugin loop).
- **v2**: Aligned env var names to `JWT_SECRET` and `JWT_EXPIRES_IN`, clarified token rotation (no per-request signing), added explicit metrics validation, specified Stage D default-flip location, and fixed Test Plan section structure.
- **v1**: Initial staged rollout proposal.

---

## Problem Statement

The app and API are intended to run in the same logical deployment boundary. Browser clients should not call the API service directly. API traffic should come from the app service (or approved test tooling) and be authenticated.

This rollout introduces enforcement in safe stages using feature flags.

## Goals

- Block browser-direct API traffic when enabled.
- Require app-to-API JWT auth when enabled.
- Preserve health probe operability.
- Roll out safely with clear validation and rollback steps.

## Scope (This Plan)

- API feature flags:
  - `API_BLOCK_BROWSER_ORIGIN`
  - `API_REQUIRE_JWT`
- JWT for app -> API calls
- Route policy for health vs non-health endpoints
- Tests and documentation updates

## Non-Goals

- mTLS or service mesh policy in this phase
- External secret manager integration in this phase
- Generic proxy expansion

## Feature Flags

| Variable | Default (Phase 1) | Description |
|---|---|---|
| `API_BLOCK_BROWSER_ORIGIN` | `false` | If `true`, reject non-health API requests that include an `Origin` header. |
| `API_REQUIRE_JWT` | `false` | If `true`, require `Authorization: Bearer <token>` for non-health API requests. |
| `JWT_SECRET` | empty | Shared secret used by app (sign) and API (verify). Required when `API_REQUIRE_JWT=true`. |
| `JWT_EXPIRES_IN` | `120s` | App token TTL. Token is pre-generated and rotated before expiry (not signed per request). |

## Endpoint Policy

### Always unauthenticated
- `GET /healthz`
- `GET /readyz`
- `GET /livez`

### Conditionally protected (by flags)
- All other API routes, including `/metrics/*` and `/api/*`

Policy:
1. If `API_BLOCK_BROWSER_ORIGIN=true` and request has `Origin`, return `403`.
2. If `API_REQUIRE_JWT=true`, require valid JWT or return `401`.
3. Otherwise continue to route handler.

Implementation note:
- Enforcement middleware must be mounted in `core/api/src/api-factory.js` before `metricsRoutes(config)` and `indexRoutes(config)`.
- Do not rely on the plugin loop for enforcement registration because plugins are mounted after both route groups.

## Rollout Stages

### Stage A: Observe (no enforcement)
- `API_BLOCK_BROWSER_ORIGIN=false`
- `API_REQUIRE_JWT=false`

Validation:
- Existing app/API behavior unchanged.
- No regressions in integration tests.

### Stage B: Browser block
- `API_BLOCK_BROWSER_ORIGIN=true`
- `API_REQUIRE_JWT=false`

Validation:
- Browser-origin requests to non-health API routes return `403`.
- Browser-origin requests to `/metrics/*` return `403`.
- Health routes still return `200`.

### Stage C: Full app-only access
- `API_BLOCK_BROWSER_ORIGIN=true`
- `API_REQUIRE_JWT=true`

Validation:
- App routes continue to function (JWT attached by app API client).
- Direct non-health API requests without JWT return `401`.
- Non-health API requests with `Origin` return `403`.

### Stage D: Harden defaults
- After stability window, flip `DEFAULTS` for `blockBrowserOrigin` and `requireJwt` to `true` in `core/api/src/config/env.js`.
- Keep env override for emergency rollback.

## Test Plan
Tests must cover all flag combinations and confirm health routes are never affected by enforcement.

## API integration tests
- Flags off: non-health routes reachable.
- Browser-block on: non-health + `Origin` => `403`.
- Browser-block on: `/metrics/*` + `Origin` => `403`.
- JWT on: missing token => `401`, invalid token => `401`, valid token => success.
- Health routes bypass enforcement.
- Combined flags enforce deterministic behavior.
- Startup fails fast if `API_REQUIRE_JWT=true` and `JWT_SECRET` is missing or empty.

## App integration checks
- `/tasks` load/create/toggle/delete still work when JWT is enabled.
- Error paths remain deterministic if API rejects auth.

## Local Validation Commands

```bash
# Non-health without JWT (when API_REQUIRE_JWT=true)
curl -i http://localhost:3001/api/tasks

# Non-health with Origin (when API_BLOCK_BROWSER_ORIGIN=true)
curl -i -H "Origin: http://localhost:3000" http://localhost:3001/api/tasks

# Health remains available
curl -i http://localhost:3001/readyz
```

## Rollback Plan

If issues are detected:
1. Set `API_REQUIRE_JWT=false`
2. If needed, set `API_BLOCK_BROWSER_ORIGIN=false`
3. Restart services and re-run smoke checks
4. Investigate logs/tests before re-enabling

## Documentation Sync Requirements

When implementation lands, also update:
1. `README.md` (security/rollout env section)
2. `app/DEV_APP_README.md` (local setup + validation)
3. `documentation/00-project-specs.md` (middleware policy + config contract)
4. `documentation/99-potential-gaps.md` (status updates from future-work to implemented rollout phase)
