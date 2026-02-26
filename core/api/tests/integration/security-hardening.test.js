/**
 * @file Integration tests for API security hardening: payload limits,
 *       metrics throttling, and health endpoint availability.
 *
 * WHY: Validates that oversized payloads return 413, burst traffic
 * to metrics routes returns 429, and health endpoints remain available
 * under throttle pressure.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApi, createApiConfig } from '../../index.js';

describe('Security Hardening — API', () => {
  // ── Payload Limit Tests ───────────────────────────────────────

  describe('Request Payload Limits', () => {
    let app;

    beforeEach(() => {
      const config = createApiConfig(
        {
          nodeEnv: 'test',
          jsonBodyLimit: '1kb',
          urlencodedBodyLimit: '1kb',
          urlencodedParameterLimit: 5,
        },
        {},
      );

      app = createApi(config, [
        (api) => {
          // WHY: Need a POST route to exercise parser limits.
          api.post('/test-payload', (req, res) => {
            res.json({ received: true, bodyKeys: Object.keys(req.body).length });
          });
        },
      ]);
    });

    it('returns 413 for JSON payload exceeding jsonBodyLimit', async () => {
      const oversizedBody = { data: 'x'.repeat(2000) };

      const response = await request(app)
        .post('/test-payload')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(oversizedBody));

      expect(response.status).toBe(413);
    });

    it('accepts JSON payload within jsonBodyLimit', async () => {
      const smallBody = { data: 'ok' };

      const response = await request(app)
        .post('/test-payload')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(smallBody));

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it('returns 413 for URL-encoded payload exceeding urlencodedBodyLimit', async () => {
      const oversizedData = 'field=' + 'x'.repeat(2000);

      const response = await request(app)
        .post('/test-payload')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(oversizedData);

      expect(response.status).toBe(413);
    });

    it('returns 413 for URL-encoded parameters exceeding parameterLimit', async () => {
      const params = Array.from({ length: 10 }, (_, i) => `p${i}=v${i}`).join('&');

      const response = await request(app)
        .post('/test-payload')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(params);

      expect(response.status).toBe(413);
    });
  });

  // ── Metrics Throttling Tests ──────────────────────────────────

  describe('Metrics Route Throttling', () => {
    let app;

    beforeEach(() => {
      // WHY: Low threshold (3 requests) for fast, deterministic test execution.
      const config = createApiConfig(
        {
          nodeEnv: 'test',
          adminRateLimitWindowMs: 60000,
          adminRateLimitMax: 3,
        },
        {},
      );
      app = createApi(config);
    });

    it('returns 429 on GET /metrics/memory after exceeding threshold', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app).get('/metrics/memory').expect(200);
      }

      const response = await request(app).get('/metrics/memory');
      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.body.error.retryAfterSeconds).toBe(60);
    });

    it('returns 429 on GET /metrics/runtime after exceeding threshold', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app).get('/metrics/runtime').expect(200);
      }

      const response = await request(app).get('/metrics/runtime');
      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('throttles each metrics path independently', async () => {
      // Exhaust /metrics/memory quota
      for (let i = 0; i < 3; i++) {
        await request(app).get('/metrics/memory').expect(200);
      }

      // /metrics/runtime should still be available (separate counter)
      await request(app).get('/metrics/runtime').expect(200);
    });
  });

  // ── Health Availability Under Throttle ────────────────────────

  describe('Health Endpoints Under Metrics Throttle', () => {
    let app;

    beforeEach(() => {
      const config = createApiConfig(
        {
          nodeEnv: 'test',
          adminRateLimitWindowMs: 60000,
          adminRateLimitMax: 1,
        },
        {},
      );
      app = createApi(config);
    });

    it('/healthz remains available when metrics routes are throttled', async () => {
      await request(app).get('/metrics/memory').expect(200);
      await request(app).get('/metrics/memory').expect(429);

      await request(app).get('/healthz').expect(200, { status: 'ok' });
    });

    it('/readyz remains available when metrics routes are throttled', async () => {
      await request(app).get('/metrics/memory').expect(200);
      await request(app).get('/metrics/memory').expect(429);

      await request(app).get('/readyz').expect(200, { status: 'ready' });
    });

    it('/livez remains available when metrics routes are throttled', async () => {
      await request(app).get('/metrics/memory').expect(200);
      await request(app).get('/metrics/memory').expect(429);

      await request(app).get('/livez').expect(200, { status: 'alive' });
    });
  });

  // ── Config Tests ──────────────────────────────────────────────

  describe('Config Key Defaults', () => {
    it('applies hardening defaults', () => {
      const config = createApiConfig({}, {});

      expect(config.jsonBodyLimit).toBe('100kb');
      expect(config.urlencodedBodyLimit).toBe('100kb');
      expect(config.urlencodedParameterLimit).toBe(1000);
      expect(config.adminRateLimitWindowMs).toBe(60000);
      expect(config.adminRateLimitMax).toBe(60);
    });

    it('applies env overrides for hardening keys', () => {
      const config = createApiConfig(
        {},
        {
          API_JSON_BODY_LIMIT: '50kb',
          API_URLENCODED_BODY_LIMIT: '200kb',
          API_URLENCODED_PARAMETER_LIMIT: '500',
          API_ADMIN_RATE_LIMIT_WINDOW_MS: '30000',
          API_ADMIN_RATE_LIMIT_MAX: '30',
        },
      );

      expect(config.jsonBodyLimit).toBe('50kb');
      expect(config.urlencodedBodyLimit).toBe('200kb');
      expect(config.urlencodedParameterLimit).toBe(500);
      expect(config.adminRateLimitWindowMs).toBe(30000);
      expect(config.adminRateLimitMax).toBe(30);
    });

    it('applies direct overrides with highest precedence', () => {
      const config = createApiConfig(
        { jsonBodyLimit: '10kb', adminRateLimitMax: 10 },
        { API_JSON_BODY_LIMIT: '50kb', API_ADMIN_RATE_LIMIT_MAX: '100' },
      );

      expect(config.jsonBodyLimit).toBe('10kb');
      expect(config.adminRateLimitMax).toBe(10);
    });
  });

  // ── Error Handler Behavior ────────────────────────────────────

  describe('Error Handler Logger Hardening', () => {
    it('handles errors without per-request logger construction', async () => {
      const config = createApiConfig({ nodeEnv: 'test' }, {});
      const app = createApi(config, [
        (api) => {
          api.get('/test-error', () => {
            throw new Error('unexpected boom');
          });
        },
      ]);

      const response = await request(app).get('/test-error');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          statusCode: 500,
        },
      });
    });
  });

  // ── JWT Toggle Regression ─────────────────────────────────────

  describe('JWT Toggle Regression', () => {
    it('JWT enforcement still works with hardening config applied', async () => {
      const config = createApiConfig(
        {
          nodeEnv: 'test',
          requireJwt: true,
          jwtSecret: 'test-secret',
          jsonBodyLimit: '100kb',
          adminRateLimitMax: 60,
        },
        {},
      );

      const app = createApi(config);

      // Non-health route without JWT → 401
      const response = await request(app).get('/metrics/memory');
      expect(response.status).toBe(401);

      // Health endpoints bypass JWT
      await request(app).get('/healthz').expect(200, { status: 'ok' });
      await request(app).get('/readyz').expect(200, { status: 'ready' });
    });

    it('browser origin blocking still works with hardening config applied', async () => {
      const config = createApiConfig(
        {
          nodeEnv: 'test',
          blockBrowserOrigin: true,
          jsonBodyLimit: '100kb',
          adminRateLimitMax: 60,
        },
        {},
      );

      const app = createApi(config);

      // Request with Origin header → 403
      const response = await request(app)
        .get('/metrics/memory')
        .set('Origin', 'http://localhost:3000');

      expect(response.status).toBe(403);

      // Health endpoints bypass origin check
      await request(app)
        .get('/healthz')
        .set('Origin', 'http://localhost:3000')
        .expect(200, { status: 'ok' });
    });
  });
});
