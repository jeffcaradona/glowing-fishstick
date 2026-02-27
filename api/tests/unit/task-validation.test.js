/**
 * @module api/tests/unit/task-validation
 * @description Unit tests for the task input validation module.
 *
 * Covers validateTaskInput (create + partial modes) and validateId.
 */
import { describe, it, expect } from 'vitest';
import { validateTaskInput, validateId, LIMITS } from '../../src/validation/task-validation.js';

// ---------- LIMITS ----------

describe('LIMITS', () => {
  it('exports frozen limits object', () => {
    expect(LIMITS.TITLE_MAX).toBe(255);
    expect(LIMITS.DESCRIPTION_MAX).toBe(4000);
    expect(Object.isFrozen(LIMITS)).toBe(true);
  });
});

// ---------- validateTaskInput (full / POST mode) ----------

describe('validateTaskInput (full mode — POST)', () => {
  it('accepts valid input with title only', () => {
    const result = validateTaskInput({ title: 'Buy milk' });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('accepts valid input with all fields', () => {
    const result = validateTaskInput({
      title: 'Buy milk',
      description: 'From the store',
      done: false,
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('accepts title at exactly max length', () => {
    const result = validateTaskInput({ title: 'a'.repeat(LIMITS.TITLE_MAX) });
    expect(result.valid).toBe(true);
  });

  it('rejects null body', () => {
    const result = validateTaskInput(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Request body must be a JSON object');
  });

  it('rejects undefined body', () => {
    const result = validateTaskInput(undefined);
    expect(result.valid).toBe(false);
  });

  it('rejects non-object body', () => {
    const result = validateTaskInput('string');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Request body must be a JSON object');
  });

  it('rejects missing title', () => {
    const result = validateTaskInput({});
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/title/);
  });

  it('rejects null title', () => {
    const result = validateTaskInput({ title: null });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/title.*required/);
  });

  it('rejects numeric title', () => {
    const result = validateTaskInput({ title: 42 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/title.*string/);
  });

  it('rejects empty string title', () => {
    const result = validateTaskInput({ title: '' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/title.*empty/);
  });

  it('rejects whitespace-only title', () => {
    const result = validateTaskInput({ title: '   ' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/title.*empty/);
  });

  it('rejects title exceeding max length', () => {
    const result = validateTaskInput({ title: 'a'.repeat(LIMITS.TITLE_MAX + 1) });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/title.*max length.*255/);
  });

  it('accepts description at exactly max length', () => {
    const result = validateTaskInput({
      title: 'Valid',
      description: 'x'.repeat(LIMITS.DESCRIPTION_MAX),
    });
    expect(result.valid).toBe(true);
  });

  it('rejects description exceeding max length', () => {
    const result = validateTaskInput({
      title: 'Valid',
      description: 'x'.repeat(LIMITS.DESCRIPTION_MAX + 1),
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/description.*max length.*4000/);
  });

  it('rejects non-string description', () => {
    const result = validateTaskInput({ title: 'Valid', description: 42 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/description.*string/);
  });

  it('accepts null description', () => {
    const result = validateTaskInput({ title: 'Valid', description: null });
    expect(result.valid).toBe(true);
  });

  it('accepts boolean done values', () => {
    expect(validateTaskInput({ title: 'X', done: true }).valid).toBe(true);
    expect(validateTaskInput({ title: 'X', done: false }).valid).toBe(true);
  });

  it('accepts numeric 0/1 done values', () => {
    expect(validateTaskInput({ title: 'X', done: 0 }).valid).toBe(true);
    expect(validateTaskInput({ title: 'X', done: 1 }).valid).toBe(true);
  });

  it('rejects invalid done values', () => {
    expect(validateTaskInput({ title: 'X', done: 2 }).valid).toBe(false);
    expect(validateTaskInput({ title: 'X', done: 'yes' }).valid).toBe(false);
    expect(validateTaskInput({ title: 'X', done: -1 }).valid).toBe(false);
  });

  it('collects multiple errors', () => {
    const result = validateTaskInput({
      title: 'a'.repeat(300),
      description: 'x'.repeat(5000),
      done: 99,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(3);
  });
});

// ---------- validateTaskInput (partial / PATCH mode) ----------

describe('validateTaskInput (partial mode — PATCH)', () => {
  it('accepts empty body (no fields to update)', () => {
    const result = validateTaskInput({}, { partial: true });
    expect(result.valid).toBe(true);
  });

  it('validates title only when provided', () => {
    const result = validateTaskInput({ title: '' }, { partial: true });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/title/);
  });

  it('validates description only when provided', () => {
    const result = validateTaskInput(
      { description: 'x'.repeat(5000) },
      { partial: true },
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/description/);
  });

  it('skips absent fields', () => {
    // Only `done` provided — title and description should not be validated.
    const result = validateTaskInput({ done: true }, { partial: true });
    expect(result.valid).toBe(true);
  });
});

// ---------- validateId ----------

describe('validateId', () => {
  it('accepts positive integers', () => {
    expect(validateId('1')).toEqual({ valid: true, id: 1 });
    expect(validateId('42')).toEqual({ valid: true, id: 42 });
    expect(validateId('999999')).toEqual({ valid: true, id: 999999 });
  });

  it('accepts numeric input', () => {
    expect(validateId(5)).toEqual({ valid: true, id: 5 });
  });

  it('rejects zero', () => {
    expect(validateId('0').valid).toBe(false);
  });

  it('rejects negative numbers', () => {
    expect(validateId('-1').valid).toBe(false);
  });

  it('rejects non-integer numbers', () => {
    expect(validateId('1.5').valid).toBe(false);
  });

  it('rejects NaN values', () => {
    expect(validateId('abc').valid).toBe(false);
    expect(validateId(NaN).valid).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateId('').valid).toBe(false);
  });

  it('rejects Infinity', () => {
    expect(validateId('Infinity').valid).toBe(false);
    expect(validateId(Infinity).valid).toBe(false);
  });

  it('returns descriptive error message', () => {
    const result = validateId('abc');
    expect(result.error).toBe('`id` must be a positive integer');
  });
});
