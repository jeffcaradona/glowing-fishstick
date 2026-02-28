/**
 * @module api/routes/router
 * @description Task CRUD REST API routes.
 *
 * GET    /api/tasks        → list all tasks
 * POST   /api/tasks        → create a task
 * GET    /api/tasks/:id    → get a single task
 * PATCH  /api/tasks/:id    → update a task (partial or full)
 * DELETE /api/tasks/:id    → delete a task
 *
 * All routes validate input at the application layer before touching the
 * database. ID-bearing routes validate `:id`; POST/PATCH validate body fields.
 */

import { Router } from 'express';
import { validateTaskInput, validateId } from '../validation/task-validation.js';

/**
 * @param {ReturnType<import('../services/tasks-service.js').createTasksService>} tasksService
 * @returns {import('express').Router}
 */
export function taskApiRoutes(tasksService) {
  const router = Router();

  // GET /api/tasks — list all tasks
  router.get('/api/tasks', (_req, res, next) => {
    try {
      const tasks = tasksService.findAll();
      res.json({ tasks });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/tasks/:id — get a single task
  router.get('/api/tasks/:id', (req, res, next) => {
    try {
      // WHY: Validate ID format before querying the database to return a
      // clear 400 instead of a confusing NaN-based empty result.
      const idResult = validateId(req.params.id);
      if (!idResult.valid) {
        return res.status(400).json({ error: idResult.error });
      }

      const task = tasksService.findById(idResult.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json(task);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/tasks — create a task
  router.post('/api/tasks', (req, res, next) => {
    try {
      // WHY: Application-level validation gives user-friendly 400 errors
      // before data reaches SQLite CHECK constraints (defense in depth).
      const { valid, errors } = validateTaskInput(req.body);
      if (!valid) {
        return res.status(400).json({ error: errors.join('; ') });
      }

      const { title, description } = req.body;

      // WHY: Explicit type guard satisfies static analysis (Snyk) even though
      // validateTaskInput already rejects non-string titles above.
      const safeName = typeof title === 'string' ? title.trim() : '';
      const task = tasksService.create({
        title: safeName,
        description: description ?? null,
      });
      res.status(201).json(task);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/tasks/:id — update a task (merges with existing fields)
  router.patch('/api/tasks/:id', (req, res, next) => {
    try {
      const idResult = validateId(req.params.id);
      if (!idResult.valid) {
        return res.status(400).json({ error: idResult.error });
      }

      const existing = tasksService.findById(idResult.id);
      if (!existing) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // WHY: partial=true so only provided fields are validated; missing
      // fields fall back to existing values (merge semantics for PATCH).
      const { valid, errors } = validateTaskInput(req.body, { partial: true });
      if (!valid) {
        return res.status(400).json({ error: errors.join('; ') });
      }

      const {
        title = existing.title,
        description = existing.description,
        done = existing.done,
      } = req.body ?? {};

      const task = tasksService.update(idResult.id, { title, description, done });
      res.json(task);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/tasks/:id — delete a task
  router.delete('/api/tasks/:id', (req, res, next) => {
    try {
      const idResult = validateId(req.params.id);
      if (!idResult.valid) {
        return res.status(400).json({ error: idResult.error });
      }

      const existing = tasksService.findById(idResult.id);
      if (!existing) {
        return res.status(404).json({ error: 'Task not found' });
      }
      tasksService.remove(idResult.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
