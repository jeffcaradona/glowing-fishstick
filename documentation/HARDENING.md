# Hardening Cookbook — glowing-fishstick

> **Scope:** Practical recipes for adding enterprise-grade security controls to a consumer app or the core packages.  
> These are _how-to_ guides, not specifications. Each recipe is self-contained and cites the relevant config keys, files, and tests to update.

---

## Recipe 1 — Content Security Policy (CSP) Headers

**Why:** Browsers enforce CSP to prevent XSS by restricting where scripts, styles, and assets may be loaded from. Without a policy, injected scripts execute freely.

### Step 1 — Install Helmet

```bash
npm install helmet --workspace app
```

Check for known vulnerabilities before committing:

```bash
# verify no advisory hits for the version you installed
npx audit-ci --critical
```

### Step 2 — Add a CSP middleware plugin

Create `sandbox/app/src/middlewares/csp.js`:

```js
import helmet from 'helmet';

/**
 * Returns a Helmet CSP middleware tuned for this app.
 *
 * WHY: CSP is policy, not plumbing — it belongs in the consumer app, not
 * in the core framework, because each app has different asset origins.
 *
 * @param {object} config - App config (used to gate policy strictness by env).
 * @returns {import('express').RequestHandler}
 */
export function createCspMiddleware(config) {
  return helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // remove 'unsafe-inline' once inline styles are gone
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      // WHY: upgradeInsecureRequests only makes sense behind TLS in production.
      ...(config.nodeEnv === 'production' ? { upgradeInsecureRequests: [] } : {}),
    },
  });
}
```

### Step 3 — Mount in the plugin

In `sandbox/app/src/app.js` (inside `taskManagerApplicationPlugin`):

```js
import { createCspMiddleware } from './middlewares/csp.js';

export function taskManagerApplicationPlugin(app, config) {
  // Mount before any route so all responses carry the header.
  app.use(createCspMiddleware(config));
  // ... rest of plugin
}
```

### Step 4 — Test

Add to `tests/integration/security-hardening.test.js`:

```js
it('sets Content-Security-Policy header on HTML responses', async () => {
  const res = await request(app).get('/');
  expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
});
```

### What to tighten later

- Replace `'unsafe-inline'` in `styleSrc` with a nonce-based approach once all inline styles use `<style nonce="...">`.
- Add a `reportUri` or `reportTo` directive to collect violation reports.

---

## Recipe 2 — Secret Rotation

**Why:** Long-lived secrets (JWT signing keys, API keys, database passwords) are high-value targets. Rotation limits the blast radius of a leaked credential.

### Rotate a JWT secret (zero-downtime)

JWT rotation needs a grace period where both the old and new secrets validate tokens.

#### Step 1 — Support multiple secrets in `verifyToken`

In `core/shared/src/auth/jwt.js`, extend to accept an array of secrets:

```js
import jwt from 'jsonwebtoken';

/**
 * Verify a JWT against one or more secrets.
 * Tries each secret in order; accepts the first that validates.
 *
 * WHY: Dual-secret window lets the old key drain naturally while the new
 * key signs all new tokens. No forced re-login during rotation.
 *
 * @param {string}          token   - Signed JWT string.
 * @param {string|string[]} secrets - Current secret or [newSecret, oldSecret].
 * @returns {{ valid: boolean, payload?: object, error?: string }}
 */
export function verifyToken(token, secrets) {
  const candidates = Array.isArray(secrets) ? secrets : [secrets];
  for (const secret of candidates) {
    try {
      const payload = jwt.verify(token, secret);
      return { valid: true, payload };
    } catch {
      // try next candidate
    }
  }
  return { valid: false, error: 'invalid or expired token' };
}
```

#### Step 2 — Wire via environment variables

In `core/service-api/src/config/env.js`:

```js
jwtSecret: overrides.jwtSecret ?? env.JWT_SECRET,
// WHY: During rotation, set PREVIOUS_JWT_SECRET to the old key until
// all outstanding tokens have expired or been replaced.
previousJwtSecret: overrides.previousJwtSecret ?? env.PREVIOUS_JWT_SECRET ?? null,
```

