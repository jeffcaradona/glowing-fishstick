# @glowing-fishstick/shared

> Shared utilities and types for the glowing-fishstick framework.

## Overview

This package contains shared code, utilities, and type definitions used by the core application module and other packages in the glowing-fishstick ecosystem.

## Usage

Install via npm (when published):

```bash
npm install @glowing-fishstick/shared
```

Import shared utilities in your module:

```js
import { someUtility } from '@glowing-fishstick/shared';
```

Server factory:

This package contains the `createServer` factory used to start HTTP servers and provide graceful shutdown. Consumers may import it directly:

```js
import { createServer } from '@glowing-fishstick/shared';
```

When consuming via `@glowing-fishstick/app`, `createServer` is re-exported from `@glowing-fishstick/app` for convenience.

## Contents

- `server-factory.js` — HTTP server factory with graceful shutdown and lifecycle hooks
- `hook-registry.js` — Generic hook registry for sequential async lifecycle execution
- `registry-store.js` — WeakMap-based private storage for app lifecycle registries
- `logger.js` — Pino-based logger factory with development/production modes
- Common type definitions
- Reusable helpers for core/app and downstream modules

## Logger

The package provides a Pino-based logger factory with environment-aware formatting:

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
  name: 'my-app',           // Logger name (default: 'app')
  logLevel: 'debug',        // Min level: trace|debug|info|warn|error|fatal (default: 'info')
  logDir: './logs',         // Log directory (default: process.cwd()/logs)
  enableFile: true,         // Enable file logging in dev (default: true)
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

## Documentation

See the main [glowing-fishstick documentation](../../README.md) for usage examples and details.

## License

MIT
