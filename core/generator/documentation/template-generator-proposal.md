Based on my review of your repository, I've created a comprehensive proposal document for building a globally-installable template generator for your `glowing-fishstick` framework. Here's the proposal:

---

# **Template Generator CLI Proposal**

## Building a Globally Installable Generator for Glowing-Fishstick

**Project:** `jeffcaradona/glowing-fishstick`  
**Date:** February 23, 2026  
**Author:** Design Proposal

---

## Executive Summary

This proposal outlines the development of a **CLI-based template generator** (similar to Express Generator) that allows developers to scaffold new glowing-fishstick applications globally via npm. Instead of manually setting up a new project, users would run a single command like:

```bash
npm install -g @glowing-fishstick/generator
fishstick-create my-app
```

This becomes a fourth publishable package in your ecosystem, complementing `@glowing-fishstick/app`, `@glowing-fishstick/api`, and `@glowing-fishstick/shared`.

---

## Problem Statement

Currently, developers who want to use glowing-fishstick must:

1. Manually create a new project directory
2. Initialize `package.json` with `"type": "module"`
3. Understand and copy the server boilerplate pattern
4. Set up dependencies correctly

**Why this matters:**

- **Friction:** Higher barrier to entry for new users
- **Errors:** Manual setup prone to misconfiguration
- **Inconsistency:** Users might not follow best practices
- **Opportunity:** Templates standardize the "right way" to build apps

---

## Proposed Solution

### High-Level Architecture

```
@glowing-fishstick/generator (New Package)
├── bin/
│   └── cli.js                    # Entry point (symlinked as `fishstick-create`)
├── src/
│   ├── prompt-engine.js          # Interactive questions
│   ├── template-renderer.js      # Handlebars rendering
│   ├── file-scaffolder.js        # Directory & file creation
│   └── validators.js             # Input validation
├── templates/
│   ├── app/                      # Express app template files
│   │   ├── src/
│   │   │   ├── server.js
│   │   │   ├── app.js
│   │   │   └── config/env.js
│   │   ├── views/
│   │   ├── public/
│   │   └── package.json
│   └── api/                      # Express API template (optional)
├── package.json
└── README.md
```

### Dependencies

| Package      | Version | Purpose                                                            |
| ------------ | ------- | ------------------------------------------------------------------ |
| `commander`  | ^14.0.3 | CLI argument parsing (what Express Generator uses)                 |
| `handlebars` | ^4.7.8  | Template rendering (`{{ }}` syntax, avoids Eta `<%= %>` conflicts) |

All other functionality uses Node.js >= 22 built-ins (`node:readline/promises`, `node:fs/promises`, `node:child_process`).

**Total size impact:** < 1 MB (minimal for dev tooling)

## Core Features

### 1. **Interactive Prompts**

```bash
$ fishstick-create my-app

✔ Project name: my-app
✔ Description: My awesome app
✔ Template type: (app / api) app
✔ Include example plugin? (y/n) y
✔ Use TypeScript? (y/n) n
✔ Git initialize? (y/n) y
```

**Prompts to collect:**

- `projectName` — folder and package name (validated)
- `projectDescription` — added to package.json
- `templateType` — "app" or "api"
- `includeExample` — sample plugin code (optional)
- `useGit` — auto-run `git init`

### 2. **Template Rendering**

Use the `core/generator/templates/app` and `core/generator/templates/api` directories as source:

```
Input template: core/generator/templates/app/src/server.js
Variables: { appName: "my-app", port: 3000 }
↓  (Handlebars renders {{ }} placeholders)
Output: my-app/src/server.js
```

The generator reads template files, renders them with user input, and writes to the destination.

### 3. **Directory Structure Creation**

```
my-app/
├── src/
│   ├── server.js              # Rendered from template
│   ├── app.js                 # Rendered from template
│   ├── config/env.js          # Rendered from template
│   ├── routes/router.js       # Optional example
│   ├── views/
│   └── public/
├── .env.example               # Copied from template
├── package.json               # Rendered with user values
├── .gitignore                 # Copied from template
├── README.md                  # Generated based on app name
└── .git/                      # If git init selected
```

### 4. **Smart Defaults**

