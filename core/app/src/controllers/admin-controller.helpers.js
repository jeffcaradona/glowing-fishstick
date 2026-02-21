/**
 * @module controllers/admin/helpers
 * @description Internal helper utilities for admin controllers.
 */

import path from 'node:path';
import { formatUptime } from '@glowing-fishstick/shared';

/**
 * @param {number} timeoutMs
 * @returns {{ controller: AbortController, timeoutId: ReturnType<typeof setTimeout> }}
 *
 * SIGNAL MECHANISM:
 * AbortController.signal is passed to fetch() in the request options.
 * When controller.abort() is called (by the timeout), it:
 *   1. Sets the signal's `aborted` flag to true
 *   2. Triggers fetch's abort handling → fetch promise rejects with AbortError
 *   3. Immediately terminates the in-flight HTTP request (no TCP cleanup needed)
 *   4. Frees the event loop from waiting on that I/O operation
 *
 * WHY: Bound upstream latency for admin endpoints so stalled dependencies do
 * not pin event-loop work and block dashboard responses.
 * TRADEOFF: Slow-but-healthy APIs get cut off just like dead ones.
 * Acceptable for informational dashboards; partial data better than hanging.
 */
export function createAbortControllerWithTimeout(timeoutMs) {
  const controller = new globalThis.AbortController();
  // WHY: Bound upstream latency for admin endpoints so stalled dependencies do
  // not pin event-loop work and block dashboard responses.
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

/**
 * @param {string} absolutePath
 * @returns {string}
 */
export function normalizeRelativePathForDisplay(absolutePath) {
  if (!absolutePath) {
    return absolutePath;
  }
  return path.relative(process.cwd(), absolutePath).replaceAll('\\', '/');
}

/**
 * @param {(input: string | URL, init?: object) => Promise<Response>} fetchImpl
 * @param {URL} apiMemoryUrl
 * @param {object} requestOptions
 * @returns {Promise<object>}
 */
export async function readApiMemoryUsage(fetchImpl, apiMemoryUrl, requestOptions) {
  const response = await fetchImpl(apiMemoryUrl, requestOptions);
  if (!response.ok) {
    throw new Error(`API memory endpoint failed with status ${response.status}`);
  }
  const payload = await response.json();
  // WHY: Validate shape at boundary so templates never consume unchecked data.
  if (!payload?.memoryUsage) {
    throw new Error('API memory payload missing memoryUsage');
  }
  return payload.memoryUsage;
}

/**
 * @param {(input: string | URL, init?: object) => Promise<Response>} fetchImpl
 * @param {URL} apiRootUrl
 * @param {object} requestOptions
 * @returns {Promise<{version: string, frameworkVersion: string}>}
 */
export async function readApiVersion(fetchImpl, apiRootUrl, requestOptions) {
  const response = await fetchImpl(apiRootUrl, requestOptions);
  if (!response.ok) {
    throw new Error(`API root endpoint failed with status ${response.status}`);
  }
  const payload = await response.json();
  if (typeof payload?.version !== 'string' || typeof payload?.frameworkVersion !== 'string') {
    throw new TypeError('API root payload missing version fields');
  }
  return { version: payload.version, frameworkVersion: payload.frameworkVersion };
}

/**
 * @param {(input: string | URL, init?: object) => Promise<Response>} fetchImpl
 * @param {URL} apiRuntimeUrl
 * @param {object} requestOptions
 * @returns {Promise<{nodeVersion: string, uptime: string}>}
 */
export async function readApiRuntime(fetchImpl, apiRuntimeUrl, requestOptions) {
  const response = await fetchImpl(apiRuntimeUrl, requestOptions);
  if (!response.ok) {
    throw new Error(`API runtime endpoint failed with status ${response.status}`);
  }
  const payload = await response.json();
  if (!payload?.nodeVersion || typeof payload?.uptimeSeconds !== 'number') {
    throw new Error('API runtime payload missing required fields');
  }
  return {
    nodeVersion: payload.nodeVersion,
    uptime: formatUptime(payload.uptimeSeconds),
  };
}
