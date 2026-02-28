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
```

### 2. Add a changeset

```sh
npm run cs
```

Select the affected packages, choose a semver bump type, and write a short description. Commit the generated `.changeset/*.md` file with your feature branch or as a standalone commit.

### 3. Version packages

```sh
npm run version-packages
```

This applies all pending changesets: bumps `version` fields and writes `CHANGELOG.md` files. Review the diffs, then commit:

```sh
git add .
git commit -m "chore: version packages"
```

### 4. Publish

```sh
npm run release
```

Runs `changeset publish`, which publishes all packages whose version has been bumped. Scoped packages are published with `--access public` as configured in `.changeset/config.json`.

### 5. Push

```sh
git push --follow-tags
```

## Notes

- The repo root is `"private": true` — it will never be published.
- All published packages require **Node.js ≥ 22**.
- Published packages: `@glowing-fishstick/app`, `@glowing-fishstick/api`, `@glowing-fishstick/shared`, `@glowing-fishstick/logger`, `@glowing-fishstick/generator`.
