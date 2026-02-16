# Claude Code Instructions: glowing-fishstick

## Project Overview

**glowing-fishstick** is a proof-of-concept Express.js application framework distributed as versioned npm modules. It solves the "template drift" problem by allowing developers to `npm install` a composable, plugin-based framework instead of copy-pasting Express templates.

### Core Value Proposition
- Transform scattered Express templates into versioned npm dependencies
- Provide composable plugin architecture for extensibility
- Deliver production-ready features: graceful shutdown, health checks, structured logging
- Maintain functional programming principles and testability

## Repository Structure

This is a **monorepo workspace** with npm workspaces:

```
core/
├── app/           → @glowing-fishstick/app (main framework module)
├── shared/        → @glowing-fishstick/shared (infrastructure utilities)
└── api/           → @glowing-fishstick/api (API scaffolding, emerging)

app/               → Example consumer (task manager application)
api/               → API consumer example (scaffold phase)
template/          → Starter templates for new projects
tests/             → Integration and unit tests (Vitest)
documentation/     → Architecture docs, specs, implementation notes
```

### Package Boundaries (Critical)
- Root package is NOT runtime-installable
- Consumer examples MUST import from `@glowing-fishstick/app` or `@glowing-fishstick/shared`
- Never show examples importing from `../../index.js` unless marked "local-only"
- The `app/` directory demonstrates how external projects would consume the published modules

## Core Architecture Principles

### 1. Factory Pattern (Primary Design Pattern)
Every major component is created via factory functions, never classes:

```javascript
// Server with graceful shutdown
const server = createServer(app, config);

// Express app with middleware composition
const app = createApp(config, [plugins]);

// Immutable configuration
const config = createConfig(overrides, env);

// Structured logger
const logger = createLogger(config);

// Lifecycle hook registry
const registry = createHookRegistry();
```

**Why factories?**
- Testability through dependency injection
- Composability and reusability
- No `this` context complexity
- Explicit dependencies in function signatures

### 2. Plugin Architecture
Plugins extend core functionality without modifying core code:

```javascript
// Plugin contract: (app, config) => void
const myPlugin = (app, config) => {
  // Add routes
  app.use('/my-feature', myRouter);

  // Register lifecycle hooks
  app.registerStartupHook(async () => {
    // Initialize resources (DB, cache, etc.)
  });

  app.registerShutdownHook(async () => {
    // Cleanup resources
  });

  // Add navigation links (optional)
  app.locals.navigationLinks.push({
    href: '/my-feature',
    label: 'My Feature'
  });
};
```

**Plugin Guidelines:**
- Plugins are plain functions, not classes
- Accept `(app, config)` parameters
- Can register hooks, routes, middleware
- Execute in order after core routes, before 404 handler
- Keep plugins focused on single feature/domain

### 3. Lifecycle Hook Registry Pattern
Manages startup and shutdown sequences:

- **App-level hooks**: Registered by plugins for feature-specific initialization
- **Entry-point hooks**: Registered at server.js level for cross-cutting concerns
- **Execution order**: FIFO (first registered, first executed)
- **Error isolation**: Errors in one hook don't prevent subsequent hooks
- **Deferred startup**: `setImmediate()` prevents race conditions

**Example usage:**
```javascript
// In plugin
app.registerStartupHook(async () => {
  await connectDatabase();
});

// In server.js entry point
server.registerStartupHook(async () => {
  logger.info('Server starting...');
});
```

### 4. Graceful Shutdown (Kubernetes-ready)
Built-in production-ready shutdown sequence:

1. SIGTERM/SIGINT signal received
2. App emits 'shutdown' event
3. Health checks return 503 (not ready)
4. New requests rejected with 503
5. In-flight requests allowed to complete
6. Shutdown hooks execute (FIFO)
7. Server stops accepting connections
8. Timeout enforced (default 30s), lingering connections destroyed
9. Process exits

**Critical files:**
- [core/shared/src/server-factory.js](core/shared/src/server-factory.js) - Server creation with shutdown handling
- [tests/integration/graceful-shutdown.test.js](tests/integration/graceful-shutdown.test.js) - Test coverage

### 5. Functional Programming First
- Prefer pure functions over stateful classes
- Use immutable data structures (frozen config objects)
- Compose behavior through function composition
- Explicit dependencies via function parameters
- Avoid side effects where possible

**Exception:** `AppError` class exists for proper `instanceof` checks and stack traces. This is a pragmatic exception documented in the specs.

## Critical Constraints (Non-Negotiable)

### Event Loop Safety
**Never block the event loop in request-handling paths.**

