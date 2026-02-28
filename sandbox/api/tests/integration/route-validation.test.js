/**
 * @module api/tests/integration/route-validation
 * @description Integration tests for route-level input validation.
 *
 * Tests verify that POST/PATCH/GET/DELETE routes return 400 for invalid input
 * (oversized fields, bad IDs) and 201/200/204 for valid input.
 *
 * WHY: Application-level validation is the primary defense layer giving
 * user-friendly errors before data reaches SQLite. These tests confirm
 * the validation module is correctly wired into routes.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { createApi, createApiConfig } from '@glowing-fishstick/api';
import { createTasksService } from '../../src/services/tasks-service.js';
import { taskApiRoutes } from '../../src/routes/router.js';
import { LIMITS } from '../../src/validation/task-validation.js';

/**
 * Build a minimal API app with an in-memory SQLite database and the
 * task routes wired in. No server listening — Supertest handles that.
 *
 * WHY: In-memory database is fast, isolated, and requires no cleanup.
 */
function createTestApp() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL CHECK(length(title) <= 255),
      description TEXT    CHECK(length(description) <= 4000),
      done        INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const getDb = () => db;
  const tasksService = createTasksService(getDb);

  // WHY: Use createApi factory with a plugin that mounts task routes so we
  // get the full middleware stack (JSON parsing, error handling, etc.).
  const config = createApiConfig({ nodeEnv: 'test', appName: 'validation-test' }, {});

  const app = createApi(config, [
    (api) => {
      api.use(taskApiRoutes(tasksService));
    },
  ]);

  return { app, db };
}

describe('Route Input Validation', () => {
  let app;
  let db;

  beforeAll(() => {
    ({ app, db } = createTestApp());
  });

  afterAll(() => {
    db.close();
  });

  // ---------- POST /api/tasks ----------

  describe('POST /api/tasks', () => {
    it('creates a task with valid input', async () => {
      const res = await request(app).post('/api/tasks').send({ title: 'Valid task' }).expect(201);

      expect(res.body.title).toBe('Valid task');
      expect(res.body.id).toBeGreaterThan(0);
    });

    it('returns 400 for missing title', async () => {
      const res = await request(app).post('/api/tasks').send({}).expect(400);

      expect(res.body.error).toMatch(/title/);
    });

    it('returns 400 for empty title', async () => {
      const res = await request(app).post('/api/tasks').send({ title: '' }).expect(400);

      expect(res.body.error).toMatch(/title/);
    });

    it('returns 400 for title exceeding max length', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'a'.repeat(LIMITS.TITLE_MAX + 1) })
        .expect(400);

      expect(res.body.error).toMatch(/title.*max length/);
    });

    it('returns 400 for description exceeding max length', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'ok', description: 'x'.repeat(LIMITS.DESCRIPTION_MAX + 1) })
        .expect(400);

      expect(res.body.error).toMatch(/description.*max length/);
    });

    it('returns 400 for non-string title', async () => {
      const res = await request(app).post('/api/tasks').send({ title: 42 }).expect(400);

      expect(res.body.error).toMatch(/title/);
    });
  });

  // ---------- GET /api/tasks/:id ----------

  describe('GET /api/tasks/:id', () => {
    it('returns 400 for invalid id', async () => {
      const res = await request(app).get('/api/tasks/abc').expect(400);
      expect(res.body.error).toMatch(/id.*positive integer/);
    });

    it('returns 400 for negative id', async () => {
      const res = await request(app).get('/api/tasks/-1').expect(400);
      expect(res.body.error).toMatch(/id/);
    });

    it('returns 404 for non-existent id', async () => {
      const res = await request(app).get('/api/tasks/999999').expect(404);
      expect(res.body.error).toBe('Task not found');
    });

    it('returns a task for valid existing id', async () => {
      // Create a task first.
      const created = await request(app)
        .post('/api/tasks')
        .send({ title: 'Fetchable' })
        .expect(201);

      const res = await request(app).get(`/api/tasks/${created.body.id}`).expect(200);
      expect(res.body.title).toBe('Fetchable');
    });
  });

  // ---------- PATCH /api/tasks/:id ----------

  describe('PATCH /api/tasks/:id', () => {
    let taskId;

    beforeAll(async () => {
      const res = await request(app).post('/api/tasks').send({ title: 'To patch' }).expect(201);
      taskId = res.body.id;
    });

    it('returns 400 for invalid id', async () => {
      const res = await request(app).patch('/api/tasks/abc').send({ title: 'New' }).expect(400);

      expect(res.body.error).toMatch(/id/);
    });

    it('returns 400 for oversized title', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${taskId}`)
        .send({ title: 'a'.repeat(LIMITS.TITLE_MAX + 1) })
        .expect(400);

      expect(res.body.error).toMatch(/title.*max length/);
    });

    it('returns 400 for oversized description', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${taskId}`)
        .send({ description: 'x'.repeat(LIMITS.DESCRIPTION_MAX + 1) })
        .expect(400);

      expect(res.body.error).toMatch(/description/);
    });

    it('returns 400 for invalid done value', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${taskId}`)
        .send({ done: 'yes' })
        .expect(400);

      expect(res.body.error).toMatch(/done/);
    });

    it('updates with valid partial data', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${taskId}`)
        .send({ title: 'Patched' })
        .expect(200);

      expect(res.body.title).toBe('Patched');
    });
  });

  // ---------- DELETE /api/tasks/:id ----------

  describe('DELETE /api/tasks/:id', () => {
    it('returns 400 for invalid id', async () => {
      const res = await request(app).delete('/api/tasks/abc').expect(400);
      expect(res.body.error).toMatch(/id/);
    });

    it('returns 404 for non-existent id', async () => {
      await request(app).delete('/api/tasks/999999').expect(404);
    });

    it('deletes with valid id', async () => {
      const created = await request(app)
        .post('/api/tasks')
        .send({ title: 'To delete' })
        .expect(201);

      await request(app).delete(`/api/tasks/${created.body.id}`).expect(204);

      // Confirm it's actually gone.
      await request(app).get(`/api/tasks/${created.body.id}`).expect(404);
    });
  });
});
