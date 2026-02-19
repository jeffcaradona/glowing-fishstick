# API Access Build Plan (Final Cut)

> Status: Implemented build reference
> Version: v1
> Last Updated: 2026-02-19
> Source of truth inputs: `documentation/API-APP-ACCESS-ROLLOUT.md` (v3), `documentation/archive/2026-02/API-APP-ACCESS-RESPONSE.md` (v3)

---

## Objective

Enforce app-only access to API routes in staged rollout, while keeping health probes unauthenticated and preserving rollback safety.

## Add (Included in This Build)

1. API feature flags

- `API_BLOCK_BROWSER_ORIGIN` (default `false`)
- `API_REQUIRE_JWT` (default `false`)
- `JWT_SECRET` (required when `API_REQUIRE_JWT=true`)
- `JWT_EXPIRES_IN` (default `120s`)

2. Config contract in `core/api/src/config/env.js`

- Add defaults for `blockBrowserOrigin` and `requireJwt` (`false` in rollout phase).
- Add `jwtSecret: env.JWT_SECRET ?? ''`.
- Add `jwtExpiresIn: env.JWT_EXPIRES_IN ?? '120s'`.

3. API fail-fast guard in `core/api/src/api-factory.js`

- At top of `createApi()`:
- If `config.requireJwt && !config.jwtSecret`, throw startup error.
- Guard must treat empty string as invalid (`!config.jwtSecret`).

4. Enforcement middleware placement in `core/api/src/api-factory.js`

- Mount enforcement middleware before both:
- `metricsRoutes(config)`
- `indexRoutes(config)`
- Do not implement enforcement through plugin loop.

5. Route policy

- Always unauthenticated: `GET /healthz`, `GET /readyz`, `GET /livez`.
- Conditionally protected: all other routes including `/metrics/*` and `/api/*`.
- Evaluation order:

1. If browser-origin blocking enabled and `Origin` header exists, return `403`.
2. If JWT required, require valid bearer token or return `401`.
3. Otherwise continue.

4. App API client JWT behavior

- Pre-generate token at client factory initialization.
- Rotate token on interval before expiry (90s for `120s` TTL baseline).
- Read token from closure on each request.
- Register shutdown hook to `clearInterval(rotationTimer)`.

7. Tests and validations

- Cover all flag combinations.
- Verify health routes always bypass enforcement.
- Verify `/metrics/*` enforcement with `Origin`.
- Verify startup fails when JWT required and secret missing/empty.
- Verify app task flows still pass when JWT enabled.

8. Stage D hardening target

- After stability window, flip defaults to `true` in `core/api/src/config/env.js`.
- Keep env overrides for rollback.

## Cut (Explicitly Not in This Build)

1. mTLS or service mesh policy.
2. External secret manager integration.
3. Generic proxy expansion.
4. Plugin-based enforcement registration.
5. Per-request JWT signing.

## Implementation Sequence

1. Update config shape (`core/api/src/config/env.js`).
2. Add fail-fast and enforcement middleware wiring (`core/api/src/api-factory.js`).
3. Implement app API client token generation/rotation + shutdown cleanup.
4. Add/adjust integration coverage for Stage A/B/C behavior.
5. Run local validation commands and rollout smoke checks.

## Acceptance Criteria

1. With both flags off, current behavior remains unchanged.
2. With browser block on, non-health routes with `Origin` return `403` (including `/metrics/*`).
3. With JWT required on, missing/invalid JWT returns `401` for non-health routes.
4. Health endpoints remain available without JWT and without origin restrictions.
5. API startup fails fast when JWT is required and secret is missing/empty.
6. App task UX works end-to-end with JWT enforcement enabled.

## Rollback

1. Set `API_REQUIRE_JWT=false`.
2. If needed, set `API_BLOCK_BROWSER_ORIGIN=false`.
3. Restart services and run smoke checks.
