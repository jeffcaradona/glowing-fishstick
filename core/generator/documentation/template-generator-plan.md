# Template Generator CLI — Implementation Plan

**Package:** `@glowing-fishstick/generator`
**Date:** February 27, 2026
**Status:** Planning
**Prerequisite:** Proposal approved (`core/generator/documentation/template-generator-proposal.md`)

---

## Summary

Build a CLI tool at `core/generator/` that scaffolds new glowing-fishstick projects from the templates already located in `core/generator/templates/`. The CLI uses `commander` for argument parsing and built-in Node.js APIs for everything else. Template rendering uses Handlebars (`{{ }}` syntax) so it won't conflict with Eta's `<%= %>` in `.eta` view files. Generated projects receive standalone-ready scripts (no monorepo-relative paths). The former `template/app` and `template/api` workspace entries are removed from the root `package.json`.

---

## Key Decisions

| Decision                 | Choice                                      | Rationale                                                                                                                              |
| ------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Template engine**      | Handlebars (`{{ }}`)                        | Won't collide with Eta's `<%= %>` syntax in `.eta` view files; eliminates need for delimiter customization or selective rendering      |
| **Dependencies**         | `commander` + `handlebars` only             | Node >= 22 provides `node:readline/promises`, `node:fs/promises`, `node:child_process` built-in; minimizes install footprint           |
| **Template strategy**    | Self-contained (templates inside generator) | Templates moved into `core/generator/templates/`; no cross-directory workspace dependencies; old `template/` workspace entries removed |
| **`.eta` file handling** | Copied verbatim (no Handlebars processing)  | `.eta` expressions (`<%= appName %>`) are Eta runtime variables resolved at request time, not generator-time placeholders              |
| **Dev scripts**          | Transformed for standalone use              | Generated `package.json` dev scripts remove monorepo-relative `--watch ../core/*` paths since standalone projects install from npm     |

---

## File Structure (Target State)

```
core/generator/
├── package.json
├── README.md
├── documentation/
│   ├── template-generator-proposal.md    # Existing proposal doc
│   └── template-generator-plan.md        # This document
├── bin/
│   └── cli.js                            # CLI entry point (hashbang)
├── src/
│   ├── generator.js                      # Orchestrator
│   ├── scaffolder.js                     # Recursive copy + render
│   ├── prompts.js                        # Interactive mode (node:readline/promises)
│   └── validators.js                     # Input validation
├── templates/
│   ├── app/                              # Existing app template (with Handlebars placeholders)
│   │   ├── .gitkeep
│   │   ├── package.json
│   │   ├── README.md
│   │   └── src/
│   │       ├── server.js
│   │       ├── app.js
│   │       ├── config/env.js
│   │       ├── routes/router.js
│   │       ├── views/
│   │       │   ├── my-feature.eta        # Copied verbatim (Eta runtime)
│   │       │   └── layouts/
│   │       │       ├── header.eta        # Copied verbatim (Eta runtime)
│   │       │       └── footer.eta        # Copied verbatim (Eta runtime)
│   │       └── public/
│   │           ├── css/.gitkeep
│   │           └── js/.gitkeep
│   └── api/                              # Existing API template (with Handlebars placeholders)
│       ├── package.json
│       ├── README.md
│       └── src/
│           ├── server.js
│           ├── api.js
│           ├── config/env.js
│           └── routes/router.js
└── tests/
    ├── unit/
    │   ├── validators.test.js
    │   └── scaffolder.test.js
    └── integration/
        └── cli.test.js
```

---

## Template Variables

Variables collected from CLI arguments or interactive prompts, passed to Handlebars:

| Variable       | Source                                   | Default                                          | Used In                                         |
| -------------- | ---------------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| `projectName`  | CLI arg or prompt                        | _(required)_                                     | `package.json` name, `README.md`                |
| `appName`      | Derived from `projectName`               | Same as `projectName`                            | `config/env.js`, `server.js` logger name        |
| `description`  | Prompt or default                        | `"A starter [app\|API] using glowing-fishstick"` | `package.json` description                      |
| `port`         | `--port` flag or default                 | `3000` (app) / `3001` (api)                      | `config/env.js`                                 |
| `templateType` | `--template` flag                        | `"app"`                                          | Selects template directory                      |
| `coreVersion`  | Read from generator's own `package.json` | Current version                                  | Dependency versions in generated `package.json` |

