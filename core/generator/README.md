# @glowing-fishstick/generator

CLI tool for scaffolding new glowing-fishstick applications and APIs.

## Installation

```bash
npm install -g @glowing-fishstick/generator
```

## Usage

### Interactive mode

```bash
fishstick-create
```

Prompts for project name, template type, description, port, git, and npm install.

### With arguments

```bash
fishstick-create my-app
fishstick-create my-api --template api
fishstick-create my-app --port 8080 --no-install
```

### Options

| Flag                | Description                   | Default                     |
| ------------------- | ----------------------------- | --------------------------- |
| `--template <type>` | Template type: `app` or `api` | `app`                       |
| `--port <number>`   | Override default port         | `3000` (app) / `3001` (api) |
| `--no-install`      | Skip `npm install`            | runs install                |
| `--no-git`          | Skip `git init`               | runs git init               |
| `--force`           | Overwrite existing directory  | `false`                     |
| `--version`         | Show version                  | —                           |
| `--help`            | Show help                     | —                           |

## Generated Output

### App template (`--template app`)

```
my-app/
├── package.json
├── README.md
└── src/
    ├── server.js        — thin entrypoint
    ├── app.js           — plugin (routes + lifecycle hooks)
    ├── config/
    │   └── env.js       — config overrides
    ├── routes/
    │   └── router.js    — example route
    ├── views/
    │   ├── my-feature.eta
    │   └── layouts/
    │       ├── header.eta
    │       └── footer.eta
    └── public/
        ├── css/
        └── js/
```

Generated app uses `@glowing-fishstick/app` and starts on port 3000.

### API template (`--template api`)

```
my-api/
├── package.json
├── README.md
└── src/
    ├── server.js        — thin entrypoint
    ├── api.js           — plugin (routes + lifecycle hooks)
    ├── config/
    │   └── env.js       — config overrides
    └── routes/
        └── router.js    — example route
```

Generated API uses `@glowing-fishstick/api` and starts on port 3001.

## Local Development

```bash
# From the monorepo root
npm install

# Run a test scaffold (no install, no git)
node core/generator/bin/cli.js test-output --template app --no-install --no-git

# Verify the output
cd test-output && npm install && node src/server.js
```

When scaffolding into a directory inside this monorepo, generated `package.json`
dependencies use local `file:` links to `core/app`, `core/api`, and
`core/shared` so `npm install` works even before packages are published.
Outside this repo, generated dependencies use semver ranges (for example
`^0.1.0`) against published `@glowing-fishstick/*` packages.
