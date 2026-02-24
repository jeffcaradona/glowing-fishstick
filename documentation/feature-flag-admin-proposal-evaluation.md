# Feature Flag Admin Page Proposal — Evaluation

## Overall Assessment

The proposal is strong and implementation-oriented. It clearly separates **flag definition metadata** from **runtime resolution**, and it adds practical operator tooling (`evaluate` / `explain`) instead of only a static dashboard.

**Recommendation:** proceed with revisions. Priority changes should tighten schema guarantees, security/auditing details, and runtime-performance constraints for request-safe operation.

---

## What Is Working Well

1. **Good separation of concerns**
   - Registry as versioned intent (`flags/registry.yaml`)
   - Runtime state as authoritative behavior
   - Service wrapper as integration boundary

2. **Operationally useful API shape**
   - `evaluate(flagKey, context)` and `explain(flagKey, context)` provide actionable answers for incident response and rollout debugging.

3. **Lifecycle guardrails included early**
   - Expiry and removal tracking are explicitly planned.

4. **Stored procedure routing visibility**
   - Linking flag outcomes to procedure-version routing is high value for teams using controlled DB rollout patterns.

---

## Gaps and Risks to Address Before Build

## 1) Registry format and validation

### Risk
A single YAML file is easy initially but can drift without strict validation.

### Recommendation
- Define and enforce a JSON Schema for `flags/registry.yaml` in CI.
- Require normalized fields:
  - `key` pattern (e.g., `^[a-z0-9_.-]+$`)
  - `owner` as team alias/email format
  - ISO-8601 dates for `created_at` / `expires_at`
  - bounded enum for `type`
- Add deterministic CI outcomes:
  - **error**: malformed schema, missing required fields
  - **warning/error-by-policy**: expired flags
- Add duplicate-key and orphan-`removal_issue` checks.

## 2) Runtime-provider contract clarity

### Risk
`getProviderState(keys)` may return inconsistent metadata across providers, making UI results ambiguous.

### Recommendation
Define a normalized provider contract:
- `enabled` / `variant`
- `targetingSummary`
- `lastChangedAt`
- `lastChangedBy`
- `source` (`env` | `db` | `provider:<name>`)
- `confidence` (`authoritative` | `partial`)

This keeps explainability consistent even with mixed backends.

## 3) Event-loop and hot-path safety

### Risk
If `evaluate`/`explain` run expensive lookups on-demand, admin endpoints can become latent, and shared logic may accidentally leak into request hot paths.

### Recommendation
- Keep evaluation logic async-only.
- Cache immutable registry data in memory with controlled refresh.
- Avoid sync filesystem and sync crypto/process APIs in all runtime paths.
- Bound context-expansion and explanation size to prevent accidental O(n²) behavior.

## 4) Security and auditability details are underspecified

### Risk
Admin visibility endpoints can leak targeting and internal rollout logic if not tightly scoped.

### Recommendation
- Require authenticated admin role with explicit authorization middleware.
- Log evaluation requests with request-id, actor, flagKey, and redacted context.
- Redact sensitive context fields (`email`, tokens, PII) before persistence.
- Return sanitized error messages; keep internals in server logs.

## 5) Stored procedure routing safeguards

### Risk
Showing dynamic procedure selection is useful, but any mismatch in parameter signatures can create runtime failure risks.

### Recommendation
- Maintain explicit per-version signature metadata in registry effects or companion config.
- Add CI check validating declared signatures against approved stored-procedure metadata source.
- Treat signature mismatch as deploy-blocking.

## 6) Flag lifecycle policy needs hard limits

### Risk
Without strict policy, temporary release flags become permanent debt.

### Recommendation
- Enforce max TTL by type:
  - `release`: short TTL
  - `experiment`: medium TTL
  - `ops`: optional but reviewed periodically
  - `entitlement`: exempt with ownership review
- Add escalation policy when expiry is exceeded (warning → failed CI after grace period).

---

## Suggested API Refinements

### `GET /admin/flags`
Include:
- `registry`: authoritative metadata
- `runtime`: normalized provider state
- `status`: `healthy | degraded | unavailable`
- `compliance`: `expired`, `missingOwner`, `missingRemovalIssue`

### `POST /admin/flags/evaluate`
Add:
- `traceId` for diagnostics
- `sourceDecisions[]` to show which rule/provider branch resolved value
- `latencyMs` and `providerLatencyMs`

### Optional `GET /admin/flags/audit`
- Keep read model pagination-ready (`cursor`, `limit`)
- Include actor, action, before/after (for phase 3 write controls)

---

## UI/UX Recommendations

- Add filters: `type`, `owner`, `expired`, `enabled`.
- Add stale indicators: “expires in <N> days”, “owner missing”, “not evaluated in 30d”.
- Add details drawer sections:
  1. Registry intent
  2. Runtime decision snapshot
  3. Stored-procedure impact (if applicable)
- Show degraded provider state prominently to prevent false confidence.

---

## Implementation Sequence (Adjusted)

1. **Schema + CI first** (registry validation, TTL policy, duplicate checks)
2. **Service wrapper contract** (normalization + explain tracing)
3. **Read-only API + auth + audit logging**
4. **UI table/details/evaluation**
5. **Stored-procedure signature validation in CI**
6. **Lifecycle dashboard and expiry automation**

This order reduces rework and prevents building UI on unstable contracts.

---

## Decision

**Proceed with changes.**

The proposal is directionally correct and high leverage. Before implementation, formalize schema/CI rules, provider normalization, and security/audit behavior so the admin page is trustworthy, safe, and operationally useful at scale.
