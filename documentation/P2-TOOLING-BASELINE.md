# P2: Tooling Baseline

## Overview

P2 addresses the foundational tooling configuration required for contributor confidence and routine quality checks. This ensures lint pipeline, testing, and formatting work reliably across development and CI/CD environments.

## Issues Fixed

### ESLint v10 Configuration Migration ✅

**Problem**: The repository pinned ESLint v10 but used legacy `.eslintrc.json` + `.eslintignore` config format. ESLint v9+ requires flat config (`eslint.config.js`), causing the lint pipeline to fail.

**Solution**:

- Migrated to ESLint flat config format (`eslint.config.js`)
- Removed deprecated `.eslintrc.json` and `.eslintignore` files
- Configured proper environment globals for Node.js, browser, and test environments
- Enabled `@eslint/js` recommended rules

**Result**: `npm run lint` now executes successfully with ESLint v10.

## Current Tooling Configuration

### ESLint Setup

- **Version**: `@eslint/js@^10.0.1`, `eslint@^10.0.0`
- **Config Format**: Flat config (`eslint.config.js`)
- **Globals Configured**:
  - Common: `console`, `process`, `Buffer`, `global`
  - Browser: `document`, `window`, `fetch`
  - Node.js timers: `setTimeout`, `clearTimeout`, `setImmediate`
  - Test: `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll`, `vi`
- **Rules**: Enforces code quality standards (see [eslint.config.js](../../eslint.config.js))

### Available Scripts

```bash
npm run lint           # Run ESLint
npm run format         # Format code with Prettier
npm test              # Run all tests with Vitest
npm test:unit         # Run unit tests
npm test:integration  # Run integration tests
npm test:smoke        # Run smoke tests
npm test:all          # Run all tests verbosely
npm run dev:app       # Run app in development mode
npm run start:app     # Start app in production mode
```

## Development Workflow

1. **Code Quality**: Run `npm run lint` to check code quality
2. **Formatting**: Run `npm run format` to auto-fix formatting
3. **Testing**: Run `npm test` or specific test suite
4. **Development**: Use `npm run dev:app` for development with file watching

## Related Documentation

- [Project Specifications](./00-project-specs.md)
- [Application Development Guide](./01-application-development.md)
- [Potential Gaps](./99-potential-gaps.md)

## Status

✅ **Complete** - Lint pipeline is functional and runnable. Contributors can now perform routine quality checks and PR hygiene without tooling blockers.
