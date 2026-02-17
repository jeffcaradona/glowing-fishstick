import { Router } from 'express';

export function taskApiRoutes() {
  const router = Router();

  router.get('/api/tasks', (_req, res) => {
    res.json({
      tasks: [
        { id: 1, title: 'Ship core/api MVP', done: false },
        { id: 2, title: 'Write API integration tests', done: false },
      ],
    });
  });

  return router;
}
