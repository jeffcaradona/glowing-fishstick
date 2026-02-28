# @glowing-fishstick/logger

Pino-based structured logging module for glowing-fishstick applications. Provides a configured Pino logger with dev/prod modes and an Express request-logging middleware.

## Install

```sh
npm install @glowing-fishstick/logger
```

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
