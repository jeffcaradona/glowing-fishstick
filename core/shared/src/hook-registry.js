/**
 * @module hook-registry
 * @description Generic hook registry system for lifecycle management.
 * Provides immutable hook registration with safe sequential async execution.
 * Suitable for startup, shutdown, or any lifecycle hooks.
 */

/**
 * Create a new hook registry.
 *
 * @returns {{ register: (hook: () => Promise<void>) => void, execute: () => Promise<void> }}
 */
export function createHookRegistry() {
  const hooks = [];

  /**
   * Register a hook function to be called during execution.
   * Hooks are executed sequentially in FIFO order.
   *
   * @param {() => Promise<void>} hook - Async function to register.
   * @throws {TypeError} if hook is not a function.
   */
  const register = (hook) => {
    if (typeof hook !== 'function') {
      throw new TypeError('Hook must be a function');
    }
    hooks.push(hook);
  };

  /**
   * Execute all registered hooks sequentially in FIFO order.
   * Errors in individual hooks are caught and logged but do not prevent
   * subsequent hooks from running.
   *
   * @returns {Promise<void>}
   */
  const execute = async () => {
    for (const hook of hooks) {
      try {
        await hook();
      } catch (err) {
        console.error('Hook execution error:', err.message);
      }
    }
  };

  return { register, execute };
}
