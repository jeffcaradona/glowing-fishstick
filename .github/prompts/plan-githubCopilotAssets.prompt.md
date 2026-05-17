+# Plan: GitHub Copilot Customization Files (.github/)

Create two sets of `.github/` assets — **instructions files** that auto-inject rules based on file context, and **reusable workflow prompts**. No `.agent.md` files (VS Code doesn't reliably support them in `.github/`); `mode: agent` in prompt frontmatter covers the same need. The existing `copilot-instructions.md` and plan prompts are left untouched.

## Target Layout

```
.github/
├── copilot-instructions.md                       (exists — no changes)
├── prompts/
│   ├── plan-sprint14Reonboarding.prompt.md       (exists)
│   ├── plan-pinoToWinstonMigration.prompt.md     (exists)
│   ├── add-feature.prompt.md                     (NEW — Phase 2)
│   ├── pr-review.prompt.md                       (NEW — Phase 2)
│   ├── docs-sync.prompt.md                       (NEW — Phase 2)
│   ├── create-package.prompt.md                  (NEW — Phase 3)
│   ├── major-migration.prompt.md                 (NEW — Phase 3)
│   └── release.prompt.md                         (NEW — Phase 3)
└── instructions/                                 (NEW directory — Phase 1)
    ├── async-safety.instructions.md
    ├── factory-pattern.instructions.md
    ├── error-handling.instructions.md
    ├── discoverability.instructions.md
    └── test-patterns.instructions.md
```

---

## Phase 1 — Instructions Files (auto-applied; highest ROI)

Instructions files use `applyTo:` frontmatter so rules are injected automatically when Copilot touches matching files. Each is narrowly scoped — not a dump of AGENTS-readable.md, but targeted to the file context.

### 1. `async-safety.instructions.md`

- `applyTo: "core/**/*.js,sandbox/**/*.js"`
- Rules: no `*Sync` FS/crypto/child_process APIs outside startup-only code; async fs/promises throughout; CPU-heavy work delegated to services/workers; bounded loops; timeouts on network calls.
- Allowed-exception pattern: startup-only blocking must carry a WHY comment + "startupOnly" marker.
- References the validation command: `rg -n "\b(readFileSync|writeFileSync|appendFileSync|existsSync|readdirSync|statSync|lstatSync|mkdirSync|rmSync|unlinkSync|execSync|spawnSync|pbkdf2Sync|scryptSync)\b"`.

### 2. `factory-pattern.instructions.md`

- `applyTo: "core/**/*.js"`
- Rules: factory functions over classes (only `AppError` exception for instanceof checks); `createX(config, [plugins])` signature; plugin contract `(app, config) => void`; lifecycle hooks via `app.registerStartupHook()`/`app.registerShutdownHook()`; no module-level singletons (use `config.services`); reuse-first checklist (config.services → @glowing-fishstick/shared → @glowing-fishstick/logger → existing deps) before building anything new.

### 3. `error-handling.instructions.md`

- `applyTo: "core/**/middlewares/**/*.js,core/**/routes/**/*.js,sandbox/**/src/**/*.js"`
- Rules: single error surfacing path only (throw/reject/callback — never multiple); no double-complete; async route handlers use `try/catch` + `next(err)`; WHY comment on every non-obvious HTTP status code choice; never leak internal error details in responses.
- Architecture note: `errorHandler` (web-app) and `error-handler` (service-api) are intentionally separate — HTML content-negotiation via Eta vs JSON-only. Do not consolidate.

### 4. `discoverability.instructions.md`

- `applyTo: "**/index.js,**/index.d.ts,**/package.json,**/README.md"`
- Rules: every published package needs a complete export table in README; `index.d.ts` must have typed signatures for all public exports; `package.json` must have `"types": "index.d.ts"` and `index.d.ts` in `files`; runtime-optional consumer deps go in `peerDependencies` with `optional: true`, NOT `devDependencies`; when `config.services` exists, no module-level singletons duplicating it.

### 5. `test-patterns.instructions.md`

- `applyTo: "**/*.test.js"`
- Rules: Vitest + Supertest; every feature needs integration tests covering success + error paths; lifecycle changes require hook-ordering tests and shutdown tests; security-hardening tests are intentionally separate per package — do not consolidate into a shared harness; suppress log noise via mock logger or `{ silent: true }` transport; no ANSI escape codes in snapshot-style assertions (disable colorize when `NODE_ENV=test`).

---

## Phase 2 — Core Workflow Prompts (high ROI; parallel creation)

Format modeled on `plan-sprint14Reonboarding.prompt.md`. Each file has YAML frontmatter (`mode:`, `description:`).

### 6. `add-feature.prompt.md`

- `mode: agent`, `description: "Plan and implement a new feature or plugin for glowing-fishstick"`
- Covers: plugin contract `(app, config) => void`; factory functions; lifecycle hook registration; thin async routes with `try/catch` + `next(err)`; integration tests for success + error + lifecycle paths; the mandatory 4-file doc-sync checklist; validation commands.
- Canonical reference patterns: `core/web-app/src/app-factory.js` and `sandbox/app/src/app.js`.

### 7. `pr-review.prompt.md`

- `mode: agent`, `description: "Review staged changes against the AGENTS-readable.md quality gates"`
- Encodes all 9 PR review checklist items from AGENTS-readable.md:
  1. No new sync-blocking APIs in request/middleware paths
  2. No mixed sync/async callback timing
  3. No unbounded loops or heavy CPU on hot paths
  4. Error handling — single path, deterministic
  5. Logging — useful, structured, not throughput-dominant
  6. Tests cover concurrency-sensitive behavior where practical
  7. New exports added to README export table + `index.d.ts`
  8. New config properties documented in config factory section with usage example
  9. No new module-level singletons duplicating `config.services`
- Also checks: 4-file doc sync, WHY-comment presence on non-trivial blocks, performance impact note in PR description for latency-sensitive changes.
- Validation commands to run: sync-blocking-API search, anti-patterns search, `npm run lint`, `npm run test:all`.

### 8. `docs-sync.prompt.md`

- `mode: ask`, `description: "Verify and update the 4 canonical documentation sources after an API or export change"`
- Lists the 4 truth sources with specific things to check in each:
  - `README.md` — install + import examples match current package exports and boundaries
  - `sandbox/app/DEV_APP_README.md` — examples and directory diagrams match current structure
  - `documentation/00-project-specs.md` — public API snippets reflect current function/file names
  - `documentation/99-potential-gaps.md` — implementation state updated if anything changed
- Built-in doc-inconsistency search command from AGENTS.md.
- Forbidden patterns checklist: no `../../index.js` imports in examples (unless marked local-only), no legacy paths that no longer exist, no install docs conflicting with actual package export boundaries.

---

## Phase 3 — Advanced Workflow Prompts (lower frequency; build after Phase 2)

### 9. `create-package.prompt.md`

- `mode: agent`, `description: "Scaffold and configure a new publishable @glowing-fishstick/* package"`
- Checklist: `package.json` shape; `index.js`, `index.d.ts`, and README export table bootstrapped together (not deferred); `peerDependencies` vs `dependencies` decision guide; version alignment with other `@glowing-fishstick` packages; register in root `package.json` workspaces; add to `npm run test:all` script.
- Canonical reference template: `core/modules/logger/` as the smallest complete published package.

### 10. `major-migration.prompt.md`

- `mode: agent`, `description: "Plan a multi-phase coordinated migration across all monorepo packages"`
- Generalizes the Pino→Winston 6-phase structure: Foundation → Call sites → Package.json + types → Tests → Docs → Validation.
- Prompts the agent to capture: what changes, what stays (exported names/shapes), breaking vs. additive classification, version bump strategy, risks/watch-outs section.
- Built-in reminders drawn from Pino→Winston experience: async-write flush on shutdown, `format.errors({ stack: true })`, colorize disabled in test environment, version drift detection.
- Stale-string validation: `rg -n "\bOLDTECH\b" -g '!**/CHANGELOG.md' -g '!documentation/archive/**'` must return zero matches.
- Mandatory PR description performance impact note (AGENTS-readable.md requirement).
- Concrete worked example: points to `plan-pinoToWinstonMigration.prompt.md` as a reference.

### 11. `release.prompt.md`

- `mode: agent`, `description: "Coordinate a multi-package version bump, CHANGELOG entries, and npm publish sequence"`
- Covers: version bump order (logger → shared → web-app + service-api → generator — each depends on the one before); CHANGELOG.md `## X.Y.Z` entry format and required content (breaking changes, migration notes); `index.d.ts` regeneration verification; `npm pack --dry-run` in each published package before pushing tags; RELEASING.md steps; post-publish smoke-test checklist (`node sandbox/app/src/server.js`, `node sandbox/api/src/server.js`).

---

## File Creation Order (dependencies)

1. Create `.github/instructions/` directory + all 5 instructions files — **independent of each other**, create in parallel
2. Create Phase 2 prompts (6, 7, 8) — **independent of each other**; consistent with Phase 1 instructions
3. Create Phase 3 prompts (9, 10, 11) — **independent of each other**; build after Phase 2 for coherence

---

## Relevant Existing Files (reference only — do not modify)

- `.github/prompts/plan-sprint14Reonboarding.prompt.md` — format template for all new prompts
- `.github/prompts/plan-pinoToWinstonMigration.prompt.md` — concrete example for `major-migration.prompt.md`
- `AGENTS-readable.md` — canonical source; all rules derive from here
- `core/modules/logger/` — canonical small-package reference for `create-package.prompt.md`
- `core/web-app/src/app-factory.js`, `sandbox/app/src/app.js` — canonical patterns for `add-feature.prompt.md`

---

## Verification (after all phases)

1. All new files have valid YAML frontmatter (no parse errors).
2. `applyTo:` globs in instructions files match files they are intended to target.
3. No instructions file repeats the full text of AGENTS-readable.md — each is focused on its domain.
4. Each prompt is self-contained: a developer new to the repo can follow it without reading AGENTS-readable.md first.
5. Instructions files complement `copilot-instructions.md` — no contradictions, no duplications.
6. Existing prompts (`plan-sprint14Reonboarding`, `plan-pinoToWinstonMigration`) are unchanged.
7. Run `rg "from '../../index.js'" .github/` — must return zero hits (no broken example paths in new files).

---

## Decisions

- **No `.agent.md` files**: VS Code `.github/` agent mode is not a stable supported format; `mode: agent` in prompt frontmatter is the right mechanism.
- **No skills directory**: VS Code Skills live in extension assets, not `.github/`; instructions files serve the same auto-injection purpose per-repo.
- **Instructions are narrow**: each file targets one concern, not a general extract of all rules. Narrow scope = lower false-positive injection noise.
- **Existing prompts untouched**: the sprint + migration plan prompts are one-time plans; this work adds reusable _workflow_ templates alongside them.
- **`pr-review.prompt.md` is `mode: agent`** (not `ask`) so it can inspect staged files directly rather than relying on a developer's description.
- **Out of scope**: GitHub Actions workflows, branch protection rules, issue/PR templates, Dependabot config.

---

## Further Considerations

1. **`applyTo:` overlap for middleware files** — files under `core/**/middlewares/` match both `async-safety` and `error-handling`. Both should apply; the concerns are orthogonal. Verify there is no conflicting guidance between them.
2. **`major-migration.prompt.md` abstraction level** — keep one concrete worked example (Pino→Winston) as a reference section rather than trying to be fully generic. Concrete examples anchor the agent better than abstract templates.
3. **`pr-review.prompt.md` as a pre-commit gate** — consider referencing it from a `CONTRIBUTING.md` or linking it in PR template. Out of scope for this plan but worth noting.
4. **Version alignment in `create-package.prompt.md`** — the guidance should explicitly say: check all other `@glowing-fishstick` packages' current versions, then match. Do not hardcode a version number in the prompt.
