#!/usr/bin/env node
// Gate for the site's data, offline: data/projects.toml is well-formed and data/github.json is a
// snapshot that covers it. No network; CI runs it on every change.
//
// usage: node scripts/check-data.mjs      exit 0 clean, 1 with every finding listed
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const findings = [];
const fail = (where, what) => findings.push(`${where}: ${what}`);

const catalogue = parse(readFileSync(join(ROOT, 'data/projects.toml'), 'utf8'));
const snapshot = JSON.parse(readFileSync(join(ROOT, 'data/github.json'), 'utf8'));
const categories = catalogue.categories ?? {};
const REQUIRED = ['repo', 'name', 'tagline', 'summary', 'category', 'stack', 'featured'];
const ICONS = ['shield', 'beaker', 'book', 'map', 'film', 'wrench', 'code', 'globe', 'graph', 'cube', 'lock', 'server', 'puzzle', 'academic'];
for (const [key, c] of Object.entries(categories)) {
  if (!/^[a-z]+$/.test(key)) fail(`categories.${key}`, 'key must be lower-case letters (it is a URL)');
  if (!c.name || !c.description) fail(`categories.${key}`, 'needs a name and a description');
  if ((c.description ?? '').length < 50 || (c.description ?? '').length > 165) {
    fail(`categories.${key}`, `description is ${(c.description ?? '').length} characters, not 50-165 (it is the page's meta description)`);
  }
  if (!ICONS.includes(c.icon)) fail(`categories.${key}`, `icon ${c.icon} is not one of ${ICONS.join(', ')}`);
}
const seen = new Set();

for (const [index, p] of (catalogue.projects ?? []).entries()) {
  const where = `data/projects.toml projects[${index}] (${p.repo ?? '?'})`;
  for (const key of REQUIRED) if (!(key in p)) fail(where, `missing ${key}`);
  if (seen.has(p.repo)) fail(where, 'duplicate repo');
  seen.add(p.repo);
  if (!(p.category in categories)) fail(where, `unknown category ${p.category}`);
  if ((p.tagline ?? '').length > 90) fail(where, `tagline is ${p.tagline.length} > 90 characters`);
  if (p.url && !/^https:\/\//.test(p.url)) fail(where, `url is not https: ${p.url}`);
  if (!Array.isArray(p.stack) || p.stack.length === 0) fail(where, 'stack must be a non-empty list');
  if ((p.stack ?? []).includes('Majordomus')) {
    fail(where, 'Majordomus supervision is measured (data/github.json), never listed in stack');
  }
  const measured = snapshot.projects?.[p.repo];
  if (!measured) {
    fail(where, 'not in data/github.json; run npm run data');
    continue;
  }
  if (measured.fork) fail(where, 'is a fork; the hub shows original work only');
  if (!['active', 'maintained', 'dormant'].includes(measured.activity)) {
    fail(where, `activity ${measured.activity} is not inferred; run npm run data`);
  }
  if (measured.visibility && measured.visibility !== 'public') fail(where, 'is not public');
  if (p.url && measured.live === false) {
    fail(where, `live site answered ${measured.live_status} at the last snapshot`);
  }
}

for (const repo of Object.keys(snapshot.projects ?? {})) {
  if (!seen.has(repo)) fail('data/github.json', `${repo} measured but not in the catalogue`);
}
if (snapshot.schema !== 'korczis-hub-github/v1') fail('data/github.json', 'unknown schema');
if (!snapshot.contributions?.days?.length) fail('data/github.json', 'no contribution days');
if (!snapshot.majordomus?.version) fail('data/github.json', 'no majordomus version');
if ((snapshot.timeline ?? []).length !== seen.size || !(snapshot.timeline ?? []).every((r) => seen.has(r))) {
  fail('data/github.json', 'timeline does not cover the catalogue; run npm run data');
}
if (!(catalogue.projects ?? []).some((p) => p.featured)) fail('data/projects.toml', 'nothing featured');

// The derived index: well-formed, every category known, every curated project present in it.
const index = JSON.parse(readFileSync(join(ROOT, 'data/index.json'), 'utf8'));
if (index.schema !== 'korczis-hub-index/v1') fail('data/index.json', 'unknown schema; run npm run index');
for (const r of index.repos ?? []) {
  if (!(r.category in categories)) fail('data/index.json', `${r.name} has unknown category ${r.category}; run npm run index -- --derive`);
  if (!r.hosts?.github && !r.hosts?.gitlab) fail('data/index.json', `${r.name} has no host link`);
}
const indexed = new Set((index.repos ?? []).map((r) => r.name.toLowerCase()));
for (const p of catalogue.projects ?? []) {
  if (!indexed.has(p.repo.toLowerCase())) fail('data/index.json', `curated ${p.repo} is not in the index (forked, mirrored or hidden?)`);
}
if (index.counts?.own !== (index.repos ?? []).length) fail('data/index.json', 'counts.own does not match the listed repositories');

const ageDays = (Date.now() - Date.parse(snapshot.generated_at)) / 86400000;
if (findings.length) {
  for (const finding of findings) console.error(`✗ ${finding}`);
  process.exit(1);
}
console.log(
  `data: ${seen.size} projects, snapshot ${snapshot.generated_at} (${ageDays.toFixed(1)} days old), PASS`,
);
