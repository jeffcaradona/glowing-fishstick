/**
 * @file Unit tests for createRequestLogger middleware
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRequestLogger } from '../../src/logger.js';

/**
 * Create a minimal mock logger with spied methods.
 */
function createMockLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
}

/**
 * Create a minimal mock request.
 */
function createMockReq(overrides = {}) {
  return {
    method: 'GET',
    path: '/test',
    headers: {},
    ...overrides,
  };
}

/**
 * Create a minimal mock response backed by EventEmitter for lifecycle events.
 */
function createMockRes() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.setHeader = vi.fn();
  res.end = vi.fn();
  return res;
}

describe('createRequestLogger', () => {
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('validation', () => {
    it('throws TypeError when logger is missing', () => {
      expect(() => createRequestLogger(null)).toThrow(TypeError);
      expect(() => createRequestLogger(undefined)).toThrow(TypeError);
    });

    it('throws TypeError when logger.info is not a function', () => {
      expect(() => createRequestLogger({ info: 'not a function' })).toThrow(TypeError);
    });
  });

  describe('request logging', () => {
    it('logs incoming request with method, pathname, and type', () => {
      const middleware = createRequestLogger(logger);
      const req = createMockReq({ method: 'POST', path: '/api/tasks' });
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'http.request',
          method: 'POST',
          pathname: '/api/tasks',
        }),
        'Request received',
      );
      expect(next).toHaveBeenCalled();
    });
  });

  describe('response logging via finish event', () => {
    it('logs response when finish event fires', () => {
      const middleware = createRequestLogger(logger);
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);

      // Only request log so far
      expect(logger.info).toHaveBeenCalledTimes(1);

      // Simulate response completion
      res.statusCode = 201;
      res.emit('finish');

      expect(logger.info).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'http.response',
          method: 'GET',
          pathname: '/test',
          status: 201,
          duration: expect.any(Number),
        }),
        'Response sent',
      );
    });

    it('does not monkey-patch res.end', () => {
      const middleware = createRequestLogger(logger);
      const req = createMockReq();
      const res = createMockRes();
      const originalEnd = res.end;
      const next = vi.fn();

      middleware(req, res, next);

      // res.end must remain untouched — this is the core fix
      expect(res.end).toBe(originalEnd);
    });

    it('logs response only once even if finish fires multiple times', () => {
      const middleware = createRequestLogger(logger);
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);

      res.emit('finish');
      res.emit('finish');

      // 1 request log + 1 response log (once, not twice)
      expect(logger.info).toHaveBeenCalledTimes(2);
    });
  });

  describe('request ID handling', () => {
    it('generates request ID when generateRequestId is true (default)', () => {
      const middleware = createRequestLogger(logger);
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(req.id).toBeDefined();
      expect(typeof req.id).toBe('string');
      expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.id);
    });

    it('uses existing x-request-id header when present', () => {
      const middleware = createRequestLogger(logger);
      const req = createMockReq({ headers: { 'x-request-id': 'custom-id-123' } });
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(req.id).toBe('custom-id-123');
    });

    it('does not generate request ID when generateRequestId is false', () => {
      const middleware = createRequestLogger(logger, { generateRequestId: false });
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(req.id).toBeUndefined();
    });

    it('does not overwrite existing req.id', () => {
      const middleware = createRequestLogger(logger);
      const req = createMockReq();
      req.id = 'pre-existing-id';
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(req.id).toBe('pre-existing-id');
    });
  });

  describe('duration tracking', () => {
    it('includes a non-negative duration in response log', () => {
      const middleware = createRequestLogger(logger);
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);
      res.emit('finish');

      const responseLogCall = logger.info.mock.calls[1];
      expect(responseLogCall[0].duration).toBeGreaterThanOrEqual(0);
    });
  });
});
