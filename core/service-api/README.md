# @glowing-fishstick/api

Express 5 API factory for the glowing-fishstick framework. Composes a JSON-only Express application with lifecycle hooks, request logging, and a plugin architecture — no view engine or static file serving.

## Install

```sh
npm install @glowing-fishstick/api
```

## Usage

```js
import { createApi, createApiConfig } from '@glowing-fishstick/api';

const config = createApiConfig({ port: 3001 });

const myPlugin = (app, cfg) => {
  app.get('/hello', (_req, res) => res.json({ message: 'hello' }));
};

const app = createApi(config, [myPlugin]);

app.listen(config.port, () => {
  console.log(`API listening on port ${config.port}`);
});
```

## License

MIT