- **Port:** Default to `3000` (app) or `3001` (api), user can override
- **Package manager:** Detect `npm` vs `yarn` vs `pnpm`, run install
- **Git:** Auto-initialize if directory empty and user agrees
- **Node version:** Inherit `engines.node` from generator's package.json

---

## Implementation Phases

### **Phase 1: MVP (1-2 weeks)**

- [x] Create `core/generator` workspace package
- [x] Implement CLI entry point with `commander`
- [x] Basic prompts: name, type (app/api)
- [x] Simple template scaffolding (no rendering, just copy)
- [x] Add `bin` field to package.json
- [x] Test locally with `npm link`

**Deliverable:** `npm install -g . && fishstick-create test-app` works

---

### **Phase 2: Template Rendering (1 week)**

- [x] Move template files to `core/generator/templates/`
- [x] Add Handlebars `{{ }}` placeholders where dynamic values are needed
- [x] Implement `template-renderer.js` using Handlebars
- [x] Pass user variables through render engine
- [x] Update `package.json` template with user values

**Deliverable:** Generated app has correct app name, description, port in files

---

### **Phase 3: Polish & Distribution (1 week)**

- [x] Publish to npm as `@glowing-fishstick/generator`
- [x] Add help documentation: `fishstick-create --help`
- [x] Error handling (invalid project names, conflicting directories)
- [x] Success message with next steps
- [x] Add to root README with installation instructions

**Deliverable:** Public npm package users can `npm install -g`

---

## CLI Specification

### **Global Invocation**

```bash
fishstick-create [options] [project-directory]
```

### **Options**

```bash
--template <type>        Template type: "app" or "api" (default: "app")
--no-install             Skip npm install
--git                    Initialize git repository (default: true)
--force                  Overwrite existing directory (default: false)
--typescript             Setup TypeScript support (future)
--help                   Show usage information
--version                Show CLI version
```

### **Examples**

```bash
# Interactive mode (prompts for all options)
fishstick-create my-app

# With flags (skip prompts)
fishstick-create my-api --template api --no-install

# Help
fishstick-create --help
```

---

## File Structure Example

After running `fishstick-create my-tasks-app --template app`:

```
my-tasks-app/
├── .env.example
├── .gitignore
├── .npmignore
├── .prettierrc.json
├── README.md                    # ← Generated with app name
├── package.json                 # ← Rendered with appName, version
├── src/
│   ├── app.js
│   ├── server.js               # ← Rendered with appName
│   ├── config/
│   │   └── env.js              # ← Rendered with appName, port
│   ├── routes/
│   │   └── router.js           # ← Example plugin
│   ├── views/
│   │   └── example.eta
│   └── public/
│       └── styles.css
└── node_modules/               # ← If --no-install not set
```

---

## Template Content Strategy

### **Approach 1: Symlink Strategy (Recommended)**

The generator uses `core/generator/templates/app` and `core/generator/templates/api` directories:

```javascript
// core/generator/src/scaffolder.js
const TEMPLATE_BASE = path.join(import.meta.url, '../templates');

export function scaffoldApp(projectDir, config) {
  const templateDir = path.join(TEMPLATE_BASE, 'app');
  // Recursively copy and render
  copyWithRender(templateDir, projectDir, config);
}
```

**Pros:**

- Single source of truth for templates
- Changes to templates automatically reflect in generator
- Minimal duplication

**Cons:**

- Must keep `core/generator/templates/app` in sync with what generator publishes
- When published to npm, templates must be included via `.npmignore`

### **Approach 2: Duplicate Strategy (Simpler)**

Keep separate template copies in `core/generator/templates/`:

```
core/generator/templates/app/  ← Self-contained templates
```

**Pros:**

- Generator is self-contained
- No cross-directory dependencies
- Easy to publish standalone

**Cons:**

- Templates drift if not kept in sync
- More code duplication

**Recommendation:** Start with **Approach 2** (duplicate). It's simpler for a first implementation and cleanly isolates the generator package.

---

## Dependencies & Installation

### **For Generator Package Consumers**

```bash
npm install -g @glowing-fishstick/generator
```

Then users never run npm again for scaffolding—just:

```bash
fishstick-create my-app
cd my-app
npm install
npm run dev
```

### **For Repository Maintainers**

