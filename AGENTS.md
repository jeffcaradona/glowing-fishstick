# Agent Instructions: Documentation, Organization, and Performance Guardrails

This document outlines the expectations and constraints for working with this repository. All contributions must adhere to these guidelines unless explicitly stated otherwise.

## Repository Structure

This repository is a **monorepo workspace** with the following key directories:

- `api/` - Local Development API package
- `app/` - Local Development Application package
- `core/` - Core libraries
- `documentation/` - Project documentation
- `template/` - Project templates
- `tests/` - Integration tests

### Package Boundaries

- Consumer runtime examples MUST use current install target packages
- Root package is NOT runtime-installable unless it has explicit runtime `exports/main` and intended `files`
- Do not assume root package can be imported directly

## Documentation Requirements

### Canonical Truth Sources

1. README installation + import examples
2. `app/DEV_APP_README` examples and directory diagrams
3. `documentation/00-project-specs` public API snippets
4. `documentation/99-potential-gaps.md` for implementation state

### Sync Rules

When editing package names, exports, directory structure, or API entrypoints:

1. Update README installation + import examples
2. Update `app/DEV_APP_README` examples and directory diagrams
3. Update `documentation/00-project-specs` public API snippets
4. Update status wording in `documentation/99-potential-gaps.md` if implementation state changed

### Forbidden Patterns

- No examples importing from `../../index.js` for consumer usage (unless explicitly marked "local-only")
- No references to legacy core paths that do not exist
- No install docs that conflict with actual package export boundaries

### Documentation Definition of Done

Before finishing any documentation update:

- [ ] Verify every documented file path exists
- [ ] Verify every documented import specifier matches current package boundaries
- [ ] Verify every code snippet reflects current function/file names
- [ ] Run repo search for known stale strings

## Event Loop Safety

### Critical Rule: Never Block Request-Handling Paths

In any code that can run per request (routes, middleware, renderers, hooks used during traffic):

**Do not use:**

- `fs.*Sync` methods
- `child_process.*Sync` methods
- `zlib.*Sync` methods
- Crypto sync APIs (`pbkdf2Sync`, `scryptSync`, etc.)
- Long tight loops

**Preferred alternatives:**

- Use async/promise APIs
- Use bounded work units
- Delegate heavy work to async services/workers

**Allowed exceptions (must be documented):**

- Startup-only initialization before server begins accepting traffic
- One-time build/dev scripts that are not runtime code

### Handler Design Principles

- Route handlers and middleware should delegate heavy work to async services/workers
- If a computation may exceed a few milliseconds under load, move it off the hot path
- Never do expensive filesystem traversal or template file reads synchronously during request processing

## I/O Patterns

### Preferred Behavior

- Use async `fs/promises` APIs
- Cache immutable or rarely changing data in memory when safe
- Use streaming for large payloads/files instead of buffering entire content
- Apply timeouts, retries, and backpressure-aware patterns for network calls

### Anti-Patterns to Avoid

- Per-request synchronous file existence checks
- Per-request `readFileSync` / `writeFileSync`
- Fire-and-forget I/O without error handling

## CPU-bound Work

### Rules

- Avoid CPU-heavy transforms in middleware/routes
- For expensive CPU tasks, use worker threads, external queues, or precomputation
- Keep loops bounded and data-size aware

### Practical Guidance

- Add guardrails on input sizes
- Prefer incremental/streaming processing
- Avoid accidental O(n²) behavior in hot paths

## Async Consistency

### Contract Rules

- Public APIs should be consistently async when they can perform async work
- Do not sometimes call callbacks synchronously and sometimes asynchronously
- If an API is callback-based, ensure callback timing is deterministic (typically async)

### Promise/Callback Hygiene

- Do not mix callback and promise completion paths in a way that can double-complete
- Return or `await` every Promise you create unless explicitly detached and documented
- Surface errors through one clear mechanism (throw/reject/callback(err), not multiple)

## V8 Optimization

### Stable Object Shapes

- Initialize expected object fields early when practical
- Avoid unnecessary per-request monkey-patching of core objects
- Minimize shape thrash from adding/removing different fields on hot objects

### Hot Path Simplicity

- Avoid polymorphic call sites when a monomorphic pattern is easy
- Avoid dynamic code generation (`eval`, `new Function`) and `with`
- Keep serialization/parsing in hot paths lean and predictable

## Logging Guidelines

- Logging in hot paths must be structured and level-gated
- Avoid expensive stringification/computation for logs that may be dropped
- Prefer async/non-blocking transports
- Include latency, status, and request-id correlation where applicable

## PR Review Checklist

When adding or changing runtime code, verify:

1. [ ] No new sync blocking APIs in request or middleware paths
2. [ ] No mixed sync/async callback timing
3. [ ] No unbounded loops or heavy CPU work in hot paths
4. [ ] Error handling is single-path and deterministic
5. [ ] Logging remains useful but not throughput-dominant
6. [ ] Tests or checks cover concurrency-sensitive behavior where practical

### Exception Documentation

If any exception is necessary, document:

- Why it is safe
- Why alternatives were not used
- Scope of impact (startup-only, dev-only, low-frequency path)

## Code Commenting (Mandatory, Non-negotiable)

Default to documenting rationale ("why"), not mechanics ("what").

### WHY-comment rules

- Do NOT write comments that restate what the code does.
- DO write short comments explaining why the code exists, what constraint it satisfies, what would break if changed.
- Add WHY-comments proactively for: conditionals, error handling, fallbacks, workarounds, performance/caching, security, and anything "weird but necessary."
- If the code is clear but the decision isn't, comment anyway.

Preferred format (use when non-trivial):
WHY: <constraint / rationale>
TRADEOFF: <downside accepted>
VERIFY IF CHANGED: <what to re-test / what might break>

### Architecture constraints

- **Express:** keep routes thin; put decisions in services/modules; WHY-comment middleware order when it matters.
- **ETA:** pass minimal, explicit view-models; no business logic in templates; WHY-comment precomputed fields.
- **MSSQL:** stored procedures only — no ad-hoc SQL. Parameterized calls with explicit types. If querying, use approved views only.
- **Error handling:** consistent HTTP errors; WHY-comment status-code choices and client expectations.
- **Security:** validate/normalize input; never leak internal errors; WHY-comment security constraints.

### Code quality

- Prefer boring, explicit code over cleverness.
- Use descriptive names that encode intent (reduce need for comments).
- When adding logging, explain WHY the log exists (diagnostics, audit, tracing).

"When you add a non-trivial block, include at least one WHY-comment explaining the decision."

## Validation Commands

Use these commands when relevant to the change:

```bash
# Search for files
rg --files

# Search for documentation inconsistencies
rg "from '../../index.js'|npm install glowing-fishstick|./src/app.js|./src/server.js" README.md app/DEV_APP_README.md documentation/*.md

# Verify package boundaries
npm pack --dry-run

# Code quality checks
npm run lint
npm run format
npm run test:all

# Search for synchronous blocking APIs
rg -n "\\b(readFileSync|writeFileSync|appendFileSync|existsSync|readdirSync|statSync|lstatSync|mkdirSync|rmSync|unlinkSync|execSync|spawnSync|pbkdf2Sync|scryptSync)\\b" app core api

# Search for anti-patterns
rg -n "res\\.end\\s*=|eval\\(|new Function\\(|with\\s*\\(" app core api
```

For performance-sensitive changes, include a brief note in PR description about expected latency/throughput impact.
