/**
 * @module errors/appError
 * @description Application error class and factory functions.
 *
 * AppError is the single class in the codebase — a pragmatic exception
 * to the functional-first rule because JavaScript error handling requires
 * class extension for proper `instanceof`, stack traces, and `catch`
 * semantics. Consumers use the factory functions instead of `new`.
 */

/**
 * Operational application error with a machine-readable code and HTTP
 * status code.
 *
 * @class
 * @extends Error
 */
class AppError extends Error {
  /**
   * @param {string} code       - Machine-readable error code (e.g. 'NOT_FOUND').
   * @param {string} message    - Human-readable error message.
   * @param {number} statusCode - HTTP status code (e.g. 404, 400, 500).
   */
  constructor(code, message, statusCode) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

/**
 * Create a generic application error.
 *
 * @param {string} code       - Machine-readable error code.
 * @param {string} message    - Human-readable error message.
 * @param {number} statusCode - HTTP status code.
 * @returns {AppError}
 */
export function createAppError(code, message, statusCode) {
  return new AppError(code, message, statusCode);
}

/**
 * Create a 404 Not Found error.
 *
 * @param {string} [message='Resource not found'] - Error message.
 * @returns {AppError}
 */
export function createNotFoundError(message = 'Resource not found') {
  return new AppError('NOT_FOUND', message, 404);
}

/**
 * Create a 400 Validation error.
 *
 * @param {string} [message='Validation failed'] - Error message.
 * @returns {AppError}
 */
export function createValidationError(message = 'Validation failed') {
  return new AppError('VALIDATION_ERROR', message, 400);
}
