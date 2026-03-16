# @glowing-fishstick/api

Express 5 API factory for the glowing-fishstick framework. Composes a JSON-only
Express application with lifecycle hooks, request logging, built-in health and
metrics routes, and a plugin slot for consumer middleware and routes.

## Install

```sh
npm install @glowing-fishstick/api @glowing-fishstick/shared
```

## Quick Start

```js
import { createApi, createApiConfig } from '@glowing-fishstick/api';
import { createLogger, createServer } from '@glowing-fishstick/shared';

const logger = createLogger({ name: 'my-api' });
const config = createApiConfig({ appName: 'my-api', port: 3001, logger });

function helloPlugin(app, cfg) {
  app.get('/hello', (_req, res) => {
    res.json({ ok: true, appName: cfg.appName });
  });
}

const app = createApi(config, [helloPlugin]);
const { server, close } = createServer(app, config);

export { server, close };
```

## Consumer-Facing Contract

This package-level contract is meant to answer the practical question:
"What does `createApi()` do to my Express app, and what framework behavior can
my plugin rely on?" Consumers should not need monorepo access to understand the
runtime surface.

## Exports

| Package | Export | Signature | Description |
|---|---|---|---|
| `@glowing-fishstick/api` | `createApi` | `(config, plugins?) => Express app` | Builds the API app with framework middleware, routes, and plugin slot |
| `@glowing-fishstick/api` | `createApiConfig` | `(overrides?, env?) => frozen config` | Builds the frozen API config object with defaults, env layering, and `config.services` |
| `@glowing-fishstick/shared` | `createServer` | `(app, config) => { server, close, registerStartupHook, registerShutdownHook }` | Starts the HTTP server and runs lifecycle hooks |
| `@glowing-fishstick/shared` | `createLogger` | `(options?) => pino logger` | Structured logger factory typically injected into config |

## `createApiConfig(overrides?, env?)`

Returns a frozen config object. Key properties:

| Property | Type | Default | Description |
|---|---|---|---|
| `port` | `number` | `3001` | HTTP listen port |
| `nodeEnv` | `string` | `'development'` | Runtime environment |
| `appName` | `string` | `'api'` | Application name used in root metadata and logs |
| `appVersion` | `string` | `'0.0.0'` | Service version returned by the root metadata route |
| `frameworkVersion` | `string` | package version | Framework version embedded by the config factory |
| `enableRequestLogging` | `boolean` | `true` | Enable request/response logging when `logger` is present |
| `allowProcessExit` | `boolean` | `true` | Allow `createServer()` to exit the process on SIGTERM/SIGINT |
| `shutdownTimeout` | `number` | `30000` | Graceful shutdown timeout in milliseconds |
| `blockBrowserOrigin` | `boolean` | `false` | Reject non-health requests that include an `Origin` header |
| `requireJwt` | `boolean` | `false` | Require bearer JWTs on non-health requests |
| `jwtSecret` | `string` | `''` | JWT secret used when `requireJwt` is enabled |
| `jwtExpiresIn` | `string` | `'120s'` | Token lifetime for shared JWT helpers |
| `jsonBodyLimit` | `string` | `'100kb'` | Maximum JSON request body size |
| `urlencodedBodyLimit` | `string` | `'100kb'` | Maximum URL-encoded request body size |
| `urlencodedParameterLimit` | `number` | `1000` | Maximum URL-encoded parameter count |
| `adminRateLimitWindowMs` | `number` | `60000` | Metrics rate-limit window |
| `adminRateLimitMax` | `number` | `60` | Max metrics requests per window |
| `logger` | `pino logger` | `undefined` | Optional logger injected into the app and request logging |
| `services` | `ServiceContainer` | auto-created | Dependency-injection container for plugin-owned services |

## `config.services` - ServiceContainer

`createApiConfig()` automatically creates `config.services`. Use it to register
and share plugin-owned infrastructure like database handles, clients, caches,
and service wrappers instead of relying on module-level singletons.

| Method | Signature | Description |
|---|---|---|
| `register` | `(name, provider, opts?) => void` | Register a singleton or transient provider |
| `registerValue` | `(name, value, opts?) => void` | Register a prebuilt singleton value |
| `resolve` | `(name) => Promise<instance>` | Resolve a service; singleton instances are cached |
| `has` | `(name) => boolean` | Check whether a service is registered |
| `keys` | `() => string[]` | List registered service names |
| `dispose` | `() => Promise<void>` | Dispose initialized singleton services in LIFO order |

Lifecycle options:

- `'singleton'` is the default and caches the first resolved instance.
- `'transient'` creates a fresh instance for every `resolve()`.

Example:

