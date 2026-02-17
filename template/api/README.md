# API Template

Minimum viable consumer API template for `@glowing-fishstick/api`.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3001`.

Core API routes:

- `/`
- `/healthz`
- `/readyz`
- `/livez`
- `/metrics/memory`
- `/metrics/runtime`

Template API route:

- `/api/my-feature`

## Structure

```text
template/api/
  package.json
  src/
    server.js
    api.js
    config/env.js
    routes/router.js
```

## Notes

- `src/server.js` is the thin API entrypoint using `createApi`, `createApiConfig`, and `createServer`.
- `src/api.js` is the plugin where API-specific routes and lifecycle hooks are registered.
- `npm run dev` watches template and core files (`core/api`, `core/shared`).