❌ **Forbidden in routes/middleware/hooks during traffic:**
```javascript
const data = fs.readFileSync('/path/to/file');  // NEVER
const hash = crypto.pbkdf2Sync(password, salt); // NEVER
for (let i = 0; i < 1000000; i++) { /* ... */ } // NEVER (unbounded loops)
```

✅ **Required approach:**
```javascript
const data = await fs.promises.readFile('/path/to/file');
const hash = await crypto.pbkdf2(password, salt);
// Or delegate to worker threads for CPU-heavy work
```

**Allowed exceptions:**
- Startup-only initialization (before server accepts traffic)
- Build/dev scripts (not runtime code)
- Must be documented with comment explaining why it's safe

**Validation:**
```bash
rg -n "\b(readFileSync|writeFileSync|execSync|pbkdf2Sync)\b" app core api
```

### Async Consistency (Prevent Zalgo)
**Public APIs must be consistently async when they can perform async work.**

❌ **Anti-pattern:**
```javascript
function getData(callback) {
  if (cache.has(key)) {
    callback(null, cache.get(key));  // Synchronous
  } else {
    fetchData().then(data => callback(null, data));  // Asynchronous
  }
}
```

✅ **Correct pattern:**
```javascript
function getData(callback) {
  if (cache.has(key)) {
    setImmediate(() => callback(null, cache.get(key)));  // Always async
  } else {
    fetchData().then(data => callback(null, data));
  }
}
```

Or better yet, use Promises consistently:
```javascript
async function getData() {
  if (cache.has(key)) return cache.get(key);
  return await fetchData();
}
```

### V8 Optimization Awareness
- **Stable object shapes**: Initialize expected fields early, avoid adding/removing fields dynamically
- **Monomorphic call sites**: Avoid polymorphic patterns in hot paths
- **No dynamic code**: Avoid `eval`, `new Function`, `with` statements
- **Predictable serialization**: Keep JSON operations lean in hot paths

### Documentation Synchronization (Mandatory)
When changing package structure, exports, or public APIs, update ALL of:

1. [README.md](README.md) - Installation and import examples
2. [app/DEV_APP_README.md](app/DEV_APP_README.md) - Consumer usage patterns
3. [documentation/00-project-specs.md](documentation/00-project-specs.md) - API specifications
4. [documentation/99-potential-gaps.md](documentation/99-potential-gaps.md) - Implementation status

**Before completing documentation changes:**
- [ ] Verify every file path exists
- [ ] Verify every import specifier matches package boundaries
- [ ] Verify every code snippet uses current function/file names
- [ ] Run: `rg "from '../../index.js'" README.md app/DEV_APP_README.md documentation/*.md`

## Critical Files Reference

### Core Infrastructure
- [core/shared/src/server-factory.js](core/shared/src/server-factory.js) - HTTP server with graceful shutdown
- [core/shared/src/logger.js](core/shared/src/logger.js) - Pino structured logging
- [core/shared/src/hook-registry.js](core/shared/src/hook-registry.js) - Lifecycle management
- [core/shared/src/registry-store.js](core/shared/src/registry-store.js) - WeakMap-based privacy

### Application Framework
- [core/app/src/app-factory.js](core/app/src/app-factory.js) - Express app composition
- [core/app/src/config/env.js](core/app/src/config/env.js) - Configuration factory
- [core/app/src/errors/appError.js](core/app/src/errors/appError.js) - Error classes
- [core/app/src/middlewares/errorHandler.js](core/app/src/middlewares/errorHandler.js) - Error middleware

### Built-in Routes
- [core/app/src/routes/health.js](core/app/src/routes/health.js) - /healthz, /readyz, /livez
- [core/app/src/routes/admin.js](core/app/src/routes/admin.js) - Admin dashboard
- [core/app/src/routes/index.js](core/app/src/routes/index.js) - Landing page

### Consumer Examples
- [app/src/server.js](app/src/server.js) - Entry point demonstrating composition
- [app/src/app.js](app/src/app.js) - Task manager plugin implementation
- [app/src/config/env.js](app/src/config/env.js) - Consumer-specific config overrides

### Testing
- [tests/integration/graceful-shutdown.test.js](tests/integration/graceful-shutdown.test.js)
- [tests/integration/startup-hook-ordering.test.js](tests/integration/startup-hook-ordering.test.js)

## Testing Expectations

### Framework: Vitest + Supertest
```bash
npm test                  # Watch mode
npm run test:all          # Run all tests with verbose output
npm run test:integration  # Integration tests only
npm run test:unit         # Unit tests only (add as needed)
npm run test:smoke        # Smoke tests (add as needed)
```

