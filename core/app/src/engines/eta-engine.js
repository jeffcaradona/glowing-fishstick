/**
 * @module engine/eta-engine
 * @description Eta template engine factory for Express with multi-directory
 * view resolution. Consumer views take priority over core views.
 */

import { Eta } from 'eta';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Create an Eta template engine function for Express.
 *
 * Notes:
 * - Eta v4 expects `config.views` to be a single directory path.
 * - We preserve multi-directory fallback by overriding `resolvePath`.
 * - Template file indexing is performed at startup to avoid sync filesystem
 *   calls in request-handling paths.
 *
 * @param {string|string[]} viewDirs - View directory path(s). First = highest priority.
 * @returns {Function} Express-compatible engine function `(filePath, options, callback)`.
 */
export function createEtaEngine(viewDirs) {
  const dirs = (Array.isArray(viewDirs) ? viewDirs : [viewDirs]).map((dir) => path.resolve(dir));

  const eta = new Eta({
    views: dirs[0],
    autoEscape: true,
    useWith: true,
    cache: process.env.NODE_ENV === 'production',
  });

  // Startup-only index for fast existence checks during template resolution.
  const knownTemplates = new Set();
  for (const dir of dirs) {
    indexTemplates(dir, knownTemplates);
  }

  const pathPrefixRegExp = /^\\|^\//;

  eta.resolvePath = function resolveMultiDir(templatePath, options) {
    const ext = path.extname(templatePath) ? '' : '.eta';
    const normalizedTemplate = `${templatePath}${ext}`;
    const baseFilePath = options?.filepath;
    const candidates = [];

    if (baseFilePath) {
      if (pathPrefixRegExp.test(normalizedTemplate)) {
        const relativeTemplate = normalizedTemplate.replace(/^\/*|^\\*/, '');
        for (const dir of dirs) {
          candidates.push(path.resolve(dir, relativeTemplate));
        }
      } else {
        // Relative include from the current template's directory.
        candidates.push(path.resolve(path.dirname(baseFilePath), normalizedTemplate));

        // Fallback to top-level views directories in priority order.
        for (const dir of dirs) {
          candidates.push(path.resolve(dir, normalizedTemplate));
        }
      }
    } else {
      for (const dir of dirs) {
        candidates.push(path.resolve(dir, normalizedTemplate));
      }
    }

    for (const candidate of candidates) {
      if (isInAnyViewDir(candidate, dirs) && knownTemplates.has(candidate)) {
        return candidate;
      }
    }

    throw new Error(`Template not found: ${templatePath}`);
  };

  function toTemplateName(filePath) {
    const resolvedPath = path.resolve(filePath);
    for (const dir of dirs) {
      const relative = path.relative(dir, resolvedPath);
      if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
        const normalized = relative.split(path.sep).join('/');
        return normalized.endsWith('.eta') ? normalized.slice(0, -4) : normalized;
      }
    }
    return resolvedPath;
  }

  return function etaEngine(filePath, options, callback) {
    eta.renderAsync(toTemplateName(filePath), options).then(
      (result) => callback(null, result),
      (err) => callback(err),
    );
  };
}

function indexTemplates(dir, knownTemplates) {
  if (!fs.existsSync(dir)) {
    return;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      indexTemplates(fullPath, knownTemplates);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.eta')) {
      knownTemplates.add(fullPath);
    }
  }
}

function isInAnyViewDir(candidatePath, dirs) {
  return dirs.some((dir) => {
    const relative = path.relative(dir, candidatePath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
}
