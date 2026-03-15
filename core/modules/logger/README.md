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
