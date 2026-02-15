/**
 * @module registry-store
 * @description Private registry storage using WeakMap to enforce encapsulation.
 * Prevents external access or mutation of lifecycle registries.
 */

/**
 * WeakMap to store app lifecycle registries.
 * Maps app instance → { startupRegistry, shutdownRegistry }
 * Entries are automatically garbage-collected when app is destroyed.
 * @type {WeakMap}
 */
const registryMap = new WeakMap();

/**
 * Store startup and shutdown registries for an app instance.
 *
 * @param {import('express').Express} app - Express app instance
 * @param {object} startupRegistry - Startup hook registry
 * @param {object} shutdownRegistry - Shutdown hook registry
 * @throws {TypeError} if app is not an object (WeakMap requirement)
 */
export function storeRegistries(app, startupRegistry, shutdownRegistry) {
  if (!startupRegistry || !shutdownRegistry) {
    throw new TypeError('storeRegistries: both registries must be provided');
  }
  registryMap.set(app, { startupRegistry, shutdownRegistry });
}

/**
 * Retrieve startup and shutdown registries for an app instance.
 *
 * @param {import('express').Express} app - Express app instance
 * @returns {object|null} Object with { startupRegistry, shutdownRegistry } or null if not found
 */
export function getRegistries(app) {
  return registryMap.get(app) || null;
}
