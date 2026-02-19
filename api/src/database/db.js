/**
 * @module api/database/db
 * @description SQLite database factory using node:sqlite (Node.js built-in).
 *
 * open()  → call in a startup hook (before traffic arrives)
 * close() → call in a shutdown hook
 * getDb() → returns the live DatabaseSync handle for use in services
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the SQLite file kept under api/data/. */
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'tasks.db');

/**
 * Idempotent schema. Run on every startup so the database is always
 * ready to hold data even on a fresh checkout.
 */
const SCHEMA_SQL = `
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
 * Create a SQLite database handle.
 *
 * @param {object} config - Frozen app config (used for logger).
 * @returns {{ open: Function, close: Function, getDb: Function }}
 */
export const createDatabase = (config) => {
  const logger = config.logger;
  let db = null;

  /**
   * Open the database file, apply WAL mode, run the schema, and run a
   * health-check query to confirm the file is readable and writable.
   * Safe to call during a startup hook (before the server accepts traffic).
   */
  const open = () => {
    db = new DatabaseSync(DB_PATH);

    // WAL mode: readers don't block writers and vice-versa.
    db.exec('PRAGMA journal_mode = WAL');

    // Apply schema — CREATE TABLE IF NOT EXISTS is idempotent.
    db.exec(SCHEMA_SQL);

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
