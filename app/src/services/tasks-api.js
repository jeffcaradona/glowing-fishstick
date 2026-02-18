/**
 * @module app/services/tasks-api
 * @description HTTP client for the tasks REST API.
 * Uses the native fetch built into Node.js >= 22 — no extra dependencies.
 */

/**
 * @param {object} config - Frozen app config containing `apiUrl`.
 * @returns {{ getTasks, createTask, toggleTask, deleteTask }}
 */
export const createTasksApiClient = (config) => {
  const base = config.apiUrl;

  /** @returns {Promise<{ tasks: object[] }>} */
  const getTasks = async () => {
    const res = await fetch(`${base}/api/tasks`);
    if (!res.ok) {
      throw new Error(`GET /api/tasks failed: ${res.status}`);
    }
    return res.json();
  };

  /**
   * @param {{ title: string, description?: string }} data
   * @returns {Promise<object>}
   */
  const createTask = async ({ title, description }) => {
    const res = await fetch(`${base}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error ?? `POST /api/tasks failed: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return body;
  };

  /**
   * Toggle the done state of a task.
   * @param {number} id
   * @param {boolean} done
   * @returns {Promise<object>}
   */
  const toggleTask = async (id, done) => {
    const res = await fetch(`${base}/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done }),
    });
    if (!res.ok) {
      throw new Error(`PATCH /api/tasks/${id} failed: ${res.status}`);
    }
    return res.json();
  };

  /**
   * @param {number} id
   * @returns {Promise<void>}
   */
  const deleteTask = async (id) => {
    const res = await fetch(`${base}/api/tasks/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(`DELETE /api/tasks/${id} failed: ${res.status}`);
    }
  };

  return { getTasks, createTask, toggleTask, deleteTask };
};
