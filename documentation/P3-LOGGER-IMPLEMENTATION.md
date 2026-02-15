# P3: Logger Implementation Plan

**Status**: In Progress  
**Priority**: P3 (Enhancement)  
**Created**: 2026-02-15

## Overview

Replace all `console.*` calls across the monorepo with a centralized Pino-based logger that supports:

- Structured JSON logging for production environments
- Pretty-printed console output in development
- Optional file logging with automatic directory creation
- Pluggable HTTP request/response middleware
- Dependency injection via config with smart defaults

## Goals

1. **Replace console calls**: Eliminate 15+ console.\* calls across core infrastructure and consumer apps
2. **Log directory management**: Auto-create `logs/` directory in consumer app root (process.cwd())
3. **Environment-aware formatting**: JSON in production, pretty-print in development
4. **Optional injection**: Accept `config.logger` or create sensible Pino default
5. **Pluggable middleware**: Export optional HTTP request logging separately
6. **Documentation alignment**: Update all docs per workspace sync rules

## Current State Analysis

### Console Usage Inventory

| Location                                                                                | Count  | Context                                   |
| --------------------------------------------------------------------------------------- | ------ | ----------------------------------------- |
| [core/shared/src/server-factory.js](../core/shared/src/server-factory.js)               | 9      | Startup, shutdown, hook errors, lifecycle |
| [core/shared/src/hook-registry.js](../core/shared/src/hook-registry.js)                 | 1      | Hook execution errors                     |
| [core/app/src/middlewares/errorHandler.js](../core/app/src/middlewares/errorHandler.js) | 1      | Unexpected HTTP errors                    |
| [app/src/app.js](../app/src/app.js)                                                     | 2      | Plugin lifecycle hooks                    |
| [app/src/server.js](../app/src/server.js)                                               | 2      | Entry-point lifecycle                     |
| **Total**                                                                               | **15** | **Production-critical logging**           |

### Archived Logger Analysis

Two archived implementations exist but are not in use:

- **archived-logger.js**: Winston-based, file-centric, structured logging
- **archived-logger_alt.js**: Pino-based, stream-centric, container-friendly

**Decision**: Use Pino (archived-logger_alt.js as foundation) for:

- Superior performance (~10x faster than Winston)
- Native streaming support for containerized environments
- Built-in multistream for dev/prod differentiation
- Modern ecosystem and active maintenance

## Architecture

### Module Location

**File**: `core/shared/src/logger.js`  
**Rationale**: Shared infrastructure used by both core/app and consumer apps

### Public API

```javascript
// core/shared/index.js exports
export { createLogger, createRequestLogger } from './src/logger.js';
```

### Logger Factory Signature

```javascript
/**
 * Create a Pino logger instance.
 * @param {object} [options] - Configuration options
 * @param {string} [options.logLevel='info'] - Minimum log level (trace, debug, info, warn, error, fatal)
 * @param {string} [options.logDir] - Directory for log files (default: process.cwd()/logs)
 * @param {boolean} [options.enableFile=true] - Enable file logging in development
 * @param {string} [options.name='app'] - Logger name for context
 * @returns {import('pino').Logger} Pino logger instance
 */
export function createLogger(options = {})
```

### Request Middleware Signature

```javascript
/**
 * Create HTTP request/response logging middleware.
 * @param {import('pino').Logger} logger - Logger instance
 * @returns {Function} Express middleware
 */
export function createRequestLogger(logger)
```

## Implementation Steps

### Phase 1: Core Logger Creation

1. ✅ **Create `core/shared/src/logger.js`**
   - Port from archived-logger_alt.js
   - Add configurable options (logLevel, logDir, enableFile, name)
   - Development mode: multistream (pino-pretty stdout + JSON file)
   - Production mode: JSON to stdout only
   - Auto-create logs/ directory

2. ✅ **Install Pino dependencies**
   - Add `pino` to core/shared/package.json
   - Add `pino-pretty` as devDependency for pretty-printing

### Phase 2: Core Infrastructure Integration

3. ✅ **Update `core/shared/src/server-factory.js`**
   - Add logger injection via config: `config.logger || createLogger({ name: 'server' })`
   - Replace 9 console calls:
     - Startup sequence logs → `logger.info()`
     - Shutdown logs → `logger.info()`
     - Hook execution errors → `logger.error()`
     - Timeout warnings → `logger.warn()`

