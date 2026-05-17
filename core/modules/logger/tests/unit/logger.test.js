/**
 * @file Unit tests for createLogger (Winston backend)
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import Transport from 'winston-transport';
import winston from 'winston';
import { createLogger } from '../../src/logger.js';

/**
 * In-memory winston transport that captures every `info` it receives.
 * WHY: avoids brittle stdout/stream spying; lets us assert on the post-format
 * record directly.
 */
class MemoryTransport extends Transport {
  constructor(opts = {}) {
    super(opts);
    this.records = [];
  }
  log(info, callback) {
    this.records.push(info);
    callback();
  }
}

function createCapturingTransport() {
  const transport = new MemoryTransport();
  return { transport, records: transport.records };
}

describe('createLogger', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalLevel !== null && originalLevel !== undefined) {
      process.env.LOG_LEVEL = originalLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
    vi.restoreAllMocks();
  });

  it('returns a logger with standard methods', () => {
    const logger = createLogger({
      name: 'unit',
      transports: [new winston.transports.Console({ silent: true })],
    });
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('honors the level option', () => {
    const logger = createLogger({
      name: 'unit',
      level: 'warn',
      transports: [new winston.transports.Console({ silent: true })],
    });
    expect(logger.level).toBe('warn');
  });

  it('falls back to LOG_LEVEL env var', () => {
    process.env.LOG_LEVEL = 'debug';
    const logger = createLogger({
      name: 'unit',
      transports: [new winston.transports.Console({ silent: true })],
    });
    expect(logger.level).toBe('debug');
  });

  it('applies redaction to matching dotted paths in meta', () => {
    const { transport, records } = createCapturingTransport();
    const logger = createLogger({
      name: 'unit',
      redact: ['req.headers.authorization', 'password'],
      transports: [transport],
    });
    logger.info('login', {
      req: { headers: { authorization: 'Bearer secret-token' } },
      password: 'hunter2',
      keep: 'visible',
    });

    // Winston file/stream transports flush synchronously for our test transport.
    const last = records.at(-1);
    expect(last.req.headers.authorization).toBe('[REDACTED]');
    expect(last.password).toBe('[REDACTED]');
    expect(last.keep).toBe('visible');
  });

  it('serializes Error objects nested under meta.err with message/name/stack', () => {
    // WHY: regression guard for the Winston migration fix. format.errors({ stack: true })
    // only expands stacks when the top-level info object IS an Error (e.g.
    // `logger.error(new Error(...))`). When an Error is passed in meta —
    // `logger.error('msg', { err })` — Winston merges it into info.err and it
    // serializes as `{}` because Error's properties are non-enumerable. The
    // logger-level errSerializerFormat is meant to normalize that to a plain
    // object with message/name/stack so downstream transports always see the
    // structured payload.
    const { transport, records } = createCapturingTransport();
    const logger = createLogger({
      name: 'unit',
      transports: [transport],
    });
    const boom = new Error('boom');
    logger.error('operation failed', { err: boom });

    const last = records.at(-1);
    expect(last.err).toBeTypeOf('object');
    expect(last.err).not.toBeInstanceOf(Error);
    expect(last.err.message).toBe('boom');
    expect(last.err.name).toBe('Error');
    expect(typeof last.err.stack).toBe('string');
    expect(last.err.stack).toContain('boom');
  });

  it('emits JSON in production mode', () => {
    process.env.NODE_ENV = 'production';
    // WHY: capture by swapping the Console transport's underlying write target.
    // Winston's Console transport writes via `console._stdout` (process.stdout) by
    // default; intercepting process.stdout.write is racy across runners, so we
    // build the prod logger then capture by replacing the Console transport's
    // `log` method after construction.
    const logger = createLogger({ name: 'prod-test', level: 'info' });
    const consoleTransport = logger.transports[0];
    const captured = [];
    const original = consoleTransport.log?.bind(consoleTransport);
    consoleTransport.log = (info, cb) => {
      // The Console transport receives the post-format info object with the
      // Symbol(MESSAGE) holding the JSON line.
      const MESSAGE = Symbol.for('message');
      captured.push(info[MESSAGE] ?? JSON.stringify(info));
      if (cb) {
        cb();
      }
      return original?.(info, () => {});
    };
    logger.info('hello', { value: 42 });

    const joined = captured.join('');
    expect(joined).toContain('"message":"hello"');
    expect(joined).toContain('"value":42');
    expect(joined).toContain('"name":"prod-test"');
  });

  it('writes to a file when enableFile is true', async () => {
    const os = await import('node:os');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gfs-logger-'));

    const logger = createLogger({
      name: 'file-test',
      level: 'info',
      enableFile: true,
      logDir: dir,
    });
    logger.info('written-line', { foo: 'bar' });

    // Allow Winston's File transport to flush.
    await new Promise((resolve) => {
      logger.on('finish', resolve);
      logger.end();
    });

    const fileContents = fs.readFileSync(path.join(dir, 'file-test.log'), 'utf8');
    expect(fileContents).toContain('"message":"written-line"');
    expect(fileContents).toContain('"foo":"bar"');
  });
});
