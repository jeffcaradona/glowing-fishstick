# Proposal: Revisit Intentional-Separation Policy for Duplicated Code

**Date:** 2026-02-26  
**Status:** Draft  
**Triggered by:** SonarQube duplication report (8.3% duplicated lines on new code)

---

## Sonar Findings

| File                                                    | Duplicated Blocks | Duplicated Lines | Dup % (New Code) |
| ------------------------------------------------------- | ----------------- | ---------------- | ---------------- |
| `core/web-app/tests/integration/security-hardening.test.js` | 4                 | 90               | 42.3%            |
| `core/service-api/tests/integration/security-hardening.test.js` | 4                 | 78               | 28.8%            |
| `core/web-app/src/app-factory.js`                           | 1                 | 12               | 29.3%            |
| `core/service-api/src/api-factory.js`                           | 1                 | 11               | 23.9%            |

---

## Analysis Summary

All four files are listed in AGENTS.md as **intentionally separate**. After deep analysis, the recommendation is a three-part response:

1. **Factory files → KEEP separate** (no change)
2. **Security hardening tests → RELAX policy slightly** (use shared helpers, not shared harnesses)
3. **Health routes → CONSOLIDATE** (bonus finding: undocumented 100% duplication)

---

## 1. Factory Files: KEEP Separate (No Change)

### Why the current policy is sound

The `app-factory.js` and `api-factory.js` files have a **load-bearing middleware-ordering divergence**. The shutdown gate mounts at different positions:

- **App:** shutdown gate mounts _before_ core routes → admin routes become unreachable during drain
- **API:** shutdown gate mounts _after_ enforcement + metrics → metrics endpoints remain reachable during drain

This is a deliberate operational difference that would be obscured by any shared pipeline abstraction.

### What's already shared

The meaningful shared logic is already extracted into `@glowing-fishstick/shared`:

- `attachHookRegistries` / `createShutdownGate` (factory-utils.js)
- `createRequestIdMiddleware` (request-id.js)
- `createRequestLogger` (via logger module)
- `createAdminThrottle` (middlewares/admin-throttle.js)

### What remains duplicated (~22 lines)

High-visibility security boilerplate: `app.disable('x-powered-by')`, body parser limits, logger assignment, plugin loop, error handler mounting. These serve as an auditable checklist in each factory. Absolute maintenance cost is low.

### Consolidation approaches evaluated and rejected

| Approach                           | Saves          | Rejected because                                                                |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------------- |
| Composable pipeline builder        | ~5 lines/file  | Shutdown gate position differs; must mentally expand abstraction to audit stack |
| `applyBaseMiddleware(app, config)` | ~12 lines/file | Hides body parser security config (`limit`, `parameterLimit`) from audit view   |
| `createBodyParsers(config)`        | ~4 lines/file  | Marginal savings; inline version is perfectly readable                          |

**Decision: No action required on factory files.**

---

## 2. Security Hardening Tests: RELAX Policy Slightly

### Current state

Both test files already import 7 shared helpers from `@glowing-fishstick/shared/testing`:
`createPayloadTestPlugin`, `sendOversizedJson`, `sendSmallJson`, `sendOversizedUrlencoded`, `sendExcessParams`, `exhaustAndHit`, `exhaustRateLimit`

However, `verifyHealthEndpoints` is **exported but unused** (dead code) — both files inline the same health assertions manually.

### Block-by-block comparison

| describe block        | App (13 tests)          | API (16 tests)         | Shared pattern?                                        |
| --------------------- | ----------------------- | ---------------------- | ------------------------------------------------------ |
| Payload Limits        | 4 tests                 | 4 tests                | **Yes** — identical assertions, different factory call |
| Throttling            | 4 tests (3 paths)       | 3 tests (2 paths)      | **Yes** — same structure, different paths/counts       |
| Health Under Throttle | 3 tests                 | 3 tests                | **Yes** — identical except exhausted path              |
| Error Handler         | 2 tests (HTML + logger) | 1 test (JSON envelope) | **No** — intentionally different                       |
| Config Defaults       | —                       | 3 tests                | API-only                                               |
| JWT Toggle Regression | —                       | 2 tests                | API-only                                               |

### Proposed changes

#### Step 2a: Use existing `verifyHealthEndpoints` helper

Both test files currently inline:

```js
const res = await request(app).get('/healthz');
expect(res.status).toBe(200);
expect(res.body).toEqual({ status: 'ok' });
// ... repeated for /readyz and /livez
```

Replace with the existing `verifyHealthEndpoints(app)` from `@glowing-fishstick/shared/testing`. Each `it()` block body becomes a one-liner. Saves ~3-6 lines per test file × 3 health tests.

#### Step 2b: Add `assertHealthAvailableAfterThrottle` helper

Add to `core/shared/src/testing/security-helpers.js`:

