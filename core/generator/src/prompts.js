/**
 * @module src/prompts
 * @description Interactive CLI prompts using node:readline/promises.
 *
 * WHY: Use Node.js built-in readline/promises (Node >= 22) rather than an
 * external prompting library to keep the dependency footprint minimal.
 * All prompts validate their input before returning so callers receive
 * clean, validated values.
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { validateProjectName, validateTemplate } from './validators.js';

/**
 * Ask a single question and return the trimmed answer.
 * Falls back to `defaultValue` if the user presses enter without input.
 *
 * @param {import('node:readline/promises').Interface} rl
 * @param {string} question
 * @param {string} [defaultValue='']
 * @returns {Promise<string>}
 */
async function ask(rl, question, defaultValue = '') {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  const raw = await rl.question(`  ${question}${suffix}: `);
  const answer = raw.trim();
  return answer === '' ? defaultValue : answer;
}

/**
 * Ask a yes/no question and return a boolean.
 *
 * @param {import('node:readline/promises').Interface} rl
 * @param {string} question
 * @param {boolean} [defaultValue=true]
 * @returns {Promise<boolean>}
 */
async function askBoolean(rl, question, defaultValue = true) {
  const hint = defaultValue ? 'Y/n' : 'y/N';
  const raw = await rl.question(`  ${question} [${hint}]: `);
  const answer = raw.trim().toLowerCase();

  if (answer === '') {
    return defaultValue;
  }
  return answer === 'y' || answer === 'yes';
}

/**
 * Prompt for all generator options interactively.
 * Only prompts for values not already supplied via CLI flags.
 *
 * @param {object} partial  Values already provided by CLI (may be partial).
 * @param {string|undefined} partial.projectDirectory
 * @param {string} partial.template
 * @param {number|undefined} partial.port
 * @param {boolean} partial.install
 * @param {boolean} partial.git
 * @returns {Promise<{
 *   projectName: string,
 *   description: string,
 *   template: string,
 *   port: number,
 *   install: boolean,
 *   git: boolean,
 * }>}
 */
export async function runPrompts(partial) {
  const rl = createInterface({ input, output });

  try {
    console.log('\n\x1b[1mglowing-fishstick scaffold\x1b[0m');
    console.log('Press enter to accept defaults.\n');

    // ── Project name ─────────────────────────────────────────────
    let projectName = partial.projectDirectory ?? '';
    if (!projectName) {
      while (true) {
        projectName = await ask(rl, 'Project name');
        const result = validateProjectName(projectName);
        if (result.valid) {
          break;
        }
        console.log(`  \x1b[33mWarning:\x1b[0m ${result.message}`);
        projectName = '';
      }
    }

    // ── Template type ─────────────────────────────────────────────
    let template = partial.template ?? 'app';
    const templateResult = validateTemplate(template);
    if (!templateResult.valid) {
      // User supplied an invalid --template via flag — prompt to correct.
      while (true) {
        template = await ask(rl, 'Template type (app / api)', 'app');
        const result = validateTemplate(template);
        if (result.valid) {
          break;
        }
        console.log(`  \x1b[33mWarning:\x1b[0m ${result.message}`);
      }
    }

    // ── Description ──────────────────────────────────────────────
    const defaultDesc =
      template === 'api'
        ? 'A starter API using glowing-fishstick'
        : 'A starter application using glowing-fishstick';
    const description = await ask(rl, 'Description', defaultDesc);

    // ── Port ─────────────────────────────────────────────────────
    let port;
    if (partial.port !== undefined) {
      port = partial.port;
    } else {
      const defaultPort = template === 'api' ? '3001' : '3000';
      while (true) {
        const raw = await ask(rl, 'Port', defaultPort);
        const n = Number(raw);
        if (Number.isInteger(n) && n >= 1 && n <= 65535) {
          port = n;
          break;
        }
        console.log('  \x1b[33mWarning:\x1b[0m Port must be an integer between 1 and 65535.');
      }
    }

    // ── Git / install (only prompt if not already set via flags) ──
    // WHY: commander --no-git sets git=false; if git is already false we skip
    // the prompt and respect the flag. Same for install.
    const git = partial.git === false ? false : await askBoolean(rl, 'Initialize git?', true);
    const install =
      partial.install === false ? false : await askBoolean(rl, 'Run npm install?', true);

    return { projectName, description, template, port, install, git };
  } finally {
    // WHY: Always close the readline interface to release stdin so the process
    // can exit cleanly after prompting completes.
    rl.close();
  }
}
