# Migration Plan: EJS to Eta (v0.1.0)

**Status:** Draft implemented in working tree (pending final approval)  
**Version Target:** 0.1.0 (breaking change)  
**Last Reviewed:** 2026-02-19

## Why This Migration Exists

`npm audit` currently reports a high-severity chain through EJS:

```text
ejs@4.0.1 -> jake -> filelist -> minimatch (<10.2.1)
```

Advisory: GHSA-3ppc-4f35-3m26 (ReDoS in minimatch).

In this repository, `npm audit` reports no non-breaking fix path for this chain. Replacing EJS with Eta avoids the transitive dependency on `jake/filelist/minimatch`.

## Current Repository Reality (as of 2026-02-19)

- Runtime is now Eta in `core/app/src/app-factory.js` (`app.set('view engine', 'eta')`).
- Templates are now `.eta` under:
  - `core/app/src/views/`
  - `app/src/views/`
  - `template/app/src/views/`
- `core/app/src/engines/eta-engine.js` is wired into `createApp`.
- Current Eta engine avoids sync FS calls in request-render paths; startup-only indexing is used for multi-directory template resolution.

## Pre-Approval Corrections to the Original Plan

1. Include syntax must not be escaped:
   - Use `Eta` raw output for includes: `<%~ include('path') %>`
   - Do **not** use `<%= include('path') %>` when `autoEscape: true` (it may escape HTML output).
2. File extension migration is required:
   - Rename `.ejs` templates to `.eta`.
   - Update any references in docs/examples accordingly.
3. Express integration steps were incomplete:
   - Register Eta engine via `app.engine('eta', createEtaEngine(viewDirs))`.
   - Set `app.set('view engine', 'eta')`.
   - Keep multi-directory view fallback behavior consistent with current EJS behavior.
4. Event-loop safety must be part of migration scope:
   - Replace sync FS calls in request-render paths with async/promise APIs before approval.

## Migration Phases

## Phase 1: Dependency and Engine Wiring

Files:

- `core/app/package.json`
- `core/app/src/app-factory.js`
- `core/app/src/engines/eta-engine.js`

Required changes:

- Replace `ejs` dependency with `eta`.
- Wire custom engine:
  - import `createEtaEngine`
  - `app.engine('eta', createEtaEngine(viewDirs))`
  - `app.set('view engine', 'eta')`
- Preserve view directory precedence (consumer first, core fallback).
- Remove sync filesystem calls from Eta engine hot path.

## Phase 2: Template Conversion

Rename all template files from `.ejs` to `.eta`:

- `core/app/src/views/index.ejs`
- `core/app/src/views/admin/dashboard.ejs`
- `core/app/src/views/admin/config.ejs`
- `core/app/src/views/errors/404.ejs`
- `core/app/src/views/layouts/header.ejs`
- `core/app/src/views/layouts/footer.ejs`
- `app/src/views/index.ejs`
- `app/src/views/tasks/list.ejs`
- `template/app/src/views/my-feature.ejs`
- `template/app/src/views/layouts/header.ejs`
- `template/app/src/views/layouts/footer.ejs`

Template syntax updates:

- Include partials: `<%- include(...) %>` -> `<%~ include(...) %>`
- Escaped output remains `<%= ... %>`
- Raw HTML output remains raw form (`<%~ ... %>`)

## Phase 3: Dev Workflow Updates

Files:

- `app/package.json`
- `api/package.json`
- `template/app/package.json`
- `template/api/package.json`

Update nodemon extension watch lists to include `.eta` (and optionally keep `.ejs` during transition window).

## Phase 4: Documentation Sync (Required by AGENTS.md)

Update all canonical docs for consistency:

- `README.md`
- `app/DEV_APP_README.md`
- `documentation/00-project-specs.md`
- `documentation/99-potential-gaps.md` (status wording if implementation state changes)
- Any package README that states EJS behavior (for example `template/app/README.md`)

## Phase 5: Versioning

Planned version bump for breaking change: `0.0.2` -> `0.1.0` in versioned workspace packages.

## Validation Checklist

Pre-migration baseline:

```bash
npm test:all
npm audit --json
```

Post-migration checks:

```bash
npm install
npm test:all
npm audit --json
npm run start:app
npm run start:api
npm run dev:app
```

Doc consistency checks:

```bash
rg -n "\\.ejs|EJS|<%- include\\(" README.md app/DEV_APP_README.md documentation/*.md template/app/README.md
rg -n "view engine" core/app/src/app-factory.js documentation/*.md
```

Performance/safety checks:

```bash
rg -n "\\b(readFileSync|existsSync|writeFileSync|readdirSync|statSync)\\b" core/app/src/engines core/app/src
```

## Approval Gates (Must Pass Before Code Merge)

- [ ] No sync blocking APIs in request/template render paths.
- [ ] Eta engine is registered and view resolution order matches current behavior.
- [ ] All runtime templates migrated to `.eta`.
- [ ] Include syntax uses Eta raw include form (`<%~ include(...) %>`).
- [ ] `npm test:all` passes.
- [ ] `npm audit` no longer reports this EJS -> jake -> filelist -> minimatch vulnerability chain.
- [ ] Canonical docs and examples are fully synchronized.
