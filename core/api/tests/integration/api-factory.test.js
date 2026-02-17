import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApi, createApiConfig } from '../../index.js';

describe('API Factory Integration', () => {
  let app;

  beforeEach(() => {
    const config = createApiConfig({ nodeEnv: 'test', appName: 'integration-api' }, {});

    app = createApi(config, [
      (api) => {
        api.get('/plugin/ping', (_req, res) => {
          res.json({ pong: true });
        });

        api.get('/plugin/error', () => {
          throw new Error('boom');
        });
      },
    ]);
  });

  it('serves health endpoints', async () => {
    await request(app).get('/healthz').expect(200, { status: 'ok' });
    await request(app).get('/readyz').expect(200, { status: 'ready' });
    await request(app).get('/livez').expect(200, { status: 'alive' });
  });

  it('serves memory metrics endpoint', async () => {
    const response = await request(app).get('/metrics/memory').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.memoryUsage).toEqual(
      expect.objectContaining({
        rss: expect.any(Number),
        heapUsed: expect.any(Number),
        heapTotal: expect.any(Number),
      }),
    );
  });

  it('serves runtime metrics endpoint', async () => {
    const response = await request(app).get('/metrics/runtime').expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        nodeVersion: expect.any(String),
        uptimeSeconds: expect.any(Number),
      }),
    );
  });

  it('changes readiness during shutdown', async () => {
    app.emit('shutdown');

    const response = await request(app).get('/readyz').expect(503);
    expect(response.body).toEqual({ status: 'not-ready', reason: 'shutdown in progress' });
  });

  it('rejects new non-health requests during shutdown', async () => {
    app.emit('shutdown');

    const response = await request(app).get('/plugin/ping').expect(503);

    expect(response.body.error).toBe('Server is shutting down');
    expect(response.headers.connection).toBe('close');
  });

  it('composes plugin routes', async () => {
    const response = await request(app).get('/plugin/ping').expect(200);
    expect(response.body).toEqual({ pong: true });
  });

  it('returns deterministic structured 404 JSON', async () => {
    const response = await request(app).get('/missing').expect(404);

    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Cannot find /missing',
        statusCode: 404,
      },
    });
  });

  it('returns deterministic structured 500 JSON', async () => {
    const response = await request(app).get('/plugin/error').expect(500);

    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        statusCode: 500,
      },
    });
  });
});
