/**
 * @module src/generator
 * @description Orchestrates the full scaffold flow: validate inputs, prompt
 * for missing values, copy + render templates, run git init and npm install.
 *
 * WHY: Separating orchestration from file I/O (scaffolder.js) and input
 * collection (prompts.js) keeps each module testable in isolation and avoids
 * a monolithic function that mixes concerns.
 */

import { readFile, access } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateProjectName,
  validatePort,
  validateTemplate,
  validateDirectory,
} from './validators.js';
import { runPrompts } from './prompts.js';
import { scaffoldFiles, createPublicSubdirs } from './scaffolder.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Resolve the absolute path to the templates directory.
 * WHY: Use import.meta.url so the path resolves correctly whether the package
 * is installed globally (npm install -g) or run locally (npm link).
 */
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

/**
 * Read the generator's own version to stamp into generated package.json files.
 *
 * WHY: Generated projects should pin to the version of the core packages that
 * was current when they were scaffolded — avoids breaking changes from later
 * releases arriving silently on npm install.
 *
 * @returns {Promise<string>}
 */
async function readCoreVersion() {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const raw = await readFile(pkgPath, 'utf8');
  const { version } = JSON.parse(raw);
  return version;
}

/**
 * Determine whether `candidatePath` is within `basePath`.
 *
 * WHY: Local file dependencies should only be generated when scaffolding
 * inside this monorepo checkout. Emitting `file:` links for external targets
 * would couple generated projects to a machine-specific checkout path.
 *
 * @param {string} basePath
 * @param {string} candidatePath
 * @returns {boolean}
 */
