/**
 * Integration tests for the generator CLI.
 *
 * WHY: These tests run `generate()` directly (not via the CLI subprocess)
 * so we can assert on generated file contents without spawning child processes
 * in the test runner, while still exercising the full scaffold + render path.
 * The `--no-install` and `--no-git` equivalents are passed via options.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { generate } from '../../src/generator.js';

let workDir;

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'fishstick-int-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

/**
 * Helper: Run generate() with `install=false` and `git=false`, placing the
 * output inside workDir by temporarily overriding process.cwd().
 *
 * WHY: generate() resolves the target directory relative to process.cwd().
 * We override it here so each test gets its own isolated output path.
 */
async function scaffold(projectName, opts = {}) {
  const originalCwd = process.cwd;
  process.cwd = () => workDir;
  try {
    await generate({
      projectDirectory: projectName,
      template: opts.template ?? 'app',
      port: opts.port,
      install: false,
      git: false,
      force: opts.force ?? false,
    });
  } finally {
    process.cwd = originalCwd;
  }
  return path.join(workDir, projectName);
}

// ── App template ─────────────────────────────────────────────────────────────

describe('app template', () => {
  it('creates the project directory', async () => {
    const outDir = await scaffold('test-app');
    await expect(access(outDir)).resolves.toBeUndefined();
  });

  it('generates package.json with correct project name', async () => {
    const outDir = await scaffold('my-test-app');
    const raw = await readFile(path.join(outDir, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw);
    expect(pkg.name).toBe('my-test-app');
  });

  it('generates package.json with standalone dev script (no monorepo --watch)', async () => {
    const outDir = await scaffold('my-test-app');
    const raw = await readFile(path.join(outDir, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw);
    expect(pkg.scripts.dev).not.toContain('../core/');
    expect(pkg.scripts.dev).toContain('nodemon');
  });

  it('renders appName in server.js logger', async () => {
    const outDir = await scaffold('my-test-app');
    const serverJs = await readFile(path.join(outDir, 'src', 'server.js'), 'utf8');
    // my-test-app → my_test_app (hyphens → underscores for JS identifier)
    expect(serverJs).toContain("createLogger({ name: 'my_test_app' })");
  });

  it('renders appName in config/env.js', async () => {
    const outDir = await scaffold('my-config-app');
    const envJs = await readFile(path.join(outDir, 'src', 'config', 'env.js'), 'utf8');
    expect(envJs).toContain("'my_config_app'");
  });

  it('copies .eta views verbatim', async () => {
    const outDir = await scaffold('eta-test-app');
    const eta = await readFile(path.join(outDir, 'src', 'views', 'my-feature.eta'), 'utf8');
    // Eta runtime expressions must be preserved, not rendered by Handlebars.
    expect(eta).toContain('<%= appName %>');
  });

  it('creates public/css and public/js directories', async () => {
    const outDir = await scaffold('public-test-app');
    await expect(access(path.join(outDir, 'src', 'public', 'css'))).resolves.toBeUndefined();
    await expect(access(path.join(outDir, 'src', 'public', 'js'))).resolves.toBeUndefined();
  });

  it('renders projectName in README.md', async () => {
    const outDir = await scaffold('readme-test-app');
    const readme = await readFile(path.join(outDir, 'README.md'), 'utf8');
    expect(readme).toContain('readme-test-app');
  });
});

// ── API template ─────────────────────────────────────────────────────────────

describe('api template', () => {
  it('creates the project directory', async () => {
    const outDir = await scaffold('test-api', { template: 'api' });
    await expect(access(outDir)).resolves.toBeUndefined();
  });

  it('generates package.json with correct API dependencies', async () => {
    const outDir = await scaffold('test-api', { template: 'api' });
    const raw = await readFile(path.join(outDir, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw);
    expect(Object.keys(pkg.dependencies)).toContain('@glowing-fishstick/api');
    expect(Object.keys(pkg.dependencies)).not.toContain('@glowing-fishstick/app');
  });

  it('renders custom port in config/env.js', async () => {
    const outDir = await scaffold('port-api', { template: 'api', port: 4000 });
    const envJs = await readFile(path.join(outDir, 'src', 'config', 'env.js'), 'utf8');
    expect(envJs).toContain('4000');
  });

  it('uses default port 3001 when no port specified', async () => {
    const outDir = await scaffold('default-port-api', { template: 'api' });
    const envJs = await readFile(path.join(outDir, 'src', 'config', 'env.js'), 'utf8');
    expect(envJs).toContain('3001');
  });

  it('renders appName in server.js', async () => {
    const outDir = await scaffold('my-test-api', { template: 'api' });
    const serverJs = await readFile(path.join(outDir, 'src', 'server.js'), 'utf8');
    expect(serverJs).toContain("createLogger({ name: 'my_test_api' })");
  });

  it('does not create views directory (API has no views)', async () => {
    const outDir = await scaffold('no-views-api', { template: 'api' });
    // API template has no views dir — access should throw
    await expect(access(path.join(outDir, 'src', 'views'))).rejects.toThrow();
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('generate() validation', () => {
  it('throws VALIDATION_ERROR for invalid project name', async () => {
    await expect(
      scaffold('MyApp'), // uppercase — invalid npm name
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR when directory already exists and force=false', async () => {
    await scaffold('exists-test');
    await expect(scaffold('exists-test', { force: false })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('succeeds when directory exists and force=true', async () => {
    await scaffold('force-test');
    const outDir = await scaffold('force-test', { force: true });
    await expect(access(outDir)).resolves.toBeUndefined();
  });
});
