# Summary of Core Libraries and Shared Utilities

## Core Libraries

### `core/app/src`

- **`app-factory.js`**
  - `createApp(config, plugins = [])`: Factory function that builds and returns a configured Express application.

### `core/shared/src`

- **`hook-registry.js`**
  - `createHookRegistry()`: Creates a registry for hooks with methods to register and execute them.
    - `register(hook)`: Registers a hook.
    - `execute(logger)`: Executes all registered hooks.

- **`logger.js`**
  - `createLogger(options = {})`: Factory function that creates a Pino logger instance.
  - `createRequestIdMiddleware()`: Middleware to generate request IDs for each HTTP request.
  - `createRequestLogger(logger, options = {})`: Creates Express middleware for HTTP request/response logging.

- **`registry-store.js`**
  - `storeRegistries(app, startupRegistry, shutdownRegistry)`: Stores startup and shutdown registries in the app object.
  - `getRegistries(app)`: Retrieves stored registries from the app object.

- **`server-factory.js`**
  - `createServer(app, config)`: Factory function that starts an HTTP server with graceful shutdown handlers.
    - `close()`: Graceful shutdown function.
    - `registerStartupHook(hook)`: Registers a startup hook.
    - `registerShutdownHook(hook)`: Registers a shutdown hook.

## Application-Specific Code

### `app/src`

- **`app.js`**
  - `taskManagerApplicationPlugin(app, config)`: Plugin for the task manager application with custom routes and middleware.

### `app/src/routes`

- **`router.js`**
  - `taskRoutes(config)`: Creates a router with the `/tasks` route that renders the `tasks/list.ejs` view.