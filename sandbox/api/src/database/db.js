/**
 * @module api/database/db
 * @description SQLite database factory using node:sqlite (Node.js built-in).
 *
 * open()  → call in a startup hook (before traffic arrives)
 * close() → call in a shutdown hook
 * getDb() → returns the live DatabaseSync handle for use in services
 *
 * Includes a version-tracked migration system that runs at startup. Each
 * migration executes inside a transaction, validates existing data before
 * schema changes, and fails loudly on constraint violations so operators
 * can fix data manually.
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the SQLite file kept under api/data/. */
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'tasks.db');

/**
 * Idempotent base schema — fresh installs get CHECK constraints immediately.
 * WHY: New databases should start with the latest constraints; migrations
 * handle upgrading pre-existing databases without them.
 */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL CHECK(length(title) <= 255),
    description TEXT    CHECK(length(description) <= 4000),
    done        INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`;

/**
 * Schema version tracking table — records which migrations have been applied.
 * WHY: Enables idempotent startup; already-applied migrations are skipped.
 */
const SCHEMA_VERSIONS_SQL = `
  CREATE TABLE IF NOT EXISTS schema_versions (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    description TEXT
  );
`;

/**
 * Ordered array of migrations. Each has a numeric version, human-readable
 * description, and an `up` function that receives the DatabaseSync handle.
 *
 * WHY: Declarative migration list makes it easy to add future schema changes
 * while keeping the execution engine generic.
 *
 * VERIFY IF CHANGED: Adding a new migration? Append to this array with the
 * next sequential version number. Never modify an already-applied migration.
 */
const MIGRATIONS = [
  {
    version: 1,
    description:
      'Add CHECK constraints to tasks table (title ≤255, description ≤4000, done IN 0/1)',
    up(db) {
      // --- Pre-migration validation ---
      // WHY: Scan existing data BEFORE altering schema so we can fail with
      // actionable diagnostics instead of silently corrupting or losing data.
      const violations = [];

      const longTitles = db
        .prepare('SELECT id, length(title) AS len FROM tasks WHERE length(title) > 255')
        .all();
      if (longTitles.length > 0) {
        const samples = longTitles
          .slice(0, 3)
          .map((r) => `id=${r.id}, length=${r.len}`)
          .join(' | ');
        violations.push(
          `  title (max 255 characters): ${longTitles.length} record(s)\n    Samples: ${samples}`,
        );
      }

      const longDescs = db
        .prepare(
          'SELECT id, length(description) AS len FROM tasks WHERE length(description) > 4000',
        )
        .all();
      if (longDescs.length > 0) {
        const samples = longDescs
          .slice(0, 3)
          .map((r) => `id=${r.id}, length=${r.len}`)
          .join(' | ');
        violations.push(
          '  description (max 4000 characters): ' +
            `${longDescs.length} record(s)\n    Samples: ${samples}`,
        );
      }

      const badDone = db.prepare('SELECT id, done FROM tasks WHERE done NOT IN (0, 1)').all();
      if (badDone.length > 0) {
        const samples = badDone
          .slice(0, 3)
          .map((r) => `id=${r.id}, done=${r.done}`)
          .join(' | ');
        violations.push(
          `  done (must be 0 or 1): ${badDone.length} record(s)\n    Samples: ${samples}`,
        );
      }

      if (violations.length > 0) {
        // WHY: Fail-on-startup forces operator intervention — no silent data
        // loss, no surprise truncations. The error includes fix instructions.
        const msg = [
          'Migration v1 failed: existing data violates new constraints:',
          ...violations,
          '',
          'Fix the data manually:',
          '  Option A: DELETE FROM tasks WHERE length(title) > 255;',
          '  Option B: UPDATE tasks SET title = substr(title, 1, 255) WHERE length(title) > 255;',
          'Then restart the app to retry migration.',
          'Or delete api/data/tasks.db for a fresh start.',
        ].join('\n');
        throw new Error(msg);
      }

      // --- Schema rebuild using SQLite 12-step pattern ---
      // WHY: SQLite does not support ALTER TABLE ADD CONSTRAINT; the official
      // approach is to create a new table, copy data, drop old, rename new.
      db.exec(`
        CREATE TABLE tasks_new (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          title       TEXT    NOT NULL CHECK(length(title) <= 255),
          description TEXT    CHECK(length(description) <= 4000),
          done        INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
          created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO tasks_new SELECT * FROM tasks;
        DROP TABLE tasks;
        ALTER TABLE tasks_new RENAME TO tasks;
      `);
    },
  },
];

/**
 * Run pending migrations inside individual transactions.
 *
 * WHY: Each migration is all-or-nothing — if validation or schema changes fail,
 * ROLLBACK leaves the database unchanged so the operator can fix data and retry.
 *
 * TRADEOFF: Table rebuilds acquire brief exclusive locks; on large tables this
 * may take seconds. Acceptable because migrations run at startup before traffic.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} [logger] - Optional Pino-compatible logger
 */
export function runMigrations(db, logger) {
  // Ensure the version tracking table exists before querying it.
  db.exec(SCHEMA_VERSIONS_SQL);

  // WHY: Determine the highest applied version so we can skip already-applied
  // migrations. Coalesce to 0 for a fresh database.
  const { maxVersion } = db
    .prepare('SELECT COALESCE(MAX(version), 0) AS maxVersion FROM schema_versions')
    .get();

  const pending = MIGRATIONS.filter((m) => m.version > maxVersion);

  for (const migration of pending) {
    logger?.info(`Running migration v${migration.version} — ${migration.description}`);

    db.exec('BEGIN TRANSACTION');
    try {
      migration.up(db);

      // Record the applied migration so it is skipped on future startups.
      db.prepare('INSERT INTO schema_versions (version, description) VALUES (?, ?)').run(
        migration.version,
        migration.description,
      );

      db.exec('COMMIT');
      logger?.info(`Migration v${migration.version} applied successfully`);
    } catch (err) {
      db.exec('ROLLBACK');
      logger?.error({ err }, `Migration v${migration.version} failed — rolled back`);
      throw err;
    }
  }
}

/**
 * Create a SQLite database handle.
 *
 * @param {object} config - Frozen app config (used for logger).
 * @returns {{ open: Function, close: Function, getDb: Function }}
 */
export const createDatabase = (config) => {
  const logger = config.logger;
  let db = null;

  /**
   * Open the database file, apply WAL mode, run the schema, execute pending
   * migrations, and run a health-check query.
   *
   * WHY: Synchronous SQLite calls are acceptable here — this runs at startup
   * before traffic arrives (allowed exception per AGENTS-readable.md).
   */
  const open = () => {
    db = new DatabaseSync(DB_PATH);

    // WAL mode: readers don't block writers and vice-versa.
    db.exec('PRAGMA journal_mode = WAL');

    // Apply base schema — CREATE TABLE IF NOT EXISTS is idempotent.
    db.exec(SCHEMA_SQL);

    // Run pending migrations (idempotent; skips already-applied versions).
    runMigrations(db, logger);

    // Verify the database is operational before accepting traffic.
    const row = db.prepare('SELECT 1 AS health').get();
    if (row?.health !== 1) {
      throw new Error('SQLite health check failed — database may be corrupt or locked');
    }

    logger?.info({ dbPath: DB_PATH }, 'SQLite database ready');
  };

  /**
   * Close the database connection gracefully.
   * Safe to call during a shutdown hook.
   */
  const close = () => {
    if (db) {
      db.close();
      db = null;
      logger?.info('SQLite database closed');
    }
  };

  /**
   * Return the live DatabaseSync handle.
   * Throws if called before open().
   *
   * @returns {import('node:sqlite').DatabaseSync}
   */
  const getDb = () => {
    if (!db) {
      throw new Error('Database not initialized — open() must be called in a startup hook first');
    }
    return db;
  };

  return { open, close, getDb };
};
