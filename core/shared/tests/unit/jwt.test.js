/**
 * @file Unit tests for JWT helpers and middleware
 */

import { describe, it, expect, vi } from 'vitest';
import { generateToken, verifyToken } from '../../src/auth/jwt.js';
import { jwtAuthMiddleware } from '../../src/middlewares/jwt-auth.js';

describe('JWT helpers', () => {
  it('generates and verifies a token', () => {
    const secret = 'test-secret';
    const token = generateToken(secret, '15m');
    const decoded = verifyToken(token, secret);

    expect(decoded.iss).toBe('glowing-fishstick-app');
    expect(decoded.aud).toBe('glowing-fishstick-api');
  });
});

describe('jwtAuthMiddleware', () => {
  it('returns 401 for missing bearer token', () => {
    const middleware = jwtAuthMiddleware('test-secret');
    const req = { headers: {} };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches decoded payload and calls next for valid bearer token', () => {
    const secret = 'test-secret';
    const token = generateToken(secret, '15m');
    const middleware = jwtAuthMiddleware(secret);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.auth).toMatchObject({
      iss: 'glowing-fishstick-app',
      aud: 'glowing-fishstick-api',
    });
  });
});
