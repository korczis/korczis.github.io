#!/usr/bin/env node
// Every page is also an article (rule project.pages-are-articles): it has a Markdown body and names
// the glossary terms it builds on (extra.terms). This gate checks, from the files alone:
//   - data/glossary.toml: unique ids, a kind, a definition in English and Czech, an https source;
//   - every content page (outside content/glossary/): a non-empty body and at least one term;
//   - every term a page names exists, and every term is used by at least one page;
//   - article bodies link to the glossary only through @/ links (Zola checks those).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { loadGlossary } from './lib/terms.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const g = loadGlossary(ROOT);
const findings = [];

const seen = new Set();
for (const t of g.terms) {
  if (seen.has(t.id)) findings.push(`data/glossary.toml: duplicate id ${t.id}`);
  seen.add(t.id);
  if (!/^[a-z0-9-]+$/.test(t.id)) findings.push(`data/glossary.toml: id ${t.id} is not a slug`);
  if (!['language', 'technology', 'concept'].includes(t.kind)) findings.push(`data/glossary.toml: ${t.id} has kind ${t.kind}`);
  for (const f of ['term', 'definition', 'definition_cs']) if (!t[f] || t[f].length < (f === 'term' ? 1 : 20)) findings.push(`data/glossary.toml: ${t.id} lacks ${f}`);
  if (!/^https:\/\//.test(t.reference?.url ?? '') || !t.reference?.title) findings.push(`data/glossary.toml: ${t.id} needs a reference with a title and an https url`);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    return e.isDirectory() ? walk(path) : e.name.endsWith('.md') ? [path] : [];
  });
}

const used = new Set();
let pages = 0;
for (const file of walk(CONTENT)) {
  const rel = relative(ROOT, file);
  const match = readFileSync(file, 'utf8').match(/^\+\+\+\n([\s\S]*?)\n\+\+\+\n?([\s\S]*)$/);
  if (!match) continue;
  pages += 1;
  const fm = parse(match[1]);
  const body = match[2].trim();
  if (rel.startsWith('content/glossary/') && !rel.includes('_index')) continue; // term pages render their definition
  const terms = fm.extra?.terms ?? [];
  if (!body) findings.push(`${rel}: no article body (every page is also an article)`);
  if (!terms.length) findings.push(`${rel}: names no glossary terms (extra.terms)`);
  for (const id of terms) {
    if (!g.byId.has(id)) findings.push(`${rel}: extra.terms names ${id}, which data/glossary.toml does not define`);
    used.add(id);
  }
  for (const [, target] of body.matchAll(/\]\((https?:\/\/korczis\.github\.io[^)]*|\/glossary\/[^)]*)\)/g)) {
    findings.push(`${rel}: link ${target} should be an @/ link, so Zola checks it`);
  }
}
for (const t of g.terms) if (!used.has(t.id)) findings.push(`data/glossary.toml: ${t.id} is used by no page; name it in a page's extra.terms or remove it`);

if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  console.error(`glossary: ${findings.length} finding(s), FAIL`);
  process.exit(1);
}
console.log(`glossary: ${g.terms.length} terms, ${pages} pages, every page an article with terms, every term used, PASS`);
