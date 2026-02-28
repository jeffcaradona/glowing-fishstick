/**
 * @module src/scaffolder
 * @description Recursively copies template files into the target directory,
 * rendering Handlebars placeholders where applicable.
 *
 * WHY: Keep copy + render logic here, separated from the orchestration in
 * generator.js, so it can be unit-tested independently with a temp directory.
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import Handlebars from 'handlebars';

/**
 * File extensions that are processed through Handlebars rendering.
 * All other files are copied verbatim.
 *
 * WHY: `.eta` files use `<%= %>` Eta runtime syntax — they must be copied
 * verbatim so the Eta engine can render them at request time, not at scaffold
 * time. `.gitkeep` files are empty markers, no rendering needed.
 */
const RENDERABLE_EXTENSIONS = new Set(['.js', '.json', '.md', '.txt', '.env', '.gitignore']);

/**
 * Determine whether a file should be processed through Handlebars.
 *
 * @param {string} filePath  Full or relative file path.
 * @returns {boolean}
 */
function isRenderable(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath);

  // WHY: Some dotfiles have no extension but are still text files we want to
  // render (e.g. `.env.example`). Treat dotfiles without an extension that
  // don't match known binary names as renderable.
  if (ext === '') {
    // .gitkeep is intentionally empty — copy verbatim.
    return base !== '.gitkeep';
  }

  return RENDERABLE_EXTENSIONS.has(ext);
}

/**
 * Recursively scaffold files from `templateDir` into `targetDir`.
 *
 * For each file:
 * - If renderable (JS/JSON/MD/etc): compile through Handlebars with `context`.
 * - Otherwise: copy verbatim.
 *
 * @param {string} templateDir  Absolute path to the source template directory.
 * @param {string} targetDir    Absolute path to the destination directory.
 * @param {object} context      Handlebars template variables.
 * @returns {Promise<void>}
 */
export async function scaffoldFiles(templateDir, targetDir, context) {
  // WHY: Use `recursive: true` on readdir (Node 18.17+/22) to avoid
  // reimplementing recursive directory traversal. Returns relative paths.
  const entries = await readdir(templateDir, { recursive: true, withFileTypes: true });

  for (const entry of entries) {
    // withFileTypes gives us Dirent objects with .name and .parentPath
    const srcPath = path.join(entry.parentPath, entry.name);
    // Compute relative path from template root to preserve directory structure.
    const relPath = path.relative(templateDir, srcPath);
    const destPath = path.join(targetDir, relPath);

    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      continue;
    }

    // Ensure parent directory exists before writing the file.
    await mkdir(path.dirname(destPath), { recursive: true });

    if (isRenderable(srcPath)) {
      const raw = await readFile(srcPath, 'utf8');
      // WHY: Compile a fresh template per file to avoid cross-file state.
      // Handlebars is synchronous; this runs in the CLI startup path (not
      // request handling), so sync compilation is acceptable.
      //
      // WHY (noEscape): Auto-escaping is disabled because templates produce
      // JS, JSON, and Markdown — not browser-served HTML. Escaping would
      // corrupt generated source files (e.g. `&` → `&amp;`). This is safe
      // because: (1) this is a local CLI tool, output is written to disk,
      // never rendered in a browser; (2) context values are developer-
      // controlled CLI inputs (projectName, port, etc.); (3) templates are
      // first-party files shipped with the package, not user-supplied.
      const compiled = Handlebars.compile(raw, { noEscape: true });
      const rendered = compiled(context);
      await writeFile(destPath, rendered, 'utf8');
    } else {
      // Copy binary or verbatim files (images, .eta, .gitkeep, etc.)
      const contents = await readFile(srcPath);
      await writeFile(destPath, contents);
    }
  }
}

/**
 * Create empty public subdirectories with `.gitkeep` marker files.
 * These directories are meaningful structure but have no template files.
 *
 * WHY: Git does not track empty directories. `.gitkeep` files ensure
 * the generated project has the expected public/css and public/js layout
 * even before the developer adds real assets.
 *
 * @param {string} publicDir  Absolute path to the generated `public/` dir.
 * @returns {Promise<void>}
 */
export async function createPublicSubdirs(publicDir) {
  const subdirs = ['css', 'js'];

  for (const sub of subdirs) {
    const subDir = path.join(publicDir, sub);
    await mkdir(subDir, { recursive: true });

    // Only write .gitkeep if subdir has no files yet.
    const entries = await readdir(subDir);
    if (entries.length === 0) {
      await writeFile(path.join(subDir, '.gitkeep'), '', 'utf8');
    }
  }
}

/**
 * Check whether the given path refers to a directory.
 *
 * @param {string} p
 * @returns {Promise<boolean>}
 */
export async function isDirectory(p) {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}
