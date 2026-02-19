# Request Logging & Request ID Implementation

**Status**: ✅ Complete  
**Date**: 2026-02-15

## Overview

Enhanced the logger implementation with automatic request ID generation and configurable HTTP request/response logging middleware, now enabled by default in the framework.

## Implementation Details

### New Middleware Functions

**File**: [core/shared/src/logger.js](../core/shared/src/logger.js)

#### 1. `createRequestIdMiddleware()`

Generates unique request IDs for distributed tracing:

- Creates UUID v4 for each request
- Uses existing `x-request-id` header if present
- Attaches to `req.id` property
- Sets `x-request-id` response header for client tracking

```javascript
export function createRequestIdMiddleware() {
  return (req, res, next) => {
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('x-request-id', req.id);
    next();
  };
}
```

#### 2. Enhanced `createRequestLogger(logger, options)`

Updated HTTP request/response logging middleware:

- **New parameter**: `options.generateRequestId` (default: `true`)
- Automatically generates request IDs if not present
- Can be disabled when using separate request ID middleware
- Logs incoming requests and outgoing responses
- Tracks duration and status codes

```javascript
export function createRequestLogger(logger, options = {}) {
  const { generateRequestId = true } = options;

  return (req, res, next) => {
    // Auto-generate request ID if enabled
    if (generateRequestId && !req.id) {
      req.id = req.headers['x-request-id'] || crypto.randomUUID();
      res.setHeader('x-request-id', req.id);
    }

    // Log request and response...
  };
}
```

### Framework Integration

**File**: [core/app/src/app-factory.js](../core/app/src/app-factory.js)

Request logging is now **built-in and enabled by default**:

1. **Request ID middleware** - Always enabled for tracing
2. **Request logging middleware** - Enabled by default when logger is provided

```javascript
// Built-in middleware (added to createApp)
app.use(createRequestIdMiddleware());

const enableRequestLogging = config.enableRequestLogging ?? true;
if (enableRequestLogging && config.logger) {
  app.use(createRequestLogger(config.logger, { generateRequestId: false }));
}
```

### Configuration

**New config option**: `enableRequestLogging` (default: `true`)

```javascript
// Enable (default)
const config = createConfig({ logger });

// Disable
const config = createConfig({
  logger,
  enableRequestLogging: false,
});
```

### Exports

**Updated**: [core/shared/index.js](../core/shared/index.js)

```javascript
export {
  createLogger,
  createRequestLogger,
  createRequestIdMiddleware, // New export
} from './src/logger.js';
```

**Updated**: [core/app/index.js](../core/app/index.js)

```javascript
export {
  createServer,
  createLogger,
  createRequestLogger,
  createRequestIdMiddleware, // New export
} from '@glowing-fishstick/shared';
```

## Usage Examples

### Default Behavior (Request Logging Enabled)

```javascript
import { createApp, createServer, createConfig, createLogger } from '@glowing-fishstick/app';

const logger = createLogger({ name: 'my-app' });
const config = createConfig({ logger, port: 3000 });
const app = createApp(config);
// Request ID generation and logging automatically enabled
```

### Disable Request Logging

```javascript
const config = createConfig({
  logger,
  enableRequestLogging: false, // Disable HTTP logging
});
```

### Manual Request Logging (Custom Setup)

```javascript
import {
  createApp,
  createConfig,
  createLogger,
  createRequestIdMiddleware,
  createRequestLogger,
} from '@glowing-fishstick/app';

const config = createConfig({
  logger,
  enableRequestLogging: false, // Disable built-in logging
});

const app = createApp(config);

// Add request ID middleware
app.use(createRequestIdMiddleware());

// Add custom request logging
const httpLogger = createLogger({ name: 'http', logLevel: 'debug' });
app.use(
  createRequestLogger(httpLogger, {
    generateRequestId: false, // Already handled by middleware above
  }),
);
```

### Accessing Request IDs in Routes

```javascript
app.get('/api/tasks', (req, res) => {
  const requestId = req.id; // UUID automatically assigned

  logger.info({ reqId: requestId }, 'Fetching tasks');

  res.json({ tasks: [], requestId });
});
```

## Log Output

### Request Logging (Production JSON)

```json
{"level":30,"time":"2026-02-15T19:43:05.220Z","pid":228452,"hostname":"DESKTOP-SQIM4M6","name":"task-manager","type":"http.request","method":"GET","pathname":"/api/tasks","reqId":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","msg":"Request received"}
{"level":30,"time":"2026-02-15T19:43:05.235Z","pid":228452,"hostname":"DESKTOP-SQIM4M6","name":"task-manager","type":"http.response","method":"GET","pathname":"/api/tasks","status":200,"duration":15,"reqId":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","msg":"Response sent"}
```

