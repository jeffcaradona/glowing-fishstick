/**
 * @module service-container
 * @description Service container factory for dependency injection in the plugin ecosystem.
 * Provides singleton and transient lifecycle management, circular dependency detection,
 * concurrent resolve deduplication, and LIFO disposal.
 */

// ── Error classes ──────────────────────────────────────────────────────────────

export class ServiceAlreadyRegisteredError extends Error {
  constructor(name) {
    super(`Service "${name}" is already registered`);
    this.name = 'ServiceAlreadyRegisteredError';
  }
}

export class ServiceNotFoundError extends Error {
  constructor(name) {
    super(`Service "${name}" is not registered`);
    this.name = 'ServiceNotFoundError';
  }
}

export class ServiceCircularDependencyError extends Error {
  constructor(path) {
    super(`Circular dependency detected: ${path.join(' → ')}`);
    this.name = 'ServiceCircularDependencyError';
    this.path = path;
  }
}

export class ServiceResolutionError extends Error {
  constructor(name, cause) {
    super(`Failed to resolve service "${name}"`, { cause });
    this.name = 'ServiceResolutionError';
  }
}

export class ServiceDisposeError extends Error {
  constructor(name, cause) {
    super(`Failed to dispose service "${name}"`, { cause });
    this.name = 'ServiceDisposeError';
  }
}

export class ServiceAggregateDisposeError extends Error {
  constructor(errors) {
    super(`Failed to dispose ${errors.length} service(s)`);
    this.name = 'ServiceAggregateDisposeError';
    this.errors = errors;
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Create a new service container.
 *
 * @param {object}  [options={}]        - Factory options.
 * @param {object}  [options.logger]    - Logger instance forwarded to providers via ctx.logger.
 * @returns {ServiceContainer}
 */
export function createServiceContainer(options = {}) {
  /** @type {Map<string, { provider: Function, lifecycle: string, dispose?: Function }>} */
  const registry = new Map();

  /** @type {Map<string, unknown>} */
  const singletonCache = new Map();

  /** @type {Map<string, Promise<unknown>>} */
  const inflightResolves = new Map();

  /** @type {string[]} Tracks singleton init order for LIFO dispose. */
  const creationOrder = [];

  let disposed = false;

  // ── register ──────────────────────────────────────────────────────────────

  /**
   * Register a service provider.
   *
   * @param {string}   name               - Unique service name.
   * @param {*}        provider           - Provider function or plain value.
   * @param {object}   [opts={}]          - Registration options.
   * @param {string}   [opts.lifecycle]   - 'singleton' (default) or 'transient'.
   * @param {Function} [opts.dispose]     - Cleanup called on dispose (singletons only).
   * @throws {TypeError} If name is not a non-empty string, or transient + dispose.
   * @throws {ServiceAlreadyRegisteredError} If the name is already registered.
   */
  function register(name, provider, opts = {}) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError('Service name must be a non-empty string');
    }

    if (registry.has(name)) {
      throw new ServiceAlreadyRegisteredError(name);
    }

    const lifecycle = opts.lifecycle ?? 'singleton';
    const dispose = opts.dispose;

    if (dispose !== undefined && lifecycle === 'transient') {
      throw new TypeError(
        `Cannot register a dispose callback for transient lifecycle on service "${name}"`,
      );
    }

    const providerFn = typeof provider === 'function' ? provider : () => provider;

    registry.set(name, { provider: providerFn, lifecycle, dispose });
  }

  // ── registerValue ─────────────────────────────────────────────────────────

  /**
   * Register a pre-initialized value as a singleton service.
   * The value is immediately cached so providers never need to call resolve.
   *
   * @param {string}   name          - Unique service name.
   * @param {*}        value         - Pre-initialized value.
   * @param {object}   [opts={}]     - Registration options (lifecycle is forced to 'singleton').
   */
  function registerValue(name, value, opts = {}) {
    register(name, value, { ...opts, lifecycle: 'singleton' });
    singletonCache.set(name, value);
    creationOrder.push(name);
  }

  // ── internalResolve ───────────────────────────────────────────────────────

