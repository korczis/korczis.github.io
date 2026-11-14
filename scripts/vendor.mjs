#!/usr/bin/env node
// Copies the pinned browser bundles out of node_modules so the site self-hosts them (no CDN).
// Exact versions are pinned in package.json; static/js/vendor/ is ignored by git and rebuilt by
// every build, locally and in CI. ECharts is the exception: it is bundled from
// scripts/lib/echarts-entry.mjs with only the charts the site draws (about a fifth of the full
// build), because the full dist costs a phone 373 KB gzip for one sunburst.
import { copyFileSync, mkdirSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'static/js/vendor');
const BUNDLES = {
  'flowbite.min.js': 'node_modules/flowbite/dist/flowbite.min.js',
  'alpine.min.js': 'node_modules/alpinejs/dist/cdn.min.js',
  'cytoscape.min.js': 'node_modules/cytoscape/dist/cytoscape.min.js',
  'chart.umd.min.js': 'node_modules/chart.js/dist/chart.umd.min.js',
  'p5.min.js': 'node_modules/p5/lib/p5.min.js',
  'd3.min.js': 'node_modules/d3/dist/d3.min.js',
};

mkdirSync(TARGET, { recursive: true });
for (const [name, source] of Object.entries(BUNDLES)) {
  copyFileSync(join(ROOT, source), join(TARGET, name));
}
buildSync({
  entryPoints: [join(ROOT, 'scripts/lib/echarts-entry.mjs')],
  outfile: join(TARGET, 'echarts.min.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  legalComments: 'eof',
  logLevel: 'warning',
});
console.log(`vendor: ${Object.keys(BUNDLES).length + 1} bundles -> static/js/vendor/`);
