#!/usr/bin/env node
// Derives data/recent.json: the original repositories with a commit in the recent window, in
// detail, each placed in the smallest period of data/projects.toml [recent] that holds its last commit. "Recent" is the date of the last commit, never the host's activity date (GitLab stamps
// every imported project with the import day). For each: the last 30 commits, language breakdown, README
// excerpt, topics, links, Majordomus supervision. Reads data/index.json for the candidates; asks
// each repository's forge through the one connection to GitHub and GitLab (scripts/lib/forge.mjs).
//
// The fields that come from data/index.json (category, curated, description, ...) and the period
// are derivation: --derive re-applies them to the stored measurements offline, so a change to the
// category rules or the catalogue reaches recent.json without the network.
//
// usage: npm run recent                                   measure (gh, glab) and derive
//        node scripts/fetch-recent.mjs --derive [--check] re-derive the stored file offline
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forges } from './lib/forge.mjs';
import { GitLabBudgetError, gitlabClient } from './lib/gitlab.mjs';
import { identity, pool, readToml } from './lib/derive.mjs';
import { cliArgs } from './lib/cli.mjs';
import { plain } from './lib/plain.mjs';

cliArgs({ '--derive': true, '--check': true });

if (process.argv.includes('--check') && !process.argv.includes('--derive')) {
  console.error('✗ --check needs --derive (the measurement itself is never checked offline)');
  process.exit(2);
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'data/recent.json');
const me = identity();
// The window is declared in data/projects.toml [recent]: periods (months) and the latest commits
// kept per project (the snapshot its pulse starts from).
const { periods: PERIODS, commits: COMMITS } = readToml('data/projects.toml').recent;
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
    // Plain here, so a measurement kept from an earlier run is cleaned by --derive too.
    last_message: plain(detail.last_message),
    commits: (detail.commits ?? []).map((c) => ({ ...c, message: plain(c.message) })),
    languages: detail.languages ?? [],
    readme: plain(detail.readme),
    topics: r.topics ?? [],
    hosts: r.hosts,
    site: r.site,
    curated: r.curated,
    stars: r.stars,
    supervised: r.supervised ?? null,
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

// Every forge through one connection: GitHub through gh, GitLab through the shared client (glab
// locally, REST in CI, one time budget).
const forge = forges({ gitlab: gitlabClient() });

// When a forge cannot answer (an error, a spent GitLab budget), a repository keeps its last
// measured record: the site loses nothing, and the run says how many were kept.
const previous = (() => { try { return JSON.parse(readFileSync(TARGET, 'utf8')).repos; } catch { return []; } })();
let kept = 0;
async function detailOf(r) {
  try {
    const d = await forge.detail(r.hosts.github ?? r.hosts.gitlab, { commits: COMMITS });
    const latest = d.commits?.[0];
    return { last_commit: latest?.at ?? null, last_message: latest?.message ?? null, commits: d.commits ?? [], languages: d.languages ?? [], readme: excerpt(d.readme) };
  } catch (error) {
    const before = previous.find((p) => p.name === r.name);
    console.error(`${r.name}: ${error instanceof GitLabBudgetError ? 'GitLab budget spent' : error.message}; ${before ? 'kept the last measurement' : 'skipped'}`);
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
  `${kept ? `; ${kept} kept from the last measurement` : ''}`);
