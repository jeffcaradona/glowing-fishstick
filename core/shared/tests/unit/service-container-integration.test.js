/**
 * @file Integration tests for service container plugin composition (conformance §7.3).
 *
 * These tests verify the container works correctly in the plugin-composition pattern
 * used by the app/api factories: two plugin functions share a container via config,
 * startup hooks can pre-warm singletons, and shutdown hooks can dispose the container.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServiceContainer } from '../../src/service-container.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Minimal stand-in for the config object produced by createConfig() /
 * createApiConfig(), which now exposes config.services.
 */
function makeConfig(overrides = {}) {
  return {
    services: overrides.services ?? createServiceContainer({ logger: overrides.logger }),
    ...overrides,
  };
}

/**
 * Minimal lifecycle hook runner (FIFO, errors isolated).
 */
function createHookRunner() {
  const hooks = [];
  return {
    register: (fn) => hooks.push(fn),
    execute: async () => {
      for (const hook of hooks) {
        await hook();
      }
    },
  };
}

// ── §7.3 Plugin composition ───────────────────────────────────────────────────

describe('Plugin composition', () => {
  let config;

  beforeEach(() => {
    config = makeConfig();
  });

  // ── Test 14 ─────────────────────────────────────────────────────────────────

  it('14 — Plugin A registers a service, Plugin B resolves it', async () => {
    const db = { query: vi.fn().mockResolvedValue([{ id: 1 }]) };

    // Plugin A: registers the service (e.g. in its setup phase)
    const pluginA = (_app, cfg) => {
      cfg.services.register('db', async () => db);
    };

    // Plugin B: resolves the service inside a request handler
    let handlerResult;
    const pluginB = (_app, cfg) => {
      // Simulate a route handler that calls resolve
      const handler = async () => {
        const resolvedDb = await cfg.services.resolve('db');
        handlerResult = await resolvedDb.query('SELECT 1');
      };
      // Execute handler immediately to simulate a request
      return handler();
    };

    // Simulate the app factory applying plugins in order
    pluginA(null, config);
    await pluginB(null, config);

    expect(handlerResult).toEqual([{ id: 1 }]);
    expect(db.query).toHaveBeenCalledWith('SELECT 1');
  });

  // ── Test 15 ─────────────────────────────────────────────────────────────────

  it('15 — startup hook pre-warms a singleton before first request', async () => {
    const providerSpy = vi.fn(async () => ({ connected: true }));
    const startupHooks = createHookRunner();

    // Plugin registers a service and a startup hook that resolves it
    const plugin = (_app, cfg) => {
      cfg.services.register('db', providerSpy);

      startupHooks.register(async () => {
        // Pre-warm: resolve during startup so the singleton is cached
        await cfg.services.resolve('db');
      });
    };

    plugin(null, config);

    // Startup hooks fire before server listens
    await startupHooks.execute();

    // Provider should have been called exactly once during startup
    expect(providerSpy).toHaveBeenCalledTimes(1);

    // Subsequent resolves (simulating request handlers) return cached instance
    await config.services.resolve('db');
    await config.services.resolve('db');
    expect(providerSpy).toHaveBeenCalledTimes(1);
  });

  // ── Test 16 ─────────────────────────────────────────────────────────────────

  it('16 — shutdown hook invokes container dispose', async () => {
    const disposeSpy = vi.fn();
    const shutdownHooks = createHookRunner();

    // Plugin registers a service with a disposer and wires dispose into shutdown
    const plugin = (_app, cfg) => {
      cfg.services.register('cache', () => ({ flush: vi.fn() }), { dispose: disposeSpy });

      shutdownHooks.register(async () => {
        await cfg.services.dispose();
      });
    };

    plugin(null, config);

    // Pre-warm the service so its disposer is eligible to run
    await config.services.resolve('cache');

    // Trigger shutdown sequence
    await shutdownHooks.execute();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});

// ── Cross-plugin service sharing ──────────────────────────────────────────────

describe('Cross-plugin service sharing', () => {
  it('multiple plugins share the same singleton instance via config.services', async () => {
    const config = makeConfig();

    const instanceRef = { id: 'singleton-ref' };
    const providerSpy = vi.fn(() => instanceRef);

    // Plugin A registers
    config.services.register('shared', providerSpy);

    // Plugin B and C resolve the same service independently
    const [b, c] = await Promise.all([
      config.services.resolve('shared'),
      config.services.resolve('shared'),
    ]);

    expect(b).toBe(instanceRef);
    expect(c).toBe(instanceRef);
    expect(providerSpy).toHaveBeenCalledTimes(1);
  });

  it('test container can be injected via overrides.services for isolation', async () => {
    const testContainer = createServiceContainer();
    const mockDb = { query: vi.fn() };
    testContainer.registerValue('db', mockDb);

    // When a test passes a container override, it replaces the default
    const config = makeConfig({ services: testContainer });

    const resolved = await config.services.resolve('db');
    expect(resolved).toBe(mockDb);
  });
});