4. ✅ **Update `core/shared/src/hook-registry.js`**
   - Add optional logger parameter to `runHooks(hooks, logger)`
   - Replace console.error → `logger.error()` with hook context

5. ✅ **Update `core/app/src/middlewares/errorHandler.js`**
   - Accept logger via closure or config injection
   - Replace console.error → `logger.error()` for unexpected errors
   - Include request context (method, path, reqId)

### Phase 3: Consumer App Integration

6. ✅ **Update `app/src/app.js`**
   - Accept logger via config or create default
   - Replace 2 console.log calls in plugin hooks → `logger.info()`

7. ✅ **Update `app/src/server.js`**
   - Pass logger through config chain: `createApp(config)` → `createServer(app, config)`
   - Replace 2 console.log calls → `logger.info()`

### Phase 4: Public API & Exports

8. ✅ **Export from `core/shared/index.js`**

   ```javascript
   export { createLogger, createRequestLogger } from './src/logger.js';
   ```

9. ✅ **Update `core/shared/package.json`**
   - Add dependencies: `pino: ^9.0.0`, `pino-pretty: ^11.0.0` (devDependency)

### Phase 5: Documentation Updates

10. ✅ **Update `core/shared/README.md`**
    - Add Logger Factory section
    - Include usage examples (basic, custom config, request middleware)

11. ✅ **Update `app/DEV_APP_README.md`**
    - Replace console examples with logger examples
    - Show optional vs. default logger behavior

12. ✅ **Update `documentation/00-project-specs.md`**
    - Replace "Future Consideration" with actual implementation
    - Include consumer usage code example
    - Update public API reference

13. ✅ **Update `documentation/01-application-development.md`**
    - Replace all console.log plugin examples with logger
    - Show logger injection in plugin patterns

14. ✅ **Update `documentation/99-potential-gaps.md`**
    - Remove logger abstraction from gaps (now implemented)

## Usage Examples

### Basic (Default Logger)

```javascript
import { createApp, createServer } from '@glowing-fishstick/app';

const config = { port: 3000 };
const app = createApp(config);
const server = createServer(app, config);
// Logger auto-created with sensible defaults
```

### Custom Logger Configuration

```javascript
import { createApp, createServer, createLogger } from '@glowing-fishstick/app';

const logger = createLogger({
  logLevel: 'debug',
  logDir: './logs',
  name: 'my-service',
});

const config = { port: 3000, logger };
const app = createApp(config);
const server = createServer(app, config);
```

### With Request Logging Middleware

```javascript
import { createApp, createServer, createLogger, createRequestLogger } from '@glowing-fishstick/app';

const logger = createLogger({ name: 'http' });
const config = { port: 3000, logger };

const app = createApp(config);

// Add HTTP request/response logging
app.use(createRequestLogger(logger));

const server = createServer(app, config);
```

### In Plugin Hooks

```javascript
export function myPlugin(app, config) {
  const logger = config.logger || createLogger({ name: 'my-plugin' });

  app.registerStartupHook('my-plugin', async () => {
    logger.info('Initializing my plugin resources...');
    // setup code
  });

  app.registerShutdownHook('my-plugin', async () => {
    logger.info('Cleaning up my plugin resources...');
    // cleanup code
  });

  // ... plugin routes, middleware, etc.
}
```

## Log Output Formats

### Development (Pretty)

```
[2026-02-15 10:23:45] INFO (server/12345): Startup sequence completed
[2026-02-15 10:23:45] INFO (server/12345): Server listening on http://localhost:3000
[2026-02-15 10:23:47] ERROR (server/12345): Error in startup hook "db-connect"
    err: {
      "type": "MongoError",
      "message": "Connection refused"
    }
```

### Production (JSON)

```json
{"level":30,"time":1739615025000,"pid":12345,"hostname":"server","name":"server","msg":"Startup sequence completed"}
{"level":30,"time":1739615025100,"pid":12345,"hostname":"server","name":"server","port":3000,"msg":"Server listening on http://localhost:3000"}
{"level":50,"time":1739615027000,"pid":12345,"hostname":"server","name":"server","hook":"db-connect","err":{"type":"MongoError","message":"Connection refused"},"msg":"Error in startup hook"}
```

## Directory Structure Impact

