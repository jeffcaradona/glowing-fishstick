# API Reference

## `createApp(config, plugins = [])`

Factory function that builds and returns a configured Express application.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `config` | `object` | Frozen configuration object from `createConfig()` |
| `plugins` | `Array<Plugin>` | Plugin functions to extend the app (optional) |

**Returns:** `Express` — configured Express app instance

**Example:**

```js
const app = createApp(config, [myPlugin]);
```

**Built-in features:**

- Eta view engine with layouts
- JSON and URL-encoded body parsing
- Static file serving from `src/public/`
- Core routes (health, admin, landing)
- Error handling middleware (404 + generic error handler)

---

## `createServer(app, config)`

Factory function that starts an HTTP server and sets up graceful shutdown handlers.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `app` | `Express` | Express app instance from `createApp()` |
| `config` | `object` | Configuration object (reads `port`) |

**Returns:** `{ server, close, registerStartupHook, registerShutdownHook }`

| Property | Type | Description |
|----------|------|-------------|
| `server` | `http.Server` | Node.js HTTP server instance |
| `close` | `() => Promise<void>` | Graceful shutdown function |
| `registerStartupHook` | `(hook: () => Promise<void>) => void` | Register a hook to run before the server starts |
| `registerShutdownHook` | `(hook: () => Promise<void>) => void` | Register a hook to run during graceful shutdown |

**Example:**

```js
const { server, close, registerStartupHook, registerShutdownHook } = createServer(app, config);

registerStartupHook(async () => {
  // Deployment-specific initialization
});

registerShutdownHook(async () => {
  // Deployment-specific cleanup
});

// Graceful shutdown on SIGTERM/SIGINT is automatic
// Or manually:
await close();
```

---

## `createConfig(overrides = {}, env = process.env)`

Pure factory function that builds a frozen configuration object from environment variables and overrides.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `overrides` | `object` | Consumer-provided config values (highest priority) |
| `env` | `object` | Environment variable source (defaults to `process.env`) |

**Default configuration:**

| Key | Default | Environment Variable |
|-----|---------|---------------------|
| `port` | `3000` | `PORT` |
| `nodeEnv` | `'development'` | `NODE_ENV` |
| `appName` | `'app'` | `APP_NAME` |
| `appVersion` | `'0.0.0'` | `APP_VERSION` |

**Example:**

```js
const config = createConfig({
  appName: 'task-manager',
  appVersion: '1.0.0',
  port: 8080,
});
```

---

## `filterSensitiveKeys(config)`

Pure function that returns a shallow copy of the config object with sensitive keys removed.

**Filtered patterns (case-insensitive):** `SECRET`, `KEY`, `PASSWORD`, `TOKEN`, `CREDENTIAL`

**Example:**

```js
const safeConfig = filterSensitiveKeys(config);
// { appName: 'my-app', port: 3000 }
// (DATABASE_PASSWORD would be removed)
```

---

## `formatUptime(seconds)`

Pure function that formats duration in seconds into a human-readable uptime string.

**Format patterns:**

| Range | Format |
|-------|--------|
| `< 60s` | `"45s"` |
| `60s – 3599s` | `"5m 23s"` |
| `3600s – 86399s` | `"2h 15m"` |
| `≥ 86400s` | `"3d 5h 30m"` |

**Example:**

```js
import { formatUptime } from '@glowing-fishstick/shared';

console.log(formatUptime(45));     // "45s"
console.log(formatUptime(323));    // "5m 23s"
console.log(formatUptime(8130));   // "2h 15m"
console.log(formatUptime(277530)); // "3d 5h 30m"

app.get('/status', (req, res) => {
  res.json({ uptime: formatUptime(process.uptime()) });
});
```

Returns `"0s"` for negative numbers, `NaN`, `Infinity`, or non-number inputs.

---

## JWT Helpers

### `generateToken(secret, expiresIn = '15m')` and `verifyToken(token, secret)`

JWT helpers from `@glowing-fishstick/shared` for service-to-service auth flows.

```js
import { generateToken, verifyToken } from '@glowing-fishstick/shared';

const token = generateToken(process.env.JWT_SECRET, '15m');
const decoded = verifyToken(token, process.env.JWT_SECRET);
```

### `jwtAuthMiddleware(secret)`

Express middleware from `@glowing-fishstick/shared` that validates `Authorization: Bearer <token>` and responds with `401` on invalid or missing tokens.

```js
import { jwtAuthMiddleware } from '@glowing-fishstick/shared';

app.use('/api/private', jwtAuthMiddleware(process.env.JWT_SECRET));
```

---

## Error Factories

### `createAppError(code, message, statusCode)`

Creates an operational application error.

```js
import { createAppError } from '@glowing-fishstick/app';

throw createAppError('INVALID_INPUT', 'Missing required field: email', 400);
```

### `createNotFoundError(message)`

Creates a 404 Not Found error.

```js
throw createNotFoundError('User not found');
```

### `createValidationError(message)`

Creates a 400 Bad Request validation error.

```js
throw createValidationError('Email format is invalid');
```
