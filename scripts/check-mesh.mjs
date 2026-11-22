#!/usr/bin/env node
// The mesh declaration opens this repository's servers to the owner's fleet: it must load, trust
// the fleet's machine keys and name its hubs. Majordomus drops a declaration whose key fails its
// schema (^[0-9a-f]{64}$) and the mesh silently goes off; a quoted key followed by a comment is
// read with its quotes (2026-11-22). So every trusted key is written bare, one per line.
// Rule project.mesh-fleet.
import { readFileSync } from 'node:fs';

const PATH = '.ai/repo/mesh/mesh.yaml';
const MIN_KEYS = 2;
const lines = readFileSync(PATH, 'utf8').split('\n');
const findings = [];
const top = (key) => lines.findIndex((l) => l === `${key}:` || l.startsWith(`${key}: `));
const block = (key) => {
  const i = top(key);
  if (i < 0) return [];
  const out = [];
  for (let j = i + 1; j < lines.length && (lines[j].startsWith(' ') || lines[j] === ''); j++) out.push([j + 1, lines[j]]);
  return out;
};

if (!lines.some((l) => l === 'enabled: true')) findings.push(`${PATH}: enabled is not true`);
if (!lines.some((l) => /^\s+policy: deny_unknown\s*$/.test(l))) findings.push(`${PATH}: trust.policy is not deny_unknown`);
let inAllow = false;
let keys = 0;
for (const [n, l] of block('trust')) {
  if (/^\s+allow:\s*$/.test(l)) { inAllow = true; continue; }
  if (inAllow && /^\s{4}- /.test(l)) {
    if (/^\s{4}- [0-9a-f]{64}(\s+#.*)?$/.test(l)) keys++;
    else findings.push(`${PATH}:${n}: a trusted key must be 64 lower-case hex digits, bare (no quotes): ${l.trim().slice(0, 24)}…`);
  } else if (inAllow && /^\s{2}\S/.test(l)) inAllow = false;
}
if (keys < MIN_KEYS) findings.push(`${PATH}: trusts ${keys} key(s); the fleet needs at least ${MIN_KEYS}`);
const endpoints = block('rendezvous').filter(([, l]) => /^\s{4}- https?:\/\//.test(l)).length;
if (!endpoints) findings.push(`${PATH}: no rendezvous endpoints; machines on other segments never find this one`);

for (const f of findings) console.log(`✗ ${f}`);
console.log(`mesh: ${keys} trusted key(s), ${endpoints} hub(s), ${findings.length ? 'FAIL' : 'PASS'}`);
process.exit(findings.length ? 1 : 0);
