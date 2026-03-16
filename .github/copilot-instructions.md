# Copilot Instructions: Documentation, Organization, and Performance Guardrails

All coding constraints, performance rules, and review checklists are defined in `AGENTS.md` (root, RDF-triple format). The human-readable version is `AGENTS-readable.md` (root). Those rules are **non-negotiable** and apply to all code changes.

## Required behavior

For performance-sensitive changes, include a brief note in PR description about expected latency/throughput impact.

1. Read `AGENTS.md` before proposing or applying changes. See `AGENTS-readable.md` for the expanded human-readable version.
2. Treat `AGENTS-readable.md` as canonical for documentation sync, runtime safety, and review quality gates.
3. If any instruction appears to conflict, prefer the stricter `AGENTS-readable.md` rule.

## Critical fallback rules (if context is constrained)

- Keep request paths non-blocking: no `*Sync` filesystem/child-process/crypto APIs in routes/middleware.
- Keep async contracts consistent: public APIs must be uniformly async; never mix sync/async callback timing; surface errors through one mechanism only (throw/reject/callback(err)) — never multiple paths.
- Keep docs synchronized when changing package names/exports/entrypoints: `README.md`, `sandbox/app/DEV_APP_README.md`, `documentation/00-project-specs`, `documentation/99-potential-gaps.md`.
- Keep routes thin and async; delegate heavier work to services/workers.
- Add WHY-comments for non-trivial decisions (error handling, fallback, perf/security/legal tradeoffs).
- Run validation commands from `AGENTS-readable.md` before finalizing.
- **Reuse-first**: before building any new service, utility, or infrastructure, check `config.services` (the built-in DI container), `@glowing-fishstick/shared` exports, `@glowing-fishstick/logger`, and existing `package.json` dependencies. Do not create module-level singletons when `config.services` exists.
- **Discoverability**: new exports require a README export table entry + `index.d.ts` typed signature. Runtime-optional consumer deps go in `peerDependencies`, not `devDependencies`.
