#!/usr/bin/env node
// Derives static/llms.txt and static/llms-full.txt (https://llmstxt.org) from zola.toml, the
// front matter of the top-level pages, data/projects.toml and data/index.json, so a language model reading the site gets the same
// catalogue a person sees, in plain Markdown: the curated projects, then every original repository.
//
// usage: node scripts/build-llms.mjs           write both files
//        node scripts/build-llms.mjs --check   exit 1 if either committed file is stale
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHECK, ROOT, config as siteConfig, contentPages, identity, isDefault, languages, readJson, readToml, report, slug } from './lib/derive.mjs';
import { cliArgs } from './lib/cli.mjs';

cliArgs({ '--check': true }, { derived: true });

const TARGET = join(ROOT, 'static/llms.txt');
const TARGET_FULL = join(ROOT, 'static/llms-full.txt');
const config = siteConfig();
const catalogue = readToml('data/projects.toml');
const me = identity();
const base = me.base;
const oneLine = (text) => text.replace(/\s+/g, ' ').trim();

// The site's top-level pages (the home page, every top-level page and section) from their own
// front matter in the default language, then each other language's home: nothing typed here.
const pages = contentPages().filter((p) => p.fm && isDefault(p.lang) && /^(_index|[^/]+|[^/]+\/_index)\.md$/.test(p.rel))
  .map((p) => ({ url: p.rel === '_index.md' ? `${base}/` : `${base}/${p.rel.replace(/(\/_index)?\.md$/, '')}/`, fm: p.fm }))
  .sort((x, y) => (x.url === `${base}/` ? -1 : y.url === `${base}/` ? 1 : x.url.localeCompare(y.url)));
const lines = [
  `# ${config.title}`,
  '',
  `> ${oneLine(config.description)}`,
  '',
  '## Pages',
  '',
  ...pages.map((p) => `- [${p.fm.title}](${p.url}): ${oneLine(p.fm.description)}`),
  ...languages().filter((l) => !isDefault(l)).map((l) => `- [${config.languages[l].title} (${l})](${base}/${l}/): ${oneLine(config.languages[l].description)}`),
  '',
];

for (const [key, category] of Object.entries(catalogue.categories)) {
  const projects = catalogue.projects.filter((p) => p.category === key);
  if (!projects.length) continue;
  lines.push(`## ${category.name}`, '', `${oneLine(category.description)} ${base}/projects/${key}/`, '');
  for (const p of projects) {
    const live = p.url ? ` Live: ${p.url}` : '';
    lines.push(
      `- [${p.name}](${me.repoUrl(p.repo)}): ${oneLine(p.tagline)}${live}`,
    );
  }
  lines.push('');
}

// The supervisory layer the site is built under, as the catalogue describes it.
const majordomus = me.majordomusUrl && catalogue.projects.find((p) => p.url?.replace(/\/$/, '') === me.majordomusUrl.replace(/\/$/, ''));
lines.push(
  '## Optional',
  '',
  ...(majordomus ? [`- [${majordomus.name}](${me.majordomusUrl}): ${oneLine(majordomus.tagline)}`] : []),
  `- [Full index for language models](${base}/llms-full.txt): every original repository with its links`,
  `- [GitHub profile](${me.githubUrl})`,
  `- [GitLab profile](${me.gitlabUrl})`,
  '',
);

const text = lines.join('\n');

// llms-full.txt: the summary above, then every original repository, grouped by inferred category.
const index = readJson('data/index.json');
const recent = readJson('data/recent.json');
const workPage = new Map(recent.repos.map((r) => [r.name, `${base}/work/${slug(r.name)}/`]));
const full = [text.trimEnd(), '', '## Every original repository', '',
  `> ${index.counts.own} repositories on GitHub and GitLab where the owner wrote at least half of the commits,`,
  `> derived ${index.generated_at}. Forks and mirrors (${index.counts.forks + index.counts.mirrors}) are not listed.`, ''];
for (const [key, category] of Object.entries(catalogue.categories)) {
  const repos = index.repos.filter((r) => r.category === key);
  if (!repos.length) continue;
  full.push(`### ${category.name} (${repos.length})`, '');
  for (const r of repos) {
    const links = [workPage.has(r.name) && `article ${workPage.get(r.name)}`, r.hosts.github && `GitHub ${r.hosts.github}`, r.hosts.gitlab && `GitLab ${r.hosts.gitlab}`, r.site && `site ${r.site}`].filter(Boolean).join('; ');
    const facts = [r.language, r.created_at.slice(0, 4)].filter(Boolean).join(', ');
    full.push(`- ${r.name}${r.description ? `: ${oneLine(r.description)}` : ''} (${facts}). ${links}`);
  }
  full.push('');
}
const fullText = full.join('\n');

const outputs = [[TARGET, text], [TARGET_FULL, fullText]];
if (CHECK) {
  const stale = outputs.filter(([path, content]) => {
    try {
      return readFileSync(path, 'utf8') !== content;
    } catch {
      return true;
    }
  });
  report(stale.map(([path]) => `${path.slice(ROOT.length + 1)} is stale`), 'static/llms.txt and llms-full.txt are current');
} else {
  for (const [path, content] of outputs) writeFileSync(path, content);
  console.log('static/llms.txt and llms-full.txt written');
}
