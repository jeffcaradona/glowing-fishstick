# App Template

Minimum viable consumer app template for `@glowing-fishstick/app`.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Core routes:

- `/`
- `/healthz`
- `/readyz`
- `/livez`
- `/admin`
- `/admin/config`

Template route:

- `/my-feature`

## Structure

```text
template/app/
  package.json
  src/
    server.js
    app.js
    config/env.js
    routes/router.js
    views/my-feature.ejs
    public/
```

## Notes

- `src/server.js` is a thin entrypoint using `createApp`, `createServer`, and `createConfig`.
- `src/app.js` is the plugin where app-specific routes and lifecycle hooks are registered.
- `npm run dev` watches template and core files (`core/app`, `core/shared`) including `.ejs`.
