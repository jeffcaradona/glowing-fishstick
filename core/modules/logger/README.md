# @glowing-fishstick/logger

Pino-based structured logging module for glowing-fishstick applications. Provides a configured Pino logger with dev/prod modes and an Express request-logging middleware.

## Install

```sh
npm install @glowing-fishstick/logger
```

In development mode, logs are pretty-printed using `pino-pretty`. Install it as a dev dependency in your project:

```sh
npm install -D pino-pretty
```

`pino-pretty` is declared as an optional peer dependency. Package managers may not warn if it is missing, but `createLogger` expects it to be installed in development; to avoid runtime errors and get pretty-printed logs, ensure `pino-pretty` is present in your devDependencies.

## Exports

| Export | Description |
| --- | --- |
| `createLogger` | Creates a Pino logger with dev/prod modes; file logging in dev, JSON to stdout in prod |
| `createRequestLogger` | Express middleware for structured request/response logging with request ID tracking |

## Configuration

### `createLogger(options?)`

Creates a configured Pino logger instance.

**Options** (`LoggerOptions`):

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | string | `'app'` | Logger name (used for file naming and context) |
| `logLevel` | string | `'info'` (or `LOG_LEVEL` env var) | Minimum log level: `trace` \| `debug` \| `info` \| `warn` \| `error` \| `fatal` |
| `logDir` | string | `process.cwd()/logs` | Directory for log files (dev mode only) |
| `enableFile` | boolean | `true` | Enable file logging in development mode |

**Returns**: Pino `Logger` instance with multistream output (pretty stdout + file logging in dev; JSON stdout in prod).

### `createRequestLogger(logger, options?)`

Creates an Express middleware for request/response logging.

**Arguments**:
- `logger` — Pino logger instance (from `createLogger()`)
- `options` (`RequestLoggerOptions`):
  - `generateRequestId` (boolean, default `true`) — Auto-generate UUIDs; also reads from `x-request-id` header

**Returns**: Express `RequestHandler` middleware that logs incoming requests and outgoing responses with timing, status, and request ID.

## Usage

### Application logger

```js
import { createLogger } from '@glowing-fishstick/logger';

const logger = createLogger({ name: 'my-api', logLevel: 'info' });

logger.info('Server starting');
logger.error({ err }, 'Something went wrong');
```

In development, logs are pretty-printed to stdout and written to `logs/<name>.log`. In production (`NODE_ENV=production`), JSON is written to stdout only.

### Express request middleware

```js
import express from 'express';
import { createLogger, createRequestLogger } from '@glowing-fishstick/logger';

const logger = createLogger({ name: 'my-api' });
const app = express();

app.use(createRequestLogger(logger));
```

Each request logs method, path, and response status with duration. Request IDs are read from `x-request-id` or auto-generated.

## License

MIT
