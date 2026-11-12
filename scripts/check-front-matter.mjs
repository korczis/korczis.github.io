#!/usr/bin/env node
// Gate for the front-matter contract (static/schemas/front-matter.schema.json, served at /schemas/): every content/*.md has
// front matter that matches it, category pages name a real category, and og_image names are
// unique. The schema is the machine-readable description; this checks exactly its rules (no
// dependency): required keys, no unknown keys, types, lengths, patterns, enums, array sizes.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(readFileSync(join(ROOT, 'static/schemas/front-matter.schema.json'), 'utf8'));
const catalogue = parse(readFileSync(join(ROOT, 'data/projects.toml'), 'utf8'));
const findings = [];

function validate(value, rule, where) {
  if (rule.enum && !rule.enum.includes(value)) return findings.push(`${where}: ${JSON.stringify(value)} is not one of ${rule.enum.join(', ')}`);
  const type = Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
  if (rule.type && rule.type !== type) return findings.push(`${where}: expected ${rule.type}, got ${type}`);
  if (type === 'string') {
    if (rule.minLength && value.length < rule.minLength) findings.push(`${where}: ${value.length} characters, at least ${rule.minLength}`);
    if (rule.maxLength && value.length > rule.maxLength) findings.push(`${where}: ${value.length} characters, at most ${rule.maxLength}`);
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) findings.push(`${where}: does not match ${rule.pattern}`);
  }
  if (type === 'integer' && rule.minimum !== undefined && value < rule.minimum) findings.push(`${where}: below ${rule.minimum}`);
  if (type === 'array') {
    if (rule.minItems && value.length < rule.minItems) findings.push(`${where}: ${value.length} items, at least ${rule.minItems}`);
    if (rule.maxItems && value.length > rule.maxItems) findings.push(`${where}: ${value.length} items, at most ${rule.maxItems}`);
    value.forEach((item, i) => validate(item, rule.items ?? {}, `${where}[${i}]`));
  }
  if (type === 'object') {
    for (const key of rule.required ?? []) if (!(key in value)) findings.push(`${where}: missing ${key}`);
    for (const [key, v] of Object.entries(value)) {
      if (!rule.properties?.[key]) {
        if (rule.additionalProperties === false) findings.push(`${where}: unknown key ${key}`);
        continue;
      }
      validate(v, rule.properties[key], `${where}.${key}`);
    }
  }
}

const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const path = join(dir, e.name);
  return e.isDirectory() ? files(path) : e.name.endsWith('.md') ? [path] : [];
});
const images = new Map();
for (const file of files(join(ROOT, 'content'))) {
  const rel = file.slice(ROOT.length + 1);
  const match = readFileSync(file, 'utf8').match(/^\+\+\+\n([\s\S]*?)\n\+\+\+/);
  if (!match) { findings.push(`${rel}: no TOML front matter`); continue; }
  const fm = parse(match[1]);
  validate(fm, { ...schema, type: 'object' }, rel);
  const category = fm.extra?.category;
  if (category && !(category in catalogue.categories)) findings.push(`${rel}: extra.category ${category} is not in data/projects.toml`);
  const image = fm.extra?.og_image;
  if (image && images.has(image)) findings.push(`${rel}: og_image ${image} is also used by ${images.get(image)}`);
  if (image) images.set(image, rel);
}

if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  process.exit(1);
}
console.log(`front matter: ${images.size} pages match static/schemas/front-matter.schema.json, PASS`);