### Test Requirements
- All new features require integration tests
- Test both success and error paths
- Test graceful shutdown behavior for new hooks
- Test startup hook ordering for initialization sequences
- Use Supertest for HTTP endpoint testing
- Mock external dependencies appropriately

### Coverage Goals
- Critical paths must have tests (graceful shutdown, hook ordering, error handling)
- Plugins should demonstrate testable patterns
- Tests should run quickly (< 5 seconds for full suite currently)

## Code Quality Tooling

### ESLint (Flat Config v10)
```bash
npm run lint
```

**Key rules:**
- Semicolons required
- Single quotes
- 100 character line width
- No unused variables
- Trailing commas (always-multiline)
- **Exception**: `no-param-reassign` disabled for `*-factory.js` files

### Prettier
```bash
npm run format
```

**Configuration:**
- 100 char print width
- 2-space indentation
- Single quotes
- Trailing commas (es5)
- Auto line endings

### Validation Commands
```bash
# Verify no sync blocking APIs in runtime code
rg -n "\b(readFileSync|writeFileSync|execSync|pbkdf2Sync|scryptSync)\b" app core api

# Check for anti-patterns
rg -n "res\.end\s*=|eval\(|new Function\(|with\s*\(" app core api

# Verify documentation consistency
rg "from '../../index.js'" README.md app/DEV_APP_README.md documentation/*.md

# Run full quality checks
npm run lint && npm run format && npm run test:all
```

## Logging Guidelines

### Use Pino Structured Logging
```javascript
// Good - structured fields
logger.info({ userId, action: 'login' }, 'User logged in');

// Good - appropriate log levels
logger.debug('Detailed debugging info');
logger.info('Normal operations');
logger.warn({ error }, 'Recoverable issue');
logger.error({ err }, 'Unexpected error');

// Bad - expensive stringification
logger.info(`User ${JSON.stringify(user)} logged in`);

// Bad - unstructured
logger.info('User ' + userId + ' logged in');
```

### Request Logging
- Automatic request ID generation and tracking
- Request/response logging with timing included by default
- Use request-scoped logger: `req.log.info({ key: value }, 'message')`
- Avoid logging sensitive data (passwords, tokens, PII)

## Common Workflows

### Adding a New Feature
1. **Read existing code first** - Understand patterns before adding
2. **Create plugin if substantial** - Don't modify core unless necessary
3. **Follow factory pattern** - Create factory functions, not classes
4. **Add lifecycle hooks if needed** - Initialize/cleanup resources properly
5. **Write integration tests** - Cover the happy path and error cases
6. **Update documentation** - Sync README, DEV_APP_README, specs
7. **Run validation** - Lint, format, test, check for sync APIs

### Modifying Core Modules
1. **Understand the impact** - Core changes affect all consumers
2. **Maintain backward compatibility** - Or document breaking changes clearly
3. **Update all consumers** - `app/` and `api/` examples must work
4. **Sync documentation** - All 4 docs must stay consistent
5. **Consider factory signature** - Breaking changes to factories are expensive
6. **Run full test suite** - Integration tests catch cross-module issues

### Adding Routes
```javascript
// In plugin or consumer app
const router = express.Router();

router.get('/my-endpoint', async (req, res, next) => {
  try {
    req.log.info('Handling my-endpoint');
    const data = await fetchData();  // Async, not sync!
    res.json({ data });
  } catch (err) {
    next(err);  // Let error handler deal with it
  }
});

// In plugin function
const myPlugin = (app, config) => {
  app.use('/my-feature', router);
};
```

### Adding Configuration
```javascript
// In consumer's config/env.js
export const createConfig = (overrides = {}, env = process.env) => {
  return {
    // Inherit core config
    ...coreCreateConfig(overrides, env),

    // Add consumer-specific config
    myFeature: {
      enabled: env.MY_FEATURE_ENABLED === 'true',
      apiKey: env.MY_FEATURE_API_KEY
    }
  };
};
```

## Common Anti-Patterns to Avoid

❌ **Modifying core when plugin would work**
```javascript
// Bad - editing core/app/src/app-factory.js to add feature
// Good - create plugin in consumer app
```

❌ **Classes instead of factories**
```javascript
// Bad
class MyService {
  constructor(config) { /* ... */ }
}

// Good
export const createMyService = (config) => {
  return {
    doSomething: async () => { /* ... */ }
  };
};
```

❌ **Mutating configuration**
```javascript
// Bad - config is frozen
config.port = 4000;  // TypeError

// Good - create new config with overrides
const newConfig = createConfig({ port: 4000 });
```

