#!/usr/bin/env node
// Gate for rule project.viz-component-layer, static (no browser):
//  - a chart, graph or sketch library is constructed only in static/js/viz/<name>.js;
//  - each such file registers exactly one visual, KorczisHub.viz('<name>', …), named after it;
//  - every data-viz="<name>" in templates/ has a registered visual, and the template that uses
//    it loads js/viz/<name>.js;
//  - no template loads a script or stylesheet from another origin (everything is self-hosted).
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'smol-toml';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const findings = [];
const CONSTRUCTORS = /\bnew\s+p5\s*\(|\bcytoscape\s*\(\s*\{|\becharts\.init\s*\(|\bnew\s+Chart\s*\(/;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'vendor' ? [] : walk(path);
    return [path];
  });
}

const registered = new Set();
const used = new Set();
for (const file of walk(join(ROOT, 'static/js')).filter((f) => f.endsWith('.js'))) {
  const rel = file.slice(ROOT.length + 1);
  const text = readFileSync(file, 'utf8');
  const inViz = rel.startsWith('static/js/viz/');
  if (CONSTRUCTORS.test(text) && !inViz) findings.push(`${rel}: constructs a visual outside static/js/viz/`);
  if (inViz) {
    const names = [...text.matchAll(/KorczisHub\.viz\(\s*'([\w-]+)'/g)].map((m) => m[1]);
    const expected = basename(file, '.js');
    if (names.length !== 1 || names[0] !== expected) {
      findings.push(`${rel}: must register exactly one visual named '${expected}' (found ${names.join(', ') || 'none'})`);
    }
    names.forEach((n) => registered.add(n));
  }
}

for (const file of walk(join(ROOT, 'templates')).filter((f) => f.endsWith('.html'))) {
  const rel = file.slice(ROOT.length + 1);
  const text = readFileSync(file, 'utf8');
  for (const [, name] of text.matchAll(/data-viz="([\w-]+)"/g)) {
    used.add(name);
    if (!registered.has(name)) findings.push(`${rel}: data-viz="${name}" has no static/js/viz/${name}.js`);
    if (!text.includes(`js/viz/${name}.js`)) findings.push(`${rel}: uses data-viz="${name}" but does not load js/viz/${name}.js`);
  }
  // Only what the browser fetches counts: scripts and stylesheet, preload or icon links. A link
  // that merely names another page (rel=me, canonical, alternate) loads nothing.
  for (const [tag] of text.matchAll(/<(?:script|link)\b[^>]*>/g)) {
    const url = (tag.match(/(?:src|href)="(https?:\/\/[^"]+)"/) || [])[1];
    if (!url) continue;
    const fetched = tag.startsWith('<script') || /rel="(?:stylesheet|preload|modulepreload|icon|apple-touch-icon|manifest)"/.test(tag);
    if (fetched) findings.push(`${rel}: loads ${url} from another origin; self-host it (scripts/vendor.mjs)`);
  }
}

// Visuals declared in front matter ([[extra.viz]]) must exist and be registered.
for (const file of walk(join(ROOT, 'content')).filter((f) => f.endsWith('.md'))) {
  const match = readFileSync(file, 'utf8').match(/^\+\+\+\n([\s\S]*?)\n\+\+\+/);
  if (!match) continue;
  for (const v of parse(match[1]).extra?.viz ?? []) {
    used.add(v.kind);
    if (!registered.has(v.kind)) findings.push(`${file.slice(ROOT.length + 1)}: [[extra.viz]] kind "${v.kind}" has no static/js/viz/${v.kind}.js`);
  }
}

// Every visual box in a template (but the decorative hero) is followed by its list twin.
for (const file of walk(join(ROOT, 'templates')).filter((f) => f.endsWith('.html'))) {
  const text = readFileSync(file, 'utf8');
  const boxes = [...text.matchAll(/data-viz="([\w-]+)"/g)].filter((m) => m[1] !== 'glyphs').length;
  const twins = (text.match(/partials\/viz-list\.html/g) || []).length;
  if (boxes > twins) findings.push(`${file.slice(ROOT.length + 1)}: ${boxes} visual(s) but ${twins} list twin(s); include partials/viz-list.html after each box`);
}

// Taxonomy pages have no front matter; their visuals are declared in data/site.toml.
{
  const site = parse(readFileSync(join(ROOT, 'data/site.toml'), 'utf8'));
  for (const v of [...(site.taxonomy?.list_viz ?? []), ...(site.taxonomy?.single_viz ?? [])]) {
    used.add(v.kind);
    if (!registered.has(v.kind)) findings.push(`data/site.toml: taxonomy visual kind "${v.kind}" has no static/js/viz/${v.kind}.js`);
  }
}

// Every visual is interactive (rule project.viz-component-layer): it answers a click or a tap and
// tells the pointer so. And none is dead code: a registered visual is used by a page.
for (const file of walk(join(ROOT, 'static/js/viz')).filter((f) => f.endsWith('.js'))) {
  const rel = file.slice(ROOT.length + 1);
  const text = readFileSync(file, 'utf8');
  const name = basename(file, '.js');
  if (name !== 'glyphs' && !/\.on\(\s*'(?:click|tap)'|onClick\s*:|addEventListener\(\s*'(?:click|pointerup)'|window\.addEventListener\(\s*'pointerup'/.test(text)) findings.push(`${rel}: answers no click or tap; every visual leads somewhere`);
  // ECharts shows the pointer itself on a series with a click handler; glyphs is the decorative hero.
  // ... and has a keyboard and screen-reader twin: items() for the list under its card (WCAG 2.1.1).
  if (name !== 'glyphs' && !/\bitems(?:\s*:|,|\s*\(\)\s*=>|\s*=)/.test(text)) findings.push(`${rel}: returns no items(); the list twin of a visual is how a keyboard reaches it`);
  if (name !== 'glyphs' && !/echarts\.init/.test(text) && !/cursor/.test(text)) findings.push(`${rel}: never sets the pointer cursor; show what is clickable`);
  if (!used.has(name)) findings.push(`${rel}: no template or front matter uses visual '${name}'; remove it or use it`);
}

if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  process.exit(1);
}
console.log(`viz layer: ${registered.size} visuals, every one registered, loaded and self-hosted, PASS`);
