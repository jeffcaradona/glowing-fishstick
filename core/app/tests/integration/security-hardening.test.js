/**
 * @file Integration tests for security hardening: payload limits,
 *       admin throttling, and health endpoint availability.
 *
 * WHY: Validates that oversized payloads return 413, burst traffic
 * to admin routes returns 429, and health endpoints remain available
 * under throttle pressure.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp, createConfig } from '../../index.js';

describe('Security Hardening — App', () => {
  let app;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // WHY: Stub fetch to prevent real upstream calls from admin controller.
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ready' }),
    }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Payload Limit Tests ───────────────────────────────────────

  describe('Request Payload Limits', () => {
    beforeEach(() => {
      const config = createConfig({
        nodeEnv: 'test',
        jsonBodyLimit: '1kb',
        urlencodedBodyLimit: '1kb',
        urlencodedParameterLimit: 5,
      });
      app = createApp(config, [
        (appInstance) => {
          // WHY: Need a POST route to exercise parser limits.
          appInstance.post('/test-payload', (req, res) => {
            res.json({ received: true, bodyKeys: Object.keys(req.body).length });
          });
        },
      ]);
    });

    it('returns 413 for JSON payload exceeding jsonBodyLimit', async () => {
      // WHY: 1kb limit; send >1kb of JSON to trigger Express 413.
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
      // WHY: 1kb limit; send >1kb of urlencoded data.
      const oversizedData = 'field=' + 'x'.repeat(2000);

      const response = await request(app)
        .post('/test-payload')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(oversizedData);

      expect(response.status).toBe(413);
    });

    it('returns 413 for URL-encoded parameters exceeding parameterLimit', async () => {
      // WHY: parameterLimit=5; send 10 parameters to trigger rejection.
      const params = Array.from({ length: 10 }, (_, i) => `p${i}=v${i}`).join('&');

      const response = await request(app)
        .post('/test-payload')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(params);

      // Express returns 413 when parameterLimit is exceeded.
      expect(response.status).toBe(413);
    });
  });

  // ── Admin Throttling Tests ────────────────────────────────────

  describe('Admin Route Throttling', () => {
    beforeEach(() => {
      // WHY: Low threshold (3 requests) for fast, deterministic test execution.
      const config = createConfig({
        nodeEnv: 'test',
        adminRateLimitWindowMs: 60000,
        adminRateLimitMax: 3,
      });
      app = createApp(config);
    });

    it('returns 429 on GET /admin after exceeding threshold', async () => {
      // First 3 requests should succeed
      for (let i = 0; i < 3; i++) {
        await request(app).get('/admin').expect(200);
      }

      // Request #4 should be throttled
      const response = await request(app).get('/admin');
      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.body.error.retryAfterSeconds).toBe(60);
    });

    it('returns 429 on GET /admin/config after exceeding threshold', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app).get('/admin/config').expect(200);
      }

      const response = await request(app).get('/admin/config');
      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('returns 429 on GET /admin/api-health after exceeding threshold', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app).get('/admin/api-health').expect(200);
      }

      const response = await request(app).get('/admin/api-health');
      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('throttles each admin path independently', async () => {
      // Exhaust /admin quota
      for (let i = 0; i < 3; i++) {
        await request(app).get('/admin').expect(200);
      }

      // /admin/config should still be available (separate counter)
      await request(app).get('/admin/config').expect(200);
    });
  });

  // ── Health Availability Under Throttle ────────────────────────

  describe('Health Endpoints Under Admin Throttle', () => {
    beforeEach(() => {
      const config = createConfig({
        nodeEnv: 'test',
        adminRateLimitWindowMs: 60000,
        adminRateLimitMax: 1,
      });
      app = createApp(config);
    });

    it('/healthz remains available when admin routes are throttled', async () => {
      // Exhaust admin quota
      await request(app).get('/admin').expect(200);
      await request(app).get('/admin').expect(429);

      // Health must still respond
      await request(app).get('/healthz').expect(200, { status: 'ok' });
    });

    it('/readyz remains available when admin routes are throttled', async () => {
      await request(app).get('/admin').expect(200);
      await request(app).get('/admin').expect(429);

      await request(app).get('/readyz').expect(200, { status: 'ready' });
    });

    it('/livez remains available when admin routes are throttled', async () => {
      await request(app).get('/admin').expect(200);
      await request(app).get('/admin').expect(429);

      await request(app).get('/livez').expect(200, { status: 'alive' });
    });
  });

  // ── Error Handler Behavior ────────────────────────────────────

  describe('Error Handler Logger Hardening', () => {
    it('handles errors without per-request logger construction', async () => {
      // WHY: Verify error handler works without a startup logger
      // (fallback to console.error). No createLogger() import in error handler.
      const config = createConfig({ nodeEnv: 'test' });
      app = createApp(config, [
        (appInstance) => {
          appInstance.get('/test-error', () => {
            throw new Error('unexpected boom');
          });
        },
      ]);

      const response = await request(app).get('/test-error');

      // Should still return a deterministic 500 error
      expect(response.status).toBe(500);
    });

    it('logs errors via startup-injected logger when available', async () => {
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        child: vi.fn(() => mockLogger),
      };

      const config = createConfig({ nodeEnv: 'test', logger: mockLogger });
      app = createApp(config, [
        (appInstance) => {
          appInstance.get('/test-logged-error', () => {
            throw new Error('should be logged');
          });
        },
      ]);

      await request(app).get('/test-logged-error').expect(500);

      // Verify the startup-injected logger was used, not a new one
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          method: 'GET',
          path: '/test-logged-error',
        }),
        'Unexpected error',
      );
    });
  });
});