❌ **Sync I/O in request handlers**
```javascript
// Bad
app.get('/data', (req, res) => {
  const data = fs.readFileSync('./data.json');  // BLOCKS EVENT LOOP
  res.json(JSON.parse(data));
});

// Good
app.get('/data', async (req, res, next) => {
  try {
    const data = await fs.promises.readFile('./data.json', 'utf-8');
    res.json(JSON.parse(data));
  } catch (err) {
    next(err);
  }
});

// Better - cache at startup
let cachedData;
app.registerStartupHook(async () => {
  cachedData = JSON.parse(
    await fs.promises.readFile('./data.json', 'utf-8')
  );
});
app.get('/data', (req, res) => {
  res.json(cachedData);
});
```

❌ **Inconsistent async behavior (Zalgo)**
```javascript
// Bad - sometimes sync, sometimes async
function getData(callback) {
  if (cached) callback(cached);  // Sync
  else fetch().then(data => callback(data));  // Async
}

// Good - always async
async function getData() {
  if (cached) return cached;
  return await fetch();
}
```

❌ **Missing error handling in async code**
```javascript
// Bad - unhandled promise rejection
app.get('/data', async (req, res) => {
  const data = await fetchData();  // If this throws, unhandled rejection
  res.json(data);
});

// Good - error handling via next()
app.get('/data', async (req, res, next) => {
  try {
    const data = await fetchData();
    res.json(data);
  } catch (err) {
    next(err);  // Let error middleware handle it
  }
});
```

## PR Review Checklist

Before submitting changes:

### Code Quality
- [ ] No sync blocking APIs in request paths (`rg -n "\b(readFileSync|writeFileSync)\b" app core api`)
- [ ] No unbounded loops or CPU-heavy work in hot paths
- [ ] Async consistency maintained (no Zalgo)
- [ ] Error handling is single-path and deterministic
- [ ] Follows factory pattern (no unnecessary classes)
- [ ] Object shapes are stable in hot paths

### Testing
- [ ] Integration tests added for new features
- [ ] Tests cover success and error paths
- [ ] `npm run test:all` passes
- [ ] Hook ordering tested if lifecycle hooks added
- [ ] Graceful shutdown tested if resources added

### Documentation
- [ ] README.md updated if public API changed
- [ ] app/DEV_APP_README.md updated if consumer patterns changed
- [ ] documentation/00-project-specs.md updated if specs changed
- [ ] All code examples tested and working
- [ ] All file paths verified to exist

### Code Quality Tools
- [ ] `npm run lint` passes
- [ ] `npm run format` applied
- [ ] No anti-patterns introduced (`rg -n "eval\(|new Function\(" app core api`)

### Performance (if applicable)
- [ ] No performance regressions in hot paths
- [ ] Resource cleanup in shutdown hooks
- [ ] Logging is structured and level-gated
- [ ] Brief note in PR about latency/throughput impact

## Tech Stack Reference

**Runtime:**
- Node.js >= 22
- ES Modules (`"type": "module"`)

**Core Dependencies:**
- Express.js 5.x (web framework)
- EJS (templating)
- Pino (structured logging)
- dotenv (environment variables)

**Development:**
- Vitest (testing)
- Supertest (HTTP assertions)
- ESLint v10 (flat config)
- Prettier (formatting)
- Nodemon (dev auto-reload)

## Development Commands

```bash
# Start example app
npm run start:app

# Development with auto-reload
npm run dev:app

# Testing
npm test                  # Watch mode
npm run test:all          # All tests
npm run test:integration  # Integration only
npm run test:unit         # Unit only

# Code quality
npm run lint              # ESLint
npm run format            # Prettier

# Validation
rg -n "\b(readFileSync|writeFileSync)\b" app core api
npm pack --dry-run
```

## Key Design Philosophy

1. **Functional programming first** - Factories, pure functions, composition
2. **Explicit over implicit** - Dependencies in function signatures
3. **Immutable where possible** - Frozen configs, stable object shapes
4. **Composable architecture** - Plugins extend without modifying core
5. **Production-ready patterns** - Graceful shutdown, health checks, structured logging
6. **Event loop safety** - Async everywhere, no blocking operations
7. **Testability** - Dependency injection, small focused functions
8. **Documentation rigor** - Keep all docs synchronized

## When in Doubt

- **Check existing patterns** - Read [core/app/src/app-factory.js](core/app/src/app-factory.js) and [app/src/app.js](app/src/app.js)
- **Follow factory pattern** - Create factories, not classes
- **Stay async** - Never block the event loop
- **Write tests** - Especially for lifecycle and error handling
- **Update docs** - Sync all 4 documentation sources
- **Ask questions** - Better to clarify than assume

This is a proof-of-concept demonstrating professional patterns. Code quality, safety, and documentation matter more than feature velocity.
