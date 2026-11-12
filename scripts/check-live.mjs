#!/usr/bin/env node
// Asks every live URL in data/projects.toml, now, and fails on any that does not answer 2xx/3xx.
// The snapshot records the status at refresh time; this is the check that it still holds (the
// Monitor workflow runs it daily, Pages after every deploy).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogue = parse(readFileSync(join(ROOT, 'data/projects.toml'), 'utf8'));
const targets = catalogue.projects.filter((p) => p.url).map((p) => [p.name, p.url]);
targets.push(['Majordomus build', 'https://majordomus.dev/build.json']);

let failed = 0;
await Promise.all(
  targets.map(async ([name, url]) => {
    let status = 0;
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      status = response.status;
    } catch {}
    const ok = status >= 200 && status < 400;
    if (!ok) failed += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${status} ${name} ${url}`);
  }),
);
console.log(`live: ${targets.length - failed}/${targets.length} answer`);
process.exit(failed ? 1 : 0);
