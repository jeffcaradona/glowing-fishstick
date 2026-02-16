/**
 * @file core/app/tests/integration/startup-hook-ordering.test.js
 * @description Integration test for P0 startup hook ordering fix.
 *
 * Verifies that the race condition between createServer() and
 * registerStartupHook() is fixed via setImmediate() deferral.
 *
 * Issue: createServer() previously executed startup hooks synchronously
 * during factory call. Consumer code registered hooks AFTER the factory
 * returned, causing hooks to be skipped or run too late.
 *
 * Fix: Wrap startup IIFE in setImmediate() to defer execution to next
 * event loop tick, guaranteeing consumer hook registration happens first.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, createServer, createConfig } from '../../index.js';

describe('Startup Hook Ordering (P0 Race Condition Fix)', () => {
  let app;
  let config;
  let logger;
  let portCounter = 12000; // Use ports > 10000 to avoid permission issues

  beforeEach(() => {
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    config = createConfig({ port: portCounter++, logger });
    app = createApp(config, []);
  });

  afterEach(() => {
    // Clear any listeners
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  it('should execute consumer-registered startup hooks in FIFO order before server listens', async () => {
    const executionOrder = [];
    const serverListening = vi.fn();

    const { server, registerStartupHook, close } = createServer(app, config);

    // Listen for server listening event
    server.once('listening', serverListening);

    // These hook registrations happen AFTER createServer() returns
    // but BEFORE the deferred setImmediate() callback fires.
    // Without the fix, these hooks would be skipped.
    registerStartupHook(async () => {
      executionOrder.push('hook-1');
    });

    registerStartupHook(async () => {
      executionOrder.push('hook-2');
    });

    registerStartupHook(async () => {
      executionOrder.push('hook-3');
    });

    // Give the deferred startup sequence time to complete
    // (typically < 1ms, this is generous)
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify hooks executed in order
    expect(executionOrder).toEqual(['hook-1', 'hook-2', 'hook-3']);
    expect(serverListening).toHaveBeenCalled();

    // Cleanup
    await close();
  });

  it('should not skip consumer hooks due to race condition', async () => {
    const hookExecuted = vi.fn();

    const { registerStartupHook, close } = createServer(app, config);

    // Register hook after createServer() returns (synchronously)
    registerStartupHook(async () => {
      hookExecuted();
    });

    // Wait for deferred startup
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Hook should have been executed despite being registered after factory call
    expect(hookExecuted).toHaveBeenCalledTimes(1);

    // Cleanup
    await close();
  });

  it('should handle errors in hooks without skipping subsequent hooks', async () => {
    const executionOrder = [];

    const { registerStartupHook, close } = createServer(app, config);

    registerStartupHook(async () => {
      executionOrder.push('hook-1');
    });

    registerStartupHook(async () => {
      executionOrder.push('hook-2');
      throw new Error('Hook 2 failed');
    });

    registerStartupHook(async () => {
      executionOrder.push('hook-3');
    });

    // Wait for deferred startup
    await new Promise((resolve) => setTimeout(resolve, 200));

    // All hooks should have executed despite hook-2 throwing
    expect(executionOrder).toEqual(['hook-1', 'hook-2', 'hook-3']);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.objectContaining({ message: 'Hook 2 failed' }),
      }),
      'Error in startup hook',
    );
    await close();
  });

  it('should allow mixing app-level and server-level hook registration', async () => {
    const executionOrder = [];

    // Register hook on app before passing to createServer
    app.registerStartupHook(async () => {
      executionOrder.push('app-hook');
    });

    const { registerStartupHook, close } = createServer(app, config);

    // Register hook on server after createServer() returns
    registerStartupHook(async () => {
      executionOrder.push('server-hook');
    });

    // Wait for deferred startup (app hook is wrapped by server)
    await new Promise((resolve) => setTimeout(resolve, 200));

    // App hook should execute (wrapped by server), then server hook
    expect(executionOrder).toContain('app-hook');
    expect(executionOrder).toContain('server-hook');

    // Cleanup
    await close();
  });
});
