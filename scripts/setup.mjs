#!/usr/bin/env node
/**
 * What this file does
 *   One-time project setup after cloning. The full list of steps is in the comment below.
 *
 * How it works
 *   - run() executes a shell command in the repository root; step() prints a heading.
 *   - Points git at the .githooks folder and copies .env.example to .env if needed.
 *   - Builds the shared package, runs migrations, and seeds demo data with --seed.
 *   - Uses findPython() from run-python.mjs to report whether Python is installed.
 *
 * Where it fits
 *   Run by `npm run setup`. Module: repository scripts (owner: Vansh).
 */
// One-time setup after `npm install`:  npm run setup  [-- --seed]
//  - enables the repository's git hooks
//  - creates apps/api/.env from the example if missing
//  - builds the shared package
//  - applies database migrations (embedded PostgreSQL unless DATABASE_URL is set)
//  - optionally loads demo data
//  - checks that Python is available for text extraction
import { execSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPython } from './run-python.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });
const step = (msg) => console.log(`\n▸ ${msg}`);

step('Enabling git hooks (.githooks)');
// Git normally looks in .git/hooks; this makes it use the hooks committed in .githooks.
spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'inherit' });

const env = path.join(root, 'apps/api/.env');
// Never overwrite an existing .env, because it may hold the developer's own settings.
if (!existsSync(env)) {
  step('Creating apps/api/.env from .env.example');
  copyFileSync(path.join(root, 'apps/api/.env.example'), env);
}

step('Building the shared package');
run('npm run build -w @docstruct/shared');

step('Applying database migrations');
run('npm run db:migrate');

if (process.argv.includes('--seed')) {
  step('Loading demo data');
  run('npm run db:seed');
}

step('Checking Python for text extraction');
const python = findPython();
if (python) console.log(`  found: ${python.join(' ')}`);
else console.log('  Python 3.9+ not found. PDF/DOCX text extraction will be skipped; set PYTHON_BIN or install Python.');

console.log('\nDone. Start DocStruct with:  npm run dev   (http://localhost:5173)');
