# Publish Prep — v0.1.2 (Codex-ready)

This document condenses **PUBLISH-0.1.2-PROPOSAL_v1.md** into a single, actionable checklist + a Codex prompt you can run locally.

## References
- Source proposal: `PUBLISH-0.1.2-PROPOSAL_v1.md`
- Canonical package metadata model: `core/generator/package.json`

## Release workflow (do not change)
This repo uses **Changesets**:
- `npm run cs` → add a changeset
- `npm run version-packages` → apply changesets to bump versions / changelogs
- `npm run release` → publish bumped packages

## Prep checklist (acceptance criteria)
### Repo-level
1. **Fix phantom workspace**
   - `core/modules/workflows` is listed as a workspace but has no `package.json`.
   - Either remove it from `workspaces` or add a stub `package.json` with `"private": true`.

2. **Prevent accidental root publish**
   - Ensure the repo root `package.json` has `"private": true`.
   - (Root currently has `"files": []`; publishing root would produce an empty/pointless package.)

### Package-level (targeted fixes for this release)
3. **Fill in READMEs (non-empty)**
   - `@glowing-fishstick/api` (`core/service-api`) README currently packs as **0B** in dry-run.
   - `@glowing-fishstick/logger` (`core/modules/logger`) README currently packs as **0B** in dry-run.
   - Create minimal but real `README.md` content for both and confirm non-zero size in pack output.

4. **Normalize metadata to match `core/generator`**
   For `core/service-api/package.json` and `core/modules/logger/package.json`, align fields to the *generator* pattern:
   - `author`: `Jeff Caradona <jeffcaradona@gmail.com>`
   - `license`: `MIT`
   - `homepage`: `https://github.com/jeffcaradona/glowing-fishstick#readme`
   - `bugs.url`: `https://github.com/jeffcaradona/glowing-fishstick/issues`
   - `repository`: `{ "type": "git", "url": "git+https://github.com/jeffcaradona/glowing-fishstick.git" }`
   - `engines`: `{ "node": ">=22" }`
   - Add/update `description` + `keywords` (include `"glowing-fishstick"` as a keyword)

5. **Do not introduce CommonJS**
   - Keep packages ESM-only (no `require`, no `exports.require` condition, no CJS build).

### Verification (must pass)
6. **Dry-run pack checks**
   Run:
   - `npm pack -w core/service-api --dry-run`
   - `npm pack -w core/modules/logger --dry-run`

   Confirm:
   - `README.md` is included and **non-zero size** for both packages.
   - The tarball includes only intended files per each package’s `"files"` allowlist.

---

## Codex prompt (paste into Codex locally)

TASK: Prep @glowing-fishstick/api (core/service-api) and @glowing-fishstick/logger (core/modules/logger) for publish quality + consistency for release v0.1.2.

CONTEXT:
- Follow existing publishing guidance in `PUBLISH-0.1.2-PROPOSAL_v1.md`.
- Use `core/generator/package.json` as the canonical metadata/style model (MIT, author, homepage/bugs/repository shape, engines, keywords style).
- ESM-only packages; do NOT add CommonJS support.

DO:
1) Repo-level fixes:
   a) Resolve phantom workspace: `core/modules/workflows` is in workspaces but lacks `package.json`.
      - Either remove it from root `workspaces` OR add a stub `package.json` with `"private": true`.
   b) Ensure root `package.json` has `"private": true` to prevent accidental publish.

2) Package.json metadata alignment:
   For:
   - `core/service-api/package.json` (@glowing-fishstick/api)
   - `core/modules/logger/package.json` (@glowing-fishstick/logger)
   Ensure these fields exist and match generator’s values/shape:
   - homepage: https://github.com/jeffcaradona/glowing-fishstick#readme
   - bugs.url: https://github.com/jeffcaradona/glowing-fishstick/issues
   - repository: { type: "git", url: "git+https://github.com/jeffcaradona/glowing-fishstick.git" }
   - license: "MIT"
   - author: "Jeff Caradona <jeffcaradona@gmail.com>" (logger currently empty; fix it)
   - engines: { node: ">=22" }
   Also add/update:
   - description (short, accurate)
   - keywords (match generator’s style; include "glowing-fishstick")

3) Add minimal non-empty READMEs:
   - Create `core/service-api/README.md` (name, purpose, install, tiny ESM usage example, license).
   - Create `core/modules/logger/README.md` (name, purpose, install, tiny ESM usage example, pino note, license).
   Ensure files are non-empty and will be included in tarballs.

4) Verify publish contents:
   - Run `npm pack -w core/service-api --dry-run` and `npm pack -w core/modules/logger --dry-run`.
   - Confirm README.md is included and non-zero; packed files match each package’s allowlist.

OUTPUT:
- Provide diffs for:
  - root `package.json` (if changed)
  - `core/service-api/package.json`
  - `core/modules/logger/package.json`
  - `core/service-api/README.md` (new)
  - `core/modules/logger/README.md` (new)
- Include the captured `npm pack --dry-run` outputs for both packages.
