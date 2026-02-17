# v1 Dependency Injection (DI) API Proposal + Exact Specification

> Status: Proposal (no runtime implementation yet)
> 
> Scope: Minimal, backward-compatible service container for app/api plugin ecosystems.

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

---

## 5) Integration contract for app/api (v1)

No plugin signature changes.

### 5.1 Config augmentation

`createConfig(...)` / API config factories SHOULD expose a container at:

```ts
config.services: ServiceContainer
```

### 5.2 Plugin usage contract

Plugins MAY:

- register shared infra services during plugin composition
- resolve services in route handlers/middleware/startup hooks

Plugins SHOULD avoid expensive initialization in request paths; use startup hooks for warmup when needed.

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

### 7.2 Lifecycle behavior

9. `dispose()` runs disposers for initialized services only
10. Disposal order is reverse creation order
11. Dispose is idempotent
12. Dispose continues after one disposer failure and returns aggregate error

### 7.3 Integration behavior

13. Plugin A registers service, Plugin B resolves service successfully
14. Startup warmup via hooks executes before server listen
15. Shutdown hook invokes container dispose

---

## 8) Non-goals for v1

- Request-scoped containers
- AsyncLocalStorage integration
- Plugin dependency graph solver
- Auto-discovery/auto-registration conventions
- Cross-process distributed service registry

---

## 9) Rollout plan

1. Implement container in shared package internals
2. Export `createServiceContainer` via package boundary
3. Inject `config.services` by default in app/api config factories
4. Add unit tests for container + integration tests for plugin composition
5. Document usage examples in README, DEV_APP_README, and project specs

---

## 10) Performance / throughput note

Expected impact in hot request paths should be negligible when handlers resolve pre-initialized singleton services (Map lookups + Promise reuse). Expensive initialization should stay in startup hooks to avoid per-request latency spikes.
