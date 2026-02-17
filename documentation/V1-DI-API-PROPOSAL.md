# v1 Dependency Injection (DI) API Proposal + Exact Specification

> Status: Proposal (no runtime implementation yet)
> Internal Version: v3
> 
> Scope: Minimal, backward-compatible service container for app/api plugin ecosystems.


---

## Revision History

- **v3**: Introduced explicit internal proposal versioning and added this revision history section for future review cycles.
- **v2**: Incorporated review clarifications for frozen config integration, transient dispose restrictions, shared error-class location/exports, LIFO-vs-FIFO documentation, plugin ownership rules, logger threading, and `keys()` conformance coverage.
- **v1**: Initial exact DI API specification draft.

---

## 1) Why v1 DI now

The current architecture has strong plugin composition and lifecycle hooks, but does not provide a first-class service registry for sharing resource instances across plugins. v1 DI addresses:

- Duplicate resource creation risk (e.g., DB/cache clients instantiated by multiple plugins)
- Implicit coupling through plugin ordering and ad hoc app mutation
- Hard-to-test dependency wiring when services are not explicit

This proposal keeps the existing plugin contract and introduces a small container API (`register`, `resolve`, `dispose`) that can be adopted incrementally.

---

## 2) Design goals

1. **Backward compatible** with `(app, config) => void` plugins
2. **Tiny surface area** with deterministic behavior
3. **Async-safe** resolution (promise-aware, no double-init race)
4. **Lifecycle-aware** disposal for graceful shutdown
5. **No globals**; dependencies are explicit and container-scoped
6. **Testable by contract** with clear error states

---

## 3) v1 public API (exact)

### 3.1 Factory

```ts
function createServiceContainer(options?: {
  logger?: { debug?: Function; info?: Function; warn?: Function; error?: Function };
  strict?: boolean; // default true (throws on unknown/duplicate)
}): ServiceContainer;
```

### 3.2 Types

```ts
type ServiceName = string;

type ServiceLifecycle = 'singleton' | 'transient';

type ServiceProviderContext = {
  resolve: (name: ServiceName) => Promise<unknown>;
  has: (name: ServiceName) => boolean;
  config?: object;
  logger?: object;
};

type ServiceProvider<T = unknown> =
  | T
  | ((ctx: ServiceProviderContext) => T | Promise<T>);

type ServiceRegistrationOptions<T = unknown> = {
  lifecycle?: ServiceLifecycle; // default: 'singleton'
  // v1 rule: dispose is only valid for singleton lifecycle.
  dispose?: (instance: T) => void | Promise<void>;
  metadata?: Record<string, unknown>; // optional observability/debugging metadata
};

interface ServiceContainer {
  register<T = unknown>(
    name: ServiceName,
    provider: ServiceProvider<T>,
    options?: ServiceRegistrationOptions<T>,
  ): void;

  registerValue<T = unknown>(
    name: ServiceName,
    value: T,
    options?: Omit<ServiceRegistrationOptions<T>, 'lifecycle'>,
  ): void;

  resolve<T = unknown>(name: ServiceName): Promise<T>;

  has(name: ServiceName): boolean;

  keys(): string[];

  dispose(): Promise<void>;
}
```

### 3.3 Runtime semantics (normative)

#### Register

- `register` MUST throw `TypeError` if `name` is empty/non-string.
- `register` MUST throw `ServiceAlreadyRegisteredError` if `name` already exists.
- `options.lifecycle` defaults to `'singleton'`.
- In v1, `dispose` is only supported for singleton services. Registering `dispose` with `lifecycle: 'transient'` MUST throw `TypeError`.

#### Resolve

- `resolve` MUST return a `Promise`.
- Unknown service MUST reject with `ServiceNotFoundError`.
- Singleton services MUST initialize once and cache result.
- Concurrent singleton resolves MUST await the same in-flight initialization promise.
- If singleton initialization fails, cache MUST be cleared so future `resolve` may retry.
- Transient services MUST execute provider per `resolve` call.

#### Circular detection

- If `A -> B -> ... -> A` is encountered during resolution, reject with `ServiceCircularDependencyError`.
- Error message SHOULD include the resolution path.

#### Dispose

- `dispose()` MUST be idempotent.
- Container MUST call registered `dispose` callbacks for successfully created instances only.
- Disposal order MUST be reverse creation order (LIFO) for predictable teardown.
- If one dispose fails, container SHOULD continue disposing remaining instances and reject with aggregated error context.

Disposal intentionally uses LIFO so dependents are torn down before dependencies. This differs from lifecycle hook registries (startup/shutdown) that execute FIFO for predictable sequential orchestration.

