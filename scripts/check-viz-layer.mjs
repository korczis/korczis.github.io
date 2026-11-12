#!/usr/bin/env node
// Gate for rule project.viz-component-layer, static (no browser):
//  - a chart, graph or sketch library is constructed only in static/js/viz/<name>.js;
//  - each such file registers exactly one visual, KorczisHub.viz('<name>', …), named after it;
//  - every data-viz="<name>" in templates/ has a registered visual, and the template that uses
//    it loads js/viz/<name>.js;
//  - no template loads a script or stylesheet from another origin (everything is self-hosted).
import { readdirSync, readFileSync } from 'node:fs';
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
    if (!registered.has(name)) findings.push(`${rel}: data-viz="${name}" has no static/js/viz/${name}.js`);
    if (!text.includes(`js/viz/${name}.js`)) findings.push(`${rel}: uses data-viz="${name}" but does not load js/viz/${name}.js`);
  }
  for (const [, url] of text.matchAll(/<(?:script|link)[^>]+(?:src|href)="(https?:\/\/[^"]+)"/g)) {
    findings.push(`${rel}: loads ${url} from another origin; self-host it (scripts/vendor.mjs)`);
  }
}

if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  process.exit(1);
}
console.log(`viz layer: ${registered.size} visuals, every one registered, loaded and self-hosted, PASS`);
