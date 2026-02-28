/**
 * @module app/services/tasks-api
 * @description HTTP client for the tasks REST API.
 * Uses the native fetch built into Node.js >= 22 — no extra dependencies.
 *
 * When config.jwtSecret is set, the client pre-generates a JWT token at
 * factory time and rotates it every 90 seconds (well before the 120s default
 * TTL). The rotation timer is cleared via a registered shutdown hook so it
 * does not hold the event loop open after the server begins draining.
 */
import { setInterval, clearInterval } from 'node:timers';
import { generateToken } from '@glowing-fishstick/shared';

/**
 * @param {object} config - Frozen app config containing `apiUrl` and optionally
 *   `jwtSecret` / `jwtExpiresIn`.
 * @param {import('express').Express} [app] - Express app instance used to register
 *   the rotation-timer shutdown hook. Required when `jwtSecret` is set.
 * @returns {{ getTasks, createTask, toggleTask, deleteTask }}
 */
export const createTasksApiClient = (config, app) => {
  const base = config.apiUrl;
  const { jwtSecret, jwtExpiresIn = '120s' } = config;

  // Token state lives in closure — read on each request, written by rotateToken.
  let currentToken = null;
  let rotationTimer = null;

  if (jwtSecret) {
    const rotateToken = () => {
      currentToken = generateToken(jwtSecret, jwtExpiresIn);
    };

    // Pre-generate before the first request.
    rotateToken();

    // Rotate 90 s before expiry so requests always carry a fresh token.
    rotationTimer = setInterval(rotateToken, 90_000);

    // Stop the timer when the server starts draining — prevents unnecessary
    // post-shutdown work and allows the event loop to drain naturally.
    app?.registerShutdownHook(async () => {
      clearInterval(rotationTimer);
      rotationTimer = null;
    });
  }

  /** Build auth headers from the current closure token. */
  const authHeaders = () => (currentToken ? { Authorization: `Bearer ${currentToken}` } : {});

  /** @returns {Promise<{ tasks: object[] }>} */
  const getTasks = async () => {
    const res = await fetch(`${base}/api/tasks`, { headers: authHeaders() });
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
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
    const res = await fetch(`${base}/api/tasks/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`DELETE /api/tasks/${id} failed: ${res.status}`);
    }
  };

  return { getTasks, createTask, toggleTask, deleteTask };
};
