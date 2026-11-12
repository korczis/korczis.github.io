#!/usr/bin/env node
// Derives data/recent.json: the original repositories with a commit in the last 48 months, in
// detail, each placed in the smallest period (12, 24 or 48 months) that holds its last commit. "Recent" is the date of the last commit, never the host's activity date (GitLab stamps
// every imported project with the import day). For each: the last 30 commits, language breakdown, README
// excerpt, topics, links. Reads data/index.json for the candidates; asks GitHub and GitLab
// through their CLIs (`gh api`, `glab api`).
//
// usage: npm run recent
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOGIN = 'korczis';
const PERIODS = [12, 24, 48]; // months
const COMMITS = 30; // the latest commits kept per project: the snapshot its pulse starts from
const DAYS = Math.round((PERIODS[PERIODS.length - 1] * 365.25) / 12);
const index = JSON.parse(readFileSync(join(ROOT, 'data/index.json'), 'utf8'));
const now = Date.now();
const cutoff = new Date(now - DAYS * 86400000).toISOString();

// A missing file (404) is an answer: null. A rate limit is not: wait and ask again, up to six times,
// so a busy API never silently drops a project from the year.
async function cli(tool, args) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { stdout } = await run(tool, ['api', ...args], { maxBuffer: 32 * 1024 * 1024 });
      return stdout;
    } catch (error) {
      const why = String(error.stderr ?? error.message);
      if (!/429|rate limit|too many|502|503/i.test(why) || attempt >= 6) return null;
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 3000));
    }
  }
}
const json = (text) => { try { return text ? JSON.parse(text) : null; } catch { return null; } };

// The first paragraph of prose in a README: no headings, badges, images, HTML or code.
function excerpt(markdown) {
  if (!markdown) return null;
  const text = markdown.replace(/```[\s\S]*?```/g, '').replace(/<[^>]+>/g, ' ');
  for (const block of text.split(/\n\s*\n/)) {
    const line = block.trim();
    if (!line || /^(#|!\[|\[!\[|\||>|-{3}|={3}|\*{3}|[-*+] )/.test(line)) continue;
    const plain = line.replace(/!\[[^\]]*]\([^)]*\)/g, '').replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
      .replace(/[*_`]/g, '').replace(/\(\s*\)/g, '').replace(/:\s*\./g, '.').replace(/\s+([,.;:])/g, '$1').replace(/\s+/g, ' ').trim();
    // GitLab's project template README says nothing about the project.
    if (plain.length < 40 || /get started with GitLab|Getting started|Add your files|Already a pro|edit this README|makeareadme/i.test(plain)) continue;
    return plain.length > 420 ? `${plain.slice(0, 417).replace(/\s+\S*$/, '')}…` : plain;
  }
  return null;
}

function shares(bytes) {
  const total = Object.values(bytes ?? {}).reduce((a, b) => a + b, 0);
  if (!total) return [];
  return Object.entries(bytes).map(([name, n]) => ({ name, share: Math.round((n / total) * 1000) / 10 }))
    .sort((a, b) => b.share - a.share).slice(0, 6);
}

async function github(name) {
  const [commits, langs, readme] = await Promise.all([
    cli('gh', [`repos/${LOGIN}/${name}/commits?per_page=${COMMITS}`]),
    cli('gh', [`repos/${LOGIN}/${name}/languages`]),
    cli('gh', ['-H', 'Accept: application/vnd.github.raw', `repos/${LOGIN}/${name}/readme`]),
  ]);
  const list = json(commits) ?? [];
  const c = list[0];
  return {
    last_commit: c?.commit?.committer?.date ?? null,
    last_message: c?.commit?.message?.split('\n')[0] ?? null,
    commits: list.map((x) => ({ at: x.commit.committer.date, message: x.commit.message.split('\n')[0], url: x.html_url })),
    languages: shares(json(langs)),
    readme: excerpt(readme),
  };
}

async function gitlab(name) {
  const id = encodeURIComponent(`${LOGIN}/${name}`);
  const project = json(await cli('glab', [`projects/${id}`]));
  if (!project) return {};
  const branch = encodeURIComponent(project.default_branch ?? 'main');
  const [commits, langs, readme] = await Promise.all([
    cli('glab', [`projects/${id}/repository/commits?per_page=${COMMITS}&ref_name=${branch}`]),
    cli('glab', [`projects/${id}/languages`]),
    cli('glab', [`projects/${id}/repository/files/README.md/raw?ref=${branch}`]),
  ]);
  const list = json(commits) ?? [];
  const c = list[0];
  return {
    last_commit: c?.committed_date ?? null,
    last_message: c?.title ?? null,
    commits: list.map((x) => ({ at: x.committed_date, message: x.title, url: x.web_url })),
    languages: Object.entries(json(langs) ?? {}).map(([n, share]) => ({ name: n, share: Math.round(share * 10) / 10 }))
      .sort((a, b) => b.share - a.share).slice(0, 6),
    readme: excerpt(readme),
  };
}

// Candidates: anything whose host says it moved in the window; the last commit then decides.
const candidates = index.repos.filter((r) => r.pushed_at >= cutoff);
const POOL = 3;
const out = [];
let next = 0;
await Promise.all(Array.from({ length: POOL }, async () => {
  while (next < candidates.length) {
    const r = candidates[next++];
    const detail = r.hosts.github ? await github(r.name) : await gitlab(r.name);
    if (!detail.last_commit || detail.last_commit < cutoff) continue;
    const months = (now - Date.parse(detail.last_commit)) / (86400000 * 365.25 / 12);
    out.push({
      name: r.name,
      period: PERIODS.find((p) => months <= p),
      description: r.description,
      category: r.category,
      language: r.language,
      created_at: r.created_at,
      last_commit: detail.last_commit,
      last_message: detail.last_message,
      commits: detail.commits ?? [],
      languages: detail.languages ?? [],
      readme: detail.readme,
      topics: r.topics ?? [],
      hosts: r.hosts,
      site: r.site,
      curated: r.curated,
      stars: r.stars,
    });
  }
}));
out.sort((a, b) => b.last_commit.localeCompare(a.last_commit));

const recent = {
  schema: 'korczis-hub-recent/v1',
  generated_at: new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  window_days: DAYS,
  periods: PERIODS.map((p) => ({ months: p, repos: out.filter((r) => r.period === p).length })),
  rule: 'a repository counts when its default branch has a commit in the window; host activity dates are ignored',
  candidates: candidates.length,
  repos: out,
};
writeFileSync(join(ROOT, 'data/recent.json'), `${JSON.stringify(recent, null, 1)}\n`);
console.log(`data/recent.json: ${out.length} of ${candidates.length} candidates have a commit in the last ${PERIODS.at(-1)} months ` +
  `(${recent.periods.map((p) => `${p.repos} within ${p.months}`).join(', ')}); ` +
  `${out.filter((r) => r.readme).length} with a README excerpt`);
