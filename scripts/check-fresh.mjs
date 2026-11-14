#!/usr/bin/env node
// Gate for the promise that the hub keeps itself current: the measured data on master must be
// younger than MAX_HOURS (default 24 h, four six-hourly refreshes). The daily Monitor runs it, so a
// refresh that keeps failing (three were cancelled unseen on 2026-11-12/13) turns the monitor red
// instead of leaving the site quietly stale. No network.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_HOURS = Number(process.env.MAX_HOURS) || 24;
const findings = [];
for (const file of ['data/github.json', 'data/index.json', 'data/recent.json']) {
  const { generated_at: at } = JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
  const hours = (Date.now() - Date.parse(at)) / 3600000;
  if (!(hours <= MAX_HOURS)) findings.push(`${file}: measured ${at}, ${hours.toFixed(1)} h ago (limit ${MAX_HOURS} h); the scheduled refresh (.github/workflows/refresh.yml) is not landing`);
}
if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  process.exit(1);
}
console.log(`fresh: data/github.json, index.json and recent.json measured within ${MAX_HOURS} h, PASS`);
