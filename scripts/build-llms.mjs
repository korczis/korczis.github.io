#!/usr/bin/env node
// Derives static/llms.txt and static/llms-full.txt (https://llmstxt.org) from zola.toml, the
// front matter of the top-level pages, data/projects.toml and data/index.json, so a language model reading the site gets the same
// catalogue a person sees, in plain Markdown: the curated projects, then every original repository.
//
// The order is for a reader with a budget (an answer engine, a sourcing assistant): while
// data/cv.toml [hire] available is true, the summary blockquote starts with the owner's name and
// headline, then the workplace and regions and the /hire/ URL; '## Hire' is the first section,
// and '## Skills' follows it, each skill measured in data/index.json (skills) with its evidence.
// With available = false the summary is the site's description and the Hire section is gone.
//
// usage: node scripts/build-llms.mjs           write both files
//        node scripts/build-llms.mjs --check   exit 1 if either committed file is stale, or (while the
//                                              owner is available) if the summary does not start with
//                                              the name and the headline and name the /hire/ URL, if
//                                              '## Hire' is not the first section, or if a skill line
//                                              names no skill of data/index.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHECK, ROOT, config as siteConfig, contentPages, identity, isDefault, languages, readJson, readToml, report, slug } from './lib/derive.mjs';
import { loadGlossary } from './lib/terms.mjs';
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
const cv = readToml('data/cv.toml');
const h = cv.hire?.available ? cv.hire : null;
const github = readJson('data/github.json');
const index = readJson('data/index.json');
const and = (items) => new Intl.ListFormat('en', { type: 'conjunction' }).format(items);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const hireUrl = `${base}/hire/`;
const resumeUrl = `${base}/resume.json`;

// The summary: who, as what, where and how to hire, while the owner is available (ADR 0007).
const summary = h
  ? `${me.author}: ${h.headline}. ${capital(h.workplace)}, ${h.regions}. Available for ${and(h.engagement)} work: ${hireUrl}`
  : oneLine(config.description);
const lines = [
  `# ${config.title}`,
  '',
  `> ${summary}`,
  '',
  ...(h ? [oneLine(config.description), ''] : []),
];

// Availability for hire: the owner's facts in data/cv.toml (ADR 0004, 0007), the first section, so
// a language model asked about the owner reads them before the catalogue.
if (h) {
  lines.push(
    '## Hire',
    '',
    `${me.author} is available for hire: ${h.headline}. ${hireUrl}`,
    '',
    ...h.roles.map((r) => `- ${r}`),
    `- Engagement: ${h.engagement.join(', ')}; ${h.workplace}, ${h.regions}${h.since ? `; available since ${h.since}` : ''}`,
    ...(h.rate_from ? [`- Contract rate: from ${h.rate_currency} ${h.rate_from} per ${h.rate_unit}, B2B; full-time compensation by conversation`] : []),
    ...(github.profile?.email ? [`- Contact: ${github.profile.email}`] : []),
    ...Object.values(cv.links ?? {}).map((u) => `- Profile: ${u}`),
    `- CV as data: [JSON Resume](${resumeUrl}), also in Czech at ${base}/cs/resume.json`,
    '',
  );
}

// Skills with their evidence, measured in data/index.json: every language and technology that the
// glossary defines (a page that explains it), the count that measures it, and the work that shows it.
const glossary = loadGlossary(ROOT);
const termPages = new Set(contentPages().filter((p) => isDefault(p.lang) && p.rel.startsWith('glossary/')).map((p) => p.rel.replace(/^glossary\/|\.md$/g, '')));
const termUrl = (name) => {
  const id = glossary.byName.get(name.toLowerCase());
  return id && termPages.has(id) ? `${base}/glossary/${id}/` : null;
};
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const skillLines = [
  ...index.skills.languages.map((s) => ({ s, what: `primary language of ${count(s.repos, 'original repository', 'original repositories')}`, evidence: s.evidence.map((e) => `[${e.name}](${e.url})`) })),
  ...index.skills.technologies.map((s) => ({ s, what: `in the stack of ${count(s.projects, 'curated project', 'curated projects')}`, evidence: s.evidence.map((e) => `[${e.name}](${me.repoUrl(e.repo)})`) })),
].filter(({ s }) => termUrl(s.name))
  .map(({ s, what, evidence }) => `- [${s.name}](${termUrl(s.name)}): ${what}; evidence: ${evidence.join(', ')}`);
if (skillLines.length) {
  lines.push('## Skills', '', `Measured from every original public repository on GitHub and GitLab, derived ${index.generated_at}.`, '', ...skillLines, '');
}

if (cv.roles?.length) {
  lines.push('## Experience', '');
  for (const r of cv.roles) {
    const span = `${r.start} to ${r.end ?? 'present'}`;
    lines.push(`- ${r.title}, ${r.organisation} (${span})${r.summary ? `: ${oneLine(r.summary)}` : ''}`);
  }
  for (const e of cv.education ?? []) lines.push(`- Education: ${e.degree}, ${e.institution}${e.start ? ` (${e.start} to ${e.end ?? 'present'})` : ''}`);
  if (cv.languages?.length) lines.push(`- Languages: ${cv.languages.map((l) => `${l.name} (${l.level})`).join(', ')}`);
  lines.push('');
}