---

## Template File Modifications

These files in `core/generator/templates/` need Handlebars placeholders replacing hardcoded values:

### App Template (`templates/app/`)

| File                | Hardcoded Value                                                    | Replacement                                                                          |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `package.json`      | `"my-glowing-fishstick-app"`                                       | `"{{projectName}}"`                                                                  |
| `package.json`      | `"A starter application..."`                                       | `"{{description}}"`                                                                  |
| `package.json`      | `"^0.0.3"` (dep versions)                                          | `"^{{coreVersion}}"`                                                                 |
| `package.json`      | `--watch ../core/web-app/src --watch ../core/shared/src` in dev script | Remove (standalone: `"nodemon --watch src --ext js,mjs,cjs,json,eta src/server.js"`) |
| `src/server.js`     | `createLogger({ name: 'my-app' })`                                 | `createLogger({ name: '{{appName}}' })`                                              |
| `src/config/env.js` | `appName: 'my-app'`                                                | `appName: '{{appName}}'`                                                             |
| `README.md`         | Title and structure references                                     | Use `{{projectName}}` and `{{appName}}`                                              |

### API Template (`templates/api/`)

| File                | Hardcoded Value                                                    | Replacement                                                                          |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `package.json`      | `"my-glowing-fishstick-api"`                                       | `"{{projectName}}"`                                                                  |
| `package.json`      | `"A starter API..."`                                               | `"{{description}}"`                                                                  |
| `package.json`      | `"^0.0.3"` (dep versions)                                          | `"^{{coreVersion}}"`                                                                 |
| `package.json`      | `--watch ../core/service-api/src --watch ../core/shared/src` in dev script | Remove (standalone: `"nodemon --watch src --ext js,mjs,cjs,json,eta src/server.js"`) |
| `src/server.js`     | `createLogger({ name: 'my-api' })`                                 | `createLogger({ name: '{{appName}}' })`                                              |
| `src/config/env.js` | `appName: 'my-api'`                                                | `appName: '{{appName}}'`                                                             |
| `src/config/env.js` | `port: Number(process.env.PORT \|\| 3001)`                         | `port: Number(process.env.PORT \|\| {{port}})`                                       |
| `README.md`         | Title and structure references                                     | Use `{{projectName}}` and `{{appName}}`                                              |

### Files NOT Modified

- `.eta` files (`my-feature.eta`, `layouts/header.eta`, `layouts/footer.eta`) — their `<%= appName %>` expressions are Eta runtime variables, not generator placeholders.
- `.gitkeep` files — empty marker files, copied as-is.

---

## Implementation Steps

### Step 1: Create `core/generator/package.json`

```json
{
  "name": "@glowing-fishstick/generator",
  "version": "0.0.3",
  "private": false,
  "description": "CLI template generator for glowing-fishstick applications",
  "type": "module",
  "main": "src/generator.js",
  "bin": {
    "fishstick-create": "./bin/cli.js"
  },
  "exports": {
    ".": { "import": "./src/generator.js" }
  },
  "files": ["bin/", "src/", "templates/"],
  "engines": { "node": ">=22" },
  "keywords": ["template", "generator", "express", "cli", "glowing-fishstick"],
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration"
  },
  "dependencies": {
    "commander": "^14.0.3",
    "handlebars": "^4.7.8"
  }
}
```

### Step 2: Create `bin/cli.js` — CLI entry point

- Hashbang: `#!/usr/bin/env node`
- Use `commander` to define `fishstick-create [project-directory]` with options:
  - `--template <type>` — `app` or `api` (default: `app`)
  - `--no-install` — skip `npm install`
  - `--no-git` — skip `git init`
  - `--force` — overwrite existing directory
  - `--port <number>` — override default port
- If `project-directory` not provided as argument, prompt interactively via `src/prompts.js`
- Call `src/generator.js` with resolved options
- Print success message with next steps using plain ANSI escape codes (green checkmarks, bold text)

### Step 3: Create `src/generator.js` — orchestrator

Main `generate(options)` async function:

