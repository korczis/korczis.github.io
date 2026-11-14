#!/usr/bin/env node
// The dev loop: the vendor bundles and the CSS once, then two watchers side by side, Tailwind
// (styles/app.css and every class in templates/ and static/js -> static/css/app.css) and
// `zola serve` (live reload on http://127.0.0.1:<port>). A change to a template, a page, the data
// or the CSS shows without a restart. Ctrl-C stops both; when either ends, the other is stopped
// too, so no watcher is left running in the background.
//
// usage: npm run dev [-- --port <n>] [--open]
//   after editing data/, i18n/ or a generator: npm run derive (the watchers do not run generators)
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliArgs } from './lib/cli.mjs';

const opts = cliArgs({ '--port': '<n>', '--open': true });
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (opts.port !== null && !/^\d+$/.test(opts.port)) {
  process.stderr.write(`dev.mjs: --port needs a number, not ${opts.port}\n`);
  process.exit(2);
}

const first = spawnSync('npm', ['run', '--silent', 'assets'], { cwd: ROOT, stdio: 'inherit' });
if (first.status !== 0) process.exit(first.status ?? 1);

const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  // A watcher that ignores SIGTERM gets a second, final signal.
  setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
    process.exit(code);
  }, 3000).unref();
  Promise.all(children.map((c) => (c.exitCode === null ? new Promise((r) => c.once('exit', r)) : null))).then(() => process.exit(code));
}

function run(name, cmd, args) {
  const child = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
  child.once('error', (error) => {
    process.stderr.write(`dev: ${name} did not start (${error.message})\n`);
    stop(1);
  });
  child.once('exit', (code, signal) => {
    if (!stopping) process.stderr.write(`dev: ${name} ended (${signal ?? `exit ${code}`}); stopping the rest\n`);
    stop(code ?? 1);
  });
  children.push(child);
}

run('tailwind', join(ROOT, 'node_modules/.bin/tailwindcss'), ['--input', 'styles/app.css', '--output', 'static/css/app.css', '--watch']);
run('zola', 'zola', ['serve', ...(opts.port ? ['--port', opts.port] : []), ...(opts.open ? ['--open'] : [])]);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => stop(0));
