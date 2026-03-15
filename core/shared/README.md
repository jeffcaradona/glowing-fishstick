# @glowing-fishstick/shared

> Shared compatibility layer and curated public API for the glowing-fishstick framework.

## Overview

This package contains shared code, utilities, and type definitions used by the core application module and other packages in the glowing-fishstick ecosystem. It also acts as the primary compatibility/public import boundary for logger utilities.

## Usage

Install via npm (when published):

```bash
npm install @glowing-fishstick/shared
```

Import shared utilities in your module:

```js
import { someUtility } from '@glowing-fishstick/shared';
```

## Exports

All public exports from `@glowing-fishstick/shared`:

### Server & Lifecycle

| Export | Description |
|---|---|
| `createServer(app, config)` | HTTP server factory with graceful shutdown and lifecycle hooks |
| `createHookRegistry()` | Generic hook registry for sequential async lifecycle execution (FIFO) |
| `storeRegistries(app, startup, shutdown)` | WeakMap-based private storage for app lifecycle registries |
| `attachHookRegistries(app)` | Create and attach startup/shutdown registries + register methods to an Express app |
| `createShutdownGate(app)` | Middleware that rejects new requests with 503 during graceful shutdown |

### Logging (re-exported from `@glowing-fishstick/logger`)

| Export | Description |
|---|---|
| `createLogger(options?)` | Pino logger factory — pretty-printed in dev, JSON in prod |
| `createRequestLogger(logger, options?)` | Express middleware for structured HTTP request/response logging |

### Request & Middleware

| Export | Description |
|---|---|
| `createRequestIdMiddleware()` | Generates UUID per request (or uses `x-request-id` header) |
| `createAdminThrottle({ windowMs, max, paths })` | Fixed-window rate-limiting middleware for expensive routes |

### Error Utilities

| Export | Description |
|---|---|
| `normalizeError(err)` | Normalize a thrown error into `{ statusCode, code, message }` |
| `resolveErrorLogger(req)` | Resolve logger from Express request context (falls back to `console.error`) |
| `logUnexpectedError(req, err, logFn, label?)` | Log non-operational errors with request context |

### Authentication (JWT)

| Export | Description |
|---|---|
| `generateToken(secret, expiresIn?)` | Generate a signed JWT token for service-to-service auth |
| `verifyToken(token, secret)` | Verify and decode a JWT token |
| `jwtAuthMiddleware(secret)` | Express middleware that validates bearer JWT tokens |

### Dependency Injection

| Export | Description |
|---|---|
| `createServiceContainer(options?)` | Lightweight DI container with singleton/transient lifecycles and LIFO disposal |
| `ServiceAlreadyRegisteredError` | Thrown when registering a duplicate service name |
| `ServiceNotFoundError` | Thrown when resolving an unregistered service |
| `ServiceCircularDependencyError` | Thrown when circular dependencies are detected during resolution |
| `ServiceResolutionError` | Thrown when a provider function fails during resolution |
| `ServiceDisposeError` | Thrown when a single service disposer fails |
| `ServiceAggregateDisposeError` | Thrown when multiple service disposers fail during `dispose()` |

### Formatting

| Export | Description |
|---|---|
| `formatUptime(seconds)` | Format seconds into human-readable uptime string (e.g., `"5m 23s"`) |

## Server Factory

```js
import { createServer } from '@glowing-fishstick/shared';
```

When consuming via `@glowing-fishstick/app`, `createServer` is re-exported for convenience.

## Logger

The package provides a Pino-based logger factory with environment-aware formatting:

`@glowing-fishstick/shared` is the recommended consumer import point for logger APIs. Implementation ownership is in `@glowing-fishstick/logger`.

```js
import { createLogger } from '@glowing-fishstick/shared';

// Create logger with defaults
const logger = createLogger({ name: 'my-service' });

logger.info('Server starting');
logger.error({ err: new Error('failure') }, 'Operation failed');
```

### Features

- **Development mode** (`NODE_ENV=development`):
  - Pretty-printed console output (colorized, human-readable)
  - JSON logs written to `./logs/<name>.log`
  - Automatic logs directory creation

- **Production mode**:
  - JSON-formatted logs to stdout for container log collection
  - No file logging (relies on external log aggregation)

### Configuration

```js
const logger = createLogger({
  name: 'my-app', // Logger name (default: 'app')
  logLevel: 'debug', // Min level: trace|debug|info|warn|error|fatal (default: 'info')
  logDir: './logs', // Log directory (default: process.cwd()/logs)
  enableFile: true, // Enable file logging in dev (default: true)
});
```

### HTTP Request Middleware

Optional middleware for logging HTTP requests and responses:

```js
import { createLogger, createRequestLogger } from '@glowing-fishstick/shared';

const logger = createLogger({ name: 'http' });
app.use(createRequestLogger(logger));
```

Logs include: method, pathname, status code, duration, and request ID.

### Request ID Middleware

Automatic request ID generation for distributed tracing:

```js
import { createRequestIdMiddleware } from '@glowing-fishstick/shared';

// Generates unique UUID for each request (or uses x-request-id header)
app.use(createRequestIdMiddleware());
```

**Built-in**: Request ID generation is automatically enabled in `createApp()`, and request logging is enabled by default. To disable:

```js
const config = createConfig({
  enableRequestLogging: false, // Disable HTTP logging
  logger,
});
```

## Service Container

```js
import { createServiceContainer } from '@glowing-fishstick/shared';

const services = createServiceContainer({ logger });

services.register('db', async (ctx) => {
  return await createPool(connectionString);
}, { dispose: (pool) => pool.close() });

const db = await services.resolve('db');
```

**Note:** Both `createConfig()` (`@glowing-fishstick/app`) and `createApiConfig()` (`@glowing-fishstick/api`) automatically create a `ServiceContainer` at `config.services`. Prefer using that container over creating your own.

## Documentation

See the main [glowing-fishstick documentation](../../README.md) for usage examples and details.

## License

MIT