1. Validate project name via `src/validators.js` (npm naming rules)
2. Check target directory doesn't exist (or `--force` to overwrite)
3. Select template source: `templates/app/` or `templates/api/`
4. Build context object with all template variables
5. Call `src/scaffolder.js` to copy + render files
6. Optionally run `git init` via `node:child_process` (async `execFile`)
7. Optionally run `npm install` via `node:child_process` (async `spawn`)

### Step 4: Create `src/scaffolder.js` — recursive copy + render

- Recursively walk the template directory using `node:fs/promises` `readdir` with `recursive: true`
- For each file, read contents and decide rendering strategy:
  - `.eta` files → copy verbatim (no Handlebars processing)
  - `.gitkeep` files → copy verbatim
  - `.js`, `.json`, `.md` files → process through Handlebars to replace `{{ }}` placeholders
- Preserve directory structure; create dirs with `mkdir({ recursive: true })`
- Handle empty directories (`public/css/`, `public/js/`) by creating them with `.gitkeep` files

### Step 5: Create `src/validators.js` — input validation

- `validateProjectName(name)` — npm-compatible: lowercase, alphanumeric + hyphens, no leading dots/underscores, max 214 chars
- `validatePort(port)` — integer 1–65535
- `validateDirectory(dir, force)` — target doesn't exist, or `--force` flag provided

### Step 6: Create `src/prompts.js` — interactive mode

Use `node:readline/promises` to prompt when CLI arguments are missing:

- Project name (with validation)
- Template type: app or api
- Description (default based on template type)
- Port (default 3000 for app, 3001 for api)
- Initialize git? (default yes)
- Run npm install? (default yes)

### Step 7: Convert template files to Handlebars placeholders

Apply the modifications listed in the "Template File Modifications" section above:

- Replace hardcoded names, descriptions, versions, and ports with `{{ }}` expressions
- Simplify dev scripts for standalone use (remove `--watch ../core/*` paths)
- Leave `.eta` files untouched

### Step 8: Update root `package.json` workspaces

Remove the now-stale workspace entries:

```diff
  "workspaces": [
    "api",
    "app",
    "core/web-app",
    "core/service-api",
    "core/generator",
    "core/shared",
    "core/modules/logger",
    "core/workflows",
-   "template/app",
-   "template/api"
  ],
```

### Step 9: Create `core/generator/README.md`

Package README with:

- Installation: `npm install -g @glowing-fishstick/generator`
- Usage examples (interactive and flag-based)
- Generated project structure diagram
- Available options table
- Development/contribution notes

### Step 10: Update documentation for the move + new generator

| Document                                 | Change                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| Root `README.md`                         | Update references from `template/app` and `template/api` to `core/generator/templates/`       |
| `documentation/00-project-specs.md`      | Add "Generator Package" section                                                               |
| `documentation/99-potential-gaps.md`     | Add generator as a tracked feature (in progress)                                              |
| `AGENTS.md`                              | Update repository structure to list `core/generator/` properly; remove `template/` references |
| `CLAUDE.md`                              | Add generator to repository description                                                       |
| `core/generator/templates/app/README.md` | Update structure diagram from `template/app/` to reflect new location                         |
| `core/generator/templates/api/README.md` | Update structure diagram from `template/api/` to reflect new location                         |

### Step 11: Add tests

