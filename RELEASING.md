# Releasing

This repo uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing.

## Prerequisites

- npm account with publish access to the `@glowing-fishstick` scope
- Authenticated locally (`npm login`) or `NPM_TOKEN` set in your environment

## Release workflow

### 1. Pre-flight

Confirm the workspace is clean and all checks pass:

```sh
npm run test:all
npm run lint
npm pack --dry-run
```

### 2. Define cutover target and sync

WHY: Release cutover must be deterministic so tags and publish always map to a known merge commit.
TRADEOFF: Slightly more process overhead before publish.
VERIFY IF CHANGED: Re-check the merge/tag sequence and changelog commit references.

Use `main` as the release source-of-truth branch unless a specific release branch is designated.

```sh
git checkout main
git pull
git status --short
```

If you are cutting from a release branch (for example `release/0.1.3`), merge into `main` first and tag only after the merge commit is finalized.

### 3. Add a changeset

```sh
npm run cs
```

Select the affected packages, choose a semver bump type, and write a short description. Commit the generated `.changeset/*.md` file with your feature branch or as a standalone commit.

### 4. Version packages

```sh
npm run version-packages
```

This applies all pending changesets: bumps `version` fields and writes `CHANGELOG.md` files. Review the diffs, then commit:

```sh
git add .
git commit -m "chore: version packages"
```

### 4.5. Coordinate major/minor bumps (patches stay independent)

After running `npm run version-packages`, inspect which packages bumped:

```sh
# Check git diff to see version changes
git diff HEAD~1 -- '**/package.json' | grep -A2 -B2 '"version"'
```

**If any package got a minor or major bump:**

1. Determine the highest bump level across all packages (major > minor > patch).
2. Bump all other packages to match that level (e.g., if `shared` went 1.0.0 → 2.0.0, bump `api`, `app`, `logger`, `generator` to 2.0.0 too).
3. Bump root `package.json` to the same version.
4. Amend the commit:

```sh
npm pkg set version=X.Y.Z
git add package.json package-lock.json
git commit --amend --no-edit
```

WHY: Major/minor releases are intentional, coordinated changes. All packages should align to the same level for clarity and coherent testing. Patches (shame bumps) can remain independent and align opportunistically on the next minor/major release.

**If only patch bumps (no minor/major changes):**

Leave packages independent. Continue to step 4.6.

### 4.6. Update root CHANGELOG.md

For minor/major releases, add an entry to the root `CHANGELOG.md` summarizing changes across all packages. This provides consuming apps (e.g., irrational-pve-api) with a single coherent story per monorepo release:

```sh
# Open CHANGELOG.md and add:
## [X.Y.Z] - YYYY-MM-DD

### Added
- @glowing-fishstick/shared: ...
- @glowing-fishstick/app: ...

### Fixed
- @glowing-fishstick/api: ...

# Then add to the commit:
git add CHANGELOG.md
git commit --amend --no-edit
```

WHY: Per-package CHANGELOG.md files target npm registry consumers. Root CHANGELOG.md targets monorepo release consumers who want one clear version number and summary.

### 5. Publish

```sh
npm run release
```

Runs `changeset publish`, which publishes all packages whose version has been bumped. Scoped packages are published with `--access public` as configured in `.changeset/config.json`.

### 6. Tag and push

Tag using the monorepo version from root `package.json` (determined in step 4.5):

```sh
git tag vX.Y.Z  # Use version from root package.json
git push --follow-tags
```

Note: Per-package versions (in `core/*/package.json`) may differ, but the tag always reflects the coordinated monorepo version. Consuming apps reference this single tag.

## Rollback / failure handling

### Publish failed before any package was published

1. Fix the root issue (auth/network/registry policy).
2. Re-run `npm run release`.

### Publish partially succeeded

WHY: Changesets may publish a subset before a failure; force-republishing blindly can cause version conflicts.
TRADEOFF: Manual triage is required.
VERIFY IF CHANGED: Confirm published versions in npm registry and local changelog consistency.

1. Check which packages and versions were actually published.
2. Do not delete or reuse published versions.
3. Create a new follow-up changeset and run `npm run version-packages`.
4. Publish again with the new versions.

### Tagging error after successful publish

1. Create the missing tag on the exact release commit (`git tag vX.Y.Z <commit>`).
2. Push tags (`git push --follow-tags`).
3. Document the correction in release notes.

## Notes

- The repo root is `"private": true` — it will never be published to npm, but `package.json` tracks the coordinated monorepo version for minor/major releases.
- Root `CHANGELOG.md` provides a single release story for monorepo developers; per-package `CHANGELOG.md` files target external consuming apps on npm.
- **Version coordination:**
  - **Patches (shame bumps):** Packages bump independently; monorepo version may lag behind a patched package.
  - **Minor/major releases:** All packages coordinate to the same version level; root `package.json` and monorepo tag (vX.Y.Z) reflect this coordinated version.
- All published packages require **Node.js ≥ 22**.
- Published packages: `@glowing-fishstick/app`, `@glowing-fishstick/api`, `@glowing-fishstick/shared`, `@glowing-fishstick/logger`, `@glowing-fishstick/generator`.

## Maintenance branches

Long-lived support branches are cut from the last release tag of a given minor line so that critical fixes can be backported without dragging in the next minor's breaking changes.

| Branch              | Tracks                                        | Purpose                                                                                                                          |
| ------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `main`              | next release line (currently `0.2.x`)         | Active development. All new features and breaking changes land here.                                                             |
| `maintenance/0.1.x` | last `0.1.x` release (Pino-backed logger)     | Pino-compatible backports only — security fixes and severe bug fixes for consumers still pinned to `@glowing-fishstick/*@^0.1.x`. |

WHY: `0.2.0` is a breaking change (Pino → Winston call-signature flip). Consumers blocked on Pino's removal need a place to receive `0.1.x` patches without being forced onto Winston.

### When to backport to `maintenance/0.1.x`

- Security advisories affecting a transitive Pino-era dependency.
- Severe runtime regressions reproducible on the published `0.1.8` install graph.
- **Not** new features. **Not** doc cleanups. **Not** dev-tooling changes.

### Backport workflow

```sh
git checkout maintenance/0.1.x
git cherry-pick <commit-sha-from-main>     # resolve any Pino-vs-Winston conflicts manually
npm run test:all
npm run cs                                 # patch-only changeset
npm run version-packages                   # bumps 0.1.x → 0.1.(x+1)
git commit -am "chore: version packages (0.1.x maintenance)"
npm run release
git tag v0.1.<n>
git push --follow-tags origin maintenance/0.1.x
```

### Sunset policy

`maintenance/0.1.x` is supported until the corporate package mirror stocks `winston` and all known internal consumers have migrated to `^0.2.0`. After that, the branch is archived and no further releases ship.