function isSubPath(basePath, candidatePath) {
  const rel = path.relative(basePath, candidatePath);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Resolve dependency specifiers for generated templates.
 *
 * WHY: In local monorepo dev, scoped packages may not be published yet.
 * Emitting relative `file:` dependencies keeps `npm install` working for
 * `node core/generator/bin/cli.js ...` scaffolds while preserving semver
 * package installs for external consumers.
 *
 * @param {object} params
 * @param {string} params.targetDir
 * @param {string} params.coreVersion
 * @returns {Promise<object>}
 */
async function resolveDependencySpecs({ targetDir, coreVersion }) {
  const externalDeps = {
    appDependencySpec: `^${coreVersion}`,
    apiDependencySpec: `^${coreVersion}`,
    sharedDependencySpec: `^${coreVersion}`,
  };

  if (!isSubPath(REPO_ROOT, targetDir)) {
    return externalDeps;
  }

  // WHY: Actual package directories differ from npm scope names —
  // @glowing-fishstick/app lives in core/web-app, /api in core/service-api.
  const localDirs = {
    app: path.join(REPO_ROOT, 'core', 'web-app'),
    api: path.join(REPO_ROOT, 'core', 'service-api'),
    shared: path.join(REPO_ROOT, 'core', 'shared'),
  };

  try {
    await Promise.all(
      Object.values(localDirs).map((dir) => access(path.join(dir, 'package.json'))),
    );
  } catch {
    return externalDeps;
  }

  return {
    appDependencySpec: `file:${path.relative(targetDir, localDirs.app).replaceAll('\\', '/')}`,
    apiDependencySpec: `file:${path.relative(targetDir, localDirs.api).replaceAll('\\', '/')}`,
    sharedDependencySpec: `file:${path
      .relative(targetDir, localDirs.shared)
      .replaceAll('\\', '/')}`,
  };
}

/**
 * Build a copy of `process.env` with PATH sanitized to absolute entries only.
 *
 * WHY: Prevents current-directory hijacking — empty segments or relative paths
 * in PATH (e.g. `.`, `./bin`, or a trailing `:`) resolve to CWD, which could
 * contain a malicious executable with the same name as a trusted tool. By
 * keeping only absolute paths we ensure OS lookup can't be tricked by files in
 * the scaffolded project directory (especially relevant with `--force`).
 *
 * TRADEOFF: We do NOT filter to "unwritable" dirs because Node version
 * managers (nvm, fnm, volta) legitimately place node/npm in user-writable
 * paths. Absolute-only filtering is the practical defence here.
 *
 * @returns {NodeJS.ProcessEnv}
 */
function getSanitizedEnv() {
  const env = { ...process.env };
  const sep = process.platform === 'win32' ? ';' : ':';

  if (env.PATH) {
    env.PATH = env.PATH.split(sep)
      .filter((dir) => path.isAbsolute(dir))
      .join(sep);
  }

  return env;
}

/**
 * Run `git init` in the target directory.
 *
 * WHY: Use execFile (not exec) to avoid shell injection — no user input is
 * passed directly to a shell interpreter. cwd scopes the command to the
 * project directory without needing to change the process working directory.
 *
 * @param {string} cwd  Absolute path to the new project directory.
 * @returns {Promise<void>}
 */
async function runGitInit(cwd) {
  // WHY (env): Use sanitized PATH to prevent CWD-based executable hijacking.
  await execFileAsync('git', ['init'], { cwd, env: getSanitizedEnv() });
}

/**
 * Run `npm install` in the target directory, streaming output to the terminal.
 *
 * WHY: Use spawn (not execFile) so npm install output streams to the user's
 * terminal in real time — large installs can take >30 seconds and silent
 * waiting is a poor UX.
 *
 * @param {string} cwd  Absolute path to the new project directory.
 * @returns {Promise<void>}
 */
function runNpmInstall(cwd) {
  return new Promise((resolve, reject) => {
    // WHY: `shell: true` is required on Windows where `npm` is a `.cmd` file;
    // without it Node can't find the npm executable. Input is hardcoded — not
    // user-supplied — so shell injection is not a concern here.
    //
    // WHY (env): Use sanitized PATH (absolute entries only) to prevent
    // CWD-based executable hijacking — the target directory may contain
    // untrusted files when using --force on an existing project.
    const child = spawn('npm', ['install'], {
      cwd,
      stdio: 'inherit',
      shell: true,
      env: getSanitizedEnv(),
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

/**
 * Resolve final options by prompting the user or deriving defaults from CLI args.
 *
 * WHY: Extracted from generate() to reduce cognitive complexity and make the
 * prompt-vs-defaults branching independently testable.
 *
 * @param {object} rawOptions  CLI options (may be partial).
 * @returns {Promise<object>}  Complete options object.
 */
async function resolveOptions(rawOptions) {
  const needsPrompts = !rawOptions.projectDirectory || !validateTemplate(rawOptions.template).valid;

  if (needsPrompts) {
    return runPrompts(rawOptions);
  }

  // WHY: All required values supplied via CLI; derive sensible defaults for
  // optional fields so downstream code has a uniform shape.
  const template = rawOptions.template;
  const defaultPort = template === 'api' ? 3001 : 3000;
  const defaultDesc =
    template === 'api'
      ? 'A starter API using glowing-fishstick'
      : 'A starter application using glowing-fishstick';

  return {
    projectName: rawOptions.projectDirectory,
    description: defaultDesc,
    template,
    port: rawOptions.port ?? defaultPort,
    install: rawOptions.install ?? true,
    git: rawOptions.git ?? true,
  };
}

/**
 * Validate all collected inputs, throwing on the first failure.
 *
 * WHY: Extracted from generate() to flatten validation branching and keep the
 * orchestrator focused on sequencing, not error-shape construction.
 *
 * @param {object} params
 * @param {string} params.projectName
 * @param {string} params.template
 * @param {number|undefined} params.port
 * @param {string} params.targetDir
 * @param {boolean} params.force
 * @returns {Promise<void>}
 */
async function validateInputs({ projectName, template, port, targetDir, force }) {
  const checks = [validateProjectName(projectName), validateTemplate(template)];

  if (port !== undefined) {
    checks.push(validatePort(port));
  }

  for (const result of checks) {
    if (!result.valid) {
      const err = new Error(result.message);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  }

  // WHY: Directory validation is async (checks filesystem) so it runs after
  // the synchronous validators above.
  const dirResult = await validateDirectory(targetDir, force);
  if (!dirResult.valid) {
    const err = new Error(dirResult.message);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
}

/**
 * Build the Handlebars template context for scaffolding.
 *
 * WHY: Extracted from generate() — dependency resolution and version stamping
 * are self-contained concerns that benefit from isolation.
 *
 * @param {object} params
 * @param {string} params.projectName
 * @param {string} params.description
 * @param {string} params.template
 * @param {number|undefined} params.port
 * @param {string} params.targetDir
 * @returns {Promise<object>}
 */
async function buildContext({ projectName, description, template, port, targetDir }) {
  // WHY: Replace hyphens with underscores so appName is a valid JS identifier
  // for logger names and config values.
  const appName = projectName.replaceAll('-', '_');
  const resolvedPort = port ?? (template === 'api' ? 3001 : 3000);
  const coreVersion = await readCoreVersion();
  const dependencySpecs = await resolveDependencySpecs({ targetDir, coreVersion });

  return {
    projectName,
    appName,
    description,
    port: resolvedPort,
    coreVersion,
    ...dependencySpecs,
  };
}

/**
 * Main generate function — called by bin/cli.js after argument parsing.
 *
 * @param {object} rawOptions         CLI options (may be partial if interactive).
 * @param {string|undefined} rawOptions.projectDirectory  CLI positional argument.
 * @param {string} rawOptions.template                    'app' | 'api'
 * @param {number|undefined} rawOptions.port              Overridden port.
 * @param {boolean} rawOptions.install                    Run npm install?
 * @param {boolean} rawOptions.git                        Run git init?
 * @param {boolean} rawOptions.force                      Overwrite existing dir?
 * @returns {Promise<void>}
 */
export async function generate(rawOptions) {
  const { force = false } = rawOptions;

  const options = await resolveOptions(rawOptions);
  const { projectName, description, template, port, install, git } = options;

  const targetDir = path.resolve(process.cwd(), projectName);
  await validateInputs({ projectName, template, port, targetDir, force });

  const context = await buildContext({ projectName, description, template, port, targetDir });

  // ── Scaffold ──────────────────────────────────────────────────────────────
  const templateDir = path.join(TEMPLATES_DIR, template);

  console.log(`\n\x1b[36mScaffolding\x1b[0m ${projectName} (${template} template)…`);

  await scaffoldFiles(templateDir, targetDir, context);

  // WHY: App template includes a public/ directory for static assets.
  // Create css/ and js/ subdirs with .gitkeep so git tracks the structure.
  if (template === 'app') {
    const publicDir = path.join(targetDir, 'src', 'public');
    await createPublicSubdirs(publicDir);
  }

  console.log(`\x1b[32m✔\x1b[0m Files written to \x1b[1m${targetDir}\x1b[0m`);

  // ── Git init ──────────────────────────────────────────────────────────────
  if (git) {
    try {
      await runGitInit(targetDir);
      console.log('\x1b[32m✔\x1b[0m Initialized git repository');
    } catch {
      // WHY: git init failure is non-fatal — the user may not have git installed
      // or may plan to manage version control separately. Warn but continue.
      console.warn('\x1b[33m⚠\x1b[0m  git init failed — skipping (git may not be installed)');
    }
  }

  // ── npm install ───────────────────────────────────────────────────────────
  if (install) {
    console.log('\x1b[36mRunning npm install…\x1b[0m');
    await runNpmInstall(targetDir);
    console.log('\x1b[32m✔\x1b[0m Dependencies installed');
  }

  // ── Success message ───────────────────────────────────────────────────────
  printSuccess({ projectName, install });
}

/**
 * Print the success message and next steps.
 *
 * @param {object} opts
 * @param {string} opts.projectName
 * @param {boolean} opts.install
 */
function printSuccess({ projectName, install }) {
  const installStep = install ? '' : '\n  npm install';
  console.log(`
\x1b[32m✔ Done!\x1b[0m Your project is ready at \x1b[1m./${projectName}\x1b[0m

Next steps:
\x1b[1m  cd ${projectName}\x1b[0m${installStep}
\x1b[1m  npm run dev\x1b[0m
`);
}
