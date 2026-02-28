/**
 * Package entry point — re-exports the public API surface.
 *
 * @module glowing-fishstick
 */

export { createApp } from './src/app-factory.js';
export {
  createServer,
  createLogger,
  createRequestLogger,
  createRequestIdMiddleware,
} from '@glowing-fishstick/shared';
export { createConfig, filterSensitiveKeys } from './src/config/env.js';
export {
  createAppError,
  createNotFoundError,
  createValidationError,
} from './src/errors/appError.js';
