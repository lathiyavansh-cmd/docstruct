#!/usr/bin/env node
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
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

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
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (!c.killed) c.kill();
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
console.log(`DocStruct: web http://localhost:${webPort}  api http://localhost:${apiPort}/api`);
