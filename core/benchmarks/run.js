/**
 * @file benchmarks/run.js
 * @description Autocannon load benchmark for glowing-fishstick core endpoints.
 *
 * Spins up the framework using the factory pattern, runs autocannon against
 * each core endpoint in sequence, then tears down cleanly.
 *
 * Usage:
 *   npm run benchmark
 *   node benchmarks/run.js --connections 50 --duration 10
 *
 * Flags:
 *   --connections  Concurrent HTTP connections (default: 10)
 *   --duration     Seconds per endpoint (default: 5)
 */

import console from 'node:console';
import autocannon from 'autocannon';
import { createApp, createServer, createConfig } from '@glowing-fishstick/app';

// ── CLI args ───────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, defaultVal) => {
  const i = args.indexOf(flag);
  return i !== -1 ? Number(args[i + 1]) : defaultVal;
};

const CONNECTIONS = getArg('--connections', 10);
const DURATION = getArg('--duration', 5);
const PORT = 4000;

// ── Endpoints to hit ───────────────────────────────────────────
const ENDPOINTS = [
  { path: '/healthz', label: '/healthz  (liveness check)' },
  { path: '/readyz', label: '/readyz   (readiness check)' },
  { path: '/livez', label: '/livez    (liveness alias)' },
  { path: '/', label: '/          (landing page)' },
  { path: '/admin', label: '/admin     (admin dashboard)' },
];

// ── Silent logger — keeps benchmark output clean ───────────────
const noop = () => {};
const silentLogger = { info: noop, warn: noop, error: noop, debug: noop, fatal: noop, trace: noop };

// ── Helpers ────────────────────────────────────────────────────

/** Resolves once the http.Server is actively listening. */
function waitForListening(server) {
  if (server.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve) => server.once('listening', resolve));
}

/** Runs autocannon against a single URL, prints the result table, returns the result. */
async function runEndpoint(url, title) {
  const result = await autocannon({ url, connections: CONNECTIONS, duration: DURATION, title });
  autocannon.printResult(result);
  return result;
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const config = createConfig({ port: PORT, allowProcessExit: false, logger: silentLogger });
  const app = createApp(config, []); // No plugins — benchmarks core routes only
  const { server, close } = createServer(app, config);

  try {
    await waitForListening(server);

    const baseUrl = `http://localhost:${PORT}`;

    console.log('\n=== glowing-fishstick benchmark ===');
    console.log(`  connections : ${CONNECTIONS}`);
    console.log(`  duration    : ${DURATION}s per endpoint`);
    console.log(`  server      : ${baseUrl}`);
    console.log(`  endpoints   : ${ENDPOINTS.length}\n`);

    const summary = [];

    for (const { path, label } of ENDPOINTS) {
      console.log(`\n--- ${label} ---`);
      const result = await runEndpoint(`${baseUrl}${path}`, label);
      summary.push({
        label,
        reqPerSec: result.requests.average,
        latencyMs: result.latency.average,
        errors: result.errors,
      });
    }

    // ── Summary sorted by throughput ───────────────────────────
    console.log('\n=== Summary (sorted by req/sec) ===');
    console.log('  req/sec    latency    errors    endpoint');
    console.log('  ─────────────────────────────────────────────────');

    summary
      .sort((a, b) => b.reqPerSec - a.reqPerSec)
      .forEach(({ label, reqPerSec, latencyMs, errors }) => {
        const rps = String(Math.round(reqPerSec)).padStart(7);
        const lat = `${latencyMs.toFixed(1)} ms`.padStart(9);
        const err = String(errors).padStart(6);
        console.log(`  ${rps}    ${lat}    ${err}    ${label}`);
      });

    console.log('');
  } finally {
    await close();
    // Remove the SIGTERM/SIGINT listeners registered by createServer
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  }
}

try {
  await main();
} catch (err) {
  console.error('Benchmark failed:', err);
  process.exit(1);
}