  /**
   * Internal resolve with cycle-detection set threading.
   *
   * @param {string}     name          - Service name to resolve.
   * @param {Set<string>} resolvingSet - Names currently being resolved in this chain.
   * @returns {Promise<unknown>}
   */
  async function internalResolve(name, resolvingSet) {
    const entry = registry.get(name);
    if (!entry) {
      throw new ServiceNotFoundError(name);
    }

    if (entry.lifecycle === 'singleton') {
      // 1. Return cached instance immediately.
      if (singletonCache.has(name)) {
        return singletonCache.get(name);
      }

      // 2. Detect cycles before checking in-flight to catch self-referential providers.
      if (resolvingSet.has(name)) {
        throw new ServiceCircularDependencyError([...resolvingSet, name]);
      }

      // 3. Deduplicate concurrent top-level resolves for the same singleton.
      if (inflightResolves.has(name)) {
        return inflightResolves.get(name);
      }

      // 4. Start resolution. Add to set so nested ctx.resolve calls detect cycles.
      resolvingSet.add(name);

      const ctx = {
        resolve: (depName) => internalResolve(depName, resolvingSet),
        has: (depName) => registry.has(depName),
        logger: options.logger,
      };

      const promise = Promise.resolve()
        .then(() => entry.provider(ctx))
        .then((instance) => {
          singletonCache.set(name, instance);
          creationOrder.push(name);
          inflightResolves.delete(name);
          resolvingSet.delete(name);
          return instance;
        })
        .catch((cause) => {
          inflightResolves.delete(name);
          singletonCache.delete(name);
          resolvingSet.delete(name);
          // Propagate circular dependency errors unwrapped so callers see the real error.
          if (cause instanceof ServiceCircularDependencyError) {
            throw cause;
          }
          throw new ServiceResolutionError(name, cause);
        });

      inflightResolves.set(name, promise);
      return promise;
    }

    // ── transient lifecycle ──────────────────────────────────────────────────
    if (resolvingSet.has(name)) {
      throw new ServiceCircularDependencyError([...resolvingSet, name]);
    }

    resolvingSet.add(name);

    const ctx = {
      resolve: (depName) => internalResolve(depName, resolvingSet),
      has: (depName) => registry.has(depName),
      logger: options.logger,
    };

    try {
      const instance = await Promise.resolve(entry.provider(ctx));
      resolvingSet.delete(name);
      return instance;
    } catch (cause) {
      resolvingSet.delete(name);
      if (cause instanceof ServiceCircularDependencyError) {
        throw cause;
      }
      throw new ServiceResolutionError(name, cause);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Resolve a service by name.
   * Always returns a Promise regardless of whether the value is cached.
   *
   * @param {string} name - Registered service name.
   * @returns {Promise<unknown>}
   */
  function resolve(name) {
    return internalResolve(name, new Set());
  }

  /**
   * Return true if a service is registered (does not check if it's resolved).
   *
   * @param {string} name
   * @returns {boolean}
   */
  function has(name) {
    return registry.has(name);
  }

  /**
   * Return all registered service names.
   *
   * @returns {string[]}
   */
  function keys() {
    return [...registry.keys()];
  }

  /**
   * Dispose the container. Runs registered disposers for initialized singletons
   * in LIFO order. Collects all failures and rejects with ServiceAggregateDisposeError
   * if any disposers throw. Subsequent calls resolve immediately (idempotent).
   *
   * @returns {Promise<void>}
   */
  async function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;

    const errors = [];
    const disposeOrder = [...creationOrder].reverse();

    for (const name of disposeOrder) {
      const entry = registry.get(name);
      if (entry && entry.dispose && singletonCache.has(name)) {
        try {
          await entry.dispose(singletonCache.get(name));
        } catch (cause) {
          errors.push({ name, cause });
        }
      }
    }

    registry.clear();
    singletonCache.clear();
    inflightResolves.clear();
    creationOrder.length = 0;

    if (errors.length > 0) {
      throw new ServiceAggregateDisposeError(errors);
    }
  }

  return { register, registerValue, resolve, has, keys, dispose };
}
