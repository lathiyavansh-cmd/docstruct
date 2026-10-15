#!/usr/bin/env node
/**
 * What this file does
 *   Finds a working Python 3.9+ on this machine and runs it with the given arguments (see below).
 *
 * How it works
 *   - candidates lists the commands to try, in order.
 *   - findPython() runs a tiny version check with each one and returns the first that passes.
 *   - When run directly, it forwards all arguments to that Python and exits with its exit code.
 *
 * Where it fits
 *   Used by `npm run test:extractor` and by setup.mjs (which imports findPython).
 *   Module: repository scripts (owner: Vansh).
 */
// Runs a Python 3.9+ interpreter with the given arguments, finding one that works on this machine:
// $PYTHON_BIN, then the Windows "py -3" launcher, then python3, then python.
import { spawnSync } from 'node:child_process';

const candidates = [
  ...(process.env.PYTHON_BIN ? [[process.env.PYTHON_BIN]] : []),
  ['py', '-3'],
  ['python3'],
  ['python'],
];

export function findPython() {
  for (const [cmd, ...pre] of candidates) {
    // Ask the interpreter itself whether it is 3.9 or newer; a missing command just fails the probe.
    const probe = spawnSync(cmd, [...pre, '-c', 'import sys; print(sys.version_info >= (3, 9))'], { encoding: 'utf8' });
    if (probe.status === 0 && probe.stdout.trim() === 'True') return [cmd, ...pre];
  }
  return null;
}

// True only when this file is run directly, not when setup.mjs imports findPython().
if (process.argv[1]?.endsWith('run-python.mjs')) {
  const python = findPython();
  if (!python) {
    console.error('Python 3.9+ was not found. Install it or set PYTHON_BIN.');
    process.exit(1);
  }
  const [cmd, ...pre] = python;
  const result = spawnSync(cmd, [...pre, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
