# @glowing-fishstick/app

## 0.2.0

### Minor Changes

- **BREAKING**: Logger backend migrated from Pino to Winston (via `@glowing-fishstick/logger@^0.2.0`). All `logger.*({...}, 'msg')` call sites rewritten to native Winston `logger.*('msg', {...})` form (server-factory lifecycle logs, admin-controller, error handler, app-factory).
- Removed direct `pino` dependency and `pino-pretty` devDependency. Consumers go through `@glowing-fishstick/logger` (no direct Winston dep required).
- New optional config knobs on `createConfig`: `logLevel`, `logRedact`, `enableFileLogging`, `logDir`. When `config.logger` is not injected, these are passed through to the auto-constructed Winston logger.
- `filterSensitiveKeys` now substitutes `[ClassName]` for non-serializable runtime singletons (`logger`, `services`) so the admin config page survives Winston's circular references.
- Updated dependencies
  - @glowing-fishstick/shared@0.2.0

## 0.1.8

### Patch Changes

- chore: bump dependencies across workspaces
- pino 9.5.0 → 10.3.1 (major upgrade)
- eta 4.5.1 → 4.6.0
- dotenv 17.3.1 → 17.4.2
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
