# Copilot Instructions: Documentation, Organization, and Performance Guardrails

This repository expects **both**:

1. strong documentation/workspace alignment, and
2. production-safe Node.js performance/concurrency practices.

Treat these as default constraints unless a task explicitly requires an exception.

---

## A) Documentation & workspace alignment (mandatory)

### Canonical truth

- This repository is a monorepo workspace.
- Consumer runtime examples MUST use current install target package(s).
- Do not assume root package is runtime-installable unless root `package.json` has explicit runtime `exports/main` and intended `files`.

### Sync rules (mandatory)

When editing package names, exports, directory structure, or API entrypoints:

1. Update README installation + import examples.
2. Update `app/DEV_APP_README` examples and directory diagrams.
3. Update `documentation/00-project-specs` public API snippets.
4. Update status wording in `documentation/99-potential-gaps.md` if implementation state changed.

### Forbidden stale patterns

- No examples importing from `../../index.js` for consumer usage unless explicitly marked "local-only".
- No references to legacy core paths that do not exist.
- No install docs that conflict with actual package export boundaries.

### Documentation DoD

Before finishing:

- Verify every documented file path exists.
- Verify every documented import specifier matches current package boundaries.
- Verify every code snippet reflects current function/file names.
- Run repo search for known stale strings.

---

## B) Event loop safety (non-negotiable)

### Never block request-handling paths with synchronous Node APIs

In any code that can run per request (routes, middleware, renderers, hooks used during traffic):

- **Do not use** `fs.*Sync`, `child_process.*Sync`, `zlib.*Sync`, crypto sync APIs (`pbkdf2Sync`, `scryptSync`, etc.), or long tight loops.
- Prefer async/promise APIs and bounded work units.

Allowed exceptions (must be documented in comments):

- Startup-only initialization before server begins accepting traffic.
- One-time build/dev scripts that are not runtime code.

### Keep handlers short and non-blocking

- Route handlers and middleware should delegate heavy work to async services/workers.
- If a computation may exceed a few milliseconds under load, move it off the hot path.
- Never do expensive filesystem traversal or template file reads synchronously during request processing.

---

## C) I/O patterns

### Preferred I/O behavior

- Use async `fs/promises` APIs.
- Cache immutable or rarely changing data in memory when safe.
- Use streaming for large payloads/files instead of buffering entire content.
- Apply timeouts, retries, and backpressure-aware patterns for network calls.

### Avoid

- Per-request synchronous file existence checks.
- Per-request `readFileSync` / `writeFileSync`.
- Fire-and-forget I/O without error handling.

---

## D) CPU-bound work

### Rules

- Avoid CPU-heavy transforms in middleware/routes.
- For expensive CPU tasks, use worker threads, external queues, or precomputation.
- Keep loops bounded and data-size aware.

### Practical guidance

- Add guardrails on input sizes.
- Prefer incremental/streaming processing.
- Avoid accidental O(n²) behavior in hot paths.

---

## E) Async consistency (prevent Zalgo)

### Contract rules

- Public APIs should be consistently async when they can perform async work.
- Do not sometimes call callbacks synchronously and sometimes asynchronously.
- If an API is callback-based, ensure callback timing is deterministic (typically async).

### Promise/callback hygiene

- Do not mix callback and promise completion paths in a way that can double-complete.
- Return or `await` every Promise you create unless explicitly detached and documented.
- Surface errors through one clear mechanism (throw/reject/callback(err), not multiple).

---

## F) V8 / deopt-aware coding

### Prefer stable object shapes

- Initialize expected object fields early when practical.
- Avoid unnecessary per-request monkey-patching of core objects.
- Minimize shape thrash from adding/removing different fields on hot objects.

### Keep hot paths simple

- Avoid polymorphic call sites when a monomorphic pattern is easy.
- Avoid dynamic code generation (`eval`, `new Function`) and `with`.
- Keep serialization/parsing in hot paths lean and predictable.

---

## G) Logging and observability without harm

- Logging in hot paths must be structured and level-gated.
- Avoid expensive stringification/computation for logs that may be dropped.
- Prefer async/non-blocking transports.
- Include latency, status, and request-id correlation where applicable.

---

## H) PR/code-review checklist (required for runtime changes)

When adding or changing runtime code, verify:

1. No new sync blocking APIs in request or middleware paths.
2. No mixed sync/async callback timing.
3. No unbounded loops or heavy CPU work in hot paths.
4. Error handling is single-path and deterministic.
5. Logging remains useful but not throughput-dominant.
6. Tests or checks cover concurrency-sensitive behavior where practical.

If any exception is necessary, document:

- Why it is safe,
- Why alternatives were not used,
- Scope of impact (startup-only, dev-only, low-frequency path).

---

## I) Validation commands

Use these when relevant to the change:

- `rg --files`
- `rg "from '../../index.js'|npm install glowing-fishstick|./src/app.js|./src/server.js" README.md app/DEV_APP_README.md documentation/*.md`
- `npm pack --dry-run` (when installation/publish docs changed)
- `npm run lint`
- `npm run format`
- `npm run test:all`
- `rg -n "\\b(readFileSync|writeFileSync|appendFileSync|existsSync|readdirSync|statSync|lstatSync|mkdirSync|rmSync|unlinkSync|execSync|spawnSync|pbkdf2Sync|scryptSync)\\b" app core api`
- `rg -n "res\\.end\\s*=|eval\\(|new Function\\(|with\\s*\\(" app core api`

For performance-sensitive changes, include a brief note in PR description about expected latency/throughput impact.
