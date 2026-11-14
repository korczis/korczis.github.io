#!/usr/bin/env node
// Derives data/recent.json: the original repositories with a commit in the last 48 months, in
// detail, each placed in the smallest period (12, 24 or 48 months) that holds its last commit. "Recent" is the date of the last commit, never the host's activity date (GitLab stamps
// every imported project with the import day). For each: the last 30 commits, language breakdown, README
// excerpt, topics, links. Reads data/index.json for the candidates; asks GitHub and GitLab
// through their CLIs (`gh api`, `glab api`).
//
// The fields that come from data/index.json (category, curated, description, ...) and the period
// are derivation: --derive re-applies them to the stored measurements offline, so a change to the
// category rules or the catalogue reaches recent.json without the network.
//
// usage: npm run recent                                   measure (gh, glab) and derive
//        node scripts/fetch-recent.mjs --derive [--check] re-derive the stored file offline
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { GitLabBudgetError, gitlabClient } from './lib/gitlab.mjs';
import { identity, pool } from './lib/derive.mjs';

const run = promisify(execFile);
if (process.argv.includes('--check') && !process.argv.includes('--derive')) {
  console.error('✗ --check needs --derive (the measurement itself is never checked offline)');
  process.exit(2);
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'data/recent.json');
const me = identity();
const PERIODS = [12, 24, 48]; // months
const COMMITS = 30; // the latest commits kept per project: the snapshot its pulse starts from
const DAYS = Math.round((PERIODS[PERIODS.length - 1] * 365.25) / 12);
const index = JSON.parse(readFileSync(join(ROOT, 'data/index.json'), 'utf8'));
const MONTH = 86400000 * 365.25 / 12;

// One row of recent.json: the index's facts about the repository, the measured detail, and the
// smallest period that holds its last commit, counted from the moment of measurement.
function row(r, detail, now) {
  const months = (now - Date.parse(detail.last_commit)) / MONTH;
  return {
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
  };
}

function document(repos, now, candidates) {
  repos.sort((a, b) => b.last_commit.localeCompare(a.last_commit));
  return {
    schema: 'korczis-hub-recent/v1',
    generated_at: new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    window_days: DAYS,
    periods: PERIODS.map((p) => ({ months: p, repos: repos.filter((r) => r.period === p).length })),
    rule: 'a repository counts when its default branch has a commit in the window; host activity dates are ignored',
    candidates,
    repos,
  };
}
const text = (recent) => `${JSON.stringify(recent, null, 1)}\n`;

if (process.argv.includes('--derive')) {
  // Offline: the stored measurements (commits, languages, README) with the index applied again; a
  // repository the index no longer lists (hidden, a mirror now) leaves.
  const stored = JSON.parse(readFileSync(TARGET, 'utf8'));
  const now = Date.parse(stored.generated_at);
  const byName = new Map(index.repos.map((r) => [r.name, r]));
  const repos = stored.repos.filter((x) => byName.has(x.name)).map((x) => row(byName.get(x.name), x, now));
  const recent = document(repos, now, stored.candidates);
  if (process.argv.includes('--check')) {
    if (readFileSync(TARGET, 'utf8') !== text(recent)) {
      console.error('✗ data/recent.json is stale against data/index.json; run npm run derive');
      process.exit(1);
    }
    console.log(`data/recent.json: ${repos.length} repositories, current against data/index.json`);
  } else {
    writeFileSync(TARGET, text(recent));
    console.log(`data/recent.json: ${repos.length} repositories re-derived (${stored.repos.length - repos.length} left the index)`);
  }
  process.exit(0);
}

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
    cli('gh', [`repos/${me.github}/${name}/commits?per_page=${COMMITS}`]),
    cli('gh', [`repos/${me.github}/${name}/languages`]),
    cli('gh', ['-H', 'Accept: application/vnd.github.raw', `repos/${me.github}/${name}/readme`]),
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

// GitLab through the shared client (glab locally, REST in CI, one time budget).
const gl = gitlabClient();
async function gitlab(name) {
  const id = encodeURIComponent(`${me.gitlab}/${name}`);
  const project = await gl(`projects/${id}`);
  if (!project) return {};
  const branch = encodeURIComponent(project.default_branch ?? 'main');
  const [commits, langs, readme] = await Promise.all([
    gl(`projects/${id}/repository/commits?per_page=${COMMITS}&ref_name=${branch}`),
    gl(`projects/${id}/languages`),
    gl(`projects/${id}/repository/files/README.md/raw?ref=${branch}`, { raw: true }),
  ]);
  const list = commits ?? [];
  const c = list[0];
  return {
    last_commit: c?.committed_date ?? null,
    last_message: c?.title ?? null,
    commits: list.map((x) => ({ at: x.committed_date, message: x.title, url: x.web_url })),
    languages: Object.entries(langs ?? {}).map(([n, share]) => ({ name: n, share: Math.round(share * 10) / 10 }))
      .sort((a, b) => b.share - a.share).slice(0, 6),
    readme: excerpt(readme),
  };
}

// When GitLab cannot be read in time, a project keeps its last measured record: the site loses
// nothing, and the run says how many were kept.
const previous = (() => { try { return JSON.parse(readFileSync(TARGET, 'utf8')).repos; } catch { return []; } })();
let kept = 0;
async function detailOf(r) {
  if (r.hosts.github) return github(r.name);
  try {
    return await gitlab(r.name);
  } catch (error) {
    const before = previous.find((p) => p.name === r.name);
    console.error(`GitLab ${r.name}: ${error instanceof GitLabBudgetError ? 'budget spent' : error.message}; ${before ? 'kept the last measurement' : 'skipped'}`);
    if (!before) return {};
    kept += 1;
    return { last_commit: before.last_commit, last_message: before.last_message, commits: before.commits ?? [], languages: before.languages, readme: before.readme };
  }
}

// Candidates: anything whose host says it moved in the window; the last commit then decides.
const candidates = index.repos.filter((r) => r.pushed_at >= cutoff);
const out = (await pool(candidates, async (r) => {
  const detail = await detailOf(r);
  return detail.last_commit && detail.last_commit >= cutoff ? row(r, detail, now) : null;
}, 3)).filter(Boolean);

const recent = document(out, now, candidates.length);
writeFileSync(TARGET, text(recent));
console.log(`data/recent.json: ${out.length} of ${candidates.length} candidates have a commit in the last ${PERIODS.at(-1)} months ` +
  `(${recent.periods.map((p) => `${p.repos} within ${p.months}`).join(', ')}); ` +
  `${out.filter((r) => r.readme).length} with a README excerpt` +
  `${kept ? `; ${kept} GitLab project(s) kept from the last measurement` : ''}`);