#### Step 3 — Pass both secrets to `jwtAuthMiddleware`

```js
const secrets = [config.jwtSecret, config.previousJwtSecret].filter(Boolean);
// In jwtAuthMiddleware, replace the single-secret verifyToken call:
//   const result = verifyToken(token, config.jwtSecret);
// with:
//   const result = verifyToken(token, secrets);
```

#### Step 4 — Rotation procedure

1. Generate a new secret: `openssl rand -base64 48`
2. Set `PREVIOUS_JWT_SECRET=<old value>`, `JWT_SECRET=<new value>` in the deployment.
3. Deploy. New tokens use the new key; old tokens still validate via the previous key.
4. Wait for token TTL to expire. **Always set `expiresIn` in `generateToken`** (e.g. `'1h'` or `'24h'`); tokens without expiry remain valid indefinitely, making secret rotation ineffective.
5. Remove `PREVIOUS_JWT_SECRET` from the environment. Rotate again as needed.

### Rotate application secrets without downtime

For database passwords and third-party API keys, use the same dual-variable pattern:

```
DB_PASSWORD=<new>
DB_PASSWORD_PREVIOUS=<old>
```

Wire the connection attempt to try the new password first, then fall back to the old during the rollover window.

---

## Recipe 3 — Database Timeouts

**Why:** Without query timeouts, a slow or hung query holds a connection open indefinitely, exhausting the connection pool and stalling all subsequent requests.

### SQLite (current implementation — `sandbox/api/src/database/db.js`)

Node's built-in `node:sqlite` `DatabaseSync` does not support query timeouts. The only reliable mitigation with the current driver is to:

1. **Keep migrations short and bounded.** Avoid full-table scans in migration `up` functions; use pagination or batch processing for large datasets.
2. **Migrate to `better-sqlite3`**, which accepts a `timeout` constructor option that aborts statements exceeding a wall-clock budget:

```js
import Database from 'better-sqlite3';

// WHY: timeout aborts any statement that runs longer than the budget,
// preventing a slow migration or runaway query from blocking the event loop.
const db = new Database('tasks.db', { timeout: 5000 });
```

3. **Log slow queries** by timing each migration step and warning when elapsed time exceeds a budget — this surfaces performance regressions without blocking progress:

```js
const start = Date.now();
db.exec(sql);
const elapsed = Date.now() - start;
// WHY: This is observability, not enforcement. Use better-sqlite3 timeout for enforcement.
if (elapsed > 5000) logger.warn({ elapsed, sql: sql.slice(0, 80) }, 'Slow migration step');
```

### PostgreSQL / MySQL (future)

When adding a relational database with a pool (e.g. `pg`, `mysql2`):

```js
// WHY: Per-query statement timeout prevents runaway queries from starving
// the connection pool under load. Adjust per SLA.
const pool = new Pool({
  connectionTimeoutMillis: 3000, // fail-fast on connection acquisition
  idleTimeoutMillis: 30000,
  query_timeout: 5000, // pg-specific: per-statement wall-clock limit
});
```

Add these values to `createApiConfig()` as `dbConnectionTimeoutMs`, `dbQueryTimeoutMs`, and read them from environment variables.

### Connection pool sizing

| Environment | Pool size     | Rationale                                     |
| ----------- | ------------- | --------------------------------------------- |
| Development | 2–5           | No parallelism needed                         |
| CI/test     | 1             | Prevent port exhaustion in parallel test runs |
| Production  | CPU count × 2 | Rule of thumb; benchmark under load           |

---

## Recipe 4 — Request / Response Signing

**Why:** Signing API responses lets consumers verify that a payload has not been tampered with in transit or by a proxy.

### HMAC-SHA256 response signing (lightweight)

#### Step 1 — Add a signing utility

Create `core/shared/src/utils/signing.js`:

````js
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Sign a string payload with HMAC-SHA256.
 *
 * WHY: Stateless — no shared state needed. Verifier recreates the same
 * digest from the payload and shared secret; a mismatch means tampering.
 *
 * @param {string} payload - The serialised response body.
 * @param {string} secret  - Shared signing secret (from config.signingSecret).
 * @returns {string} Hex digest.
 */
