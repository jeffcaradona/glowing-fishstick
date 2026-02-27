/**
 * Unit tests for src/validators.js
 */

import { describe, it, expect } from 'vitest';
import {
  validateProjectName,
  validatePort,
  validateTemplate,
  validateDirectory,
} from '../../src/validators.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// ── validateProjectName ─────────────────────────────────────────────────────

describe('validateProjectName', () => {
  it('accepts a simple valid name', () => {
    expect(validateProjectName('my-app').valid).toBe(true);
  });

  it('accepts names with numbers', () => {
    expect(validateProjectName('app-v2').valid).toBe(true);
  });

  it('accepts names with underscores and dots', () => {
    expect(validateProjectName('my_app.v2').valid).toBe(true);
  });

  it('rejects empty string', () => {
    const result = validateProjectName('');
    expect(result.valid).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('rejects undefined', () => {
    const result = validateProjectName(undefined);
    expect(result.valid).toBe(false);
  });

  it('rejects names starting with a dot', () => {
    const result = validateProjectName('.hidden');
    expect(result.valid).toBe(false);
  });

  it('rejects names starting with an underscore', () => {
    const result = validateProjectName('_private');
    expect(result.valid).toBe(false);
  });

  it('rejects uppercase names', () => {
    const result = validateProjectName('MyApp');
    expect(result.valid).toBe(false);
  });

  it('rejects names longer than 214 characters', () => {
    const result = validateProjectName('a'.repeat(215));
    expect(result.valid).toBe(false);
  });

  it('accepts names exactly 214 characters long', () => {
    expect(validateProjectName('a'.repeat(214)).valid).toBe(true);
  });

  it('rejects names with spaces', () => {
    const result = validateProjectName('my app');
    expect(result.valid).toBe(false);
  });

  it('rejects names with @ symbols', () => {
    const result = validateProjectName('@scope/my-app');
    expect(result.valid).toBe(false);
  });
});

// ── validatePort ────────────────────────────────────────────────────────────

describe('validatePort', () => {
  it('accepts port 3000', () => {
    expect(validatePort(3000).valid).toBe(true);
  });

  it('accepts port 1 (minimum)', () => {
    expect(validatePort(1).valid).toBe(true);
  });

  it('accepts port 65535 (maximum)', () => {
    expect(validatePort(65535).valid).toBe(true);
  });

  it('accepts port as string "3000"', () => {
    expect(validatePort('3000').valid).toBe(true);
  });

  it('rejects port 0', () => {
    expect(validatePort(0).valid).toBe(false);
  });

  it('rejects port 65536', () => {
    expect(validatePort(65536).valid).toBe(false);
  });

  it('rejects non-integer port', () => {
    expect(validatePort(3000.5).valid).toBe(false);
  });

  it('rejects NaN', () => {
    expect(validatePort('abc').valid).toBe(false);
  });
});

// ── validateTemplate ────────────────────────────────────────────────────────

describe('validateTemplate', () => {
  it('accepts "app"', () => {
    expect(validateTemplate('app').valid).toBe(true);
  });

  it('accepts "api"', () => {
    expect(validateTemplate('api').valid).toBe(true);
  });

  it('rejects unknown template type', () => {
    const result = validateTemplate('typescript');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/app.*api/);
  });

  it('rejects empty string', () => {
    expect(validateTemplate('').valid).toBe(false);
  });
});

// ── validateDirectory ───────────────────────────────────────────────────────

describe('validateDirectory', () => {
  it('accepts a path that does not exist', async () => {
    const result = await validateDirectory('/nonexistent-path-xyzzy-123/my-app', false);
    expect(result.valid).toBe(true);
  });

  it('rejects an existing directory when force=false', async () => {
    // tmpdir always exists
    const result = await validateDirectory(tmpdir(), false);
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/already exists/);
  });

  it('accepts an existing directory when force=true', async () => {
    const result = await validateDirectory(tmpdir(), true);
    expect(result.valid).toBe(true);
  });

  it('accepts a freshly created temp directory with force=true', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fishstick-test-'));
    try {
      const result = await validateDirectory(dir, true);
      expect(result.valid).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
