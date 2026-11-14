#!/usr/bin/env node
// Gate for the site's data, offline: data/projects.toml is well-formed and data/github.json is a
// snapshot that covers it. No network; CI runs it on every change.
//
// usage: node scripts/check-data.mjs      exit 0 clean, 1 with every finding listed
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { inferCategory, ruleFindings } from './lib/repos.mjs';

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

// The category rules: none shadowed or dead, and every fixture (a repository with the category a
// person judged right) is placed there by the rules themselves, not only by the stored index.
for (const f of ruleFindings(categories, catalogue.inference)) fail('data/projects.toml', f);
const fixtures = parse(readFileSync(join(ROOT, 'data/category-fixtures.toml'), 'utf8')).fixtures ?? {};
const byName = new Map((index.repos ?? []).map((r) => [r.name, r]));
const curatedRepos = new Set((catalogue.projects ?? []).map((p) => p.repo.toLowerCase()));
let fixtureCount = 0;
for (const [name, expected] of Object.entries(fixtures)) {
  const where = `data/category-fixtures.toml ${name}`;
  fixtureCount += 1;
  if (!(expected in categories)) { fail(where, `expects ${expected}, which is no category`); continue; }
  if (curatedRepos.has(name.toLowerCase())) { fail(where, 'is curated: its category is the catalogue\'s, not inferred'); continue; }
  const r = byName.get(name);
  if (!r) { fail(where, 'is not in data/index.json any more; remove the fixture'); continue; }
  const got = inferCategory(r, categories, catalogue.inference);
  if (got.category !== expected) fail(where, `the rules place it in ${got.category} (${got.by}: ${got.evidence.join(', ') || 'none'}), not ${expected}`);
}

// The owner's CV facts (ADR 0004) against static/schemas/cv.schema.json: the subset of JSON Schema
// that schema uses (type, required, additionalProperties: false, pattern, minLength, enum, $ref).
const cvSchema = JSON.parse(readFileSync(join(ROOT, 'static/schemas/cv.schema.json'), 'utf8'));
const cv = parse(readFileSync(join(ROOT, 'data/cv.toml'), 'utf8'));
function conforms(value, schema, at) {
  if (schema.$ref) return conforms(value, cvSchema.$defs[schema.$ref.split('/').pop()], at);
  if (schema.enum && !schema.enum.includes(value)) return fail('data/cv.toml', `${at} is not one of ${schema.enum.join(', ')}`);
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('data/cv.toml', `${at} is not a table`);
    for (const key of schema.required ?? []) if (!(key in value)) fail('data/cv.toml', `${at} has no ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (!schema.properties?.[key]) fail('data/cv.toml', `${at}.${key} is not in the schema`);
      else conforms(item, schema.properties[key], `${at}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) return fail('data/cv.toml', `${at} is not a list`);
    value.forEach((item, i) => conforms(item, schema.items, `${at}[${i}]`));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') return fail('data/cv.toml', `${at} is not a string (quote dates: "2020-01")`);
    if (schema.minLength && value.length < schema.minLength) fail('data/cv.toml', `${at} is empty`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail('data/cv.toml', `${at} "${value}" does not match ${schema.pattern}`);
  }
}
conforms(cv, cvSchema, 'cv');
for (const [i, r] of (cv.roles ?? []).entries()) if (r.end && r.end < r.start) fail('data/cv.toml', `roles[${i}] ends before it starts`);

const ageDays = (Date.now() - Date.parse(snapshot.generated_at)) / 86400000;
if (findings.length) {
  for (const finding of findings) console.error(`✗ ${finding}`);
  process.exit(1);
}
console.log(
  `data: ${seen.size} projects, ${fixtureCount} category fixtures, snapshot ${snapshot.generated_at} (${ageDays.toFixed(1)} days old), PASS`,
);
