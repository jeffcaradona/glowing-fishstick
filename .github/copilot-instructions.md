# Copilot Instructions: Documentation, Organization, and Performance Guardrails

All coding constraints, performance rules, and review checklists are defined in `AGENTS.md` (root). Those rules are **non-negotiable** and apply to all code changes.

## Required behavior

For performance-sensitive changes, include a brief note in PR description about expected latency/throughput impact.

1. Read `AGENTS.md` before proposing or applying changes.
2. Treat `AGENTS.md` as canonical for documentation sync, runtime safety, and review quality gates.
3. If any instruction appears to conflict, prefer the stricter `AGENTS.md` rule.

## Critical fallback rules (if context is constrained)

- Keep request paths non-blocking: no `*Sync` filesystem/child-process/crypto APIs in routes/middleware.
- Keep async contracts consistent: public APIs must be uniformly async; never mix sync/async callback timing; surface errors through one mechanism only (throw/reject/callback(err)) — never multiple paths.
- Keep docs synchronized when changing package names/exports/entrypoints: `README.md`, `app/DEV_APP_README.md`, `documentation/00-project-specs`, `documentation/99-potential-gaps.md`.
- Keep routes thin and async; delegate heavier work to services/workers.
- Add WHY-comments for non-trivial decisions (error handling, fallback, perf/security/legal tradeoffs).
- Run validation commands from `AGENTS.md` before finalizing.