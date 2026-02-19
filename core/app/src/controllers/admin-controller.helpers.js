/**
 * @module controllers/admin/helpers
 * @description Internal helper utilities for admin controllers.
 */

import path from 'node:path';
import { formatUptime } from '@glowing-fishstick/shared';

/**
 * @param {number} timeoutMs
 * @returns {{ controller: AbortController, timeoutId: ReturnType<typeof setTimeout> }}
 */
export function createAbortControllerWithTimeout(timeoutMs) {
  const controller = new globalThis.AbortController();
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
