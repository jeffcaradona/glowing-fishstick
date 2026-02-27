/**
 * @module middlewares/admin-throttle
 * @description Re-exports createAdminThrottle from @glowing-fishstick/shared.
 *
 * WHY: The throttle implementation is framework-agnostic and was duplicated
 * identically in core/app and core/api. Consolidated into shared to
 * eliminate Sonar code-duplication findings and ensure uniform behavior.
 * This re-export preserves the original import path for existing consumers.
 *
 * VERIFY IF CHANGED: core/shared/src/middlewares/admin-throttle.js is the
 * canonical implementation. Update there, not here.
 */
export { createAdminThrottle } from '@glowing-fishstick/shared';
