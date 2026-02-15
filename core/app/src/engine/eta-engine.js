/**
 * @module engine/eta-engine
 * @description ETA template engine factory for Express with multi-directory
 * view resolution. Consumer views take priority over core views.
 *
 * Express resolves the top-level view file using its built-in multi-views
 * array. For sub-templates (include / partial), ETA's overridden
 * resolvePath checks every view directory in priority order.
 */

import { Eta } from 'eta';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Create an ETA template engine function for Express.
 *
 * Supports multiple view directories for template override:
 * consumer views are checked first, core views serve as fallback.
 * Include/partial resolution also follows the same priority.
 *
 * @param {string|string[]} viewDirs - View directory path(s). First = highest priority.
 * @returns {Function} Express-compatible engine function `(filePath, options, callback)`.
 */
export function createEtaEngine(viewDirs) {
  const dirs = Array.isArray(viewDirs) ? viewDirs : [viewDirs];

  const eta = new Eta({
    views: dirs[0],
    autoEscape: true,
    cache: process.env.NODE_ENV === 'production',
  });

  // ── Multi-directory include resolution ───────────────────────
  // Override resolvePath so that include() in templates checks
  // every views directory in priority order.
  const _origResolvePath = eta.resolvePath?.bind(eta);

  eta.resolvePath = function resolveMultiDir(templatePath) {
    const ext = templatePath.endsWith('.eta') ? '' : '.eta';
    for (const dir of dirs) {
      const candidate = path.resolve(dir, templatePath + ext);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    // Fallback to default resolution (throws if not found)
    if (_origResolvePath) return _origResolvePath(templatePath);
    throw new Error(`Template not found: ${templatePath}`);
  };

  /**
   * Express template engine callback.
   *
   * Express resolves the top-level view using its own multi-views
   * array and passes the absolute path here. For sub-templates
   * (include/partial), ETA's overridden resolvePath handles
   * multi-directory resolution.
   *
   * @param {string}   filePath - Absolute path resolved by Express.
   * @param {object}   options  - Merged app.locals + res.locals + render data.
   * @param {Function} callback - `(err, html)` callback.
   */
  return function etaEngine(filePath, options, callback) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const result = eta.renderString(content, options);
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  };
}
