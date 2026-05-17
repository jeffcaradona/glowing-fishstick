# @glowing-fishstick/api

## 0.2.0

### Minor Changes

- **BREAKING**: Logger backend migrated from Pino to Winston (via `@glowing-fishstick/logger@^0.2.0`). All `logger.*({...}, 'msg')` call sites rewritten to native Winston `logger.*('msg', {...})` form (api-factory, error-handler).
- Removed direct `pino` dependency and `pino-pretty` devDependency.
- New optional config knobs on `createApiConfig`: `logLevel`, `logRedact`, `enableFileLogging`, `logDir`.
- Updated dependencies
  - @glowing-fishstick/shared@0.2.0

## 0.1.8

### Patch Changes

- chore: bump dependencies across workspaces
- pino 9.5.0 → 10.3.1 (major upgrade)
- Updated dependencies
  - @glowing-fishstick/shared@0.1.8

## 0.1.4

### Patch Changes

- Discoverability improvements
- Updated dependencies
  - @glowing-fishstick/shared@0.1.4

## 0.1.3

### Patch Changes

- Initial 0.1.2 Alpha Release
- Updated dependencies
  - @glowing-fishstick/shared@0.1.3