```js
function servicesPlugin(app, config) {
  config.services.register(
    'vault',
    async () => connectToVault(config.vaultUrl),
    { dispose: (client) => client.close() },
  );

  app.registerStartupHook(async () => {
    await config.services.resolve('vault');
  });

  app.registerShutdownHook(async () => {
    await config.services.dispose();
  });
}
```

## Middleware Stack

`createApi()` mounts framework-managed middleware in this order:

```text
[framework] request ID middleware
[framework] request logger (only when config.logger is present and logging is enabled)
[framework] express.json / express.urlencoded body parsers
[framework] health routes
[framework] enforcement middleware
[framework] metrics throttle
[framework] metrics routes
[framework] shutdown gate
[framework] index route
----------- plugin slot -------------------------------------------------------
consumer middleware and routes registered by plugins
-------------------------------------------------------------------------------
[framework] notFoundHandler
[framework] errorHandler
```

Layer behavior:

| Layer | What It Does |
|---|---|
| Request ID | Sets `req.id` from a safe inbound `x-request-id` or generates a new UUID |
| Request logger | Logs request/response pairs through the configured root logger |
| Body parsers | Enforces `jsonBodyLimit`, `urlencodedBodyLimit`, and `urlencodedParameterLimit` |
| Health routes | Mounts `GET /healthz`, `GET /readyz`, and `GET /livez` before enforcement |
| Enforcement | Applies optional Origin blocking and optional JWT verification to non-health routes |
| Metrics throttle | Protects `/metrics/memory` and `/metrics/runtime` from burst traffic |
| Shutdown gate | Returns `503` for new requests after graceful shutdown begins |
| Not found / error handlers | Return stable JSON error responses |

## Built-In Routes

| Route | Method | Response | Notes |
|---|---|---|---|
| `/` | `GET` | `{ name, version, frameworkVersion, status }` | Root metadata route |
| `/healthz` | `GET` | `{ status: 'ok' }` | Health |
| `/readyz` | `GET` | `{ status: 'ready' }` or `503 { status: 'not-ready', reason }` | Readiness flips during shutdown |
| `/livez` | `GET` | `{ status: 'alive' }` | Liveness |
| `/metrics/memory` | `GET` | `{ status, memoryUsage }` | Protected by enforcement and throttle |
| `/metrics/runtime` | `GET` | `{ status, nodeVersion, uptimeSeconds }` | Protected by enforcement and throttle |

## Request and Response Contract

Inside plugin middleware and route handlers, the framework currently guarantees:

| Object | Property | Type | Description |
|---|---|---|---|
| `req` | `id` | `string` | Sanitized request ID |
| `req` | `untrustedRequestId` | `string \| undefined` | Raw inbound header value when the supplied request ID is rejected as unsafe |
| `res` | `x-request-id` header | response header | Mirrors `req.id` for client-side correlation |

Current non-features consumers should not rely on:

- The framework does not attach `req.log`.
- The framework does not add convenience responders like `res.ok(data)`.
- The framework does not expose a request-scoped child logger on `req`.

If plugin code needs logging, use `config.logger` or a service resolved from
`config.services`.

## Error Handling Contract

Plugins should pass failures to `next(err)`. The framework returns a stable
JSON envelope:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Cannot find /missing",
    "statusCode": 404
  }
}
```

Consumer errors may provide:

- `statusCode`: HTTP status to return
- `code`: machine-readable error code
- `isOperational`: whether the message is safe to expose to clients

Non-operational errors are logged and returned with a safe normalized message.
Stack traces are not included in API responses.

## Lifecycle Hooks

The Express app returned by `createApi()` exposes:

| Method | Signature | When It Runs | Notes |
|---|---|---|---|
| `app.registerStartupHook` | `(fn) => void` | During `createServer(app, config)` startup, before `server.listen()` | App-level hooks run before entry-point server hooks |
| `app.registerShutdownHook` | `(fn) => void` | During graceful shutdown, before `server.close()` | App-level hooks run before entry-point server hooks |

Hook behavior:

- Hooks execute in FIFO order.
- Errors in one hook are logged and do not stop later hooks from running.
- Hooks are attached by `createApi()`, but they execute only when the app is
  paired with `createServer()` from `@glowing-fishstick/shared`.

## Lifecycle Example

```js
function databasePlugin(app, config) {
  config.services.register(
    'db',
    async () => openDatabase(config.databaseUrl),
    { dispose: (db) => db.close() },
  );

  app.registerStartupHook(async () => {
    await config.services.resolve('db');
  });

  app.registerShutdownHook(async () => {
    await config.services.dispose();
  });

  app.get('/records', async (_req, res, next) => {
    try {
      const db = await config.services.resolve('db');
      res.json(await db.findAll());
    } catch (err) {
      next(err);
    }
  });
}
```

## License

MIT
