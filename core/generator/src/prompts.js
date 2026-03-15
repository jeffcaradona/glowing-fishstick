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
import { validateProjectName, validateTemplate, validateDescription } from './validators.js';

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
 * Repeatedly ask a question until the validator returns { valid: true }.
 * WHY: Consolidates the ask→validate→warn loop that was duplicated across
 * project-name, template, and description prompts, cutting cognitive
 * complexity of runPrompts.
 *
 * @param {import('node:readline/promises').Interface} rl
 * @param {string} question
 * @param {(value: string) => { valid: boolean, message?: string }} validate
 * @param {string} [defaultValue='']
 * @returns {Promise<string>}
 */
async function askValidated(rl, question, validate, defaultValue = '') {
  while (true) {
    const answer = await ask(rl, question, defaultValue);
    const result = validate(answer);
    if (result.valid) {
      return answer;
    }
    console.log(`  \x1b[33mWarning:\x1b[0m ${result.message}`);
  }
}

/**
 * Prompt for a valid port number.
 *
 * @param {import('node:readline/promises').Interface} rl
 * @param {string} defaultPort
 * @returns {Promise<number>}
 */
async function askPort(rl, defaultPort) {
  while (true) {
    const raw = await ask(rl, 'Port', defaultPort);
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= 65535) {
      return n;
    }
    console.log('  \x1b[33mWarning:\x1b[0m Port must be an integer between 1 and 65535.');
  }
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
    const projectName =
      partial.projectDirectory || (await askValidated(rl, 'Project name', validateProjectName));

    // ── Template type ─────────────────────────────────────────────
    let template = partial.template ?? 'app';
    if (!validateTemplate(template).valid) {
      // WHY: User supplied an invalid --template via flag — prompt to correct.
      template = await askValidated(rl, 'Template type (app / api)', validateTemplate, 'app');
    }

    // ── Description ──────────────────────────────────────────────
    const defaultDesc =
      template === 'api'
        ? 'A starter API using glowing-fishstick'
        : 'A starter application using glowing-fishstick';
    const description = await askValidated(rl, 'Description', validateDescription, defaultDesc);

    // ── Port ─────────────────────────────────────────────────────
    const defaultPort = template === 'api' ? '3001' : '3000';
    const port = partial.port ?? (await askPort(rl, defaultPort));

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