export function signPayload(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify a signed payload.
 *
 * @param {string} payload   - The serialised response body.
 * @param {string} signature - Hex digest to verify against.
 * @param {string} secret    - Shared signing secret.
 * @returns {boolean}
 */
export function verifySignature(payload, signature, secret) {
  const expected = signPayload(payload, secret);
  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(signature, 'hex');
  // WHY: timingSafeEqual prevents timing side-channel attacks.
  // Lengths must match first; timingSafeEqual throws on length mismatch.
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

#### Step 2 — Add config keys

In `core/service-api/src/config/env.js`:

```js
signingSecret: overrides.signingSecret ?? env.API_SIGNING_SECRET ?? null,
enableResponseSigning: overrides.enableResponseSigning ?? (env.API_ENABLE_SIGNING === 'true') ?? false,
````

#### Step 3 — Add a response-signing middleware

Create `core/service-api/src/middlewares/response-signing.js`:

```js
import { signPayload } from '@glowing-fishstick/shared';

/**
 * Middleware that adds an HMAC-SHA256 signature header to JSON responses.
 *
 * WHY: Allows downstream consumers to verify payload integrity without TLS
 * termination at the consumer (e.g. after an internal proxy layer).
 * Only active when config.signingSecret is set.
 *
 * @param {object} config - App config with signingSecret and enableResponseSigning.
 */
export function createResponseSigningMiddleware(config) {
  if (!config.enableResponseSigning || !config.signingSecret) {
    // WHY: Return a no-op when signing is disabled to keep the middleware
    // stack uniform without branching in the factory.
    return (_req, _res, next) => next();
  }

  return (_req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const serialized = JSON.stringify(body);
      const sig = signPayload(serialized, config.signingSecret);
      res.setHeader('x-signature-sha256', sig);
      return originalJson(body);
    };
    next();
  };
}
```

#### Step 4 — Mount in `createApi()`

```js
// In core/service-api/src/api-factory.js, after enforcement middleware:
app.use(createResponseSigningMiddleware(config));
```

#### Step 5 — Verify on the client

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyResponseSignature(body, signatureHeader, secret) {
  const expected = createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
  const received = Buffer.from(signatureHeader, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (received.length !== expectedBuf.length) return false;
  return timingSafeEqual(received, expectedBuf);
}
```

---

## Recipe 5 — Additional Quick Wins

| Control                               | Recipe                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| **HSTS**                              | Add `helmet.hsts({ maxAge: 31536000 })` in production; sets `Strict-Transport-Security`    |
| **X-Frame-Options**                   | `helmet.frameguard({ action: 'deny' })` — prevents clickjacking                            |
| **Rate limit all routes**             | Use `createAdminThrottle` pattern with wider paths; or add `express-rate-limit` globally   |
| **Audit log**                         | In shutdown hook, flush any pending audit events before `server.close()`                   |
| **Dependency audit**                  | Run `npm audit --audit-level=high` in CI; block merges on high/critical findings           |
| **Env var validation at startup**     | In `createConfig()`, throw if required secrets are missing (already done for `JWT_SECRET`) |
| **Remove stack traces in production** | In `errorHandler`, gate `stack` inclusion on `config.nodeEnv !== 'production'`             |

---

## Where to Look

| Topic                          | File                                                |
| ------------------------------ | --------------------------------------------------- |
| Current rate limiting          | `core/shared/src/middlewares/admin-throttle.js`     |
| JWT auth middleware            | `core/shared/src/middlewares/jwt-auth.js`           |
| JWT sign/verify utilities      | `core/shared/src/auth/jwt.js`                       |
| Error middleware (app)         | `core/web-app/src/middlewares/errorHandler.js`      |
| Error middleware (api)         | `core/service-api/src/middlewares/error-handler.js` |
| API enforcement (JWT + origin) | `core/service-api/src/middlewares/enforcement.js`   |
| Security hardening plan        | `documentation/SECURITY-HARDENING-PLAN.md`          |
| Architecture overview          | `documentation/ARCHITECTURE.md`                     |
