# API App Access Rollout — Review Response

---

> Reviewed against current codebase state (branch: `feature/fwt`)
>
> Response version: v3 (reviewing rollout plan v3) — see bottom for latest
>
> Status: All v2 findings resolved. Two new low-severity findings raised.

---

## Resolution Scorecard (v1 Issues)

| # | Issue | Severity | v1 Status | v2 Status |
|---|---|---|---|---|
| 1 | `API_JWT_SECRET` naming conflict | Critical | Open | **Resolved** |
| 2 | Per-request signing / event-loop safety | Critical | Open | **Resolved** |
| 3 | Metrics route scope / Stage B test case | Medium | Open | **Resolved** |
| 4 | Stage D default-flip implementation guidance | Medium | Open | **Partially resolved** (see §1) |
| 5 | Empty Test Plan intro | Low | Open | **Resolved** |
| 6 | Fail-fast falsy check on secret | Low | Open | **Resolved** |

---

## Resolved Issues (no further action)

### Issue 1 — Env var naming
Feature Flags table now correctly uses `JWT_SECRET` and `JWT_EXPIRES_IN`. No conflicts with existing codebase references.

### Issue 2 — Event-loop safety
`JWT_EXPIRES_IN` description now reads "Token is pre-generated and rotated before expiry (not signed per request)." Language unambiguously rules out per-request `jwt.sign()`.

### Issue 3 — Metrics scope
Stage B validation now explicitly includes "Browser-origin requests to `/metrics/*` return `403`." Option A confirmed.

### Issue 5 — Test Plan intro
"Tests must cover all flag combinations and confirm health routes are never affected by enforcement." Present and correct.

### Issue 6 — Fail-fast falsy check
Test plan entry now reads "missing **or empty**" — the intent of `!config.jwtSecret` (falsy, not `=== undefined`) is captured at the spec level. No further doc change needed; implementation must match.

---

## New Findings

### 1. Low-Medium: Stage D Points at Wrong Config File

**Section affected:** Stage D (Harden defaults)

Stage D now correctly specifies flipping the `DEFAULTS` constant rather than the env var reading logic — that guidance is right. However, the file path is wrong.

The rollout doc says:
> flip `DEFAULTS` for `blockBrowserOrigin` and `requireJwt` to `true` in `api/src/config/env.js`

The consumer config at `api/src/config/env.js` currently contains only `appOverrides` (appName, appVersion, port). It has no `DEFAULTS` constant and no feature flags. The `DEFAULTS` constant that governs API behavior lives in `core/api/src/config/env.js` — that is where `blockBrowserOrigin` and `requireJwt` defaults will be defined when implementation lands.

**Recommendation:** Correct the Stage D path:

```
flip `DEFAULTS` for `blockBrowserOrigin` and `requireJwt` to `true`
in `core/api/src/config/env.js`
```

Consumer env override for rollback remains:
```bash
API_BLOCK_BROWSER_ORIGIN=false API_REQUIRE_JWT=false node src/server.js
```

---

### 2. Medium: Metrics Middleware Order Makes Option A Non-Trivial

**Section affected:** Endpoint Policy, Stage B/C validation

The rollout plan confirms Option A — metrics routes are conditionally protected. This is the right security posture. However, the current `core/api/src/api-factory.js` mounts metrics **before** the plugin layer:

```
line 58: app.use(healthRoutes(app));       // health — always exempt
line 59: app.use(metricsRoutes(config));   // metrics — mounted here
...
line 76: for (const plugin of plugins) {  // enforcement plugin runs here
           plugin(app, config);
         }
```

An enforcement plugin registered in the plugin loop arrives in the middleware chain **after** `/metrics/*` is already registered. Express matches routes by registration order, so a plugin-registered middleware at line 76 will not intercept requests that match the metrics mount at line 59.

To enforce Option A the implementation must use one of these approaches:

