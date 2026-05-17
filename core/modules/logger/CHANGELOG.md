# @glowing-fishstick/logger

## 0.2.0

### Minor Changes

- **BREAKING**: Logger backend migrated from Pino to Winston. Call signature is now native Winston `logger.info(message, meta)` instead of Pino's `logger.info(meta, message)`. All consumer call sites must be updated.
- Removed `pino` and `pino-pretty` dependencies; added `winston ^3.19.0`.
- New options: `level` (renamed from `logLevel`), `redact` (dotted-path masking), `transports` (override default Console/File).
- `enableFile` default changed from `true` (Pino dev) to `false` (Winston) — surfaced via `enableFileLogging` knob on `createConfig`/`createApiConfig`.
- `format.errors({ stack: true })` preserves stacks for direct `Error` instances, but nested `meta.err` still requires the separate serializer (rather than relying on `format.errors` alone).
- Test environment (`NODE_ENV='test'`) disables colorize to keep test output clean.

## 0.1.8

### Patch Changes

- chore: version normalization across workspaces

## 0.1.4

### Patch Changes

- Discoverability improvements

## 0.1.3

### Patch Changes

- Initial 0.1.2 Alpha Release
