/**
 * @module src/validators
 * @description Input validation for CLI arguments and prompts.
 *
 * WHY: Validate early — before any filesystem writes — so users see clear
 * error messages and no partial output is left behind.
 */

import { access } from 'node:fs/promises';

/**
 * Validate a project name against npm package naming rules.
 *
 * WHY: npm rejects names that don't follow these rules; pre-validating here
 * gives the user a clear message before any files are written.
 *
 * Rules enforced:
 * - Non-empty string
 * - Lowercase only
 * - Alphanumeric characters, hyphens, underscores (no dots at start)
 * - Max 214 characters (npm limit)
 * - No leading dot or underscore (npm convention)
 *
 * @param {string} name
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateProjectName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, message: 'Project name is required.' };
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { valid: false, message: 'Project name cannot be empty.' };
  }

  if (trimmed.length > 214) {
    return { valid: false, message: 'Project name must be 214 characters or fewer.' };
  }

  // WHY: npm forbids names starting with dots or underscores as package convention.
  if (trimmed.startsWith('.') || trimmed.startsWith('_')) {
    return { valid: false, message: 'Project name cannot start with a dot or underscore.' };
  }

  // WHY: npm requires lowercase to avoid case-sensitivity issues across registries and OSes.
  if (trimmed !== trimmed.toLowerCase()) {
    return { valid: false, message: 'Project name must be lowercase.' };
  }

  // WHY: Restrict to URL-safe characters to avoid issues with package registry paths.
  if (!/^[a-z0-9][a-z0-9\-_.]*$/.test(trimmed)) {
    return {
      valid: false,
      message:
        'Project name may only contain lowercase letters, numbers, hyphens, underscores, and dots.',
    };
  }

  return { valid: true };
}

/**
 * Validate a port number.
 *
 * @param {number|string} port
 * @returns {{ valid: boolean, message?: string }}
 */
export function validatePort(port) {
  const n = Number(port);

  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return { valid: false, message: 'Port must be an integer between 1 and 65535.' };
  }

  return { valid: true };
}

/**
 * Validate template type.
 *
 * @param {string} template
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateTemplate(template) {
  const allowed = ['app', 'api'];

  if (!allowed.includes(template)) {
    return { valid: false, message: `Template must be one of: ${allowed.join(', ')}.` };
  }

  return { valid: true };
}

/**
 * Validate a project description.
 *
 * WHY: The description is interpolated into generated source files (package.json,
 * README, etc.) via Handlebars with noEscape. Characters that can break out of
 * a JSON string context or inject Handlebars directives must be rejected to
 * prevent code injection into statically saved files (CWE-96).
 *
 * @param {string} description
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateDescription(description) {
  if (!description || typeof description !== 'string') {
    return { valid: false, message: 'Description is required.' };
  }

  const trimmed = description.trim();

  if (trimmed.length === 0) {
    return { valid: false, message: 'Description cannot be empty.' };
  }

  if (trimmed.length > 500) {
    return { valid: false, message: 'Description must be 500 characters or fewer.' };
  }

  // WHY: Reject characters that can escape JSON string boundaries, inject
  // Handlebars directives, or introduce control sequences into generated files.
  // Allowed: letters, digits, spaces, and common safe punctuation.
  if (/["\\`{}]/.test(trimmed)) {
    return {
      valid: false,
      message:
        'Description must not contain quotes, backslashes, backticks, or curly braces.',
    };
  }

  // WHY: Control characters (tabs, newlines, etc.) can corrupt generated JSON.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    return {
      valid: false,
      message: 'Description must not contain control characters.',
    };
  }

  return { valid: true };
}

/**
 * Check whether the target directory is safe to write into.
 *
 * WHY: Async check via access() rather than existsSync() to stay consistent
 * with the AGENTS.md I/O pattern rules (no sync FS in runtime paths).
 * This function is called from a CLI startup path, not a request path —
 * but we keep it async for contract consistency.
 *
 * @param {string} dirPath  Resolved absolute path to the target directory.
 * @param {boolean} force   If true, allow writing into existing directories.
 * @returns {Promise<{ valid: boolean, message?: string }>}
 */
export async function validateDirectory(dirPath, force) {
  try {
    await access(dirPath);
    // Directory exists — only allowed if --force is set.
    if (!force) {
      return {
        valid: false,
        message: `Directory "${dirPath}" already exists. Use --force to overwrite.`,
      };
    }
    return { valid: true };
  } catch {
    // WHY: ENOENT means the path doesn't exist — that's the happy path for
    // a fresh scaffold. Any other error (permissions, etc.) surfaces below.
    return { valid: true };
  }
}
