#!/usr/bin/env node
/**
 * What this file does
 *   Runs the API server and the web client at the same time with one command (details below).
 *
 * How it works
 *   - arg() reads optional --api-port and --web-port flags.
 *   - Spawns `npm run dev` for both workspaces and tells each one the other's port.
 *   - relay() prints each child's output with a coloured [api] or [web] prefix.
 *   - shutdown() stops both children when one exits or on Ctrl+C.
 *
 * Where it fits
 *   Run by `npm run dev` from the repository root. Module: repository scripts (owner: Vansh).
 */
// Starts the API and the web client together for development.
//   node scripts/dev.mjs [--api-port 4000] [--web-port 5173]
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const apiPort = arg('--api-port', process.env.PORT ?? '4000');
const webPort = arg('--web-port', '5173');
// On Windows the npm command is a .cmd file, so it needs a different name (and a shell below).
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Each entry: [name, npm args, extra env vars, colour]. The API gets the web URL for CORS;
// the web dev server gets the API port for its proxy.
const children = [
  ['api', ['run', 'dev', '-w', '@docstruct/api'], { PORT: apiPort, APP_URL: `http://localhost:${webPort}` }, '\x1b[36m'],
  ['web', ['run', 'dev', '-w', '@docstruct/web', '--', '--port', webPort, '--strictPort'], { DOCSTRUCT_API_PORT: apiPort }, '\x1b[35m'],
].map(([name, args, env, colour]) => {
  const child = spawn(npm, args, { cwd: root, env: { ...process.env, ...env }, shell: process.platform === 'win32' });
  const prefix = `${colour}[${name}]\x1b[0m `;
  const relay = (stream, out) =>
    stream.on('data', (chunk) => out.write(chunk.toString().split(/\r?\n/).filter(Boolean).map((l) => prefix + l).join('\n') + '\n'));
  relay(child.stdout, process.stdout);
  relay(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown();
  });
  return child;
});

let stopping = false;
// The stopping flag makes sure shutdown runs only once, even though both children will exit.
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (!c.killed) c.kill();
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
console.log(`DocStruct: web http://localhost:${webPort}  api http://localhost:${apiPort}/api`);
