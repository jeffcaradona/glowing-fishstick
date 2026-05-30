/**
 * @file benchmarks/run.js
 * @description k6 load benchmark for glowing-fishstick core endpoints.
 *
 * Spins up the framework using the factory pattern, spawns k6 against
 * all core endpoints concurrently, then tears down cleanly.
 *
 * Usage:
 *   npm run benchmark:core
 *   node core/benchmarks/run.js --connections 50 --duration 10
 *
 * Flags:
 *   --connections  Concurrent virtual users (default: 10)
 *   --duration     Seconds per run (default: 5)
 *
 * Prerequisites:
 *   k6 must be installed and available on PATH (https://k6.io/docs/get-started/installation/)
 */

import console from 'node:console';
import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { createApp, createServer, createConfig } from '@glowing-fishstick/app';

// ── CLI args ───────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, defaultVal) => {
  const i = args.indexOf(flag);
  return i === -1 ? defaultVal : Number(args[i + 1]);
};

const CONNECTIONS = getArg('--connections', 10);
const DURATION = getArg('--duration', 5);
const PORT = 4000;

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

/**
 * Spawns k6 and resolves when it exits cleanly.
 * WHY spawn without shell: k6 is a native binary on PATH — shell:false is sufficient and
 * avoids DEP0190 (arg concatenation) and any shell injection surface. Args are passed as
 * an array and never string-concatenated by the shell.
 */
function runK6(baseUrl) {
  // Resolve absolute path to the k6 script so this works regardless of cwd.
  const k6ScriptPath = fileURLToPath(new URL('./k6-script.js', import.meta.url));

  return new Promise((resolve, reject) => {
    const k6 = spawn(
      'k6',
      [
        'run',
        '--env', `CONNECTIONS=${CONNECTIONS}`,
        '--env', `DURATION=${DURATION}`,
        '--env', `BASE_URL=${baseUrl}`,
        k6ScriptPath,
      ],
      { stdio: 'inherit' },
    );

    k6.on('error', (err) => reject(new Error(`Failed to spawn k6: ${err.message}`)));
    k6.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`k6 exited with code ${code}`));
      }
    });
  });
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
    console.log(`  duration    : ${DURATION}s`);
    console.log(`  server      : ${baseUrl}`);
    console.log('');

    await runK6(baseUrl);
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
