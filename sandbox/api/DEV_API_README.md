# API - Local Development Guide

> Using the `sandbox/api/` directory for local development and testing

This document explains how to use the `sandbox/api/` directory to run the local JSON API workspace. It demonstrates how a consuming API service would use `@glowing-fishstick/api` in production while composing custom plugin routes.

> **Security Hardening**: Payload limits, metrics throttling, and error handler hardening are implemented. See [documentation/SECURITY-HARDENING-PLAN.md](../documentation/SECURITY-HARDENING-PLAN.md).

---

## Overview

The `sandbox/api/` directory simulates a real consumer API service that depends on the core `@glowing-fishstick/api` package. It demonstrates:

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
sandbox/api/
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
nodemon --watch src --watch ../core/service-api/src --watch ../core/shared/src --ext js,mjs,cjs,json,eta src/server.js
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

### Entry Point: `sandbox/api/src/server.js`

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

### Plugin: `sandbox/api/src/api.js`

The plugin wires database, service, and routes:

- Creates the database handle (`createDatabase(config)`)
- Creates the task service from `getDb`
- Opens DB in a startup hook
- Closes DB in a shutdown hook
- Mounts task REST routes

### Database Lifecycle: `sandbox/api/src/database/db.js`

The local API uses `node:sqlite` with a file at `sandbox/api/data/tasks.db`.

Startup (`open()`):

- Opens SQLite file
- Enables WAL mode
- Applies schema (`CREATE TABLE IF NOT EXISTS`)
- Runs a health query before traffic

Shutdown (`close()`):

- Closes DB handle cleanly

---

## Deployment Pattern: API as an Authenticated Proxy

### Use Case: Secure Proxying to Proxmox, Kubernetes, or Other Backends

The API can sit in front of an existing backend system (e.g., Proxmox cluster, Kubernetes API, ClickHouse, custom microservices) to provide authentication, payload limits, request logging, and rate-limiting without modifying the backend itself.

#### Agents Call the Proxy

**Instead of:**

```bash
# ❌ Direct agent access (no audit, no limits, risk)
curl -H "Authorization: Bearer proxmox-token" https://proxmox.internal:8006/api2/json/nodes
```

**Use:**

```bash
# ✅ Via glowing-fishstick API (audit log, payload limits, throttling)
curl http://localhost:3001/nodes
```

#### Configuration

Create a `.env.local` (or CI secrets) with appropriate settings based on your network:

**Option 1: Internal Agents (Same VPC, No JWT Required)**

```bash
# Agents are trusted; JWTs not needed
API_REQUIRE_JWT=false

# Block web browsers to prevent accidental access
API_BLOCK_BROWSER_ORIGIN=true

# Enforce payload limits to prevent OOM/amplification attacks
API_JSON_BODY_LIMIT=100kb
API_URLENCODED_BODY_LIMIT=100kb
API_URLENCODED_PARAMETER_LIMIT=1000

# Optional: rate-limit expensive operations
API_ADMIN_RATE_LIMIT_WINDOW_MS=60000
API_ADMIN_RATE_LIMIT_MAX=60
```

**Option 2: Strict Multi-Tenant (All Requests Require JWT)**

```bash
# All non-health endpoints require valid JWT
API_REQUIRE_JWT=true
JWT_SECRET=your-secret-from-vault
JWT_EXPIRES_IN=7d

# Allow browser requests (or block if only agents)
API_BLOCK_BROWSER_ORIGIN=false

# Payload limits
API_JSON_BODY_LIMIT=100kb
API_URLENCODED_BODY_LIMIT=100kb
```

**Option 3: Hybrid (JWT Optional, Origin Blocked)**

```bash
# JWT is optional; useful for self-hosted deployments
API_REQUIRE_JWT=false

# Only allow non-browser clients (agents, services, tools)
API_BLOCK_BROWSER_ORIGIN=true

# Payload limits
API_JSON_BODY_LIMIT=100kb
```

#### Wiring Proxmox Routes (Example)

In your API plugin (`sandbox/api/src/api.js`), register a route that proxies to Proxmox:

