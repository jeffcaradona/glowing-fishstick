# Prebuild / Publish Readiness Checklist — v0.1.2

## Plan: ESM Workspaces + Changesets

**TL;DR:** The monorepo's Changesets flow and workspace `"files"` whitelists are largely in place, but several gaps would cause problems at publish time: a phantom workspace (`core/modules/workflows`), a non-private root package, missing package metadata on 3 of 5 publishable packages, missing READMEs for 2 packages, and no lifecycle scripts to gate accidental broken publishes. This plan addresses each gap, then validates with `npm pack --dry-run` per package.

---

## Existing release flow (already correct — keep as-is)

- `.changeset/config.json`: `access: "public"`, `baseBranch: "main"`, `updateInternalDependencies: "patch"` — all appropriate.
- Root scripts `cs` → `version-packages` → `release` per `README.md` versioning section — correct.
- 5 publishable packages already have `"type": "module"`, `"exports"`, and `"files"` whitelists.
- `sandbox/app` and `sandbox/api` are `"private": true` — correctly excluded.

---

## Steps

### Step 1 — Fix phantom workspace: `core/modules/workflows`

`core/modules/workflows/` has no `package.json` but is listed in root `package.json` `"workspaces"`. This will break `npm install`, `changeset version`, and `changeset publish`. **Remove** `"core/modules/workflows"` from the `"workspaces"` array (or, if the package is planned, add a minimal `package.json` with `"private": true`).

### Step 2 — Mark root package as `"private": true`

Root `package.json` has `"files": []` but no `"private": true`. An accidental `npm publish` from root would publish an empty package named `glowing-fishstick`. Add `"private": true` to the root `package.json`.

### Step 3 — Normalize metadata on publishable packages

