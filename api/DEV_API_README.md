# API - Local Development Guide

> Using the `api/` directory for local development and testing

This document explains how to use the `api/` directory to run the local JSON API workspace. It demonstrates how a consuming API service would use `@glowing-fishstick/api` in production while composing custom plugin routes.

> **Current Next Work**: Security hardening is the immediate next milestone. The plan adds API payload-limit config (`API_JSON_BODY_LIMIT`, `API_URLENCODED_BODY_LIMIT`, `API_URLENCODED_PARAMETER_LIMIT`). See [documentation/SECURITY-HARDENING-PLAN.md](../documentation/SECURITY-HARDENING-PLAN.md).

---

## Overview

The `api/` directory simulates a real consumer API service that depends on the core `@glowing-fishstick/api` package. It demonstrates:

- How to compose the API factory with custom plugin routes
- How to provide API-specific configuration overrides
- How to attach startup and shutdown hooks for resource lifecycle
- How a thin `server.js` entrypoint boots the composed API

In production, a consumer would install published packages and import by package name:

```bash
npm install @glowing-fishstick/api @glowing-fishstick/shared
```

```js
import { createApi, createApiConfig } from '@glowing-fishstick/api';
import { createServer } from '@glowing-fishstick/shared';
```

For local development in this repository, workspace package linkage resolves those package names to local workspaces.

---

## Directory Structure

```text
api/
|-- DEV_API_README.md          # This file
|-- package.json               # Workspace metadata/scripts
|-- data/
|   |-- DATA.md                # Data notes
|   `-- tasks.db               # Local SQLite file (created/updated at runtime)
`-- src/
    |-- server.js              # Entrypoint - composes and boots API
    |-- api.js                 # API plugin registration
    |-- config/
    |   `-- env.js             # API-specific config overrides
    |-- database/
    |   `-- db.js              # SQLite factory (open/close/getDb)
    |-- services/
    |   `-- tasks-service.js   # Task CRUD service
    `-- routes/
        `-- router.js          # Task REST routes
```

---

## Running the API

### 1. Install Dependencies

From the repository root:

```bash
npm install
```

### 2. Start the API Server

Option A: Standard mode

```bash
npm run start:api
```

Option B: Development mode (auto-restart)

```bash
npm run dev:api
```

This runs:

```bash
nodemon --watch src --watch ../core/api/src --watch ../core/shared/src --ext js,mjs,cjs,json,eta src/server.js
```

### 3. Access the API

Default base URL:

- `http://localhost:3001`

Core routes:

- `GET /` - API metadata and status
- `GET /healthz` - health
- `GET /readyz` - readiness
- `GET /livez` - liveness
- `GET /metrics/memory` - process memory metrics
- `GET /metrics/runtime` - runtime metrics

Task routes from the local plugin:

- `GET /api/tasks`
- `GET /api/tasks/:id`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`

---

## How It Works

### Entry Point: `api/src/server.js`

The local entrypoint imports the workspace package by name:

```js
import { createApi, createApiConfig } from '@glowing-fishstick/api';
import { createServer, createLogger } from '@glowing-fishstick/shared';
import { taskApiPlugin } from './api.js';
import { appOverrides } from './config/env.js';

const logger = createLogger({ name: 'task-api' });
const config = createApiConfig({ ...appOverrides, logger });
const app = createApi(config, [taskApiPlugin]);
const { server, close } = createServer(app, config);

export { server, close };
```

Key points:

1. Imports `@glowing-fishstick/api` by package name
2. Builds config with API-specific overrides
3. Composes plugin routes via `createApi(config, [taskApiPlugin])`
4. Boots with shared `createServer()` for lifecycle handling

### Plugin: `api/src/api.js`

The plugin wires database, service, and routes:

- Creates the database handle (`createDatabase(config)`)
- Creates the task service from `getDb`
- Opens DB in a startup hook
- Closes DB in a shutdown hook
- Mounts task REST routes

### Database Lifecycle: `api/src/database/db.js`

The local API uses `node:sqlite` with a file at `api/data/tasks.db`.

Startup (`open()`):

- Opens SQLite file
- Enables WAL mode
- Applies schema (`CREATE TABLE IF NOT EXISTS`)
- Runs a health query before traffic

Shutdown (`close()`):

- Closes DB handle cleanly

---

## Environment Variables

Create `.env` in the repository root:

```env
PORT=3001
NODE_ENV=development
APP_NAME=glowing-fishstick-tasks-api
APP_VERSION=1.0.0
ENABLE_REQUEST_LOGGING=true
ALLOW_PROCESS_EXIT=true
SHUTDOWN_TIMEOUT=30000
API_BLOCK_BROWSER_ORIGIN=false
API_REQUIRE_JWT=false
JWT_SECRET=replace-with-random-secret
JWT_EXPIRES_IN=120s
```

Notes:

- `API_REQUIRE_JWT=true` requires `JWT_SECRET`.
- `API_BLOCK_BROWSER_ORIGIN=true` rejects non-health requests that include an `Origin` header.
- Health routes stay available even when enforcement is enabled.
- Upcoming hardening keys tracked in the current plan: `API_JSON_BODY_LIMIT`, `API_URLENCODED_BODY_LIMIT`, `API_URLENCODED_PARAMETER_LIMIT`.

---

## Testing and Validation

From repository root:

```bash
npm run test:api
npm run lint
```

Quick manual checks:

```bash
curl http://localhost:3001/readyz
curl http://localhost:3001/api/tasks
curl http://localhost:3001/metrics/runtime
```

---

## Troubleshooting

### API will not start

Check if port 3001 is already in use:

```powershell
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
```

Run on a different port:

```powershell
$env:PORT=3002; npm run start:api
```

### JWT enforcement returns 401

If `API_REQUIRE_JWT=true`, send `Authorization: Bearer <token>` and ensure `JWT_SECRET` matches token signer.

### Task data appears stale

The SQLite database file is persisted at `api/data/tasks.db`. Remove it only if you intentionally want a clean local dataset.

---

## Related Documentation

- [Main README](../README.md)
- [App Development README](../app/DEV_APP_README.md)
- [Project Specification](../documentation/00-project-specs.md)