```javascript
import express from 'express';

export function setupProxmoxPlugin(app, config) {
  const router = express.Router();

  const proxmoxBaseUrl = config.proxmoxUrl || 'https://proxmox.internal:8006';
  const proxmoxApiToken = config.proxmoxApiToken; // from env/vault

  // WHY: Proxy GET /nodes to Proxmox with token auth
  // All requests are logged via req.log; payload limits enforced upstream
  router.get('/nodes', async (req, res, next) => {
    try {
      const response = await fetch(`${proxmoxBaseUrl}/api2/json/nodes`, {
        method: 'GET',
        headers: {
          Authorization: `PVEAPIToken=${proxmoxApiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Proxmox returned ${response.status}`,
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (err) {
      req.log.error({ err }, 'Proxmox /nodes request failed');
      next(err);
    }
  });

  // Similar proxies for other Proxmox endpoints
  // router.post('/nodes', ...)
  // router.delete('/nodes/:node', ...)

  app.use('/', router);
}
```

Then register in `sandbox/api/src/api.js`:

```javascript
import { taskApiPlugin } from './routes/tasks.js';
import { setupProxmoxPlugin } from './routes/proxmox.js';

export const plugins = [
  taskApiPlugin,
  setupProxmoxPlugin, // New proxy plugin
];
```

#### Environment Variables for Backend Config

Add to your config override (`sandbox/api/src/config/env.js`):

```javascript
export function apiConfigOverrides() {
  return {
    // Proxmox backend
    proxmoxUrl: process.env.PROXMOX_URL || 'https://proxmox.internal:8006',
    proxmoxApiToken: process.env.PROXMOX_API_TOKEN,

    // Or other backend
    backendUrl: process.env.BACKEND_URL,
    backendApiKey: process.env.BACKEND_API_KEY,
  };
}
```

#### Advantages of This Pattern

✅ **Audit Logging**: All requests and responses logged via Pino (structured, queryable)  
✅ **Payload Validation**: Oversized requests return `413` before reaching backend  
✅ **Resource Protection**: Requests throttled via fixed-window rate limits  
✅ **Request Tracing**: Built-in request IDs correlate logs across services  
✅ **Graceful Shutdown**: In-flight proxied requests drain before process exit  
✅ **No Backend Changes**: Existing backends (Proxmox, Kubernetes, etc.) remain untouched  
✅ **No Agent-Side Auth Logic**: Agents call the proxy; the proxy handles secrets  
✅ **Flexible Auth**: JWT toggle allows same deployment to serve internal agents or strict tenants

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
- Upcoming hardening keys tracked in the current plan: `API_JSON_BODY_LIMIT`, `API_URLENCODED_BODY_LIMIT`, `API_URLENCODED_PARAMETER_LIMIT`.\n These are now implemented with defaults of `100kb` / `100kb` / `1000`. See config table above.

### JWT Configuration Reference

The API supports optional JWT enforcement via environment variables:

| Env Var                    | Default | Behavior                                                                        |
| -------------------------- | ------- | ------------------------------------------------------------------------------- |
| `API_REQUIRE_JWT`          | `false` | If `true`, all non-health endpoints require valid JWT                           |
| `API_BLOCK_BROWSER_ORIGIN` | `false` | If `true`, reject requests with `Origin` header (prevents browser-based misuse) |
| `JWT_SECRET`               | (none)  | Secret key for signing/verifying JWTs; required if `API_REQUIRE_JWT=true`       |
| `JWT_EXPIRES_IN`           | `7d`    | JWT expiration duration                                                         |

**Example 1: Internal Proxy (No JWT Required)**

```bash
API_REQUIRE_JWT=false
API_BLOCK_BROWSER_ORIGIN=true
# Agents call API directly without tokens
```

**Example 2: Strict Access (JWT Required)**

```bash
API_REQUIRE_JWT=true
JWT_SECRET=super-secret-key-from-vault
# All non-health requests require `Authorization: Bearer <token>`
```

**Example 3: Hybrid (JWT Optional, Origin Blocked)**

```bash
API_REQUIRE_JWT=false
API_BLOCK_BROWSER_ORIGIN=true
# Agents or services can call the API. Browsers cannot.
```

Health endpoints (`/healthz`, `/readyz`, `/livez`) always bypass JWT and origin checks.

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

The SQLite database file is persisted at `sandbox/api/data/tasks.db`. Remove it only if you intentionally want a clean local dataset.

---

## Related Documentation

- [Main README](../README.md)
- [App Development README](../app/DEV_APP_README.md)
- [Project Specification](../documentation/00-project-specs.md)