**Option A1 (recommended):** Register the enforcement middleware in `api-factory.js` directly, before both `metricsRoutes` and the plugin loop — similar to how the shutdown gate middleware is registered at line 62. This keeps enforcement responsibility in the factory, not in a plugin.

```js
// After shutdown gate, before metricsRoutes:
app.use(createEnforcementMiddleware(config));
app.use(metricsRoutes(config));
```

**Option A2:** Move `metricsRoutes` mount to after the plugin loop, accepting that all plugins must be registered before metrics are reachable. This changes the existing middleware ordering assumption and is harder to reason about during shutdown.

**Option A3 (avoid):** Mount a second enforcement middleware inside the metrics router itself. This is duplicated logic and not maintainable.

Option A1 is consistent with the factory pattern, keeps `api-factory.js` as the single source of middleware order, and matches how the shutdown gate is already handled.

**Recommendation:** Add an implementation note to the Endpoint Policy section acknowledging that enforcement middleware must be registered before `metricsRoutes` in `api-factory.js` — not as a plugin.

---

## Implementation Alignment (updated)

| Area | Requirement |
|---|---|
| `core/api/src/config/env.js` | Add `blockBrowserOrigin` and `requireJwt` to `DEFAULTS` (default `false`); read from `API_BLOCK_BROWSER_ORIGIN` and `API_REQUIRE_JWT` env vars |
| `core/api/src/config/env.js` | Add `jwtSecret: env.JWT_SECRET ?? ''` and `jwtExpiresIn: env.JWT_EXPIRES_IN ?? '120s'` |
| `core/api/src/api-factory.js` | Register enforcement middleware before `metricsRoutes` (Option A1); not as a plugin |
| App API client (not yet written) | Pre-generate token at factory time; rotate via `setInterval` at 90s; read from closure per request |
| Fail-fast guard | Use `!config.jwtSecret` (falsy), not `=== undefined`, to catch `JWT_SECRET=` (empty string from env) |

---

## Summary

v2 resolves all critical and medium blockers from v1. The plan is ready to proceed into implementation with two corrections:

1. **Fix the Stage D file path** — `core/api/src/config/env.js`, not `api/src/config/env.js`.
2. **Add an implementation note** that enforcement middleware must mount before `metricsRoutes` in `api-factory.js` (Option A1), not as a plugin, to correctly protect `/metrics/*` routes.

Neither finding blocks writing code. Both can be addressed as small doc edits to the rollout plan before or alongside the first implementation PR.

---

---

# Response v3 — Reviewing Rollout Plan v3

> Reviewed against current codebase state (branch: `feature/fwt`)
>
> Response version: v3 (reviewing rollout plan v3)
>
> Status: All v2 findings resolved. Two new low-severity findings raised.

---

## Resolution Scorecard (v2 New Findings)

| # | Finding | Severity | v2 Status | v3 Status |
|---|---|---|---|---|
| 1 | Stage D points at wrong config file | Low-Medium | Open | **Resolved** |
| 2 | Metrics middleware order makes Option A non-trivial | Medium | Open | **Resolved** |

---

## Resolved Findings (no further action)

### Finding 1 — Stage D config file path

v3 correctly specifies `core/api/src/config/env.js` as the Stage D target. Verified against codebase: `core/api/src/config/env.js` contains the `DEFAULTS` object and `createApiConfig()` factory. The consumer path `api/src/config/env.js` contains only `appOverrides` (appName, appVersion, port) — no `DEFAULTS`, no feature flags. Path is now correct.

### Finding 2 — Middleware ordering

v3 adds an explicit implementation note to the Endpoint Policy section:

> Enforcement middleware must be mounted in `core/api/src/api-factory.js` before `metricsRoutes(config)` and `indexRoutes(config)`. Do not rely on the plugin loop for enforcement registration because plugins are mounted after both route groups.

Verified against current `core/api/src/api-factory.js`:

