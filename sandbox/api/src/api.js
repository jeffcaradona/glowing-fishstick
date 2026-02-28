/**
 * @module api/api
 * @description API plugin registration for local consumer workspace.
 *
 * Wires together:
 *  - createDatabase  → opens/closes the node:sqlite file in api/data/tasks.db
 *  - createTasksService → CRUD over the database
 *  - taskApiRoutes   → REST handlers mounted on the Express app
 */

import { createDatabase } from './database/db.js';
import { createTasksService } from './services/tasks-service.js';
import { taskApiRoutes } from './routes/router.js';

/**
 * @param {import('express').Express} app
 * @param {object} config
 */
export function taskApiPlugin(app, config) {
  const logger = config.logger;

  // Build the database and service handles. The DB file is not opened
  // yet — that happens in the startup hook below (after the process is
  // ready but before the server starts accepting traffic).
  const db = createDatabase(config);
  const tasksService = createTasksService(db.getDb);

  app.registerStartupHook(async () => {
    db.open();
    logger?.info('Task API database ready');
  });

  app.registerShutdownHook(async () => {
    db.close();
    logger?.info('Task API database closed');
  });

  app.use(taskApiRoutes(tasksService));
}
