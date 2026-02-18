/**
 * @module api/routes/router
 * @description Task CRUD REST API routes.
 *
 * GET    /api/tasks        → list all tasks
 * POST   /api/tasks        → create a task
 * GET    /api/tasks/:id    → get a single task
 * PATCH  /api/tasks/:id    → update a task (partial or full)
 * DELETE /api/tasks/:id    → delete a task
 */

import { Router } from 'express';

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
      const task = tasksService.findById(Number(req.params.id));
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
      const { title, description } = req.body ?? {};
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: '`title` is required' });
      }
      const task = tasksService.create({ title: title.trim(), description: description ?? null });
      res.status(201).json(task);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/tasks/:id — update a task (merges with existing fields)
  router.patch('/api/tasks/:id', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = tasksService.findById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const {
        title = existing.title,
        description = existing.description,
        done = existing.done,
      } = req.body ?? {};

      const task = tasksService.update(id, { title, description, done });
      res.json(task);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/tasks/:id — delete a task
  router.delete('/api/tasks/:id', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = tasksService.findById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Task not found' });
      }
      tasksService.remove(id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