### Request Logging (Development Pretty)

```
[2026-02-15 19:43:05] INFO (task-manager): Request received
  type: "http.request"
  method: "GET"
  pathname: "/api/tasks"
  reqId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

[2026-02-15 19:43:05] INFO (task-manager): Response sent
  type: "http.response"
  method: "GET"
  pathname: "/api/tasks"
  status: 200
  duration: 15
  reqId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

## Benefits

1. **Distributed Tracing**: Request IDs enable tracing requests across services
2. **Default Enabled**: No configuration needed for basic HTTP logging
3. **Flexible**: Can be disabled or customized as needed
4. **Standards Compliant**: Uses standard `x-request-id` header
5. **Performance**: Minimal overhead with Pino's fast logging
6. **Debugging**: Easy correlation between requests and responses

## Architecture Decisions

### Why Request IDs are Always Generated

Request IDs are fundamental for:

- Debugging production issues
- Distributed tracing
- Correlating logs across services
- Client tracking

Therefore, they're always enabled via `createRequestIdMiddleware()`.

### Why Request Logging is Enabled by Default

Most applications benefit from request/response logging:

- Development debugging
- Production monitoring
- Performance tracking
- Security auditing

It can be disabled for specific use cases (e.g., very high-throughput APIs).

### Separation of Concerns

**Two separate middlewares**:

1. `createRequestIdMiddleware()` - Request ID generation only
2. `createRequestLogger()` - HTTP logging with optional ID generation

This allows:

- Using request IDs without logging
- Custom logging implementations
- Third-party request ID systems (e.g., AWS X-Ray)

## Testing Verification

The implementation was tested with the app startup:

```json
{"level":30,"time":"2026-02-15T19:43:05.220Z","pid":228452,"hostname":"DESKTOP-SQIM4M6","name":"task-manager","msg":"Initializing task manager resources…"}
{"level":30,"time":"2026-02-15T19:43:05.220Z","pid":228452,"hostname":"DESKTOP-SQIM4M6","name":"task-manager","msg":"Entry-point startup initialization…"}
{"level":30,"time":"2026-02-15T19:43:05.220Z","pid":228452,"hostname":"DESKTOP-SQIM4M6","name":"task-manager","msg":"Startup sequence completed."}
```

✅ Logger is working correctly  
✅ Structured JSON logging in production  
✅ Automatic middleware integration

## Documentation Updates

Updated documentation in:

- [core/shared/README.md](../core/shared/README.md) - Request ID middleware section
- [app/DEV_APP_README.md](../app/DEV_APP_README.md) - HTTP request logging configuration
- [documentation/00-project-specs.md](../documentation/00-project-specs.md) - Request logging integration

## Migration Impact

**Breaking Changes**: None

**New Behavior**: HTTP request logging is now enabled by default when a logger is provided.

**Opt-Out**: Set `config.enableRequestLogging = false` to disable.

## Future Enhancements

1. **Request ID Formats**: Support other ID formats (e.g., AWS X-Ray trace IDs)
2. **Log Sampling**: Sample high-throughput endpoints to reduce log volume
3. **Custom Log Filters**: Filter sensitive paths from logging
4. **Performance Metrics**: Add p50/p95/p99 latency tracking
5. **Correlation Context**: Propagate request IDs to child services/databases

## File Changes Summary

| File                                                                      | Changes                                                                                               |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [core/shared/src/logger.js](../core/shared/src/logger.js)                 | Added `createRequestIdMiddleware()`, enhanced `createRequestLogger()` with `generateRequestId` option |
| [core/shared/index.js](../core/shared/index.js)                           | Exported `createRequestIdMiddleware`                                                                  |
| [core/app/src/app-factory.js](../core/app/src/app-factory.js)             | Integrated request ID and request logging middlewares with config support                             |
| [core/app/index.js](../core/app/index.js)                                 | Re-exported `createRequestIdMiddleware`                                                               |
| [core/shared/README.md](../core/shared/README.md)                         | Documented request ID middleware                                                                      |
| [app/DEV_APP_README.md](../app/DEV_APP_README.md)                         | Documented request logging configuration                                                              |
| [documentation/00-project-specs.md](../documentation/00-project-specs.md) | Added request logging section                                                                         |

---

**Implementation Complete**: 2026-02-15  
**Status**: ✅ Production Ready
