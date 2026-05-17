# @glowing-fishstick/shared

## 0.2.0

### Minor Changes

- **BREAKING**: Re-exports `createLogger`/`createRequestLogger` from the rewritten `@glowing-fishstick/logger@^0.2.0` (Winston-backed). Call signature is now native Winston `logger.info(message, meta)`.
- Removed `peerDependencies.pino`.
- `resolveErrorLogger(req)` flips the internal `(meta, msg)` shape to `logger.error(msg, meta)` so callers in `errorHandler.js` / `error-handler.js` stay untouched.
- Updated dependencies
  - @glowing-fishstick/logger@0.2.0

## 0.1.8

### Patch Changes

- chore: bump dependencies across workspaces
- dotenv 17.3.1 → 17.4.2
- Fixed @glowing-fishstick/logger version specifier (^1.0.8 → ^0.1.8)
- Updated dependencies
  - @glowing-fishstick/logger@0.1.8

## 0.1.5

### Patch Changes

- Fixed Express Regression. shamever bumped

## 0.1.4

### Patch Changes

- Discoverability improvements
- Updated dependencies
  - @glowing-fishstick/logger@0.1.4

## 0.1.3

### Patch Changes

- Initial 0.1.2 Alpha Release
- Updated dependencies
  - @glowing-fishstick/logger@0.1.3
