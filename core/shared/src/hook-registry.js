// In shared/src/hook-registry.js
export function createHookRegistry() {
  const hooks = [];
  
  return {
    register(hook) {
      if (typeof hook !== 'function') throw new TypeError('Hook must be a function');
      hooks.push(hook);
    },
    async execute() {
      for (const hook of hooks) {
        try {
          await hook();
        } catch (error) {
          console.error('Hook execution failed:', error);
        }
      }
    }
  };
}
