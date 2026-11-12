#!/usr/bin/env node
// Derives static/llms.txt and static/llms-full.txt (https://llmstxt.org) from zola.toml,
// data/projects.toml and data/index.json, so a language model reading the site gets the same
// catalogue a person sees, in plain Markdown: the curated projects, then every original repository.
//
// usage: node scripts/build-llms.mjs           write both files
//        node scripts/build-llms.mjs --check   exit 1 if either committed file is stale
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'static/llms.txt');
const TARGET_FULL = join(ROOT, 'static/llms-full.txt');
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
  `- [About](${base}/about/): profile, CV, languages over the years, sources`,
  `- [Projects](${base}/projects/): the curated catalogue, filterable, with project details`,
  `- [Repositories](${base}/repositories/): every original repository on GitHub and GitLab`,
  `- [Stack](${base}/stack/): the tools and practices behind every project`,
  '',
];

for (const [key, category] of Object.entries(catalogue.categories)) {
  const projects = catalogue.projects.filter((p) => p.category === key);
  if (!projects.length) continue;
  lines.push(`## ${category.name}`, '', `${oneLine(category.description)} ${base}/projects/${key}/`, '');
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
  `- [Full index for language models](${base}/llms-full.txt): every original repository with its links`,
  `- [GitHub profile](https://github.com/korczis)`,
  `- [GitLab profile](https://gitlab.com/korczis)`,
  '',
);

const text = lines.join('\n');

// llms-full.txt: the summary above, then every original repository, grouped by inferred category.
const index = JSON.parse(readFileSync(join(ROOT, 'data/index.json'), 'utf8'));
const full = [text.trimEnd(), '', '## Every original repository', '',
  `> ${index.counts.own} repositories on GitHub and GitLab where the owner wrote at least half of the commits,`,
  `> derived ${index.generated_at}. Forks and mirrors (${index.counts.forks + index.counts.mirrors}) are not listed.`, ''];
for (const [key, category] of Object.entries(catalogue.categories)) {
  const repos = index.repos.filter((r) => r.category === key);
  if (!repos.length) continue;
  full.push(`### ${category.name} (${repos.length})`, '');
  for (const r of repos) {
    const links = [r.hosts.github && `GitHub ${r.hosts.github}`, r.hosts.gitlab && `GitLab ${r.hosts.gitlab}`, r.site && `site ${r.site}`].filter(Boolean).join('; ');
    const facts = [r.language, r.created_at.slice(0, 4)].filter(Boolean).join(', ');
    full.push(`- ${r.name}${r.description ? `: ${oneLine(r.description)}` : ''} (${facts}). ${links}`);
  }
  full.push('');
}
const fullText = full.join('\n');

const outputs = [[TARGET, text], [TARGET_FULL, fullText]];
if (process.argv.includes('--check')) {
  const stale = outputs.filter(([path, content]) => {
    try {
      return readFileSync(path, 'utf8') !== content;
    } catch {
      return true;
    }
  });
  if (stale.length) {
    for (const [path] of stale) console.error(`${path.slice(ROOT.length + 1)} is stale: run npm run llms`);
    process.exit(1);
  }
  console.log('static/llms.txt and llms-full.txt are current');
} else {
  for (const [path, content] of outputs) writeFileSync(path, content);
  console.log('static/llms.txt and llms-full.txt written');
}
