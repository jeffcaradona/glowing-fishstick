/**
 * @file Unit tests for formatting utilities
 */

import { describe, it, expect } from 'vitest';
import { formatUptime } from '../../src/utils/formatters.js';

describe('formatUptime', () => {
  describe('seconds only (< 60s)', () => {
    it('formats 0 seconds', () => {
      expect(formatUptime(0)).toBe('0s');
    });

    it('formats 1 second', () => {
      expect(formatUptime(1)).toBe('1s');
    });

    it('formats 45 seconds', () => {
      expect(formatUptime(45)).toBe('45s');
    });

    it('formats 59 seconds (boundary)', () => {
      expect(formatUptime(59)).toBe('59s');
    });
  });

  describe('minutes and seconds (60s - 3599s)', () => {
    it('formats exactly 60 seconds as 1m 0s', () => {
      expect(formatUptime(60)).toBe('1m 0s');
    });

    it('formats 323 seconds as 5m 23s', () => {
      expect(formatUptime(323)).toBe('5m 23s');
    });

    it('formats 3599 seconds as 59m 59s (boundary)', () => {
      expect(formatUptime(3599)).toBe('59m 59s');
    });
  });

  describe('hours and minutes (3600s - 86399s)', () => {
    it('formats exactly 3600 seconds as 1h 0m', () => {
      expect(formatUptime(3600)).toBe('1h 0m');
    });

    it('formats 8130 seconds as 2h 15m', () => {
      expect(formatUptime(8130)).toBe('2h 15m');
    });

    it('formats 86399 seconds as 23h 59m (boundary)', () => {
      expect(formatUptime(86399)).toBe('23h 59m');
    });
  });

  describe('days, hours, and minutes (≥ 86400s)', () => {
    it('formats exactly 86400 seconds as 1d 0h 0m', () => {
      expect(formatUptime(86400)).toBe('1d 0h 0m');
    });

    it('formats 277920 seconds as 3d 5h 12m', () => {
      expect(formatUptime(277920)).toBe('3d 5h 12m');
    });

    it('formats 604800 seconds as 7d 0h 0m (1 week)', () => {
      expect(formatUptime(604800)).toBe('7d 0h 0m');
    });

    it('formats large uptimes (100 days)', () => {
      expect(formatUptime(8640000)).toBe('100d 0h 0m');
    });
  });

  describe('edge cases and input validation', () => {
    it('handles decimal seconds by flooring', () => {
      expect(formatUptime(45.7)).toBe('45s');
      expect(formatUptime(323.9)).toBe('5m 23s');
    });

    it('handles negative numbers', () => {
      expect(formatUptime(-100)).toBe('0s');
    });

    it('handles NaN', () => {
      expect(formatUptime(Number.NaN)).toBe('0s');
    });

    it('handles Infinity', () => {
      expect(formatUptime(Number.POSITIVE_INFINITY)).toBe('0s');
    });

    it('handles non-number types', () => {
      expect(formatUptime('123')).toBe('0s');
      expect(formatUptime(null)).toBe('0s');
      expect(formatUptime(undefined)).toBe('0s');
    });
  });
});
