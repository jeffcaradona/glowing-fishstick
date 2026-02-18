/**
 * @module api/services/tasks-service
 * @description CRUD operations for the tasks table using node:sqlite.
 *
 * All methods are synchronous — SQLite operations on a local file are
 * sub-millisecond for typical task-list workloads and do not meaningfully
 * block the event loop for this demo scale.
 */

/**
 * @param {() => import('node:sqlite').DatabaseSync} getDb
 * @returns {{ findAll, findById, create, update, remove }}
 */
export const createTasksService = (getDb) => {
  /** Return all tasks, newest first. */
  const findAll = () =>
    getDb().prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();

  /**
   * Return a single task by id, or null if not found.
   * @param {number} id
   */
  const findById = (id) =>
    getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) ?? null;

  /**
   * Insert a new task and return the created row.
   * @param {{ title: string, description?: string }} data
   */
  const create = ({ title, description = null }) => {
    const result = getDb()
      .prepare('INSERT INTO tasks (title, description) VALUES (?, ?)')
      .run(title, description);
    // node:sqlite returns lastInsertRowid as BigInt — convert to Number for JSON.
    return findById(Number(result.lastInsertRowid));
  };

  /**
   * Update an existing task and return the updated row.
   * @param {number} id
   * @param {{ title: string, description?: string, done: boolean }} data
   */
  const update = (id, { title, description = null, done }) => {
    getDb()
      .prepare(
        `UPDATE tasks
         SET title = ?, description = ?, done = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(title, description, done ? 1 : 0, id);
    return findById(id);
  };

  /**
   * Delete a task by id.
   * @param {number} id
   */
  const remove = (id) => {
    getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
  };

  return { findAll, findById, create, update, remove };
};
