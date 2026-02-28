/**
 * @module testing/security-helpers
 * @description Shared test helpers for security-hardening integration tests.
 *
 * WHY: Both core/web-app and core/service-api security-hardening test suites exercise
 * identical HTTP patterns (oversized payloads, throttle exhaustion, health
 * probes). Extracting the _request construction_ into helpers eliminates
 * Sonar-flagged line duplication while each test file retains its own
 * describe/it structure, factory calls, and assertions — preserving the
 * AGENTS.md requirement that "each package must independently prove its
 * own hardening."
 *
 * These are _helpers_, not a _harness_: test ownership stays in each package.
 */

import request from 'supertest';

// ── Plugin helpers ──────────────────────────────────────────────

/**
 * Create a plugin that registers a POST /test-payload route.
 * Both app and API tests need an identical route to exercise parser limits.
 *
 * @returns {(app: import('express').Express) => void}
 */
export function createPayloadTestPlugin() {
  // WHY: Centralised so changes to the test route shape propagate to both suites.
  return (app) => {
    app.post('/test-payload', (req, res) => {
      res.json({ received: true, bodyKeys: Object.keys(req.body).length });
    });
  };
}

// ── Payload request helpers ─────────────────────────────────────

/**
 * POST an oversized JSON body to trigger 413.
 *
 * @param {import('express').Express} app
 * @param {string} [path='/test-payload']
 * @param {number} [sizeBytes=2000]
 * @returns {Promise<import('supertest').Response>}
 */
export function sendOversizedJson(app, path = '/test-payload', sizeBytes = 2000) {
  const body = { data: 'x'.repeat(sizeBytes) };
  return request(app).post(path).set('Content-Type', 'application/json').send(JSON.stringify(body));
}

/**
 * POST a small JSON body that should be accepted.
 *
 * @param {import('express').Express} app
 * @param {string} [path='/test-payload']
 * @returns {Promise<import('supertest').Response>}
 */
export function sendSmallJson(app, path = '/test-payload') {
  return request(app)
    .post(path)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ data: 'ok' }));
}

/**
 * POST an oversized URL-encoded body to trigger 413.
 *
 * @param {import('express').Express} app
 * @param {string} [path='/test-payload']
 * @param {number} [sizeBytes=2000]
 * @returns {Promise<import('supertest').Response>}
 */
export function sendOversizedUrlencoded(app, path = '/test-payload', sizeBytes = 2000) {
  const data = 'field=' + 'x'.repeat(sizeBytes);
  return request(app)
    .post(path)
    .set('Content-Type', 'application/x-www-form-urlencoded')
    .send(data);
}

/**
 * POST URL-encoded data with more parameters than the configured limit.
 *
 * @param {import('express').Express} app
 * @param {string} [path='/test-payload']
 * @param {number} [count=10]
 * @returns {Promise<import('supertest').Response>}
 */
export function sendExcessParams(app, path = '/test-payload', count = 10) {
  // WHY: Default count=10 chosen to clearly exceed typical parameterLimit=5 in tests.
  const params = Array.from({ length: count }, (_, i) => `p${i}=v${i}`).join('&');
  return request(app)
    .post(path)
    .set('Content-Type', 'application/x-www-form-urlencoded')
    .send(params);
}

// ── Throttle helpers ────────────────────────────────────────────

/**
 * Exhaust a rate-limited endpoint's quota by sending `quota` successful GET
 * requests, then return the next (throttled) response.
 *
 * @param {import('express').Express} app
 * @param {string} path   - Route to exhaust.
 * @param {number} quota  - Number of requests allowed before throttling.
 * @returns {Promise<import('supertest').Response>} The first 429 response.
 */
export async function exhaustAndHit(app, path, quota) {
  for (let i = 0; i < quota; i++) {
    await request(app).get(path).expect(200);
  }
  // WHY: Return the first throttled response so callers can assert on it.
  return request(app).get(path);
}

/**
 * Exhaust a rate-limited endpoint's quota without making the extra request.
 *
 * @param {import('express').Express} app
 * @param {string} path   - Route to exhaust.
 * @param {number} quota  - Number of requests allowed.
 */
export async function exhaustRateLimit(app, path, quota) {
  for (let i = 0; i < quota; i++) {
    await request(app).get(path).expect(200);
  }
}

// ── Health endpoint helpers ─────────────────────────────────────

/**
 * Verify all three health endpoints return their expected responses.
 *
 * @param {import('express').Express} app
 */
export async function verifyHealthEndpoints(app) {
  await request(app).get('/healthz').expect(200, { status: 'ok' });
  await request(app).get('/readyz').expect(200, { status: 'ready' });
  await request(app).get('/livez').expect(200, { status: 'alive' });
}
