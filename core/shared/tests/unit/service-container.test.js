/**
 * @file Unit tests for the service container (conformance matrix §7.1, §7.2, validation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createServiceContainer,
  ServiceAlreadyRegisteredError,
  ServiceNotFoundError,
  ServiceCircularDependencyError,
  ServiceResolutionError,
  ServiceAggregateDisposeError,
} from '../../src/service-container.js';

// ── §7.1 Core behavior ────────────────────────────────────────────────────────

describe('Core behavior', () => {
  let container;

  beforeEach(() => {
    container = createServiceContainer();
  });

  it('1 — registers and resolves a plain value service', async () => {
    container.registerValue('cfg', { a: 1 });
    const result = container.resolve('cfg');
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toEqual({ a: 1 });
  });

  it('2 — registers and resolves an async provider service', async () => {
    const mockDb = { query: vi.fn() };
    container.register('db', async () => mockDb);
    const result = await container.resolve('db');
    expect(result).toBe(mockDb);
  });

  it('3 — singleton provider executes once across many resolves', async () => {
    const spy = vi.fn(() => ({}));
    container.register('x', spy);
    const [a, b, c] = await Promise.all([
      container.resolve('x'),
      container.resolve('x'),
      container.resolve('x'),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('4 — concurrent singleton resolves deduplicate to a single provider invocation', async () => {
    const spy = vi.fn(async () => {
      await new Promise((r) => setImmediate(r));
      return {};
    });
    container.register('x', spy);
    const results = await Promise.all([
      container.resolve('x'),
      container.resolve('x'),
      container.resolve('x'),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(results[0]).toBe(results[1]);
    expect(results[1]).toBe(results[2]);
  });

  it('5 — transient provider executes per resolve', async () => {
    const spy = vi.fn(() => ({}));
    container.register('t', spy, { lifecycle: 'transient' });
    const a = await container.resolve('t');
    const b = await container.resolve('t');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(a).not.toBe(b);
  });

  it('6 — duplicate registration throws ServiceAlreadyRegisteredError', () => {
    container.register('x', () => 1);
    expect(() => container.register('x', () => 2)).toThrow(ServiceAlreadyRegisteredError);
    expect(() => container.register('x', () => 2)).toThrow(
      expect.objectContaining({ name: 'ServiceAlreadyRegisteredError' }),
    );
  });

  it('7 — unknown service rejects with ServiceNotFoundError', async () => {
    await expect(container.resolve('nope')).rejects.toThrow(ServiceNotFoundError);
    await expect(container.resolve('nope')).rejects.toMatchObject({
      name: 'ServiceNotFoundError',
    });
  });

  it('8 — circular dependency rejects with ServiceCircularDependencyError containing both names', async () => {
    container.register('a', async (ctx) => ctx.resolve('b'));
    container.register('b', async (ctx) => ctx.resolve('a'));

    await expect(container.resolve('a')).rejects.toThrow(ServiceCircularDependencyError);
    await expect(container.resolve('a')).rejects.toMatchObject({
      name: 'ServiceCircularDependencyError',
      path: expect.arrayContaining(['a', 'b']),
    });
  });

  it('9 — keys() returns all registered names regardless of init state', async () => {
    container.register('a', () => 1);
    container.register('b', () => 2);
    container.register('c', () => 3);
    await container.resolve('a');
    expect(container.keys()).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(container.keys()).toHaveLength(3);
  });
});

// ── §7.2 Lifecycle behavior ───────────────────────────────────────────────────

describe('Lifecycle behavior', () => {
  let container;

  beforeEach(() => {
    container = createServiceContainer();
  });

  it('10 — dispose() runs disposers for initialized services only', async () => {
    const disposeA = vi.fn();
    const disposeB = vi.fn();
    container.register('a', () => 'a', { dispose: disposeA });
    container.register('b', () => 'b', { dispose: disposeB });

    await container.resolve('a'); // resolve A only
    await container.dispose();

    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).not.toHaveBeenCalled();
  });

  it('11 — disposal order is reverse creation order (LIFO)', async () => {
    const order = [];
    container.register('a', () => 'a', { dispose: () => order.push('dispose-a') });
    container.register('b', () => 'b', { dispose: () => order.push('dispose-b') });
    container.register('c', () => 'c', { dispose: () => order.push('dispose-c') });

    await container.resolve('a');
    await container.resolve('b');
    await container.resolve('c');
    await container.dispose();

    expect(order).toEqual(['dispose-c', 'dispose-b', 'dispose-a']);
  });

  it('12 — dispose is idempotent; disposers called exactly once total', async () => {
    const disposeSpy = vi.fn();
    container.register('a', () => 'a', { dispose: disposeSpy });
    await container.resolve('a');

    await container.dispose();
    await container.dispose();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('13 — dispose continues after a disposer failure and rejects with ServiceAggregateDisposeError', async () => {
    const disposeA = vi.fn();
    const failErr = new Error('boom');
    const disposeB = vi.fn(() => {
      throw failErr;
    });
    const disposeC = vi.fn();

    container.register('a', () => 'a', { dispose: disposeA });
    container.register('b', () => 'b', { dispose: disposeB });
    container.register('c', () => 'c', { dispose: disposeC });

    await container.resolve('a');
    await container.resolve('b');
    await container.resolve('c');

    await expect(container.dispose()).rejects.toThrow(ServiceAggregateDisposeError);
    await expect(container.dispose()).resolves.toBeUndefined(); // idempotent after disposed

    // Verify all disposers were attempted (disposeB was called despite throwing)
    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).toHaveBeenCalledTimes(1);
    expect(disposeC).toHaveBeenCalledTimes(1);
  });
});

// ── Input validation ──────────────────────────────────────────────────────────

describe('Input validation', () => {
  let container;

  beforeEach(() => {
    container = createServiceContainer();
  });

  it('throws TypeError for empty string name', () => {
    expect(() => container.register('', () => 1)).toThrow(TypeError);
  });

  it('throws TypeError for non-string name', () => {
    expect(() => container.register(42, () => 1)).toThrow(TypeError);
  });

  it('throws TypeError for transient + dispose combo', () => {
    expect(() =>
      container.register('t', () => 1, { lifecycle: 'transient', dispose: vi.fn() }),
    ).toThrow(TypeError);
    expect(() =>
      container.register('t', () => 1, { lifecycle: 'transient', dispose: vi.fn() }),
    ).toThrow(/transient/i);
  });

  it('provider failure clears singleton cache so a retry succeeds', async () => {
    let failNext = true;
    container.register('flaky', () => {
      if (failNext) {
        throw new Error('first fail');
      }
      return 'ok';
    });

    await expect(container.resolve('flaky')).rejects.toThrow(ServiceResolutionError);

    failNext = false;
    await expect(container.resolve('flaky')).resolves.toBe('ok');
  });

  it('ctx.resolve and ctx.has are available inside providers', async () => {
    container.register('dep', () => 'dep-value');
    container.register('svc', async (ctx) => {
      expect(typeof ctx.resolve).toBe('function');
      expect(typeof ctx.has).toBe('function');
      return ctx.resolve('dep');
    });
    await expect(container.resolve('svc')).resolves.toBe('dep-value');
  });

  it('ctx.logger matches the logger passed to the factory', async () => {
    const logger = { info: vi.fn() };
    const c = createServiceContainer({ logger });
    c.register('svc', (ctx) => ctx.logger);
    await expect(c.resolve('svc')).resolves.toBe(logger);
  });
});

// ── ServiceAggregateDisposeError detail ───────────────────────────────────────

describe('ServiceAggregateDisposeError detail', () => {
  it('errors array contains { name, cause } for each failing disposer', async () => {
    const container = createServiceContainer();
    const failErr = new Error('exploded');

    container.register('a', () => 'a', {
      dispose: () => {
        throw failErr;
      },
    });
    await container.resolve('a');

    let thrown;
    try {
      await container.dispose();
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ServiceAggregateDisposeError);
    expect(thrown.name).toBe('ServiceAggregateDisposeError');
    expect(thrown.errors).toHaveLength(1);
    expect(thrown.errors[0]).toMatchObject({ name: 'a', cause: failErr });
  });
});
