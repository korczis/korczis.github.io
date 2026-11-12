#!/usr/bin/env node
// Copies the pinned browser bundles out of node_modules so the site self-hosts them (no CDN).
// Exact versions are pinned in package.json; static/js/vendor/ is ignored by git and rebuilt by
// every build, locally and in CI.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'static/js/vendor');
const BUNDLES = {
  'flowbite.min.js': 'node_modules/flowbite/dist/flowbite.min.js',
  'alpine.min.js': 'node_modules/alpinejs/dist/cdn.min.js',
  'cytoscape.min.js': 'node_modules/cytoscape/dist/cytoscape.min.js',
  'chart.umd.min.js': 'node_modules/chart.js/dist/chart.umd.min.js',
  'echarts.min.js': 'node_modules/echarts/dist/echarts.min.js',
  'p5.min.js': 'node_modules/p5/lib/p5.min.js',
  'd3.min.js': 'node_modules/d3/dist/d3.min.js',
};

mkdirSync(TARGET, { recursive: true });
for (const [name, source] of Object.entries(BUNDLES)) {
  copyFileSync(join(ROOT, source), join(TARGET, name));
}
console.log(`vendor: ${Object.keys(BUNDLES).length} bundles -> static/js/vendor/`);
