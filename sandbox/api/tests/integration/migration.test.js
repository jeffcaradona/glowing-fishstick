/**
 * @module api/tests/integration/migration
 * @description Integration tests for the database schema migration system.
 *
 * Tests cover:
 * - Fresh database gets CHECK constraints immediately (base schema)
 * - Migration v1 upgrades old-schema databases and CHECK constraints are enforced
 * - Migration v1 pre-validation catches bad data and throws with details
 * - Migrations are idempotent (re-running is a no-op)
 * - Rollback on failure leaves schema unchanged
 *
 * WHY: Migrations run at startup before traffic. These tests verify that both
 * fresh installs and upgrades produce a correctly constrained schema, and that
 * data violations are caught before any schema change.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../src/database/db.js';

/**
 * Old schema — no CHECK constraints. Simulates a database created before
 * the migration system was introduced.
 */
const OLD_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    description TEXT,
    done        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`;

/**
 * Helper to create an in-memory database with the old (unconstrained) schema.
 * WHY: In-memory databases isolate tests and avoid filesystem cleanup.
 */
function createOldSchemaDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(OLD_SCHEMA_SQL);
  return db;
}

/**
 * Helper to create an in-memory database with the new (constrained) schema,
 * simulating a fresh install that already has CHECK constraints.
 */
function createFreshDb() {
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
  return db;
}

// Stub logger that captures messages for assertion.
function createTestLogger() {
  const messages = [];
  return {
    info: (msg) => messages.push({ level: 'info', msg }),
    error: (obj, msg) => messages.push({ level: 'error', msg }),
    messages,
  };
}

describe('Database Migration System', () => {
  let db;

  afterEach(() => {
    try {
      db?.close();
    } catch {
      // Already closed or never opened — safe to ignore.
    }
  });

  // --- Fresh install (no migrations needed for schema, but migration should still run) ---

  describe('fresh database with new base schema', () => {
    beforeEach(() => {
      db = createFreshDb();
    });

    it('applies migration v1 on a fresh empty database', () => {
      const logger = createTestLogger();
      runMigrations(db, logger);

      // Verify schema_versions was created and v1 recorded.
      const versions = db.prepare('SELECT version FROM schema_versions ORDER BY version').all();
      expect(versions.map((r) => r.version)).toContain(1);
    });

    it('enforces CHECK constraints after migration on fresh database', () => {
      runMigrations(db, null);

      // Title too long should fail.
      expect(() => {
        db.prepare('INSERT INTO tasks (title) VALUES (?)').run('x'.repeat(256));
      }).toThrow();

      // Description too long should fail.
      expect(() => {
        db.prepare('INSERT INTO tasks (title, description) VALUES (?, ?)').run(
          'ok',
          'y'.repeat(4001),
        );
      }).toThrow();

      // done outside 0/1 should fail.
      expect(() => {
        db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)').run('ok', 2);
      }).toThrow();

      // Valid data should succeed.
      db.prepare('INSERT INTO tasks (title, description, done) VALUES (?, ?, ?)').run(
        'Valid',
        'Desc',
        1,
      );
      const row = db.prepare('SELECT * FROM tasks WHERE title = ?').get('Valid');
      expect(row).toBeTruthy();
    });
  });

  // --- Upgrade path (old schema → migration → constrained) ---

  describe('upgrade from old schema (no CHECK constraints)', () => {
    beforeEach(() => {
      db = createOldSchemaDb();
    });

    it('migrates old schema and adds CHECK constraints', () => {
      // Insert valid data under old schema.
      db.prepare('INSERT INTO tasks (title, description, done) VALUES (?, ?, ?)').run(
        'Task 1',
        'A description',
        0,
      );

      const logger = createTestLogger();
      runMigrations(db, logger);

      // Verify the migration was recorded.
      const versions = db.prepare('SELECT version FROM schema_versions ORDER BY version').all();
      expect(versions.map((r) => r.version)).toContain(1);

      // Verify existing data survived the rebuild.
      const tasks = db.prepare('SELECT * FROM tasks').all();
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Task 1');

      // Verify CHECK constraints are now enforced.
      expect(() => {
        db.prepare('INSERT INTO tasks (title) VALUES (?)').run('x'.repeat(256));
      }).toThrow();
    });

    it('preserves all columns and data during table rebuild', () => {
      db.prepare(
        'INSERT INTO tasks (title, description, done, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ).run('Rebuild test', 'Keep my data', 1, '2025-01-01 00:00:00', '2025-06-15 12:00:00');

      runMigrations(db, null);

      const task = db.prepare('SELECT * FROM tasks WHERE title = ?').get('Rebuild test');
      expect(task.description).toBe('Keep my data');
      expect(task.done).toBe(1);
      expect(task.created_at).toBe('2025-01-01 00:00:00');
      expect(task.updated_at).toBe('2025-06-15 12:00:00');
    });
  });

  // --- Pre-migration validation catches violations ---

  describe('pre-migration validation (bad data)', () => {
    beforeEach(() => {
      db = createOldSchemaDb();
    });

    it('throws on oversized title with sample IDs', () => {
      db.prepare('INSERT INTO tasks (title) VALUES (?)').run('x'.repeat(300));
      db.prepare('INSERT INTO tasks (title) VALUES (?)').run('Valid title');

      expect(() => runMigrations(db, null)).toThrow(/title.*max 255 characters.*1 record/);
    });

    it('throws on oversized description with sample IDs', () => {
      db.prepare('INSERT INTO tasks (title, description) VALUES (?, ?)').run(
        'ok',
        'd'.repeat(5000),
      );

      expect(() => runMigrations(db, null)).toThrow(/description.*max 4000 characters.*1 record/);
    });

    it('throws on invalid done values', () => {
      db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)').run('ok', 99);

      expect(() => runMigrations(db, null)).toThrow(/done.*must be 0 or 1.*1 record/);
    });

    it('includes fix instructions in error message', () => {
      db.prepare('INSERT INTO tasks (title) VALUES (?)').run('x'.repeat(300));

      try {
        runMigrations(db, null);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err.message).toContain('Fix the data manually');
        expect(err.message).toContain('Option A:');
        expect(err.message).toContain('Option B:');
        expect(err.message).toContain('api/data/tasks.db');
      }
    });

    it('includes multiple violation categories in one error', () => {
      db.prepare('INSERT INTO tasks (title, description, done) VALUES (?, ?, ?)').run(
        'x'.repeat(300),
        'd'.repeat(5000),
        42,
      );

      try {
        runMigrations(db, null);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err.message).toContain('title');
        expect(err.message).toContain('description');
        expect(err.message).toContain('done');
      }
    });

    it('rolls back on validation failure — schema unchanged', () => {
      db.prepare('INSERT INTO tasks (title) VALUES (?)').run('x'.repeat(300));

      expect(() => runMigrations(db, null)).toThrow();

      // Confirm no schema_versions entries were committed.
      // WHY: schema_versions table is created before migration runs, but
      // the version INSERT is inside the rolled-back transaction.
      const versions = db.prepare('SELECT * FROM schema_versions').all();
      expect(versions.length).toBe(0);

      // Old schema should still allow unconstrained data (no CHECK added).
      db.prepare('INSERT INTO tasks (title) VALUES (?)').run('y'.repeat(500));
      const count = db.prepare('SELECT count(*) AS cnt FROM tasks').get();
      expect(count.cnt).toBe(2);
    });
  });

  // --- Idempotency ---

  describe('idempotency', () => {
    it('skips already-applied migrations on subsequent runs', () => {
      db = createOldSchemaDb();
      db.prepare('INSERT INTO tasks (title) VALUES (?)').run('Keep me');

      runMigrations(db, null);
      runMigrations(db, null); // Second run should be a no-op.

      const versions = db.prepare('SELECT * FROM schema_versions').all();
      expect(versions.length).toBe(1);

      const tasks = db.prepare('SELECT * FROM tasks').all();
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Keep me');
    });
  });
});
