#!/usr/bin/env node
/**
 * @module bin/cli
 * @description CLI entry point for the fishstick-create scaffolding tool.
 *
 * WHY: Thin shell over generator.js — commander handles argument parsing and
 * help/version output; all generation logic lives in src/ for testability.
 */

import { program } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { generate } from '../src/generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// WHY: Read version from package.json at startup (before traffic) — sync I/O
// is safe here per AGENTS.md "Allowed exceptions: startup-only initialization."
const { version } = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

program
  .name('fishstick-create')
  .description('Scaffold a new glowing-fishstick application or API')
  .version(version)
  .argument('[project-directory]', 'Directory name for the new project')
  .option('--template <type>', 'Template type: app or api', 'app')
  .option('--port <number>', 'Override default port')
  .option('--no-install', 'Skip npm install after scaffolding')
  .option('--no-git', 'Skip git init after scaffolding')
  .option('--force', 'Overwrite existing directory', false)
  .action(async (projectDirectory, options) => {
    try {
      await generate({
        projectDirectory,
        template: options.template,
        port: options.port ? Number(options.port) : undefined,
        install: options.install,
        git: options.git,
        force: options.force,
      });
    } catch (err) {
      // WHY: Surface clean error messages without stack traces for user-facing
      // validation failures; keep stack traces for unexpected runtime errors.
      if (err.code === 'VALIDATION_ERROR') {
        console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
      } else {
        console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
        if (process.env.DEBUG) {
          console.error(err.stack);
        }
      }
      process.exit(1);
    }
  });

program.parse();