---

## 4) Error model (exact)

Required error classes:

1. `ServiceAlreadyRegisteredError(name)`
2. `ServiceNotFoundError(name)`
3. `ServiceCircularDependencyError(path: string[])`
4. `ServiceResolutionError(name, cause)`
5. `ServiceDisposeError(name, cause)`
6. `ServiceAggregateDisposeError(errors: Array<{ name: string; cause: unknown }>)`

All MUST extend `Error` and include stable `.name` values.

All container errors SHOULD be defined alongside the container implementation in `core/shared/src/service-container.js` and exported via `core/shared/index.js` so both app and api packages can consume them through `@glowing-fishstick/shared`.

---

## 5) Integration contract for app/api (v1)

No plugin signature changes.

### 5.1 Config augmentation

`createConfig(...)` / API config factories SHOULD expose a container at:

```ts
config.services: ServiceContainer
```

Because both config factories freeze the returned config object, the service container MUST be created inside each config factory and included in the object literal before `Object.freeze(...)`.

```js
const logger = overrides.logger;
const config = {
  // ...existing fields...
  services: overrides.services ?? createServiceContainer({ logger }),
  ...overrides,
};

return Object.freeze(config);
```

`Object.freeze` is shallow, so `config.services` methods (`register`, `resolve`, `dispose`) remain callable; only replacement of the `services` reference is prevented.

### 5.2 Plugin usage contract

Plugins MAY:

- register shared infra services during plugin composition
- resolve services in route handlers/middleware/startup hooks

Plugins SHOULD avoid expensive initialization in request paths; use startup hooks for warmup when needed.

Each service name MUST be owned by exactly one plugin (or one core registration point). If multiple plugins register the same service name, `ServiceAlreadyRegisteredError` is expected.

### 5.3 Lifecycle hooks

Recommended default wiring:

- Startup: optional warmup (`await services.resolve('db')`) for critical services
- Shutdown: `await services.dispose()` via existing shutdown hook pipeline

---

## 6) Example usage

```js
// db-plugin.js
export function dbPlugin(app, config) {
  config.services.register(
    'db',
    async ({ logger }) => {
      const db = await connectDb(config.dbUrl);
      logger?.info?.('db connected');
      return db;
    },
    {
      lifecycle: 'singleton',
      dispose: async (db) => db.close(),
      metadata: { owner: 'db-plugin' },
    },
  );

  app.registerStartupHook(async () => {
    await config.services.resolve('db');
  });
}

// tasks-plugin.js
export function tasksPlugin(app, config) {
  app.get('/tasks', async (_req, res, next) => {
    try {
      const db = await config.services.resolve('db');
      const tasks = await db.listTasks();
      res.json({ tasks });
    } catch (err) {
      next(err);
    }
  });
}
```

---

## 7) v1 conformance test matrix

### 7.1 Core behavior

1. Registers and resolves plain value service
2. Registers and resolves async provider service
3. Singleton provider executes once across many resolves
4. Concurrent singleton resolves dedupe to single provider invocation
5. Transient provider executes per resolve
6. Duplicate registration throws
7. Unknown service throws
8. Circular dependency throws with path
9. `keys()` returns all registered service names regardless of initialization state

### 7.2 Lifecycle behavior

10. `dispose()` runs disposers for initialized services only
11. Disposal order is reverse creation order
12. Dispose is idempotent
13. Dispose continues after one disposer failure and returns aggregate error

### 7.3 Integration behavior

14. Plugin A registers service, Plugin B resolves service successfully
15. Startup warmup via hooks executes before server listen
16. Shutdown hook invokes container dispose

---

## 8) Non-goals for v1

- Request-scoped containers
- AsyncLocalStorage integration
- Plugin dependency graph solver
- Auto-discovery/auto-registration conventions
- Cross-process distributed service registry

---

## 9) Rollout plan

1. Implement container in `core/shared/src/service-container.js` and pass `logger` into `createServiceContainer({ logger })` so providers receive `ctx.logger`.
2. Export `createServiceContainer` and all service container error classes via `core/shared/index.js` (`@glowing-fishstick/shared` boundary).
3. In both app/api config factories, include `services: overrides.services ?? createServiceContainer({ logger })` in the config object literal before `Object.freeze(...)`.
4. Add unit tests for container + integration tests for plugin composition
5. Document usage examples in README, DEV_APP_README, and project specs

---

## 10) Performance / throughput note

Expected impact in hot request paths should be negligible when handlers resolve pre-initialized singleton services (Map lookups + Promise reuse). Expensive initialization should stay in startup hooks to avoid per-request latency spikes.
