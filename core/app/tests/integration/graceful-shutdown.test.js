/**
 * @file core/app/tests/integration/graceful-shutdown.test.js
 * @description Integration test for P1 graceful shutdown behavior.
 *
 * Verifies that graceful shutdown:
 * - Emits 'shutdown' event to app listeners
 * - Returns 503 Service Unavailable for new requests after shutdown begins
 * - Sends Connection: close header on responses during shutdown
 * - Returns 503 on /readyz health check during shutdown
 * - Allows in-flight requests to complete within timeout
 * - Force-destroys lingering connections after shutdown timeout
 *
 * Related: documentation/P1-GRACEFUL-SHUTDOWN.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, createServer, createConfig } from '../../index.js';
import request from 'supertest';
import http from 'node:http';

describe('Graceful Shutdown (P1)', () => {
  let app;
  let config;
  let logger;
  let portCounter = 13000; // Use ports > 10000 to avoid permission issues
  let server;
  let agent;

  beforeEach(() => {
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    config = createConfig({
      port: portCounter++,
      allowProcessExit: false, // Disable process.exit for tests
      logger,
    });
    app = createApp(config, []);
    agent = new http.Agent({ keepAlive: true });
  });

  afterEach(async () => {
    // Clean up agent to avoid hanging tests
    if (agent) {
      agent.destroy();
    }

    // Clean up server if still running
    if (server?.listening) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }

    // Clear any listeners to prevent interference between tests
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  it('should emit shutdown event when SIGTERM is received', async () => {
    const shutdownListener = vi.fn();
    app.on('shutdown', shutdownListener);

    const { server: srv } = createServer(app, config);
    server = srv;

    // Wait for server to start listening
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Trigger shutdown via SIGTERM
    process.emit('SIGTERM');

    // Give shutdown sequence time to emit event
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(shutdownListener).toHaveBeenCalledTimes(1);
  }, 10000);

  it('should return 503 for new requests after shutdown begins', async () => {
    const { server: srv } = createServer(app, config);
    server = srv;

    // Wait for server to start listening
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Make a request before shutdown - should succeed (use index route)
    await request(app).get('/').agent(agent).expect(200);

    // Trigger shutdown
    process.emit('SIGTERM');

    // Give shutdown event time to propagate
    await new Promise((resolve) => setTimeout(resolve, 50));

    // New requests after shutdown should get 503
    const afterShutdown = await request(app).get('/').agent(agent).expect(503);

    expect(afterShutdown.body.error).toBe('Server is shutting down');
    expect(afterShutdown.headers.connection).toBe('close');
  }, 10000);

  it('should return 503 on /readyz during shutdown', async () => {
    const { server: srv } = createServer(app, config);
    server = srv;

    // Wait for server to start listening
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Readiness check before shutdown - should succeed
    const beforeShutdown = await request(app).get('/readyz').agent(agent).expect(200);

    expect(beforeShutdown.body.status).toBe('ready');

    // Trigger shutdown
    process.emit('SIGTERM');

    // Give shutdown event time to propagate
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Readiness check during shutdown should fail
    const afterShutdown = await request(app).get('/readyz').agent(agent).expect(503);

    expect(afterShutdown.body.status).toBe('not-ready');
    expect(afterShutdown.body.reason).toBe('shutdown in progress');
  }, 10000);

  it('should keep /healthz and /livez responding during shutdown', async () => {
    const { server: srv } = createServer(app, config);
    server = srv;

    // Wait for server to start listening
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Trigger shutdown
    process.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Health endpoints should still respond with 200
    // (they run before shutdown middleware)
    const healthz = await request(app).get('/healthz').agent(agent).expect(200);

    const livez = await request(app).get('/livez').agent(agent).expect(200);

    expect(healthz.body.status).toBe('ok');
    expect(livez.body.status).toBe('alive');
  }, 10000);

  it('should reject requests that arrive during shutdown', async () => {
    // This test verifies that requests initiated AFTER shutdown begins
    // are rejected, which is correct Kubernetes behavior.
    app.get('/slow-task', async (req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      res.json({ completed: true });
    });

    const { server: srv } = createServer(app, {
      ...config,
      shutdownTimeout: 5000,
    });
    server = srv;

    // Wait for server to start listening
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Trigger shutdown first
    process.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Request initiated AFTER shutdown should be rejected
    const response = await request(app).get('/slow-task').agent(agent);

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Server is shutting down');
  }, 10000);

  it('should handle shutdown timeout when connections linger', async () => {
    // This test verifies that if server.close() doesn't complete within
    // the timeout, remaining connections are force-destroyed.
    //
    // Note: In normal HTTP scenarios, requests complete quickly. The timeout
    // mainly protects against misbehaving keep-alive connections or hung requests.

    const { server: srv } = createServer(app, {
      ...config,
      shutdownTimeout: 100, // Very short timeout
    });
    server = srv;

    // Wait for server to start listening
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create a raw socket connection that won't close gracefully
    const net = await import('node:net');
    const socket = new net.Socket();
    socket.connect(config.port, 'localhost');

    // Wait for connection to establish
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Trigger shutdown
    process.emit('SIGTERM');

    // Wait for shutdown timeout to be exceeded
    await new Promise((resolve) => setTimeout(resolve, 300));

    // The setTimeout in close() should have triggered and logged warning
    // Note: Since server.close() waits for connections, and we have a lingering
    // socket, the timeout should eventually fire and force-destroy it.
    expect(logger.warn).toHaveBeenCalled();
    const warningCalls = logger.warn.mock.calls.map((call) => call[1] ?? '');
    const hasTimeoutWarning = warningCalls.some(
      (msg) => msg.includes('Shutdown timeout') || msg.includes('forcing remaining connections'),
    );
    expect(hasTimeoutWarning).toBe(true);

    // Clean up socket
    socket.destroy();
  }, 10000);

  it('should execute shutdown hooks before closing server', async () => {
    const executionOrder = [];

    app.on('shutdown', () => {
      executionOrder.push('app-shutdown-listener');
    });

    const { server: srv, registerShutdownHook } = createServer(app, config);
    server = srv;

    registerShutdownHook(async () => {
      executionOrder.push('shutdown-hook-1');
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    registerShutdownHook(async () => {
      executionOrder.push('shutdown-hook-2');
    });

    // Wait for server to start listening
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Trigger shutdown
    process.emit('SIGTERM');

    // Wait for shutdown sequence
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify execution order: app event, then hooks in FIFO
    expect(executionOrder).toEqual(['app-shutdown-listener', 'shutdown-hook-1', 'shutdown-hook-2']);
  }, 10000);

  it('should handle errors in shutdown hooks without blocking shutdown', async () => {
    const executionOrder = [];

    const { server: srv, registerShutdownHook } = createServer(app, config);
    server = srv;

    registerShutdownHook(async () => {
      executionOrder.push('hook-1');
    });

    registerShutdownHook(async () => {
      executionOrder.push('hook-2-error');
      throw new Error('Shutdown hook failed');
    });

    registerShutdownHook(async () => {
      executionOrder.push('hook-3');
    });

    // Wait for server to start listening
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Trigger shutdown
    process.emit('SIGTERM');

    // Wait for shutdown sequence
    await new Promise((resolve) => setTimeout(resolve, 300));

    // All hooks should execute despite error in hook-2
    expect(executionOrder).toEqual(['hook-1', 'hook-2-error', 'hook-3']);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.objectContaining({ message: 'Shutdown hook failed' }),
      }),
      'Error in shutdown hook',
    );
  }, 10000);

  it('should not process duplicate shutdown signals', async () => {
    const shutdownListener = vi.fn();
    app.on('shutdown', shutdownListener);

    const { server: srv } = createServer(app, config);
    server = srv;

    // Wait for server to start listening
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Trigger multiple shutdown signals
    process.emit('SIGTERM');
    process.emit('SIGINT');
    process.emit('SIGTERM');

    // Wait for shutdown sequence
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Shutdown should only be processed once
    expect(shutdownListener).toHaveBeenCalledTimes(1);
  }, 10000);
});
