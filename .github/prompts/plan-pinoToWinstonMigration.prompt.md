# Plan: Pino → Winston Migration (0.2.0)

Replace Pino with Winston across the monorepo because Pino is blocked by jFrog at work. Keep exported names (`createLogger`, `createRequestLogger`) but rewrite every call site to native Winston `(message, meta)` form. Ship as a coordinated 0.2.0 release for the four publishable packages. Add new optional config knobs (`level`, `redact`, `transports`) on the logger and surface them through `createConfig`/`createApiConfig`. Mirror today's transport behavior (Console + optional File). Retire the `pino-pretty` peerDep case study from DISCOVERABILITY.md.

## Decisions

- **Call signature**: native Winston `logger.info(message, meta)` — every existing `logger.info({ err }, 'msg')` and `logger.error({ err, ... }, 'msg')` site is rewritten. No compatibility shim.
- **Exports unchanged**: `createLogger(options)` and `createRequestLogger(logger, options)` keep their names and option shapes.
- **Transports**: `winston.transports.Console` (colorized printf in dev, JSON in prod) plus `winston.transports.File` when `enableFile` is true. No daily-rotation dep (jFrog risk + scope).
- **Types**: replace `import type { Logger } from 'pino'` with `import type { Logger } from 'winston'` in all four `.d.ts` files.
- **Version**: bump `@glowing-fishstick/logger`, `@glowing-fishstick/shared`, `@glowing-fishstick/app`, `@glowing-fishstick/api` to `0.2.0`. Generator CLI also bumps to `0.2.0` because its templates change.
- **Hook registry duck-type** stays (`typeof logger.error === 'function'`) — Winston satisfies it.
- **Maintenance branch**: `maintenance/0.1.x` is cut from the last `0.1.8` release commit *before* any 0.2.0 work merges to `main`. Pino-era security and severe-bug backports land there. See `RELEASING.md` → "Maintenance branches" for the workflow and sunset policy.
- **Out of scope**: child loggers, `req.log` attachment, redaction beyond a simple format-based field masker, daily rotation, splat-style printf in production.

## Phase 1 — Logger module rewrite (foundation; blocks everything else)

1. `core/modules/logger/package.json`: remove `pino`, `pino-pretty` (deps/peer/dev); add `"winston": "^3.13.0"` to `dependencies`; bump version to `0.2.0`; update `description` and `keywords` (drop "pino", add "winston"); update `engines` only if needed.
2. `core/modules/logger/src/logger.js`: rewrite using `winston.createLogger`.
   - Options: `{ name, level, logDir, enableFile, redact, transports }` (redact = array of dotted paths masked via `format`; transports = optional override array).
   - Dev: `Console` with `format.combine(format.colorize(), format.timestamp(), format.errors({ stack: true }), format.splat(), format.printf(...))` printing `${ts} ${level} [${name}] ${message} ${metaJson}`.
   - Prod: `Console` with `format.combine(format.timestamp(), format.errors({ stack: true }), format.json())` and `defaultMeta: { name }`.
   - File transport (when `enableFile`): JSON format, filename derived from sanitized `name` (preserve current `name.replaceAll(':', '-')` behavior).
   - Level: honor `level` option, then `LOG_LEVEL` env, then default `info`.
   - Redaction: if `redact` provided, add a custom `format` that walks meta and replaces matched paths with `'[REDACTED]'`.
