/**
 * @file Integration tests for admin routes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp, createConfig } from '../../index.js';

describe('Admin Routes Integration', () => {
  let app;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url) => {
      const href = typeof url === 'string' ? url : (url?.toString?.() ?? '');
      if (href.includes('/metrics/memory')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            memoryUsage: {
              rss: 12000000,
              heapUsed: 8000000,
              heapTotal: 10000000,
            },
          }),
        };
      }
      if (href.includes('/metrics/runtime')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            nodeVersion: 'v22.0.0',
            uptimeSeconds: 3600,
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'ready' }),
      };
    });

    const config = createConfig({ nodeEnv: 'test' });
    app = createApp(config);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('GET /admin', () => {
    it('returns 200 and renders dashboard', async () => {
      const response = await request(app).get('/admin').expect(200);

      expect(response.text).toContain('Admin Dashboard');
      expect(response.text).toContain('Uptime');
      expect(response.text).toContain('healthCheckBtn');
      expect(response.text).toContain('/js/admin/dashboard.js');
      expect(response.text).toContain('App');
      expect(response.text).toContain('API');
      expect(response.text).toContain('v22.0.0');
    });

    it('displays formatted uptime (not raw seconds)', async () => {
      const response = await request(app).get('/admin').expect(200);
      const tokens = response.text.split(/[^0-9a-zA-Z]+/).filter(Boolean);

      // Should NOT contain patterns like "86400s" (raw large seconds)
      const hasLargeRawSeconds = tokens.some(
        (token) =>
          token.endsWith('s') &&
          Number.isInteger(Number(token.slice(0, -1))) &&
          Number(token.slice(0, -1)) >= 10000,
      );
      expect(hasLargeRawSeconds).toBe(false);

      // Should contain formatted patterns like "5m", "2h", "3d", or just "Xs"
      // (exact value depends on process uptime, so we check for format patterns)
      const hasFormattedUptimeToken = tokens.some((token) => {
        if (token.length < 2) {
          return false;
        }
        const unit = token[token.length - 1];
        const value = token.slice(0, -1);
        return (
          ['s', 'm', 'h', 'd'].includes(unit) && Number.isInteger(Number(value)) && value.length > 0
        );
      });
      expect(hasFormattedUptimeToken).toBe(true);
    });

    it('displays memory usage', async () => {
      const response = await request(app).get('/admin').expect(200);

      expect(response.text).toContain('Memory Usage');
      expect(response.text).toContain('RSS');
      expect(response.text).toContain('Heap Used');
      expect(response.text).toContain('App');
      expect(response.text).toContain('API');
    });

    it('shows API memory as unavailable if upstream fetch fails', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        const href = typeof url === 'string' ? url : (url?.toString?.() ?? '');
        if (href.includes('/metrics/memory')) {
          throw new Error('unreachable');
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ready' }),
        };
      });

      const response = await request(app).get('/admin').expect(200);
      expect(response.text).toContain('Unavailable');
    });

    it('shows API runtime as unavailable if upstream fetch fails', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        const href = typeof url === 'string' ? url : (url?.toString?.() ?? '');
        if (href.includes('/metrics/runtime')) {
          throw new Error('runtime endpoint unreachable');
        }
        if (href.includes('/metrics/memory')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'ok',
              memoryUsage: {
                rss: 12000000,
                heapUsed: 8000000,
                heapTotal: 10000000,
              },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ready' }),
        };
      });

      const response = await request(app).get('/admin').expect(200);
      expect(response.text).toContain('Unavailable');
    });
  });

  describe('GET /admin/config', () => {
    it('returns 200 and renders config page', async () => {
      const response = await request(app).get('/admin/config').expect(200);

      expect(response.text).toContain('Configuration');
    });
  });

  describe('GET /admin/api-health', () => {
    it('returns 200 healthy when upstream readiness is successful', async () => {
      const response = await request(app).get('/admin/api-health').expect(200);

      expect(response.body).toEqual({ status: 'healthy' });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('returns 503 unhealthy when upstream readiness is non-2xx', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ status: 'not-ready', reason: 'shutdown in progress' }),
      }));

      const response = await request(app).get('/admin/api-health').expect(503);

      expect(response.body).toEqual({ status: 'unhealthy' });
    });

    it('returns 502 unhealthy when upstream call fails', async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error('network failure');
      });

      const response = await request(app).get('/admin/api-health').expect(502);

      expect(response.body).toEqual({ status: 'unhealthy' });
    });
  });
});
