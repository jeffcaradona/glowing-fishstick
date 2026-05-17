/**
 * @file Unit tests for error-utils helpers.
 *
 * WHY: Winston's format.errors({ stack: true }) only unwraps a top-level Error;
 * nested Error instances in meta objects serialize to `{}`. serializeError() is
 * the workaround used by error handlers and admin controllers — these tests
 * lock in the JSON-safe shape so logs stay actionable.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  logUnexpectedError,
  normalizeError,
  resolveErrorLogger,
  serializeError,
} from '../../src/middlewares/error-utils.js';

describe('serializeError', () => {
  it('extracts name, message, and stack from an Error', () => {
    const err = new Error('boom');
    const out = serializeError(err);

    expect(out.name).toBe('Error');
    expect(out.message).toBe('boom');
    expect(typeof out.stack).toBe('string');
    expect(out.stack).toContain('Error: boom');
  });

  it('survives JSON.stringify without losing fields', () => {
    const err = new Error('boom');
    const json = JSON.parse(JSON.stringify(serializeError(err)));

    expect(json.message).toBe('boom');
    expect(json.name).toBe('Error');
    expect(typeof json.stack).toBe('string');
  });

  it('preserves operational metadata when present', () => {
    const err = Object.assign(new Error('forbidden'), {
      code: 'FORBIDDEN',
      statusCode: 403,
    });
    const out = serializeError(err);

    expect(out.code).toBe('FORBIDDEN');
    expect(out.statusCode).toBe(403);
  });

  it('recursively serializes Error causes', () => {
    const cause = new Error('upstream gone');
    const err = new Error('wrap');
    err.cause = cause;
    const out = serializeError(err);

    expect(out.cause).toBeDefined();
    expect(out.cause.message).toBe('upstream gone');
    expect(out.cause.name).toBe('Error');
  });

  it('wraps non-Error values under .value', () => {
    expect(serializeError('plain string')).toEqual({ value: 'plain string' });
    expect(serializeError(42)).toEqual({ value: 42 });
    expect(serializeError(null)).toEqual({ value: null });
  });
});

describe('logUnexpectedError', () => {
  it('serializes nested Error so message and stack survive JSON.stringify', () => {
    const logFn = vi.fn();
    const req = {
      method: 'GET',
      path: '/admin/config',
      id: 'req-123',
      headers: {},
    };
    const err = new Error('template explode');

    logUnexpectedError(req, err, logFn);

    expect(logFn).toHaveBeenCalledTimes(1);
    const [meta, label] = logFn.mock.calls[0];
    expect(label).toBe('Unexpected error');
    expect(meta.method).toBe('GET');
    expect(meta.path).toBe('/admin/config');
    expect(meta.reqId).toBe('req-123');

    // The critical regression guard: round-trip through JSON must keep message + stack.
    const round = JSON.parse(JSON.stringify(meta));
    expect(round.err.message).toBe('template explode');
    expect(round.err.name).toBe('Error');
    expect(typeof round.err.stack).toBe('string');
  });

  it('falls back to x-request-id header when req.id is absent', () => {
    const logFn = vi.fn();
    const req = {
      method: 'POST',
      path: '/x',
      headers: { 'x-request-id': 'header-id' },
    };
    logUnexpectedError(req, new Error('x'), logFn, 'Custom label');

    const [meta, label] = logFn.mock.calls[0];
    expect(label).toBe('Custom label');
    expect(meta.reqId).toBe('header-id');
  });
});

describe('normalizeError', () => {
  it('returns defaults for an unknown error', () => {
    expect(normalizeError(new Error('boom'))).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });

  it('preserves message for operational errors', () => {
    const err = Object.assign(new Error('not allowed'), {
      statusCode: 403,
      code: 'FORBIDDEN',
      isOperational: true,
    });
    expect(normalizeError(err)).toEqual({
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'not allowed',
    });
  });
});

describe('resolveErrorLogger', () => {
  it('returns a function that flips (meta, msg) to native Winston (msg, meta)', () => {
    const error = vi.fn();
    const req = { app: { locals: { logger: { error } } } };
    const logFn = resolveErrorLogger(req);

    logFn({ k: 'v' }, 'hello');
    expect(error).toHaveBeenCalledWith('hello', { k: 'v' });
  });

  it('falls back to console.error when no logger is attached', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logFn = resolveErrorLogger({ app: { locals: {} } });
    logFn({ k: 'v' }, 'hello');
    expect(spy).toHaveBeenCalledWith('hello', { k: 'v' });
    spy.mockRestore();
  });
});
