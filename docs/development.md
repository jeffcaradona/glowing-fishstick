# Development

## Monorepo Structure

This repository uses npm workspaces. The packages are:

| Path | Package | Role |
|------|---------|------|
| `core/app` | `@glowing-fishstick/app` | Main framework module |
| `core/api` | `@glowing-fishstick/api` | JSON-first API module |
| `core/shared` | `@glowing-fishstick/shared` | Shared utilities |
| `core/modules/logger` | `@glowing-fishstick/logger` | Logger implementation |
| `app/` | (local consumer) | Example app consuming `@glowing-fishstick/app` |
| `api/` | (local consumer) | Example API consuming `@glowing-fishstick/api` |

---

## Running Locally

```bash
# Start example app
npm run start:app

# Start example API
npm run start:api

# Development with auto-reload (app)
npm run dev:app

# Development with auto-reload (API)
npm run dev:api
```

For more detail, see:

- [`app/DEV_APP_README.md`](https://github.com/jeffcaradona/glowing-fishstick/blob/main/app/DEV_APP_README.md)
- [`api/DEV_API_README.md`](https://github.com/jeffcaradona/glowing-fishstick/blob/main/api/DEV_API_README.md)

---

## Testing

The framework uses [Vitest](https://vitest.dev/) and [Supertest](https://github.com/ladjs/supertest).

```bash
# Run all tests
npm run test:all

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Smoke tests only
npm run test:smoke

# API tests
npm run test:api
```

### Unit Test Example

```js
import { describe, it, expect } from 'vitest';
import { createConfig, filterSensitiveKeys } from '@glowing-fishstick/app';

describe('createConfig', () => {
  it('should merge overrides with defaults', () => {
    const config = createConfig({ appName: 'test' }, {});
    expect(config.appName).toBe('test');
    expect(config.port).toBe(3000); // default
  });
});
```

### Integration Test Example

```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp, createConfig } from '@glowing-fishstick/app';

describe('Health endpoints', () => {
  it('should respond to /healthz', async () => {
    const config = createConfig();
    const app = createApp(config);

    const response = await request(app).get('/healthz');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
```

---

## Code Quality

```bash
# ESLint
npm run lint

# Prettier
npm run format
```

**ESLint key rules:** semicolons required, single quotes, 100-char line width, no unused variables, trailing commas.

---

## Validation Checklist

Before submitting changes, run:

```bash
# No sync blocking APIs in runtime code
rg -n "\b(readFileSync|writeFileSync|execSync|pbkdf2Sync|scryptSync)\b" app core api

# No anti-patterns
rg -n "res\.end\s*=|eval\(|new Function\(|with\s*\(" app core api

# Full quality check
npm run lint && npm run format && npm run test:all
```

---

## Adding a New Feature

1. **Read existing code first** — understand patterns before adding
2. **Create a plugin** for substantial features — don't modify core unless necessary
3. **Follow factory pattern** — create factory functions, not classes
4. **Add lifecycle hooks** if your feature needs resource initialization/cleanup
5. **Write integration tests** — cover success and error paths
6. **Update documentation** — sync README, DEV_APP_README, and specs
7. **Run validation** — lint, format, test, check for sync APIs

---

## Documentation (MkDocs)

The project docs site is built with [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/).

```bash
# Install dependencies
pip install mkdocs-material

# Serve docs locally with live-reload
mkdocs serve

# Build static site
mkdocs build
```

The docs are automatically deployed to GitHub Pages on every push to `main`.