Add to root `package.json` workspaces:

```json
{
  "workspaces": [
    "core/web-app",
    "core/service-api",
    "core/shared",
    "core/modules/logger",
    "core/generator", // ← NEW
    "app",
    "api"
  ]
}
```

Then local testing:

```bash
npm install
npm run link:generator  # Symlink locally
fishstick-create test-app
```

---

## Success Criteria

| Criterion           | Metric                                                                          |
| ------------------- | ------------------------------------------------------------------------------- |
| **Usability**       | User can scaffold a new app in < 30 seconds with zero manual edits              |
| **Correctness**     | Generated app runs immediately: `cd my-app && npm install && npm run dev` works |
| **Consistency**     | All generated apps follow best practices (structure, config, dependencies)      |
| **Discoverability** | Users can find generator via npm search: `npm search glowing-fishstick`         |
| **Documentation**   | Generator README + examples clearly explain each prompt option                  |

---

## Effort Estimate

| Phase                            | Duration      | Dev Hours       |
| -------------------------------- | ------------- | --------------- |
| **Phase 1: MVP**                 | 1-2 weeks     | 16-24 hours     |
| **Phase 2: Template Rendering**  | 1 week        | 8-12 hours      |
| **Phase 3: Polish & Publishing** | 1 week        | 8-12 hours      |
| **Total**                        | **3-4 weeks** | **32-48 hours** |

**Risk factors:**

- Handlebars/Eta delimiter separation (mitigated: `{{ }}` vs `<%= %>`)
- Cross-platform path handling (+2h)
- npm registry publishing first-time (+1h)

---

## Publishing Checklist

- [ ] Create `core/generator/package.json` with `"name": "@glowing-fishstick/generator"`
- [ ] Add `"bin": { "fishstick-create": "./bin/cli.js" }`
- [ ] Add `"keywords": ["template", "generator", "express", "cli"]`
- [ ] Add `.npmignore` to exclude dev files
- [ ] Create GitHub release notes
- [ ] Update root README with generator installation instructions
- [ ] Add to `documentation/00-project-specs.md` "Generator Package" section
- [ ] Create `core/generator/README.md` with usage examples

---

## Comparison to Express Generator

| Feature             | Express Generator | Proposed Glowing-Fishstick |
| ------------------- | ----------------- | -------------------------- |
| **Command**         | `express myapp`   | `fishstick-create myapp`   |
| **Prompts**         | None (deprecated) | Interactive questions      |
| **Template engine** | Jade (removed)    | Eta (modern)               |
| **Output**          | Boilerplate app   | Composable framework app   |
| **Customization**   | Via flags         | Via prompts or flags       |
| **Update path**     | Manual            | Via npm package updates    |

---

## Risks & Mitigation

| Risk                      | Impact                         | Mitigation                                       |
| ------------------------- | ------------------------------ | ------------------------------------------------ |
| **Template paths break**  | Generator fails on npm publish | Test `.npmignore` includes all template files    |
| **Windows path issues**   | Generator fails on Windows     | Use `path.join()` everywhere, test on Windows CI |
| **npm registry downtime** | Can't publish                  | Use GitHub Releases as fallback distribution     |
| **Breaking CLI changes**  | Users stuck on old version     | Semantic versioning, changelog discipline        |

---

## Future Enhancements (Out of Scope)

These can be added after MVP:

- [ ] TypeScript scaffolding (`--typescript` flag)
- [ ] Docker configuration generation
- [ ] Database template options (PostgreSQL, MongoDB, etc.)
- [ ] Environment-specific configs (.env.dev, .env.prod)
- [ ] Pre-configured testing setup (Vitest)
- [ ] Web UI for scaffolding (alternative to CLI)
- [ ] Plugin marketplace / community templates

---

## Recommendation

**Proceed with Phase 1 (MVP).** The generator is:

✅ **Low complexity** — Standard Node.js CLI tooling  
✅ **High value** — Dramatically improves onboarding  
✅ **Quick win** — 2-3 weeks to working global tool  
✅ **Extensible** — Foundation for future enhancements

The 48-hour effort is justified by making your framework significantly more approachable to new developers.

---

**Would you like me to proceed with creating a pull request to build Phase 1 of the generator?**