```
glowing-fishstick/            # Monorepo root (not logged to)
├── app/                      # Consumer app
│   ├── logs/                 # ← Created at runtime (process.cwd() when app starts)
│   │   └── app.log           # Development JSON logs
│   ├── src/
│   │   ├── app.js            # Uses injected logger
│   │   └── server.js         # Passes logger via config
│   └── package.json
├── core/
│   ├── shared/
│   │   ├── src/
│   │   │   ├── logger.js     # ← New logger factory
│   │   │   ├── server-factory.js  # Uses injected logger
│   │   │   └── hook-registry.js   # Uses injected logger
│   │   ├── index.js          # Exports createLogger, createRequestLogger
│   │   └── package.json      # New dep: pino, pino-pretty
│   └── app/
│       └── src/
│           └── middlewares/
│               └── errorHandler.js  # Uses injected logger
└── documentation/
    └── P3-LOGGER-IMPLEMENTATION.md  # This document
```

## Testing Verification

### Manual Verification Steps

1. Start dev app: `npm start` (from app/)
   - Verify `logs/` directory created in app/
   - Verify pretty console output on startup
   - Verify JSON written to app/logs/app.log

2. Trigger error scenario:
   - Cause hook execution error
   - Verify structured error logging with context

3. Test graceful shutdown:
   - Send SIGTERM: `kill <pid>`
   - Verify shutdown logs emitted

4. Production mode test:
   ```bash
   NODE_ENV=production npm start
   ```

   - Verify JSON-only stdout (no file logging)
   - Verify no pretty-printing

### Automated Tests (Future)

- Unit tests for `createLogger()` with various configs
- Integration test for logger injection through config chain
- Smoke test for logs/ directory creation
- Snapshot test for log output formats

## Rollback Plan

If logger introduces issues:

1. **Immediate rollback**: Revert all commits related to P3-LOGGER-IMPLEMENTATION
2. **Quick fix**: Wrap logger calls with try-catch, fallback to console
3. **Partial rollback**: Keep logger in core/shared but delay consumer integration

## Success Criteria

- [ ] Zero `console.*` calls remain in core/shared/src, core/app/src, app/src (excluding client-side JS)
- [ ] `logs/` directory auto-created in consumer app root on first run
- [ ] Development mode shows pretty console + JSON file
- [ ] Production mode shows JSON stdout only
- [ ] All documentation examples updated per workspace sync rules
- [ ] No new Snyk vulnerabilities introduced
- [ ] All file paths in docs exist and are valid
- [ ] Integration tests pass (startup, shutdown, error handling)

## Dependencies

### New Package Dependencies

**core/shared/package.json:**

```json
{
  "dependencies": {
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "pino-pretty": "^11.0.0"
  }
}
```

**Rationale for versions:**

- Pino 9.x: Latest stable, ESM-native
- pino-pretty 11.x: Matches Pino 9.x compatibility

## Migration Notes for Consumers

### Breaking Changes

**None** (logger is optional with sensible defaults)

### Opt-In Migration

Existing apps continue working without changes. To enable custom logging:

```diff
// app/src/server.js
import { createApp, createServer } from '@glowing-fishstick/app';
+ import { createLogger } from '@glowing-fishstick/shared';

+ const logger = createLogger({ name: 'my-app', logLevel: 'debug' });
- const config = { port: 3000 };
+ const config = { port: 3000, logger };

const app = createApp(config);
```

## Future Enhancements

1. **Log rotation**: Integrate `pino-roll` or external rotation (logrotate)
2. **Remote logging**: Add transport for centralized logging (e.g., Datadog, Elasticsearch)
3. **Correlation IDs**: Automatic request ID generation and propagation
4. **Child loggers**: Scoped loggers per module/plugin with inherited context
5. **Sensitive data redaction**: Auto-redact passwords, tokens from logs
6. **Performance metrics**: Log startup/shutdown timing, hook execution duration
7. **Alerting hooks**: Integrate with monitoring systems (PagerDuty, Sentry)

## References

- Pino documentation: https://getpino.io/
- 00-project-specs.md: Logger abstraction gap (line 624)
- archived-logger_alt.js: Original Pino implementation
- Workspace alignment rules: .github/copilot-instructions.md

---

**Last Updated**: 2026-02-15  
**Author**: GitHub Copilot  
**Status**: Implementation in progress
