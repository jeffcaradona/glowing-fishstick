/**
 * Unit tests for src/scaffolder.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { scaffoldFiles, createPublicSubdirs } from '../../src/scaffolder.js';

let templateDir;
let targetDir;

beforeEach(async () => {
  // Create isolated temp directories for each test.
  templateDir = await mkdtemp(path.join(tmpdir(), 'fishstick-tpl-'));
  targetDir = await mkdtemp(path.join(tmpdir(), 'fishstick-out-'));
});

afterEach(async () => {
  await rm(templateDir, { recursive: true, force: true });
  await rm(targetDir, { recursive: true, force: true });
});

// ── scaffoldFiles ───────────────────────────────────────────────────────────

describe('scaffoldFiles', () => {
  it('renders Handlebars placeholders in .js files', async () => {
    await writeFile(
      path.join(templateDir, 'server.js'),
      "const logger = createLogger({ name: '{{appName}}' });",
    );

    await scaffoldFiles(templateDir, targetDir, { appName: 'my_test_app' });

    const out = await readFile(path.join(targetDir, 'server.js'), 'utf8');
    expect(out).toContain("createLogger({ name: 'my_test_app' })");
  });

  it('renders Handlebars placeholders in .json files', async () => {
    await writeFile(
      path.join(templateDir, 'package.json'),
      JSON.stringify({ name: '{{projectName}}', version: '0.0.1' }),
    );

    await scaffoldFiles(templateDir, targetDir, { projectName: 'test-app' });

    const out = await readFile(path.join(targetDir, 'package.json'), 'utf8');
    const parsed = JSON.parse(out);
    expect(parsed.name).toBe('test-app');
  });

  it('renders Handlebars placeholders in .md files', async () => {
    await writeFile(path.join(templateDir, 'README.md'), '# {{projectName}}\n');

    await scaffoldFiles(templateDir, targetDir, { projectName: 'my-proj' });

    const out = await readFile(path.join(targetDir, 'README.md'), 'utf8');
    expect(out).toBe('# my-proj\n');
  });

  it('copies .eta files verbatim (no Handlebars rendering)', async () => {
    const etaContent = '<%= appName %> and {{projectName}}';
    await writeFile(path.join(templateDir, 'view.eta'), etaContent);

    await scaffoldFiles(templateDir, targetDir, { appName: 'RENDERED', projectName: 'RENDERED' });

    const out = await readFile(path.join(targetDir, 'view.eta'), 'utf8');
    // WHY: .eta files must be copied verbatim — their `<%= %>` expressions are
    // Eta runtime variables, not generator-time placeholders.
    expect(out).toBe(etaContent);
  });

  it('copies .gitkeep files verbatim', async () => {
    await writeFile(path.join(templateDir, '.gitkeep'), '');

    await scaffoldFiles(templateDir, targetDir, {});

    const out = await readFile(path.join(targetDir, '.gitkeep'), 'utf8');
    expect(out).toBe('');
  });

  it('preserves nested directory structure', async () => {
    await mkdir(path.join(templateDir, 'src', 'config'), { recursive: true });
    await writeFile(
      path.join(templateDir, 'src', 'config', 'env.js'),
      "export const appName = '{{appName}}';",
    );

    await scaffoldFiles(templateDir, targetDir, { appName: 'nested-test' });

    const out = await readFile(path.join(targetDir, 'src', 'config', 'env.js'), 'utf8');
    expect(out).toContain("'nested-test'");
  });

  it('handles multiple placeholders in the same file', async () => {
    await writeFile(
      path.join(templateDir, 'config.js'),
      "const name = '{{appName}}';\nconst port = {{port}};",
    );

    await scaffoldFiles(templateDir, targetDir, { appName: 'multi-test', port: 8080 });

    const out = await readFile(path.join(targetDir, 'config.js'), 'utf8');
    expect(out).toContain("'multi-test'");
    expect(out).toContain('8080');
  });
});

// ── createPublicSubdirs ─────────────────────────────────────────────────────

describe('createPublicSubdirs', () => {
  it('creates css/ and js/ subdirectories with .gitkeep files', async () => {
    const publicDir = path.join(targetDir, 'public');
    await mkdir(publicDir, { recursive: true });

    await createPublicSubdirs(publicDir);

    const cssKeep = await readFile(path.join(publicDir, 'css', '.gitkeep'), 'utf8');
    const jsKeep = await readFile(path.join(publicDir, 'js', '.gitkeep'), 'utf8');
    expect(cssKeep).toBe('');
    expect(jsKeep).toBe('');
  });

  it('does not overwrite existing files in public subdirs', async () => {
    const publicDir = path.join(targetDir, 'public');
    const cssDir = path.join(publicDir, 'css');
    await mkdir(cssDir, { recursive: true });
    await writeFile(path.join(cssDir, 'style.css'), 'body { margin: 0; }');

    await createPublicSubdirs(publicDir);

    // css/style.css should still exist alongside .gitkeep (not added since dir non-empty)
    const style = await readFile(path.join(cssDir, 'style.css'), 'utf8');
    expect(style).toContain('margin');
  });
});