```
line 58: app.use(healthRoutes(app));       // health — always exempt
line 59: app.use(metricsRoutes(config));   // metrics — must be covered by enforcement
lines 62–72: shutdown gate
line 74: app.use(indexRoutes(config));
lines 76–78: plugin loop                  // enforcement must NOT live here
```

The note is accurate and sufficient to guide implementation. Option A1 remains the correct approach.

---

## New Findings

### 1. Low: Token Rotation Timer Lacks Shutdown Hook Guidance

**Section affected:** Implementation Alignment table (App API client row)

The table specifies the app API client should "rotate via `setInterval` at 90s." No guidance is given for clearing this interval at shutdown.

If `clearInterval()` is not called during the shutdown sequence, the timer will continue firing after the app begins draining — signing a new token into a process that is no longer serving traffic. On slower shutdown cycles this is harmless, but it is unnecessary work and can delay process exit if the timer holds an open handle that prevents the event loop from draining naturally.

**Recommendation:** Add a note to the Implementation Alignment table row:

> Register a shutdown hook that calls `clearInterval(rotationTimer)` to stop token rotation when the server begins draining.

The `rotationTimer` ref is naturally closure-captured in the app API client factory and can be passed to `app.registerShutdownHook()` at factory time.

---

### 2. Low: Fail-Fast Guard Location Unspecified

**Section affected:** Implementation Alignment table (Fail-fast guard row), Test Plan

The table specifies `!config.jwtSecret` (falsy) as the guard expression. The test plan says "startup fails fast if `API_REQUIRE_JWT=true` and `JWT_SECRET` is missing or empty." Neither document specifies which file or function hosts this guard.

Three plausible locations exist:

- `createApiConfig()` in `core/api/src/config/env.js` — throws at config creation time
- `createApi()` in `core/api/src/api-factory.js` — throws before middleware is registered
- Consumer `server.js` — throws before `createApi()` is called

The factory (`createApi()`) is the correct location. Config creation may legitimately happen without JWT intent in test contexts; the factory is where the enforcement contract is established. A guard at the top of `createApi()` keeps the precondition co-located with the enforcement middleware it protects.

**Recommendation:** Specify the location in the Implementation Alignment table:

> In `createApi()` (`core/api/src/api-factory.js`), before middleware registration: `if (config.requireJwt && !config.jwtSecret) throw new Error('JWT_SECRET is required when API_REQUIRE_JWT is enabled');`

---

## Implementation Alignment (updated)

| Area | Requirement |
|---|---|
| `core/api/src/config/env.js` | Add `blockBrowserOrigin` and `requireJwt` to `DEFAULTS` (default `false`); read from `API_BLOCK_BROWSER_ORIGIN` and `API_REQUIRE_JWT` env vars |
| `core/api/src/config/env.js` | Add `jwtSecret: env.JWT_SECRET ?? ''` and `jwtExpiresIn: env.JWT_EXPIRES_IN ?? '120s'` |
| `core/api/src/api-factory.js` | At top of `createApi()`, throw if `config.requireJwt && !config.jwtSecret` |
| `core/api/src/api-factory.js` | Register enforcement middleware before `metricsRoutes` (Option A1); not as a plugin |
| App API client (not yet written) | Pre-generate token at factory time; rotate via `setInterval` at 90s; clear interval via registered shutdown hook; read token from closure per request |
| Fail-fast guard | Use `!config.jwtSecret` (falsy), not `=== undefined`, to catch `JWT_SECRET=` (empty string from env) |

---

## Summary

v3 resolves both v2 findings cleanly. The Stage D path is correct and verified against the codebase. The enforcement middleware ordering note is accurate and actionable.

Two new low-severity findings do not block implementation:

1. **Token rotation shutdown hook** — add `clearInterval` guidance to the Implementation Alignment table to prevent unnecessary post-shutdown timer activity.
2. **Fail-fast guard location** — specify `createApi()` in `core/api/src/api-factory.js` as the guard site to keep the precondition co-located with the enforcement it protects.

The plan is ready to implement.
