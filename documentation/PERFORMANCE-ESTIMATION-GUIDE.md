# Performance Estimation Guide (PoC Context)

## Why this document exists

This project is intentionally a demonstration/PoC, so performance questions should be answered with **measurement-driven ranges** instead of hard promises.

This guide explains how to estimate capacity for questions like:

- Can it handle 100 requests?
- Can it handle 1,000 requests?
- Can it handle 100,000 requests?

---

## First, define what "100 / 1,000 / 100,000 requests" means

Those numbers can describe very different loads:

1. **Total requests over a long time** (easy)
2. **Requests per minute** (moderate)
3. **Requests per second (RPS)** (hard)
4. **Concurrent in-flight requests** (hardest for latency)

For planning, treat these as separate test targets.

---

## Practical answer up front

- **100 requests total**: almost certainly yes.
- **1,000 requests total**: almost certainly yes.
- **100,000 requests total**: likely yes over time, but depends on sustained RPS and route complexity.

The important unknown is not total count; it is **throughput at acceptable latency and error rate**.

---

## What to measure (minimum KPI set)

For each endpoint class (`/healthz`, `/`, `/admin`, API JSON routes), capture:

- Throughput (`requests/sec`)
- Latency p50 / p95 / p99
- Error rate (`5xx`, timeouts, connection resets)
- CPU utilization
- Memory (RSS + heap growth)
- Event-loop delay (if available)

Recommended pass/fail guardrails for PoC confidence:

- Error rate < 1%
- p95 latency under an agreed budget (for example 200ms for simple routes)
- No sustained memory climb across a 10–30 minute run

---

## Existing benchmark support in this repo

The repository already includes a benchmark harness:

- `core/benchmarks/run.js`

It starts the app via factory functions and runs `autocannon` across core endpoints in sequence.

Use:

```bash
npm run benchmark:core
# or custom
node core/benchmarks/run.js --connections 50 --duration 10
```

---

## Test plan to estimate capacity credibly

## Stage 1 — Baseline (single instance)

Goal: find normal operating range.

Example matrix:

- Connections: `10`, `25`, `50`
- Duration: `30s` per run
- Endpoints: `/healthz`, `/`, `/admin` and representative API route

Record p95 latency and errors. The highest point with stable latency + near-zero errors is your baseline range.

## Stage 2 — Stress test (find knee point)

Goal: identify where latency accelerates and errors appear.

- Increase connections gradually (`50 -> 100 -> 200`)
- Keep duration `60s`
- Track when p95/p99 jumps sharply and 5xx/timeout rate rises

That knee point is near practical max for a single process on that machine profile.

## Stage 3 — Soak test (stability)

Goal: verify no leaks/drift.

- Run at ~60–70% of Stage 2 knee throughput
- Duration: `15–60 minutes`
- Watch heap/RSS trend and error rate

## Stage 4 — Scenario tests (realistic mix)

Goal: estimate production-like behavior for internal use.

- Route mix (example): 70% health/simple, 20% API list/read, 10% admin
- Include auth/session behavior once auth is implemented
- Include any upstream dependency (DB/API) with realistic latency

---

## Turning results into "100 / 1,000 / 100,000" answers

After Stage 1–4, convert throughput to capacity windows:

- If sustained safe throughput is `RPS_safe`, then:
  - `100` requests ≈ `100 / RPS_safe` seconds
  - `1,000` requests ≈ `1,000 / RPS_safe` seconds
  - `100,000` requests ≈ `100,000 / RPS_safe` seconds

Example (illustrative only):

- If `RPS_safe = 250`
  - 100 req ≈ 0.4s
  - 1,000 req ≈ 4s
  - 100,000 req ≈ 400s (~6.7 min)

This is why total count alone is not a strong performance metric.

---

## Important caveats for this PoC

- Dev app routes are simple; real business logic will lower throughput.
- Auth, DB calls, external APIs, and template complexity materially change results.
- Node process count, CPU class, and reverse proxy configuration change capacity.
- Security hardening items (rate limiting/body limits) may change max throughput but improve resilience.

---

## Recommendation for your coworker demo

Present performance as:

1. **Measured baseline** on your local machine
2. **Known bottleneck/knee point** from stress test
3. **Conservative safe operating range** (with latency/error SLO)
4. **What changes when auth + real dependencies are introduced**

This keeps the conversation honest while still proving the architecture is viable.
