# @glowing-fishstick/generator

## 0.2.0

### Minor Changes

- Scaffolded `app/` and `api/` templates no longer include `pino-pretty` in devDependencies (Pino → Winston migration in 0.2.0).
- Scaffolded `package.json` files target `@glowing-fishstick/app@^0.2.0` / `@glowing-fishstick/api@^0.2.0` / `@glowing-fishstick/shared@^0.2.0`.
- Template logger call sites use native Winston `logger.info('msg', {...})` signature.

## 0.1.8

### Patch Changes

- chore: bump dependencies across workspaces
- handlebars 4.7.8 → 4.7.9

## 0.1.4

### Patch Changes

- Discoverability improvements

## 0.1.3

### Patch Changes

- Initial 0.1.2 Alpha Release
