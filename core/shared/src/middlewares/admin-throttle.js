/**
 * @module middlewares/admin-throttle
 * @description Fixed-window, in-memory, process-local rate-limiting middleware
 * for expensive routes. Returns 429 when the request count for a given
 * route exceeds the configured threshold within a time window.
 *
 * WHY: Consolidated into @glowing-fishstick/shared because both the app
 * package (admin endpoints) and the API package (metrics endpoints) need
 * identical throttling logic. Keeping a single implementation eliminates
 * byte-for-byte duplication (Sonar code-duplication finding) and ensures
 * bug-fixes apply uniformly.
 *
 * TRADEOFF: Process-local counters — each Node process gets an independent
 * budget. Sufficient for single-process POC; distributed throttling
 * (shared store) is deferred to a future phase.
 *
 * VERIFY IF CHANGED: Integration tests for 429 responses in both
 * core/web-app/tests/integration/security-hardening.test.js and
 * core/service-api/tests/integration/security-hardening.test.js, plus health
 * endpoint availability tests (health must bypass throttle).
 */

/**
 * Create a fixed-window throttling middleware.
 *
 * @param {object} options
 * @param {number} options.windowMs   - Duration of each fixed window in milliseconds.
 * @param {number} options.max        - Maximum number of requests allowed per window.
 * @param {string[]} options.paths    - Route paths to throttle (exact match).
 * @returns {import('express').RequestHandler}
 */
export function createAdminThrottle({ windowMs, max, paths }) {
  /** @type {Map<string, number>} Route → current-window hit count */
  const counters = new Map();

  /** @type {number|null} Timer handle for window reset */
  let timer = null;

  // WHY: Start the reset interval lazily on first request rather than
  // at import time, so tests don't leak timers if the middleware is
  // never mounted. setInterval is unref'd so it won't block shutdown.
  function ensureTimer() {
    if (timer !== null) {
      return;
    }
    timer = setInterval(() => {
      counters.clear();
    }, windowMs);
    // WHY: unref() prevents this timer from keeping the process alive
    // during graceful shutdown — the event loop can exit naturally.
    if (typeof timer === 'object' && typeof timer.unref === 'function') {
      timer.unref();
    }
  }

  /** @type {Set<string>} Fast lookup for throttled paths */
  const throttledPaths = new Set(paths);

  return function adminThrottle(req, res, next) {
    // WHY: Only throttle exact-match paths; sub-routes and health
    // endpoints pass through unaffected.
    if (!throttledPaths.has(req.path)) {
      return next();
    }

    ensureTimer();

    const current = counters.get(req.path) ?? 0;

    if (current >= max) {
      // WHY: Deterministic JSON envelope so clients can programmatically
      // detect throttling and implement backoff.
      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests — try again later',
          statusCode: 429,
          retryAfterSeconds: Math.ceil(windowMs / 1000),
        },
      });
    }

    counters.set(req.path, current + 1);
    next();
  };
}
