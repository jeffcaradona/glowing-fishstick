# glowing-fishstick

> **A composable Express.js application framework distributed as an npm module**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)

## Overview

`glowing-fishstick` transforms a traditional Express.js template into a proper, versioned npm module. Instead of copying and pasting template code into every new project, you can depend on this module via `npm install` and compose your application using a plugin-based architecture.

### Problem Statement

Traditional template systems for Express.js applications suffer from:

- **Template drift** — manual updates across multiple projects
- **Coupling** — app-specific code mixed with core template logic
- **Difficult upgrades** — no semantic versioning, no dependency management

### Solution

This module provides:

- ✅ **Factory functions** for creating Express apps and HTTP servers
- ✅ **Plugin contract** for adding custom routes, middleware, and views
- ✅ **Built-in routes** for health checks, admin dashboard, and landing page
- ✅ **Configuration management** with environment variable support
- ✅ **Graceful shutdown** for Kubernetes/container environments
- ✅ **Service container** (`config.services`) for plugin-to-plugin dependency injection
- ✅ **Functional programming patterns** for testability and composability

## Packages

| Package | Description |
|---------|-------------|
| `@glowing-fishstick/app` | Main app factory — `createApp`, `createServer`, `createConfig`, built-in routes, plugin system |
| `@glowing-fishstick/api` | JSON-first API factory — `createApi`, `createApiConfig`, health routes, JWT enforcement |
| `@glowing-fishstick/shared` | Shared utilities — request IDs, lifecycle registries, formatters, JWT helpers, logger re-exports |
| `@glowing-fishstick/logger` | Pino logger factory and request logging middleware |

## Repository Structure

```
core/
├── app/           → @glowing-fishstick/app
├── api/           → @glowing-fishstick/api
├── shared/        → @glowing-fishstick/shared
└── modules/logger → @glowing-fishstick/logger

app/               → Example consumer application
api/               → Example API consumer
template/          → Starter templates
documentation/     → Architecture docs and specs
```

## Built-in Routes

### Health Checks (Kubernetes-ready)

| Route | Method | Response | Purpose |
|-------|--------|----------|---------|
| `/healthz` | GET | `{ status: "ok" }` | Basic health check |
| `/readyz` | GET | `{ status: "ready" }` | Readiness probe |
| `/livez` | GET | `{ status: "alive" }` | Liveness probe |

### Admin Dashboard

| Route | Method | Response | Purpose |
|-------|--------|----------|---------|
| `/admin` | GET | Rendered HTML | Dashboard with app info |
| `/admin/config` | GET | Rendered HTML | Config viewer (sensitive keys filtered) |
| `/admin/api-health` | GET | JSON | API readiness probe passthrough |

## Project Status

This is a **proof of concept** demonstrating how to build a composable Express.js framework distributed as an npm module. It is not intended for production use without additional development work.

**Current Focus**: Security hardening is the immediate engineering milestone. See [documentation/SECURITY-HARDENING-PLAN.md](https://github.com/jeffcaradona/glowing-fishstick/blob/main/documentation/SECURITY-HARDENING-PLAN.md).

## License

MIT © Jeff Caradona
