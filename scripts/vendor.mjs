#!/usr/bin/env node
// Copies the pinned browser bundles out of node_modules so the site self-hosts them (no CDN).
// Exact versions are pinned in package.json; static/js/vendor/ is ignored by git and rebuilt by
// every build, locally and in CI. ECharts is the exception: it is bundled from
// scripts/lib/echarts-entry.mjs with only the charts and components the site draws, because the
// full dist costs a phone 373 KB gzip. It is the site's one chart library (the owner's standard):
// the graph and the bars that once needed Cytoscape and Chart.js are ECharts series now.
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliArgs } from './lib/cli.mjs';

cliArgs();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'static/js/vendor');
const BUNDLES = {
  'flowbite.min.js': 'node_modules/flowbite/dist/flowbite.min.js',
  'alpine.min.js': 'node_modules/alpinejs/dist/cdn.min.js',
  'p5.min.js': 'node_modules/p5/lib/p5.min.js',
  'd3.min.js': 'node_modules/d3/dist/d3.min.js',
};

mkdirSync(TARGET, { recursive: true });
// A bundle the site no longer ships (a library dropped from BUNDLES) must not linger in a local
// build's output: the directory holds exactly these files.
for (const name of readdirSync(TARGET)) {
  if (!(name in BUNDLES) && name !== 'echarts.min.js') rmSync(join(TARGET, name));
}
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
