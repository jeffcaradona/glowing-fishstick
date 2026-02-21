import crypto from 'node:crypto';

// Very safe default: compact charset + bounded length
export function coerceRequestId(value, { maxLen = 64 } = {}) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) {
    return null;
  }

  // Avoid log/header injection and weird unicode
  // WHY: IDs are echoed in headers and logs, so allowlist charset prevents
  // control chars and spoofing via visually confusable values.
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function getOrCreateRequestId(req) {
  const incoming = coerceRequestId(req.headers['x-request-id']);
  return incoming ?? crypto.randomUUID();
}

/**
 * Create a request ID middleware.
 * Generates a unique UUID for each request and attaches it to req.id.
 * If a request already has an x-request-id header, uses that instead.
 *
 * @returns {Function} Express middleware
 *
 * @example
 * import { createRequestIdMiddleware } from '@glowing-fishstick/shared';
 * app.use(createRequestIdMiddleware());
 */
export function createRequestIdMiddleware() {
  return (req, res, next) => {
    const incoming = req.headers['x-request-id'];
    const validated = coerceRequestId(incoming);

    req.id = validated ?? crypto.randomUUID();
    if (!validated && typeof incoming === 'string') {
      // WHY: Preserve the raw inbound value only for diagnostics while ensuring
      // downstream systems use the sanitized req.id.
      req.untrustedRequestId = incoming;
    }

    res.setHeader('x-request-id', req.id);
    next();
  };
}