3. `core/modules/logger/src/request-logger.js`: new file (extracted from logger.js for clarity); same exported `createRequestLogger(logger, options)`. Replace `logger.info({...}, 'Request received')` with `logger.info('Request received', {...})` and likewise for response. Preserve all existing tested behavior: `TypeError` on missing logger or missing `.info`, `req.id` generation/respecting, `x-request-id` header, `res.once('finish')` idempotency, non-negative duration, `type`/`method`/`pathname`/`status`/`duration` fields.
4. `core/modules/logger/index.js`: re-export both from their new files (keep single import surface).
5. `core/modules/logger/index.d.ts`: switch `import type { Logger } from 'winston'`; export `LoggerOptions` shape including new knobs; keep `createLogger` and `createRequestLogger` signatures source-compatible (only return type's vendor changes).
6. `core/modules/logger/README.md`: rewrite to describe Winston backend, remove `pino-pretty` install instructions, add new knobs (`level`, `redact`, `transports`, `enableFile`, `logDir`), update examples to native `(message, meta)` form.
7. `core/modules/logger/tests/unit/request-logger.test.js`: update assertions to expect `logger.info` called with `('Request received', {...})` and finish log with `('Request completed', {...})` (or current message wording, preserved). Confirm all existing edge cases still asserted.
8. **Add** `core/modules/logger/tests/unit/logger.test.js`: minimal coverage for `createLogger` — returns object with `info/warn/error/debug` methods, honors `level`, applies redaction, emits JSON in prod mode, writes to file when `enableFile`.

## Phase 2 — Rewrite call sites to native Winston signature (depends on Phase 1)

Done in parallel across packages once Phase 1 lands.

9. `core/shared/src/server-factory.js`: rewrite every logger call.
   - `logger.info({ port, host, ... }, '... listening ...')` → `logger.info('... listening ...', { port, host, ... })`.
   - Same flip for startup-hook and shutdown-hook error logs, "shutdown initiated", "draining connections", "destroyed lingering connections", etc.
10. `core/shared/src/middlewares/error-utils.js`: `resolveErrorLogger` returns `(meta, msg) => logger.error(msg, meta)` — flip arg order. Update `logUnexpectedError` if it formats the args. Console fallback updated similarly.
11. `core/web-app/src/middlewares/errorHandler.js` and `core/service-api/src/middlewares/error-handler.js`: update direct `logFn(meta, msg)` call sites to `logFn(msg, meta)` (or simpler: leave helper signature `(meta, msg)` and flip inside `resolveErrorLogger` only — pick whichever yields the smaller diff; recommendation = flip inside the helper so callers stay untouched).
12. `core/web-app/src/controllers/admin-controller.js`: flip the five `logger?.warn(obj, msg)` / `logger?.info(obj, msg)` sites.
13. `core/web-app/src/app-factory.js` and `core/service-api/src/api-factory.js`: audit for any direct `logger.*({...}, '...')` calls; flip args. Keep `enableRequestLogging` gate unchanged.
14. `sandbox/app/src/server.js`, `sandbox/app/src/app.js`, `sandbox/api/src/server.js`: flip all `logger.info({...}, '...')` to native form.
15. `core/generator/templates/app/src/server.js`, `core/generator/templates/app/src/app.js`, `core/generator/templates/api/src/server.js`, `core/generator/templates/api/src/api.js`: flip args in scaffold templates.

## Phase 3 — Package.json + types + config (parallel with Phase 2)

16. `core/shared/package.json`: drop `peerDependencies.pino`; bump `@glowing-fishstick/logger` to `^0.2.0`; bump shared to `0.2.0`.
17. `core/shared/index.d.ts`: replace `pino` type import with `winston`.
18. `core/web-app/package.json`: remove `pino` dep and `pino-pretty` devDep; add `winston` as peerDep (optional) or rely on transitive from logger module — recommendation: **no direct winston dep** in web-app/api; consumers always go through `@glowing-fishstick/logger`. Bump version to `0.2.0`. Bump shared/logger dep ranges to `^0.2.0`.
19. `core/web-app/index.d.ts`, `core/service-api/index.d.ts`: replace `pino` type imports with `winston`.
20. `core/service-api/package.json`: same treatment as web-app. Version `0.2.0`.
21. `core/generator/templates/app/package.json`: remove `pino-pretty` devDep; ensure `@glowing-fishstick/app` (or shared/logger) range targets `^0.2.0`.
22. `core/generator/templates/api/package.json`: same.
23. `core/generator/package.json`: bump generator to `0.2.0` (templates changed; user-facing scaffolding altered).
24. `core/web-app/src/config/env.js` and `core/service-api/src/config/env.js`: surface new optional logger knobs (`logLevel`, `logRedact`, `enableFileLogging`, `logDir`) on `createConfig`/`createApiConfig` so consumers can opt in without constructing a `createLogger` themselves. Pass them through to `createLogger` only when `config.logger` is unset (preserve "consumer-injects-logger-wins" precedence).

## Phase 4 — Tests across the suite (depends on Phases 1–3)

25. `core/web-app/tests/integration/security-hardening.test.js` "Error Handler Logger Hardening": update assertions to expect `mockLogger.error('msg', { err, method, path, reqId })`.
26. `core/service-api/tests/integration/security-hardening.test.js`: same flip.
27. `core/web-app/tests/integration/startup-hook-ordering.test.js`: update assertions to native arg order.
28. `core/web-app/tests/integration/graceful-shutdown.test.js`: update assertions to native arg order.
29. `core/generator/tests/integration/cli.test.js` and `core/generator/tests/unit/scaffolder.test.js`: literal `createLogger({ name: '...' })` assertions remain valid (export name unchanged); add (or update) assertions that scaffolded `package.json` no longer contains `pino-pretty`.
30. Run full suite: `npm run test:all`. Fix any incidental flake caused by Winston's default async writes (use `transports: [new winston.transports.Console({ silent: true })]` in tests where output noise matters, or pass `logger: mockLogger` as already done).

## Phase 5 — Documentation sync (depends on Phases 1–3; AGENTS-readable.md doc-sync rule)

31. `README.md`: rewrite the logger paragraph (drop "Pino logger factory"); flip any logger-call examples to `(message, meta)` form.
32. `CLAUDE.md`: replace "Pino structured logging" / "Pino logging" with Winston; correct the misleading `req.log` line ("framework does not attach `req.log`; consume via `req.app.locals.logger` / `config.logger`").
33. `AGENTS.md` and `AGENTS-readable.md`: update reuse-first guidance ("DO NOT install or configure Pino separately" → "Winston"); drop `pino-pretty` peerDep callout.
34. `DISCOVERABILITY.md`: remove the `pino-pretty` peerDep case study (or replace with a forward-looking Winston-transport example).
35. `RELEASING.md`: no semantic change; verify version table is regenerated for `0.2.0`.
36. `documentation/00-project-specs.md`: flip every `createLogger`/`createRequestLogger` example to Winston signature; update full API section (lines ~933–996).
37. `documentation/01-application-development.md`: same flip.
38. `documentation/ARCHITECTURE.md`: replace "Pino request logging" / "Pino structured logging" with Winston.
39. `documentation/99-potential-gaps.md`: add a note describing the 0.2.0 Pino→Winston migration; remove the `pino-pretty` peerDep history line if obsolete.
40. `core/shared/README.md`: update logger description ("Pino logger factory — pretty-printed in dev, JSON in prod" → Winston).
41. `core/service-api/README.md`: update `pino logger` type annotations in config table to Winston; correct the `req.log` note if needed.
42. `core/modules/logger/CHANGELOG.md`, `core/shared/CHANGELOG.md`, `core/web-app/CHANGELOG.md`, `core/service-api/CHANGELOG.md`, `core/generator/CHANGELOG.md`: add `## 0.2.0` entry summarizing migration and breaking change ("Logger backend changed from Pino to Winston; call signature is now native Winston `(message, meta)`").
43. `sandbox/app/DEV_APP_README.md`: flip all logger examples; remove "logger implementation ownership lives in `@glowing-fishstick/logger` (Pino)" wording.
44. `sandbox/api/DEV_API_README.md`: flip all logger examples; change "Audit Logging: All requests and responses logged via Pino" to Winston.
45. `documentation/archive/P3-LOGGER-IMPLEMENTATION-SUMMARY.md`: leave as historical, but add a top-of-file note pointing forward to the 0.2.0 migration; the "Pino is ~10x faster than Winston" line stays as historical context.

## Phase 6 — Validation (depends on all prior phases)

46. `rg -n "\bpino\b" -g '!**/CHANGELOG.md' -g '!documentation/archive/**'` — must return zero matches.
47. `rg -n "pino-pretty"` — must return zero matches outside `documentation/archive/`.
48. `rg "from '../../index.js'|npm install glowing-fishstick|\./src/app\.js|\./src/server\.js" README.md sandbox/app/DEV_APP_README.md documentation/*.md` (AGENTS doc-inconsistency search).
49. `npm pack --dry-run` in each of the four published packages — confirm no Pino files leak; confirm `index.d.ts` is in `files`.
50. `npm run lint`, `npm run format`, `npm run test:all`.
51. Manual smoke: `node sandbox/app/src/server.js` and `node sandbox/api/src/server.js` — verify colorized dev console output and structured JSON when `NODE_ENV=production`.
52. PR description note: latency/throughput delta from Pino → Winston (Winston is the slower path; document expected impact per AGENTS-readable.md performance rule).

## Relevant files (anchor list)

- `core/modules/logger/src/logger.js` — full rewrite; replace `pino` with `winston.createLogger`
- `core/modules/logger/index.js`, `index.d.ts`, `package.json`, `README.md`, `CHANGELOG.md`
- `core/modules/logger/tests/unit/request-logger.test.js` — flip arg-order assertions
- `core/shared/src/server-factory.js` — every lifecycle `logger.*({...}, 'msg')` call
- `core/shared/src/middlewares/error-utils.js` — `resolveErrorLogger` flips internally
- `core/web-app/src/middlewares/errorHandler.js`, `core/service-api/src/middlewares/error-handler.js`
- `core/web-app/src/controllers/admin-controller.js` — 5 call sites
- `core/web-app/src/app-factory.js`, `core/service-api/src/api-factory.js`
- `core/web-app/src/config/env.js`, `core/service-api/src/config/env.js` — new optional logger knobs
- `sandbox/app/src/server.js`, `sandbox/app/src/app.js`, `sandbox/api/src/server.js`
- `core/generator/templates/{app,api}/src/*.js` and `core/generator/templates/{app,api}/package.json`
- `core/{shared,web-app,service-api}/index.d.ts` and `package.json`
- Docs: README, CLAUDE, AGENTS, AGENTS-readable, DISCOVERABILITY, RELEASING, documentation/00-project-specs, 01-application-development, ARCHITECTURE, 99-potential-gaps, sandbox DEV\_\*\_READMEs, all five CHANGELOGs

## Risks / Watch-outs

- **Async writes**: Winston's File transport is async by default — flush on shutdown is not guaranteed without `logger.end()`/`logger.on('finish')`. Add a final flush in `server-factory.js` shutdown sequence (after all hooks run, before `process.exit`).
- **`format.errors({ stack: true })`** is required, otherwise `Error` objects in meta serialize as `{}`. Mirrors Pino's default err serializer.
- **Console color in tests**: ensure colorize is disabled when `NODE_ENV=test` to keep test output clean and avoid ANSI in snapshot-style assertions.
- **Version drift**: `core/shared/package.json` currently declares `pino: ^9.0.0` peer while logger ships `^10.3.1`. Removing the peer eliminates this drift.
- **Generator template tests** assert literal scaffolded strings — confirm changes don't break them; update them in the same PR.
- **Performance**: Winston is materially slower than Pino under high log throughput. Per AGENTS-readable.md, include a PR-description note about expected throughput impact.
