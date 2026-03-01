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

### 5. Publish

```sh
npm run release
```

Runs `changeset publish`, which publishes all packages whose version has been bumped. Scoped packages are published with `--access public` as configured in `.changeset/config.json`.

### 6. Tag and push

```sh
git tag vX.Y.Z
git push --follow-tags
```

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

- The repo root is `"private": true` — it will never be published.
- All published packages require **Node.js ≥ 22**.
- Published packages: `@glowing-fishstick/app`, `@glowing-fishstick/api`, `@glowing-fishstick/shared`, `@glowing-fishstick/logger`, `@glowing-fishstick/generator`.
