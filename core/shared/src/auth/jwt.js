/**
 * @module auth/jwt
 * @description JWT token generation and verification for service-to-service auth.
 */

import jwt from 'jsonwebtoken';

const DEFAULT_ISSUER = 'glowing-fishstick-app';
const DEFAULT_AUDIENCE = 'glowing-fishstick-api';

/**
 * Generate a signed JWT token.
 *
 * @param {string} secret - JWT signing secret.
 * @param {string} [expiresIn='15m'] - Token TTL.
 * @returns {string}
 */
export function generateToken(secret, expiresIn = '15m') {
  return jwt.sign(
    {
      iss: DEFAULT_ISSUER,
      aud: DEFAULT_AUDIENCE,
      iat: Math.floor(Date.now() / 1000),
    },
    secret,
    { expiresIn },
  );
}

/**
 * Verify and decode a JWT token.
 *
 * @param {string} token - JWT token to verify.
 * @param {string} secret - JWT signing secret.
 * @returns {object}
 */
export function verifyToken(token, secret) {
  return jwt.verify(token, secret, {
    issuer: DEFAULT_ISSUER,
    audience: DEFAULT_AUDIENCE,
  });
}
