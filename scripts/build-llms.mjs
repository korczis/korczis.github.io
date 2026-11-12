#!/usr/bin/env node
// Derives static/llms.txt (https://llmstxt.org) from zola.toml and data/projects.toml, so a
// language model reading the site gets the same catalogue a person sees, in plain Markdown.
//
// usage: node scripts/build-llms.mjs           write static/llms.txt
//        node scripts/build-llms.mjs --check   exit 1 if the committed file is stale
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'static/llms.txt');
const config = parse(readFileSync(join(ROOT, 'zola.toml'), 'utf8'));
const catalogue = parse(readFileSync(join(ROOT, 'data/projects.toml'), 'utf8'));
const base = config.base_url.replace(/\/$/, '');
const oneLine = (text) => text.replace(/\s+/g, ' ').trim();

const lines = [
  `# ${config.title}`,
  '',
  `> ${oneLine(config.description)}`,
  '',
  `${config.extra.author} builds software for evidence: tools that make AI agents prove their`,
  'work, honest scientific instruments in the browser, and knowledge bases that can be checked.',
  'Every project below links to its source on GitHub; most have a live site.',
  '',
  '## Pages',
  '',
  `- [Home](${base}/): who I am, featured projects, activity`,
  `- [Projects](${base}/projects/): the full catalogue, filterable`,
  `- [Stack](${base}/stack/): the tools and practices behind every project`,
  '',
];

for (const [key, label] of Object.entries(catalogue.categories)) {
  const projects = catalogue.projects.filter((p) => p.category === key);
  if (!projects.length) continue;
  lines.push(`## ${label}`, '');
  for (const p of projects) {
    const live = p.url ? ` Live: ${p.url}` : '';
    lines.push(
      `- [${p.name}](https://github.com/korczis/${p.repo}): ${oneLine(p.tagline)}${live}`,
    );
  }
  lines.push('');
}

lines.push(
  '## Optional',
  '',
  `- [Majordomus](https://majordomus.dev): the supervisory layer this site is built under`,
  `- [GitHub profile](https://github.com/korczis)`,
  '',
);

const text = lines.join('\n');
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(TARGET, 'utf8');
  } catch {}
  if (current !== text) {
    console.error('static/llms.txt is stale: run npm run llms');
    process.exit(1);
  }
  console.log('static/llms.txt is current');
} else {
  writeFileSync(TARGET, text);
  console.log('static/llms.txt written');
}
