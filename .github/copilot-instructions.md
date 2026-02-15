# Documentation & Workspace Alignment

## Canonical truth

- This repository is a monorepo workspace.
- Consumer runtime examples MUST use current install target package(s).
- Do not assume root package is runtime-installable unless root `package.json` has explicit runtime `exports/main` and intended `files`.

## Sync rules (mandatory)

When editing package names, exports, directory structure, or API entrypoints:

1. Update README installation + import examples.
2. Update app/DEV_APP_README examples and directory diagrams.
3. Update documentation/00-project-specs public API snippets.
4. Update status wording in documentation/99-potential-gaps.md if implementation state changed.

## Forbidden stale patterns

- No examples importing from ../../index.js for consumer usage unless explicitly marked "local-only".
- No references to legacy core paths that do not exist.
- No install docs that conflict with actual package export boundaries.

## Documentation DoD

Before finishing:

- Verify every documented file path exists.
- Verify every documented import specifier matches current package boundaries.
- Verify every code snippet reflects current function/file names.
- Run repo search for known stale strings.

## Validation commands

- rg --files
- rg "from '../../index.js'|npm install glowing-fishstick|./src/app.js|./src/server.js" README.md app/DEV_APP_README.md documentation/\*.md
- npm pack --dry-run (when installation/publish docs changed)
- npm run lint
- npm run format
