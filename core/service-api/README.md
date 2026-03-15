# @glowing-fishstick/api

Express 5 API factory for the glowing-fishstick framework. Composes a JSON-only Express application with lifecycle hooks, request logging, and a plugin architecture — no view engine or static file serving.

## Install

```sh
npm install @glowing-fishstick/api
```

## Usage

```js
import { createApi, createApiConfig } from '@glowing-fishstick/api';

const config = createApiConfig({ port: 3001 });

const myPlugin = (app, cfg) => {
  app.get('/hello', (_req, res) => res.json({ message: 'hello' }));
};

const app = createApi(config, [myPlugin]);

app.listen(config.port, () => {
  console.log(`API listening on port ${config.port}`);
});
```

## `createApiConfig(overrides?, env?)`

Returns a frozen config object. Key properties:

| Property | Type | Default | Description |
|---|---|---|---|
| `port` | `number` | `3001` | HTTP listen port |
| `nodeEnv` | `string` | `'development'` | Runtime environment |
| `appName` | `string` | `'api'` | Application name |
| `services` | `ServiceContainer` | auto-created | **Dependency injection container** (see below) |
| `enableRequestLogging` | `boolean` | `true` | Enable Pino HTTP request logging |
| `blockBrowserOrigin` | `boolean` | `false` | Reject requests with browser `Origin` header |
| `requireJwt` | `boolean` | `false` | Require JWT bearer tokens on all routes |
| `jwtSecret` | `string` | `''` | JWT signing/verification secret |
| `jwtExpiresIn` | `string` | `'120s'` | Token TTL |
| `jsonBodyLimit` | `string` | `'100kb'` | Max JSON body size |
| `shutdownTimeout` | `number` | `30000` | Graceful shutdown timeout (ms) |
| `adminRateLimitWindowMs` | `number` | `60000` | Rate-limit window (ms) |
| `adminRateLimitMax` | `number` | `60` | Max requests per window |

### `config.services` — ServiceContainer

`createApiConfig()` automatically creates a `ServiceContainer` (from `@glowing-fishstick/shared`) and attaches it as `config.services`. **Use this container for dependency injection instead of creating your own or using module-level singletons.**

```js
import { createApiConfig } from '@glowing-fishstick/api';

const config = createApiConfig({ port: 3001 });

// Register a service (e.g., database pool, external client)
config.services.register('vault', async (ctx) => {
  const client = await connectToVault();
  return client;
}, { dispose: (client) => client.close() });

// Resolve in a plugin or route handler
const myPlugin = async (app, cfg) => {
  app.get('/secrets', async (req, res) => {
    const vault = await cfg.services.resolve('vault');
    res.json(await vault.getCredentials());
  });
};
```

`ServiceContainer` methods: `register(name, provider, opts?)`, `registerValue(name, value, opts?)`, `resolve(name)`, `has(name)`, `keys()`, `dispose()`.

You can also pass your own container via `createApiConfig({ services: myContainer })`.

## Exports

| Export | Description |
|---|---|
| `createApi` | Factory that composes Express app with middleware, plugins, and routes |
| `createApiConfig` | Configuration factory with env-var layering and `ServiceContainer` |

## License

MIT
