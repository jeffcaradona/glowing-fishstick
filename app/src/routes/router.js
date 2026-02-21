/**
 * @module app/routes/router
 * @description App-specific routes for the task_manager application.
 *
 * HTML-form-friendly pattern: all mutations use POST (no PUT/DELETE from
 * the browser) via method-override suffixes (/toggle, /delete).
 */

import { Router } from 'express';

/**
 * Create a router with task_manager routes.
 *
 * @param {object} config - Frozen app config.
 * @param {ReturnType<import('../services/tasks-api.js').createTasksApiClient>} tasksApiClient
 * @returns {import('express').Router}
 */
export function taskRoutes(config, tasksApiClient) {
  const router = Router();

  // GET /tasks - render task list
  router.get('/tasks', async (req, res, next) => {
    try {
      const { tasks } = await tasksApiClient.getTasks();
      res.render('tasks/list', {
        appName: 'Task Manager', //config.appName,
        tasks,
        error: req.query.error ?? null,
        styles: ['/css/tasks/list.css'],
        scripts: ['/js/tasks/list.js'],
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /tasks - create a new task, redirect back to list
  router.post('/tasks', async (req, res, next) => {
    try {
      const { title, description } = req.body ?? {};
      await tasksApiClient.createTask({ title, description });
      res.redirect('/tasks');
    } catch (err) {
      if (err.status === 400) {
        return res.redirect('/tasks?error=' + encodeURIComponent(err.message));
      }
      next(err);
    }
  });

  // POST /tasks/:id/toggle - flip the done flag, redirect back to list
  router.post('/tasks/:id/toggle', async (req, res, next) => {
    try {
      // done arrives as the string 'true' or 'false' from the hidden input.
      const done = req.body.done === 'true';
      await tasksApiClient.toggleTask(Number(req.params.id), done);
      res.redirect('/tasks');
    } catch (err) {
      next(err);
    }
  });

  // POST /tasks/:id/delete - delete a task, redirect back to list
  router.post('/tasks/:id/delete', async (req, res, next) => {
    try {
      await tasksApiClient.deleteTask(Number(req.params.id));
      res.redirect('/tasks');
    } catch (err) {
      next(err);
    }
  });

  return router;
}
