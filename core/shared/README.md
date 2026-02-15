# @glowing-fishstick/shared

> Shared utilities and types for the glowing-fishstick framework.

## Overview

This package contains shared code, utilities, and type definitions used by the core application module and other packages in the glowing-fishstick ecosystem.

## Usage

Install via npm (when published):

```bash
npm install @glowing-fishstick/shared
```

Import shared utilities in your module:

```js
import { someUtility } from '@glowing-fishstick/shared';
```

Server factory:

This package contains the `createServer` factory used to start HTTP servers and provide graceful shutdown. Consumers may import it directly:

```js
import { createServer } from '@glowing-fishstick/shared';
```

When consuming via `@glowing-fishstick/app`, `createServer` is re-exported from `@glowing-fishstick/app` for convenience.

## Contents

- Shared utility functions
- Common type definitions
- Reusable helpers for core/app and downstream modules

## Documentation

See the main [glowing-fishstick documentation](../../README.md) for usage examples and details.

## License

MIT
