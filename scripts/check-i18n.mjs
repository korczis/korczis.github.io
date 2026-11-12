#!/usr/bin/env node
// Gate for rule project.i18n-everywhere. Every text of the site exists in every language:
//  1. every trans(key=...) a template uses is a key of i18n/strings.toml (every key has every
//     language: build-i18n.mjs --check);
//  2. no template shows a text outside trans(): text nodes and aria-label/placeholder/title/alt
//     values may only be expressions, names that are the same in every language, or code;
//  3. curated data has a Czech twin for every text field (`name` -> `name_cs`, ...);
//  4. every page of content/ exists in every language (`x.md` and `x.cs.md`).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['cs'];
const strings = parse(readFileSync(join(ROOT, 'i18n/strings.toml'), 'utf8'));
const findings = [];
const walk = (dir, ext) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  return e.isDirectory() ? walk(p, ext) : e.name.endsWith(ext) ? [p] : [];
});
const rel = (p) => p.slice(ROOT.length + 1);

// Names, identifiers and code: the same in every language.
const VERBATIM = new Set(['Majordomus', 'GitHub', 'GitLab', 'majordomus.dev', 'gh', 'glab', 'majordomus.dev/build.json',
  'llms.txt', 'llms-full.txt', '.ai/manifest.yaml', 'Tomas Korcak · korczis', 'curl -fsSL https://majordomus.dev/install.sh | sh',
  'Tomas Korcak', 'korczis.github.io/oscilla/', 'github.com/', 'Esc', 'Enter', 'GL', 'data/projects.toml', '⌘K']);

for (const file of walk(join(ROOT, 'templates'), '.html')) {
  const raw = readFileSync(file, 'utf8');
  for (const [, key, joined] of raw.matchAll(/trans\(key="([^"]+)"(\s*~)?/g)) {
    // A key built at render time ("kind_term_" ~ kind) is a prefix: some keys must carry it.
    if (joined) {
      if (!Object.keys(strings).some((k) => k.startsWith(key))) findings.push(`${rel(file)}: no trans key starts with ${key}`);
      continue;
    }
    if (!strings[key]) findings.push(`${rel(file)}: trans key ${key} is not in i18n/strings.toml`);
  }
  let s = raw.replace(/\{#[\s\S]*?#\}/g, '').replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<svg\b[\s\S]*?<\/svg>/g, '')
    .replace(/\{%[\s\S]*?%\}/g, '\u0000').replace(/\{\{[\s\S]*?\}\}/g, '\u0000');
  const texts = [];
  for (const m of s.matchAll(/(?:aria-label|placeholder|title|alt|aria-description)="([^"]*)"/g)) texts.push(m[1]);
  for (const node of s.replace(/<[^>]+>/g, '\u0001').split('\u0001')) for (const part of node.split('\u0000')) texts.push(part);
  for (const t of texts) {
    const v = t.replace(/\u0000/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/[A-Za-z]{2}/.test(v) || VERBATIM.has(v)) continue;
    findings.push(`${rel(file)}: untranslated text "${v.slice(0, 60)}"; move it to i18n/strings.toml and use trans()`);
  }
}

// Data: every text field has its twins.
const TEXT_FIELDS = { categories: ['name', 'description'], projects: ['tagline', 'summary'] };
const catalogue = parse(readFileSync(join(ROOT, 'data/projects.toml'), 'utf8'));
for (const [key, c] of Object.entries(catalogue.categories)) {
  for (const f of TEXT_FIELDS.categories) for (const l of LANGS) if (!c[`${f}_${l}`]) findings.push(`data/projects.toml categories.${key}: missing ${f}_${l}`);
}
for (const p of catalogue.projects) {
  for (const f of TEXT_FIELDS.projects) for (const l of LANGS) if (!p[`${f}_${l}`]) findings.push(`data/projects.toml ${p.repo}: missing ${f}_${l}`);
}
const NOT_TEXT = new Set(['name', 'icon', 'id']);
function twins(node, where) {
  if (Array.isArray(node)) { node.forEach((n, i) => twins(n, `${where}[${i}]`)); return; }
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (LANGS.some((l) => k.endsWith(`_${l}`))) continue;
    if ((typeof v === 'string' || (Array.isArray(v) && typeof v[0] === 'string')) && !NOT_TEXT.has(k)) {
      for (const l of LANGS) if (!(`${k}_${l}` in node)) findings.push(`data/site.toml ${where}.${k}: missing ${k}_${l}`);
    } else twins(v, `${where}.${k}`);
  }
}
twins(parse(readFileSync(join(ROOT, 'data/site.toml'), 'utf8')), 'site');

// Front matter that names texts by key ([[extra.viz]] title / lead) names existing keys.
for (const file of walk(join(ROOT, 'content'), '.md')) {
  const match = readFileSync(file, 'utf8').match(/^\+\+\+\n([\s\S]*?)\n\+\+\+/);
  for (const v of (match ? parse(match[1]).extra?.viz : null) ?? []) {
    for (const key of [v.title, v.lead]) if (!strings[key]) findings.push(`${rel(file)}: [[extra.viz]] key ${key} is not in i18n/strings.toml`);
  }
}

// Content: every page in every language.
const pages = walk(join(ROOT, 'content'), '.md').map(rel);
const set = new Set(pages);
for (const p of pages) {
  if (/\.[a-z]{2}\.md$/.test(p)) {
    const base = p.replace(/\.[a-z]{2}\.md$/, '.md');
    if (!set.has(base)) findings.push(`${p}: no default-language page ${base}`);
  } else {
    for (const l of LANGS) if (!set.has(p.replace(/\.md$/, `.${l}.md`))) findings.push(`${p}: no ${l} translation`);
  }
}

if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  process.exit(1);
}
console.log(`i18n: ${Object.keys(strings).length} keys, every template text translated, data twins and ${pages.length} pages in ${['en', ...LANGS].join(', ')}, PASS`);