Use `core/generator/package.json` as the model (it's the most complete). Add missing fields to these 4 packages:

| Field        | `core/web-app`          | `core/service-api` | `core/shared` | `core/modules/logger`  |
| ------------ | ----------------------- | ------------------ | ------------- | ---------------------- |
| `license`    | ❌ add `"MIT"`          | ❌ add             | ❌ add        | ✅                     |
| `author`     | ❌ add                  | ❌ add             | ❌ add        | ⚠️ empty string → fill |
| `repository` | ❌ add                  | ❌ add             | ❌ add        | ❌ add                 |
| `homepage`   | ❌ add                  | ❌ add             | ❌ add        | ❌ add                 |
| `bugs`       | ❌ add                  | ❌ add             | ❌ add        | ❌ add                 |
| `keywords`   | ❌ add                  | ❌ add             | ❌ add        | ❌ add                 |
| `engines`    | ❌ add `"node": ">=22"` | ❌ add             | ❌ add        | ❌ add                 |

Also fix `core/shared/package.json` `"description"` — currently copy-pasted from web-app ("Core application factory and configuration module"); change to something like "Shared utilities, server factory, hook registry, and auth for glowing-fishstick".

### Step 4 — Add missing READMEs

- **`core/service-api/`**: Create `README.md` for `@glowing-fishstick/api`. Without it, the npm landing page will be blank.
- **`core/modules/logger/`**: Create `README.md` for `@glowing-fishstick/logger`.

npm always includes `README.md` in tarballs regardless of `.npmignore`/`"files"`, so no `"files"` changes needed.

### Step 5 — Verify `.npmignore` vs `"files"` interaction

The root `.npmignore` contains `*.md`, `tests/`, `coverage/`, `documentation/`, etc. Since each publishable package has a `"files"` whitelist, npm should use the whitelist as the primary inclusion mechanism and still always include `README.md`, `LICENSE`, and `package.json`. **Verification required** via `npm pack -w <pkg> --dry-run` (Step 8) to confirm README.md appears in each tarball. If it doesn't, add per-package `.npmignore` files that do NOT exclude `*.md`, or explicitly add `"README.md"` to each `"files"` array.

### Step 6 — Add `prepublishOnly` lifecycle script to each publishable package

Add a `"prepublishOnly"` script that gates accidental broken publishes. Suggested script for each:

```
"prepublishOnly": "npm run test"
```

This ensures tests pass before any `npm publish` / `changeset publish`. Add to all 5 publishable `package.json` files:

- `core/web-app/package.json`
- `core/service-api/package.json`
- `core/shared/package.json`
- `core/modules/logger/package.json`
- `core/generator/package.json`

### Step 7 — Add `"ignore"` for sandbox packages in Changesets config

While `"private": true` packages are automatically skipped by Changesets, it's defensive to explicitly list them in `.changeset/config.json` `"ignore"` array:

```json
"ignore": ["glowing-fishstick-tasks", "glowing-fishstick-tasks-api"]
```

This prevents confusing prompts during `npm run cs` if Changesets detects changes in sandbox packages.

### Step 8 — Validate packed contents (every publishable package)

Run for each of the 5 publishable packages and confirm the tarball contains exactly what's expected:

```bash
npm pack -w core/web-app --dry-run
npm pack -w core/service-api --dry-run
npm pack -w core/shared --dry-run
npm pack -w core/modules/logger --dry-run
npm pack -w core/generator --dry-run
```

**For each, verify:**

- `package.json` ✅ included
- `README.md` ✅ included (not excluded by root `.npmignore`)
- `index.js` ✅ included
- `src/` contents ✅ included
- `bin/` and `templates/` ✅ included (generator only)
- `tests/`, `coverage/`, `*.test.js`, `vitest.config.js` ❌ NOT included
- `node_modules/` ❌ NOT included

### Step 9 — Decide on `./testing` sub-path export in `@glowing-fishstick/shared`

`core/shared/package.json` exports `"./testing"` pointing to `./src/testing/security-helpers.js`. This will be published and available to consumers. Confirm this is intentional (it's used in `core/web-app` and `core/service-api` integration tests). If it's dev-only tooling not meant for external consumers, consider documenting it as internal or gating it behind a separate package.

### Step 10 — Documentation sync

Update these 4 docs per AGENTS-readable.md requirements:

- `README.md` — already has correct versioning section; update if any fields change
- `sandbox/app/DEV_APP_README.md` — confirm install examples use package names
- `documentation/00-project-specs.md` — update if exports change
- `documentation/99-potential-gaps.md` — note publish readiness status

---

## Verification

1. `npm install` succeeds without errors (after removing workflows workspace or adding its `package.json`)
2. `npm run lint && npm run format -- --check` passes
3. `npm run test:all` passes
4. All 5 `npm pack -w <pkg> --dry-run` outputs show correct files (README included, tests excluded)
5. `npm run cs` (dry run) does not prompt for sandbox packages
6. Each publishable package's `package.json` has: `type: "module"`, `exports`, `files`, `license`, `author`, `repository`, `engines`

---

## Decisions needed

- **Phantom workspace**: Remove `core/modules/workflows` from workspaces (it has no `package.json` and is just proposal docs) — or add a stub `package.json` with `"private": true` if it's a planned future package.
- **`prepublishOnly` scope**: Run tests only (lightweight), or run `lint + test` (stricter). Recommend tests only since `changeset publish` runs for all packages — lint can be done once at root.
- **`./testing` sub-path**: Keep or remove from `@glowing-fishstick/shared` exports.

---

## Discovery findings

### Changesets configuration (`.changeset/config.json`)

```json
{
  "access": "public",
  "baseBranch": "main",
  "commit": false,
  "fixed": [],
  "linked": [],
  "ignore": [],
  "updateInternalDependencies": "patch"
}
```

- `access: "public"` — correct for `@glowing-fishstick/*` scoped packages
- `commit: false` — version bumps are not auto-committed; manual commit needed after `changeset version`
- `ignore: []` — no packages excluded (sandbox packages are auto-skipped via `private: true`)
- All publishable packages at version `0.1.2` (in sync); internal deps use `^0.1.0` ranges

### Per-package readiness snapshot

| Package                        | `type` | `exports` | `files` | `license` | `author` | `repo` | `engines` | README |
| ------------------------------ | ------ | --------- | ------- | --------- | -------- | ------ | --------- | ------ |
| `@glowing-fishstick/app`       | ✅     | ✅        | ✅      | ❌        | ❌       | ❌     | ❌        | ✅     |
| `@glowing-fishstick/api`       | ✅     | ✅        | ✅      | ❌        | ❌       | ❌     | ❌        | ❌     |
| `@glowing-fishstick/shared`    | ✅     | ✅        | ✅      | ❌        | ❌       | ❌     | ❌        | ✅     |
| `@glowing-fishstick/logger`    | ✅     | ✅        | ✅      | ✅        | ⚠️ `""`  | ❌     | ❌        | ❌     |
| `@glowing-fishstick/generator` | ✅     | ✅        | ✅      | ✅        | ✅       | ✅     | ✅        | ✅     |

### Root `.npmignore`

```
*.md
tests/
vitest.config.js
*.test.js
*.spec.js
coverage/
documentation/
sandbox/
.eslintrc.json
.eslintignore
.prettierrc.json
.prettierignore
.gitignore
.env
.env.*.local
.github/
.gitlab-ci.yml
.vscode/
.idea/
*.swp
*.swo
.git/
.gitkeep
```

`*.md` exclusion is present — needs `npm pack --dry-run` verification that `"files"` whitelists override this for workspace packages and README.md is still included.

### No CI/CD workflows

`.github/workflows/` is empty. All publishing is manual via `npm run release`.

### Severity summary

| #   | Severity   | Issue                                                           |
| --- | ---------- | --------------------------------------------------------------- |
| 1   | **HIGH**   | `core/modules/workflows` in workspaces with no `package.json`   |
| 2   | **HIGH**   | Root `.npmignore` `*.md` may exclude README from tarballs       |
| 3   | **MEDIUM** | Root `package.json` missing `"private": true`                   |
| 4   | **MEDIUM** | 3 packages missing `license`, `author`, `repository`, `engines` |
| 5   | **MEDIUM** | `core/shared` description is copy-pasted from `core/web-app`    |
| 6   | **MEDIUM** | `core/service-api` has no README.md                             |
| 7   | **MEDIUM** | `core/modules/logger` has no README.md and empty `author`       |
| 8   | **LOW**    | No `prepublishOnly` scripts to gate broken publishes            |
| 9   | **LOW**    | No CI/CD workflows for automated publish                        |
| 10  | **INFO**   | `./testing` sub-path in shared — confirm intentional            |

### Dry Runs

```text
PS E:\Users\jeffc\Source\Repos\GitHub\glowing-fishstick> npm pack -w core/web-app --dry-run
npm notice
npm notice 📦  @glowing-fishstick/app@0.1.2
npm notice Tarball Contents
npm notice 1.5kB README.md
npm notice 465B index.js
npm notice 853B package.json
npm notice 6.5kB src/app-factory.js
npm notice 6.1kB src/config/env.js
npm notice 3.9kB src/controllers/admin-controller.helpers.js
npm notice 8.1kB src/controllers/admin-controller.js
npm notice 4.3kB src/engines/eta-engine.js
npm notice 1.8kB src/errors/appError.js
npm notice 633B src/middlewares/admin-throttle.js
npm notice 2.4kB src/middlewares/errorHandler.js
npm notice 1.9kB src/public/css/style.css
npm notice 1.6kB src/public/js/admin/dashboard.js
npm notice 1.0kB src/routes/admin.js
npm notice 1.2kB src/routes/health.js
npm notice 496B src/routes/index.js
npm notice 1.8kB src/views/admin/config.eta
npm notice 2.5kB src/views/admin/dashboard.eta
npm notice 218B src/views/errors/404.eta
npm notice 532B src/views/index.eta
npm notice 353B src/views/layouts/footer.eta
npm notice 840B src/views/layouts/header.eta
npm notice Tarball Details
npm notice name: @glowing-fishstick/app
npm notice version: 0.1.2
npm notice filename: glowing-fishstick-app-0.1.2.tgz
npm notice package size: 14.9 kB
npm notice unpacked size: 49.2 kB
npm notice shasum: 9649b8b4b68499bb2d5b243591714cbfd0ca7c1c
npm notice integrity: sha512-WEbzBWSBjUurk[...]YsYhKcveNCxsQ==
npm notice total files: 22
npm notice
glowing-fishstick-app-0.1.2.tgz
PS E:\Users\jeffc\Source\Repos\GitHub\glowing-fishstick> npm pack -w core/service-api --dry-run
npm notice
npm notice 📦  @glowing-fishstick/api@0.1.2
npm notice Tarball Contents
npm notice 0B README.md
npm notice 105B index.js
npm notice 716B package.json
npm notice 3.9kB src/api-factory.js
npm notice 3.7kB src/config/env.js
npm notice 633B src/middlewares/admin-throttle.js
npm notice 2.5kB src/middlewares/enforcement.js
npm notice 1.9kB src/middlewares/error-handler.js
npm notice 1.2kB src/routes/health.js
npm notice 507B src/routes/index.js
npm notice 774B src/routes/metrics.js
npm notice Tarball Details
npm notice name: @glowing-fishstick/api
npm notice version: 0.1.2
npm notice filename: glowing-fishstick-api-0.1.2.tgz
npm notice package size: 5.7 kB
npm notice unpacked size: 15.9 kB
npm notice shasum: c89e953b915b1e1891c27964c9620038779421bf
npm notice integrity: sha512-/MNcmLFGTT5Cr[...]7btcB9S8h8Tag==
npm notice total files: 11
npm notice
glowing-fishstick-api-0.1.2.tgz
PS E:\Users\jeffc\Source\Repos\GitHub\glowing-fishstick> npm pack -w core/shared --dry-run
npm notice
npm notice 📦  @glowing-fishstick/shared@0.1.2
npm notice Tarball Contents
npm notice 3.6kB README.md
npm notice 1.0kB index.js
npm notice 782B package.json
npm notice 946B src/auth/jwt.js
npm notice 2.7kB src/factory-utils.js
npm notice 1.6kB src/hook-registry.js
npm notice 3.2kB src/middlewares/admin-throttle.js
npm notice 2.3kB src/middlewares/error-utils.js
npm notice 1.5kB src/middlewares/jwt-auth.js
npm notice 1.3kB src/registry-store.js
npm notice 1.6kB src/request-id.js
npm notice 6.8kB src/server-factory.js
npm notice 9.9kB src/service-container.js
npm notice 5.2kB src/testing/security-helpers.js
npm notice 1.7kB src/utils/formatters.js
npm notice Tarball Details
npm notice name: @glowing-fishstick/shared
npm notice version: 0.1.2
npm notice filename: glowing-fishstick-shared-0.1.2.tgz
npm notice package size: 13.3 kB
npm notice unpacked size: 44.1 kB
npm notice shasum: eff7dead37c57da8e746b90d707e00e19502bd2d
npm notice integrity: sha512-9SKgb3q/5k6Ox[...]YVrIDe+PkySww==
npm notice total files: 15
npm notice
glowing-fishstick-shared-0.1.2.tgz
PS E:\Users\jeffc\Source\Repos\GitHub\glowing-fishstick> npm pack -w core/modules/logger --dry-run
npm notice
npm notice 📦  @glowing-fishstick/logger@0.1.2
npm notice Tarball Contents
npm notice 0B README.md
npm notice 69B index.js
npm notice 528B package.json
npm notice 6.4kB src/logger.js
npm notice Tarball Details
npm notice name: @glowing-fishstick/logger
npm notice version: 0.1.2
npm notice filename: glowing-fishstick-logger-0.1.2.tgz
npm notice package size: 2.7 kB
npm notice unpacked size: 7.0 kB
npm notice shasum: e6f3799fc85f40957e48348149f86ece01a76873
npm notice integrity: sha512-IlwhjVXWDIzCW[...]GPK5Lxa1wm09g==
npm notice total files: 4
npm notice
glowing-fishstick-logger-0.1.2.tgz
PS E:\Users\jeffc\Source\Repos\GitHub\glowing-fishstick> npm pack -w core/generator --dry-run
npm notice
npm notice 📦  @glowing-fishstick/generator@0.1.2
npm notice Tarball Contents
npm notice 3.0kB README.md
npm notice 2.1kB bin/cli.js
npm notice 1.1kB package.json
npm notice 13.7kB src/generator.js
npm notice 5.3kB src/prompts.js
npm notice 5.2kB src/scaffolder.js
npm notice 3.8kB src/validators.js
npm notice 498B templates/api/package.json
npm notice 1.1kB templates/api/README.md
npm notice 515B templates/api/src/api.js
npm notice 232B templates/api/src/config/env.js
npm notice 368B templates/api/src/routes/router.js
npm notice 798B templates/api/src/server.js
npm notice 0B templates/app/.gitkeep
npm notice 502B templates/app/package.json
npm notice 1.2kB templates/app/README.md
npm notice 605B templates/app/src/app.js
npm notice 634B templates/app/src/config/env.js
npm notice 438B templates/app/src/routes/router.js
npm notice 795B templates/app/src/server.js
npm notice 186B templates/app/src/views/layouts/footer.eta
npm notice 402B templates/app/src/views/layouts/header.eta
npm notice 321B templates/app/src/views/my-feature.eta
npm notice Tarball Details
npm notice name: @glowing-fishstick/generator
npm notice version: 0.1.2
npm notice filename: glowing-fishstick-generator-0.1.2.tgz
npm notice package size: 13.2 kB
npm notice unpacked size: 42.9 kB
npm notice shasum: c9db5ff5098e7bdb8173f8f493c839041eb2a8e8
npm notice integrity: sha512-MPI71p9C2Pwph[...]bAK1IxUPomg+g==
npm notice total files: 23
npm notice
glowing-fishstick-generator-0.1.2.tgz
PS E:\Users\jeffc\Source\Repos\GitHub\glowing-fishstick>
```