```js
/**
 * Verify health endpoints remain available after exhausting a throttled path.
 * WHY: Both app and API security tests validate that health bypass works
 * under throttle pressure — this eliminates the duplicated exhaust-then-verify pattern.
 */
async function assertHealthAvailableAfterThrottle(app, exhaustPath, quota) {
  await exhaustRateLimit(app, exhaustPath, quota);
  await verifyHealthEndpoints(app);
}
```

Each "Health Under Throttle" `it()` body collapses to a single call while each test file still owns its `describe` block, `beforeEach`, factory call, and test structure.

#### Step 2c: Update AGENTS.md policy wording

Change the security hardening tests entry from:

> Parallel test structure validates each framework independently. Each package must prove its own security contract; shared harness would obscure which implementation is under test.

To:

> Each package must own its `describe`/`it` structure and prove its own security contract. Shared **assertion helpers** (e.g., `verifyHealthEndpoints`, `sendOversizedJson`) in `@glowing-fishstick/shared/testing` are encouraged to reduce request-construction boilerplate. Shared test **generators** that produce entire `describe` blocks are prohibited — each test file must be independently readable without expanding a generator's output.

Mirror in `CLAUDE.md`.

### What this does NOT do

- Does NOT create parameterized test generators
- Does NOT share `describe` block structure
- Does NOT merge test files
- Each package still independently proves its security contract

---

## 3. Health Routes: CONSOLIDATE (Bonus Finding)

### Discovery

`core/web-app/src/routes/health.js` and `core/service-api/src/routes/health.js` are **100% character-identical** (49 lines each). This duplication is **not documented** in the AGENTS.md intentional-separation table — it appears to be an oversight.

### Proposed changes

Follow the established `createAdminThrottle` re-export stub pattern:

1. **Create canonical source:** `core/shared/src/routes/health.js` with the current content
2. **Add subpath export:** `./routes/health` in `core/shared/package.json`
3. **Convert both package files to re-export stubs:**

```js
// WHY: Canonical source is @glowing-fishstick/shared/routes/health.
// Re-export stub preserves the original import path used by each factory.
// VERIFY IF CHANGED: Both app-factory.js and api-factory.js import from this path.
export { default } from '@glowing-fishstick/shared/routes/health';
```

4. **Add to AGENTS.md** "Consolidated (shared)" section:

> **`healthRoutes`** — Canonical source: `core/shared/src/routes/health.js`. Both `core/web-app` and `core/service-api` import from `@glowing-fishstick/shared`. Local files (`core/*/src/routes/health.js`) are re-export stubs that preserve the original import path.

---

## Implementation Checklist

- [ ] Create `core/shared/src/routes/health.js` (move canonical source)
- [ ] Add `./routes/health` export to `core/shared/package.json`
- [ ] Convert `core/web-app/src/routes/health.js` to re-export stub
- [ ] Convert `core/service-api/src/routes/health.js` to re-export stub
- [ ] Add `assertHealthAvailableAfterThrottle` to `core/shared/src/testing/security-helpers.js`
- [ ] Import + use `verifyHealthEndpoints` in app security hardening test
- [ ] Import + use `verifyHealthEndpoints` in API security hardening test
- [ ] Refactor health-under-throttle blocks to use `assertHealthAvailableAfterThrottle`
- [ ] Update AGENTS.md: add health routes to "Consolidated" section
- [ ] Update AGENTS.md: revise security test policy wording
- [ ] Mirror updates in CLAUDE.md
- [ ] Update `core/shared/README.md` with new exports
- [ ] Check `documentation/00-project-specs.md` and `documentation/99-potential-gaps.md` for stale refs
- [ ] Run `npm run lint` / `npm run format` / `npm run test:all`
- [ ] Run Snyk code scan on new/modified files

## Expected Sonar Impact

| File                               | Before (Dup Lines) | After (Est.) | Reduction               |
| ---------------------------------- | ------------------ | ------------ | ----------------------- |
| `security-hardening.test.js` (app) | 90 (42.3%)         | ~60          | ~33% fewer dup lines    |
| `security-hardening.test.js` (api) | 78 (28.8%)         | ~55          | ~30% fewer dup lines    |
| `app-factory.js`                   | 12 (29.3%)         | 12 (29.3%)   | No change (intentional) |
| `api-factory.js`                   | 11 (23.9%)         | 11 (23.9%)   | No change (intentional) |
| **Overall new-code dup %**         | **8.3%**           | **~5-6%**    | Improved                |

Health route stubs drop from 49 lines each to ~4 lines — this duplication won't be flagged at all post-consolidation.

## Slept on it response

Don’t let Sonar’s duplication metric design the system.

Free SonarCloud’s duplication threshold can push us into weird abstractions.

Better approaches than “refactor twice until green”:

Put repeated code into a shared internal module (clear + boring).

If duplication is in test helpers, generated code, DTO mapping, etc., consider excluding those paths (if your org allows) rather than abstracting them.

Use duplication as a signal, not a steering wheel. Some duplication is fine if it keeps local clarity.

If we find ourselves inventing patterns just to appease a metric, that’s a strong sign we’re overengineering.
