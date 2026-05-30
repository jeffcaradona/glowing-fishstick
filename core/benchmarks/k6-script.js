/* global __ENV */
/**
 * @file benchmarks/k6-script.js
 * @description k6 load test script for glowing-fishstick core endpoints.
 *
 * Runs in the k6 JS runtime (not Node.js). All endpoints are hit concurrently
 * within each virtual user iteration — one VU loops through all endpoints
 * on every iteration for the full duration.
 *
 * Invoked by core/benchmarks/run.js via child_process.spawn.
 * Environment variables injected by the orchestrator:
 *   BASE_URL     - e.g. http://localhost:4000
 *   CONNECTIONS  - number of concurrent virtual users
 *   DURATION     - seconds to run (e.g. "5")
 */

import http from 'k6/http';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';

// ── Options ────────────────────────────────────────────────────
export const options = {
  vus: Number(__ENV.CONNECTIONS) || 10,
  duration: `${__ENV.DURATION || '5'}s`,
};

// ── Endpoints ──────────────────────────────────────────────────
const ENDPOINTS = [
  { path: '/healthz', label: '/healthz  (liveness check)', key: 'healthz' },
  { path: '/readyz', label: '/readyz   (readiness check)', key: 'readyz' },
  { path: '/livez', label: '/livez    (liveness alias)', key: 'livez' },
  { path: '/', label: '/          (landing page)', key: 'root' },
  { path: '/admin', label: '/admin     (admin dashboard)', key: 'admin' },
];

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

// ── Per-endpoint custom metrics ────────────────────────────────
// WHY named metrics instead of groups: k6's per-group http metrics are not
// exposed in a stable cross-version shape in handleSummary. Named Counter and
// Trend metrics are the reliable, documented way to get per-endpoint data.
const endpointMetrics = {};
for (const { key } of ENDPOINTS) {
  endpointMetrics[key] = {
    duration: new Trend(`http_req_duration_${key}`, true),
    requests: new Counter(`http_reqs_${key}`),
    errors: new Counter(`http_errors_${key}`),
  };
}

// ── Default function (VU loop) ─────────────────────────────────
export default function () {
  for (const { path, key } of ENDPOINTS) {
    const res = http.get(`${BASE_URL}${path}`);
    const m = endpointMetrics[key];
    m.duration.add(res.timings.duration);
    m.requests.add(1);
    const ok = check(res, { 'status 200': (r) => r.status === 200 });
    if (!ok) {
      m.errors.add(1);
    }
  }
}

// ── Custom summary table ───────────────────────────────────────
// WHY: Replicates the output format from the previous autocannon harness —
// one row per endpoint showing req/sec, avg latency, and error count,
// sorted by throughput descending.
export function handleSummary(data) {
  const rows = ENDPOINTS.map(({ label, key }) => {
    const reqs = data.metrics[`http_reqs_${key}`];
    const dur = data.metrics[`http_req_duration_${key}`];
    const errs = data.metrics[`http_errors_${key}`];
    return {
      label,
      reqPerSec: reqs?.values?.rate ?? 0,
      latencyMs: dur?.values?.avg ?? 0,
      errors: errs?.values?.count ?? 0,
    };
  });

  rows.sort((a, b) => b.reqPerSec - a.reqPerSec);

  const lines = [
    '\n=== Summary (sorted by req/sec) ===',
    '  req/sec    latency    errors    endpoint',
    '  ─────────────────────────────────────────────────',
    ...rows.map(({ label, reqPerSec, latencyMs, errors }) => {
      const rps = String(Math.round(reqPerSec)).padStart(7);
      const lat = `${latencyMs.toFixed(1)} ms`.padStart(9);
      const err = String(errors).padStart(6);
      return `  ${rps}    ${lat}    ${err}    ${label}`;
    }),
    '',
  ];

  return { stdout: lines.join('\n') };
}