| Test File                       | Coverage                                                                                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/validators.test.js` | Name validation, port validation, directory checks                                                                                                   |
| `tests/unit/scaffolder.test.js` | File rendering with Handlebars, directory creation, `.eta` passthrough                                                                               |
| `tests/integration/cli.test.js` | Full scaffold flow into temp directory; verify generated files have correct content; verify `npm install && node src/server.js` starts without error |

### Step 12: Add generator to root test pipeline

Update root `package.json` `test:all` script to include:

```
npm run test --workspace core/generator
```

### Step 13: Run Snyk code scan

Scan all new first-party code (`bin/cli.js`, `src/*.js`) per Snyk security instructions. Fix any issues found and rescan until clean.

---

## CLI Specification

### Global Invocation

```bash
fishstick-create [options] [project-directory]
```

### Options

| Flag                | Description                   | Default                     |
| ------------------- | ----------------------------- | --------------------------- |
| `--template <type>` | Template type: `app` or `api` | `app`                       |
| `--port <number>`   | Override default port         | `3000` (app) / `3001` (api) |
| `--no-install`      | Skip `npm install`            | `false`                     |
| `--no-git`          | Skip `git init`               | `false`                     |
| `--force`           | Overwrite existing directory  | `false`                     |
| `--help`            | Show usage information        | —                           |
| `--version`         | Show CLI version              | —                           |

### Examples

```bash
# Interactive mode (prompts for all options)
fishstick-create

# With flags (skip prompts)
fishstick-create my-api --template api --no-install

# Override port
fishstick-create my-app --port 8080

# Force overwrite
fishstick-create my-app --force
```

---

## Generated Output Structure

After running `fishstick-create my-tasks-app --template app`:

```
my-tasks-app/
├── .gitkeep
├── package.json               ← Rendered: projectName, description, coreVersion
├── README.md                  ← Rendered: projectName, appName
├── src/
│   ├── server.js              ← Rendered: appName
│   ├── app.js                 ← Copied (no placeholders)
│   ├── config/
│   │   └── env.js             ← Rendered: appName
│   ├── routes/
│   │   └── router.js          ← Copied (no placeholders)
│   ├── views/
│   │   ├── my-feature.eta     ← Copied verbatim (Eta runtime)
│   │   └── layouts/
│   │       ├── header.eta     ← Copied verbatim (Eta runtime)
│   │       └── footer.eta     ← Copied verbatim (Eta runtime)
│   └── public/
│       ├── css/.gitkeep
│       └── js/.gitkeep
└── .git/                      ← If --no-git not set
```

After running `fishstick-create my-tasks-api --template api`:

```
my-tasks-api/
├── package.json               ← Rendered: projectName, description, coreVersion, port
├── README.md                  ← Rendered: projectName, appName
├── src/
│   ├── server.js              ← Rendered: appName
│   ├── api.js                 ← Copied (no placeholders)
│   ├── config/
│   │   └── env.js             ← Rendered: appName, port
│   └── routes/
│       └── router.js          ← Copied (no placeholders)
└── .git/                      ← If --no-git not set
```

---

## Verification Checklist

After implementation, verify:

- [ ] `npm install` from root succeeds with updated workspaces (no `template/app` or `template/api`)
- [ ] `npm link` from `core/generator/` works
- [ ] `fishstick-create test-output --template app --no-install --no-git` produces correct file structure and content
- [ ] `cd test-output && npm install && node src/server.js` starts successfully (app template)
- [ ] Same flow for `--template api`
- [ ] `npm run test --workspace core/generator` — all unit and integration tests pass
- [ ] `npm run lint` — no lint errors in new code
- [ ] `npm run format` — code matches Prettier config
- [ ] `rg "template/app|template/api" README.md AGENTS.md CLAUDE.md documentation/*.md package.json` — no stale references to old paths
- [ ] Snyk code scan reports no issues in new first-party code

---

## Dependencies

| Package      | Version     | Purpose                             | Type                      |
| ------------ | ----------- | ----------------------------------- | ------------------------- |
| `commander`  | ^14.0.3     | CLI argument parsing                | runtime                   |
| `handlebars` | ^4.7.8      | Template rendering (`{{ }}` syntax) | runtime                   |
| `vitest`     | (workspace) | Test runner                         | dev (inherited from root) |

All other functionality uses Node.js >= 22 built-ins:

- `node:readline/promises` — interactive prompts
- `node:fs/promises` — file system operations (read, write, mkdir, readdir)
- `node:child_process` — `execFile` for `git init`, `spawn` for `npm install`
- `node:path` — cross-platform path handling
- `node:url` — `import.meta.url` resolution for template directory

---

## Future Enhancements (Out of Scope)

These can be added after the MVP ships:

- TypeScript scaffolding (`--typescript` flag)
- Optional example plugin scaffold toggle
- Package manager auto-detection (`npm`/`pnpm`/`yarn`) for install step
- Docker configuration generation
- Database template options
- Environment-specific configs (`.env.dev`, `.env.prod`)
- Pre-configured testing setup (Vitest)
- Plugin marketplace / community templates
