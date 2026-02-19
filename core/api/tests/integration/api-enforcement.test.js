import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { generateToken } from '@glowing-fishstick/shared';
import { createApi, createApiConfig } from '../../index.js';

const SECRET = 'test-shared-secret';
const validToken = () => generateToken(SECRET, '120s');

// Helper — build a minimal API app with enforcement config baked in via overrides.
const makeApp = (overrides = {}) => createApi(createApiConfig({ nodeEnv: 'test', ...overrides }, {}));

// ── Stage A: all flags off ────────────────────────────────────────────────────

describe('Stage A — flags off (default behavior)', () => {
  const app = makeApp();

  it('health routes are reachable', async () => {
    await request(app).get('/healthz').expect(200);
    await request(app).get('/readyz').expect(200);
    await request(app).get('/livez').expect(200);
  });

  it('metrics routes are reachable without auth', async () => {
    await request(app).get('/metrics/memory').expect(200);
    await request(app).get('/metrics/runtime').expect(200);
  });

  it('API index is reachable without auth', async () => {
    await request(app).get('/').expect(200);
  });

  it('Origin header does not trigger enforcement', async () => {
    await request(app).get('/metrics/memory').set('Origin', 'http://localhost:3000').expect(200);
  });
});

// ── Stage B: browser-origin block on ─────────────────────────────────────────

describe('Stage B — blockBrowserOrigin=true', () => {
  const app = makeApp({ blockBrowserOrigin: true });

  it('health routes remain accessible with Origin header', async () => {
    await request(app).get('/healthz').set('Origin', 'http://localhost:3000').expect(200);
    await request(app).get('/readyz').set('Origin', 'http://localhost:3000').expect(200);
    await request(app).get('/livez').set('Origin', 'http://localhost:3000').expect(200);
  });

  it('non-health request with Origin returns 403', async () => {
    const res = await request(app).get('/').set('Origin', 'http://localhost:3000').expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('metrics routes with Origin return 403', async () => {
    const res = await request(app)
      .get('/metrics/memory')
      .set('Origin', 'http://localhost:3000')
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('non-health request without Origin continues normally', async () => {
    await request(app).get('/metrics/runtime').expect(200);
  });
});

// ── Stage C: JWT enforcement on ───────────────────────────────────────────────

describe('Stage C — requireJwt=true', () => {
  const app = makeApp({ requireJwt: true, jwtSecret: SECRET });

  it('health routes remain accessible without a token', async () => {
    await request(app).get('/healthz').expect(200);
    await request(app).get('/readyz').expect(200);
    await request(app).get('/livez').expect(200);
  });

  it('missing Authorization header returns 401', async () => {
    const res = await request(app).get('/metrics/memory').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('Authorization header without Bearer scheme returns 401', async () => {
    const res = await request(app)
      .get('/metrics/memory')
      .set('Authorization', 'Basic dXNlcjpwYXNz')
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('invalid token returns 401', async () => {
    const res = await request(app)
      .get('/metrics/memory')
      .set('Authorization', 'Bearer not-a-valid-token')
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('token signed with wrong secret returns 401', async () => {
    const badToken = generateToken('wrong-secret', '120s');
    const res = await request(app)
      .get('/metrics/memory')
      .set('Authorization', `Bearer ${badToken}`)
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('valid token allows access to metrics routes', async () => {
    await request(app)
      .get('/metrics/memory')
      .set('Authorization', `Bearer ${validToken()}`)
      .expect(200);
  });

  it('valid token allows access to API index', async () => {
    await request(app)
      .get('/')
      .set('Authorization', `Bearer ${validToken()}`)
      .expect(200);
  });
});

// ── Combined flags ────────────────────────────────────────────────────────────

describe('Combined flags — blockBrowserOrigin=true + requireJwt=true', () => {
  const app = makeApp({ blockBrowserOrigin: true, requireJwt: true, jwtSecret: SECRET });

  it('health routes remain accessible', async () => {
    await request(app).get('/healthz').expect(200);
  });

  it('Origin header triggers 403 before JWT check (deterministic order)', async () => {
    // Even with a valid token, Origin header is rejected first.
    const res = await request(app)
      .get('/metrics/memory')
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${validToken()}`)
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('no Origin + valid JWT succeeds', async () => {
    await request(app)
      .get('/metrics/memory')
      .set('Authorization', `Bearer ${validToken()}`)
      .expect(200);
  });

  it('no Origin + missing JWT returns 401', async () => {
    const res = await request(app).get('/metrics/memory').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

// ── Fail-fast guard ───────────────────────────────────────────────────────────

describe('Fail-fast guard — requireJwt without jwtSecret', () => {
  it('throws at startup when API_REQUIRE_JWT=true and JWT_SECRET is missing', () => {
    const config = createApiConfig({ requireJwt: true }, {});
    expect(() => createApi(config)).toThrow(
      'JWT_SECRET is required when API_REQUIRE_JWT is enabled',
    );
  });

  it('throws at startup when API_REQUIRE_JWT=true and JWT_SECRET is empty string', () => {
    const config = createApiConfig({ requireJwt: true, jwtSecret: '' }, {});
    expect(() => createApi(config)).toThrow(
      'JWT_SECRET is required when API_REQUIRE_JWT is enabled',
    );
  });

  it('does not throw when requireJwt=false even with no secret', () => {
    const config = createApiConfig({ requireJwt: false }, {});
    expect(() => createApi(config)).not.toThrow();
  });
});

// ── Config defaults ───────────────────────────────────────────────────────────

describe('Config defaults and env var reading', () => {
  it('blockBrowserOrigin defaults to false', () => {
    const config = createApiConfig({}, {});
    expect(config.blockBrowserOrigin).toBe(false);
  });

  it('requireJwt defaults to false', () => {
    const config = createApiConfig({}, {});
    expect(config.requireJwt).toBe(false);
  });

  it('jwtSecret defaults to empty string', () => {
    const config = createApiConfig({}, {});
    expect(config.jwtSecret).toBe('');
  });

  it('jwtExpiresIn defaults to 120s', () => {
    const config = createApiConfig({}, {});
    expect(config.jwtExpiresIn).toBe('120s');
  });

  it('reads API_BLOCK_BROWSER_ORIGIN from env', () => {
    const config = createApiConfig({}, { API_BLOCK_BROWSER_ORIGIN: 'true' });
    expect(config.blockBrowserOrigin).toBe(true);
  });

  it('reads API_REQUIRE_JWT from env', () => {
    const config = createApiConfig({}, { API_REQUIRE_JWT: 'true' });
    expect(config.requireJwt).toBe(true);
  });

  it('reads JWT_SECRET from env', () => {
    const config = createApiConfig({}, { JWT_SECRET: 'env-secret' });
    expect(config.jwtSecret).toBe('env-secret');
  });

  it('reads JWT_EXPIRES_IN from env', () => {
    const config = createApiConfig({}, { JWT_EXPIRES_IN: '300s' });
    expect(config.jwtExpiresIn).toBe('300s');
  });

  it('overrides take precedence over env vars', () => {
    const config = createApiConfig(
      { blockBrowserOrigin: false, jwtSecret: 'override-secret' },
      { API_BLOCK_BROWSER_ORIGIN: 'true', JWT_SECRET: 'env-secret' },
    );
    expect(config.blockBrowserOrigin).toBe(false);
    expect(config.jwtSecret).toBe('override-secret');
  });
});
