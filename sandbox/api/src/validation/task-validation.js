/**
 * @module api/validation/task-validation
 * @description Application-level input validation for task API routes.
 *
 * Provides user-friendly 400 errors before data reaches SQLite.
 * Complements database CHECK constraints as a defense-in-depth layer.
 *
 * WHY: Application validation gives fast, human-readable feedback at the
 * route layer. Database constraints are the safety net — they should
 * never fire under normal operation because this module catches issues first.
 */

/**
 * Frozen constraint limits shared between validation and tests.
 * WHY: Single source of truth prevents drift between validation code,
 * database CHECK constraints, and test assertions.
 *
 * @type {Readonly<{ TITLE_MAX: number, DESCRIPTION_MAX: number }>}
 */
export const LIMITS = Object.freeze({
  TITLE_MAX: 255,
  DESCRIPTION_MAX: 4000,
});

/**
 * Validate task input data for create (POST) and update (PATCH) operations.
 *
 * @param {unknown} data - The request body to validate.
 * @param {{ partial?: boolean }} [opts={}] - Options:
 *   - `partial: true` (PATCH): all fields optional, validate only what is present.
 *   - `partial: false` (POST, default): `title` is required.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateTaskInput(data, opts = {}) {
  const errors = [];
  const partial = opts.partial ?? false;

  // WHY: Guard against null/undefined/non-object bodies before accessing fields.
  if (data === null || data === undefined || typeof data !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }

  // --- title ---
  if ('title' in data || !partial) {
    const { title } = data;

    if (title === null || title === undefined || typeof title !== 'string') {
      errors.push('`title` is required and must be a string');
    } else if (title.trim().length === 0) {
      errors.push('`title` must not be empty');
    } else if (title.length > LIMITS.TITLE_MAX) {
      errors.push(
        `\`title\` exceeds max length of ${LIMITS.TITLE_MAX} characters (got ${title.length})`,
      );
    }
  }

  // --- description ---
  if ('description' in data && data.description !== null && data.description !== undefined) {
    if (typeof data.description !== 'string') {
      errors.push('`description` must be a string');
    } else if (data.description.length > LIMITS.DESCRIPTION_MAX) {
      errors.push(
        '`description` exceeds max length of ' +
          `${LIMITS.DESCRIPTION_MAX} characters (got ${data.description.length})`,
      );
    }
  }

  // --- done ---
  if ('done' in data && data.done !== null && data.done !== undefined) {
    // WHY: Accept boolean or 0/1 integer — both are common in API clients.
    // Reject anything else to prevent silent coercion bugs.
    const d = data.done;
    const isValidDone = d === true || d === false || d === 0 || d === 1;
    if (!isValidDone) {
      errors.push('`done` must be a boolean or 0/1');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate and parse a route `:id` parameter.
 *
 * WHY: Express route params are always strings. We need to parse, validate
 * type/range, and reject invalid IDs before they reach the database layer.
 *
 * @param {unknown} raw - The raw `:id` parameter value from Express.
 * @returns {{ valid: boolean, id?: number, error?: string }}
 */
export function validateId(raw) {
  const parsed = Number(raw);

  // WHY: Reject NaN, negative, non-integer, and zero IDs — SQLite AUTOINCREMENT
  // starts at 1 and only produces positive integers.
  if (!Number.isFinite(parsed) || parsed < 1 || !Number.isInteger(parsed)) {
    return { valid: false, error: '`id` must be a positive integer' };
  }

  return { valid: true, id: parsed };
}
