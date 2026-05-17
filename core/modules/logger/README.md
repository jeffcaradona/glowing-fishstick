# @glowing-fishstick/logger

Winston-based structured logging module for glowing-fishstick applications. Provides a configured Winston logger with dev/prod modes and an Express request-logging middleware. All exports use **native Winston call signature**: `logger.info(message, meta)`.

## Install

```sh
npm install @glowing-fishstick/logger
```

No additional peer dependencies are required. `winston` is bundled as a runtime dependency.

## Exports

| Export                | Description                                                                            |
| --------------------- | -------------------------------------------------------------------------------------- |
| `createLogger`        | Creates a Winston logger with dev/prod modes; optional JSON file transport, redaction. |
| `createRequestLogger` | Express middleware for structured request/response logging with request ID tracking.   |

## Configuration

### `createLogger(options?)`

Creates a configured Winston logger instance.

**Options** (`LoggerOptions`):

| Property     | Type                  | Default                           | Description                                                                                              |
| ------------ | --------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `name`       | string                | `'app'`                           | Logger name (emitted as `name` in meta; also used for file naming).                                      |
| `level`      | string                | `'info'` (or `LOG_LEVEL` env var) | Minimum log level: `error` \| `warn` \| `info` \| `http` \| `verbose` \| `debug` \| `silly`.             |
| `logDir`     | string                | `process.cwd()/logs`              | Directory for log files (only when `enableFile` is true).                                                |
| `enableFile` | boolean               | `false`                           | Enable JSON file transport in non-production mode.                                                       |
| `redact`     | string[]              | `[]`                              | Dotted paths inside meta to mask with `'[REDACTED]'` (e.g. `['req.headers.authorization', 'password']`). |
| `transports` | `winston.transport[]` | (none)                            | Override transports entirely. When provided, Console/File defaults are NOT constructed. Tests use this.  |

**Returns**: Winston `Logger` instance.

- **Development** (`NODE_ENV !== 'production'`): colorized printf console output. When `enableFile=true`, a JSON file transport is also added at `<logDir>/<name>.log`.
- **Production**: JSON to stdout only (for container log collectors).
- **Test** (`NODE_ENV='test'`): colorize is disabled to keep test output clean.

### `createRequestLogger(logger, options?)`

Creates an Express middleware for request/response logging.

**Arguments**:

- `logger` — Winston logger instance (from `createLogger()`).
- `options` (`RequestLoggerOptions`):
  - `generateRequestId` (boolean, default `true`) — Auto-generate UUIDs; also reads from `x-request-id` header.

**Returns**: Express `RequestHandler` middleware that logs incoming requests and outgoing responses with timing, status, and request ID.

## Usage

### Application logger

```js
import { createLogger } from '@glowing-fishstick/logger';

const logger = createLogger({ name: 'my-api', level: 'info' });

logger.info('Server starting');
logger.error('Something went wrong', { err });
```

In development, logs are colorized and printed to stdout. In production (`NODE_ENV=production`), JSON is written to stdout only.

### Redaction

```js
const logger = createLogger({
  name: 'my-api',
  redact: ['req.headers.authorization', 'password'],
});

logger.info('login attempt', { req: { headers: { authorization: 'Bearer abc' } } });
// → req.headers.authorization is replaced with '[REDACTED]'
```

### Custom transports (tests)

```js
import winston from 'winston';
import { createLogger } from '@glowing-fishstick/logger';

const logger = createLogger({
  name: 'test',
  transports: [new winston.transports.Console({ silent: true })],
});
```

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