lines.push(
  '## Pages',
  '',
  ...pages.map((p) => `- [${p.fm.title}](${p.url}): ${oneLine(p.fm.description)}`),
  ...languages().filter((l) => !isDefault(l)).map((l) => `- [${config.languages[l].title} (${l})](${base}/${l}/): ${oneLine(config.languages[l].description)}`),
  '',
);

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
const recent = readJson('data/recent.json');
// Every original repository has its page (scripts/build-work.mjs), dated as measured: the first
// year (creation or the oldest commit read), the last commit, and recent (its period) or archive.
// Its page in every language: the default one at the root, every other under /<lang>/.
const workPages = (name) => languages().map((l) => `${isDefault(l) ? 'page' : `${l} page`} ${base}${isDefault(l) ? '' : `/${l}`}/work/${slug(name)}/`);
const workPage = new Set(recent.repos.map((r) => r.name));
const detail = new Map(recent.repos.map((r) => [r.name, r]));
const datesOf = (r) => {
  const d = detail.get(r.name);
  if (!d) return r.created_at.slice(0, 4);
  const first = Math.min(...[d.created_at, ...d.commits.map((c) => c.at)].filter(Boolean).map((x) => new Date(x).getUTCFullYear()));
  const last = new Date(d.last_commit ?? d.pushed_at).getUTCFullYear();
  return `${first < last ? `${first}–${last}` : last}, ${d.period ? `active within ${d.period} months` : 'archive'}`;
};
const full = [text.trimEnd(), '', '## Every original repository', '',
  `> ${index.counts.own} repositories on GitHub and GitLab where the owner wrote at least half of the commits,`,
  `> derived ${index.generated_at}. Forks and mirrors (${index.counts.forks + index.counts.mirrors}) are not listed.`, ''];
for (const [key, category] of Object.entries(catalogue.categories)) {
  const repos = index.repos.filter((r) => r.category === key);
  if (!repos.length) continue;
  full.push(`### ${category.name} (${repos.length})`, '');
  for (const r of repos) {
    const links = [...(workPage.has(r.name) ? workPages(r.name) : []), r.hosts.github && `GitHub ${r.hosts.github}`, r.hosts.gitlab && `GitLab ${r.hosts.gitlab}`, r.site && `site ${r.site}`].filter(Boolean).join('; ');
    const facts = [r.language, datesOf(r), r.stars ? `${r.stars} stars` : null, r.supervised ? 'supervised by Majordomus' : null].filter(Boolean).join(', ');
    full.push(`- ${r.name}${r.description ? `: ${oneLine(r.description)}` : ''} (${facts}). ${links}`);
  }
  full.push('');
}
const fullText = full.join('\n');

// What the order promises, asserted on the text (the committed file must equal it).
function promises(body) {
  const found = [];
  if (!h) return found;
  const quote = body.split('\n').find((l) => l.startsWith('> ')) ?? '';
  if (!quote.startsWith(`> ${me.author}: ${h.headline}`)) found.push(`static/llms.txt: the summary does not start with the name and the headline ("${quote.slice(0, 80)}")`);
  for (const part of [h.workplace, hireUrl]) if (!quote.toLowerCase().includes(part.toLowerCase())) found.push(`static/llms.txt: the summary does not name ${part}`);
  const first = body.split('\n').find((l) => l.startsWith('## '));
  if (first !== '## Hire') found.push(`static/llms.txt: the first section is "${first}", not "## Hire"`);
  const names = new Set([...index.skills.languages, ...index.skills.technologies].map((x) => x.name));
  const section = body.split('\n## Skills\n')[1]?.split('\n## ')[0];
  if (!section) found.push('static/llms.txt: no "## Skills" section');
  for (const l of (section ?? '').split('\n').filter((x) => x.startsWith('- '))) {
    const name = l.match(/^- \[([^\]]+)\]/)?.[1];
    if (!names.has(name)) found.push(`static/llms.txt: the skill line "${l.slice(0, 60)}" names no skill of data/index.json`);
  }
  return found;
}

const outputs = [[TARGET, text], [TARGET_FULL, fullText]];
if (CHECK) {
  const stale = outputs.filter(([path, content]) => {
    try {
      return readFileSync(path, 'utf8') !== content;
    } catch {
      return true;
    }
  });
  const findings = [...stale.map(([path]) => `${path.slice(ROOT.length + 1)} is stale`), ...promises(readFileSync(TARGET, 'utf8')), ...promises(text)];
  report([...new Set(findings)], `static/llms.txt and llms-full.txt are current${h ? '; the summary names the owner, the headline and /hire/, Hire is the first section, every skill is measured' : ''}`);
} else {
  for (const [path, content] of outputs) writeFileSync(path, content);
  console.log('static/llms.txt and llms-full.txt written');
}
