/**
 * @file Integration tests for admin routes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp, createConfig } from '../../index.js';

describe('Admin Routes Integration', () => {
  let app;

  beforeEach(() => {
    const config = createConfig({ nodeEnv: 'test' });
    app = createApp(config);
  });

  describe('GET /admin', () => {
    it('returns 200 and renders dashboard', async () => {
      const response = await request(app).get('/admin').expect(200);

      expect(response.text).toContain('Admin Dashboard');
      expect(response.text).toContain('Uptime');
    });

    it('displays formatted uptime (not raw seconds)', async () => {
      const response = await request(app).get('/admin').expect(200);

      // Should NOT contain patterns like "86400s" (raw large seconds)
      expect(response.text).not.toMatch(/\d{5,}s\b/);

      // Should contain formatted patterns like "5m", "2h", "3d", or just "Xs"
      // (exact value depends on process uptime, so we check for format patterns)
      expect(response.text).toMatch(/\d+[smhd]/);
    });

    it('displays memory usage', async () => {
      const response = await request(app).get('/admin').expect(200);

      expect(response.text).toContain('Memory Usage');
      expect(response.text).toContain('RSS');
      expect(response.text).toContain('Heap Used');
    });
  });

  describe('GET /admin/config', () => {
    it('returns 200 and renders config page', async () => {
      const response = await request(app).get('/admin/config').expect(200);

      expect(response.text).toContain('Configuration');
    });
  });
});
