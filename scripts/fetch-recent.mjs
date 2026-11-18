#!/usr/bin/env node
// Derives data/recent.json: EVERY original repository of data/index.json in detail (the one set;
// ADR 0003), each placed in the smallest period of data/projects.toml [recent] that holds its last
// commit, or in the archive (period null) when its last commit is older than the longest period.
// "Recent" is the date of the last commit, never the host's activity date (GitLab stamps every
// imported project with the import day). For each: the latest commits, language breakdown, README
// excerpt, topics, links, Majordomus supervision. Every repository here gets its own /work/ page
// (scripts/build-work.mjs), recent or archive alike.
//
// A repository is asked again (through the one connection to GitHub and GitLab,
// scripts/lib/forge.mjs) only when its host saw activity after the stored measurement, or when it
// has none; everything else keeps its measurement, so a refresh asks a handful, not every
// repository. --all asks every one again.
//
// The fields that come from data/index.json (category, curated, description, ...) and the period
// are derivation: --derive re-applies them to the stored measurements offline, so a change to the
// category rules or the catalogue reaches recent.json without the network. --derive --check also
// fails when an original repository of the index has no measurement here (every one must have a
// page).
//
// usage: npm run recent                                   measure (gh, glab) and derive
//        node scripts/fetch-recent.mjs --all              ask every repository again
//        node scripts/fetch-recent.mjs --derive [--check] re-derive the stored file offline
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forges } from './lib/forge.mjs';
import { GitLabBudgetError, gitlabClient } from './lib/gitlab.mjs';
import { identity, pool, readToml } from './lib/derive.mjs';
import { cliArgs } from './lib/cli.mjs';
import { plain } from './lib/plain.mjs';

cliArgs({ '--derive': true, '--check': true, '--all': true });

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
// A repository whose last commit is older than the longest period is archive: period null.
function row(r, detail, now) {
  const months = detail.last_commit ? (now - Date.parse(detail.last_commit)) / MONTH : Infinity;
  return {
    name: r.name,
    period: PERIODS.find((p) => months <= p) ?? null,
    description: r.description,
    category: r.category,
    language: r.language,
    created_at: r.created_at,
    pushed_at: r.pushed_at,
    last_commit: detail.last_commit ?? null,
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

// Newest last commit first (the host's push date stands in for a repository with no readable
// commit), the name breaking ties, so the order is the same on every machine.
const lastOf = (r) => r.last_commit ?? r.pushed_at ?? '';
function document(repos, now, asked) {
  repos.sort((a, b) => lastOf(b).localeCompare(lastOf(a)) || a.name.localeCompare(b.name));
  return {
    schema: 'korczis-hub-recent/v2',
    generated_at: new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    window_days: DAYS,
    periods: PERIODS.map((p) => ({ months: p, repos: repos.filter((r) => r.period === p).length })),
    archive: repos.filter((r) => r.period === null).length,
    rule: 'every original repository of data/index.json; a repository is recent when its default branch has a commit in the window, archive otherwise; host activity dates are ignored',
    asked,
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
  const recent = document(repos, now, stored.asked ?? stored.candidates ?? 0);
  if (process.argv.includes('--check')) {
    // The one set: every original repository of the index is measured here, so each has a page.
    const measured = new Set(repos.map((r) => r.name));
    const missing = index.repos.filter((r) => !measured.has(r.name)).map((r) => r.name);
    if (missing.length) {
      console.error(`✗ data/recent.json has no measurement of ${missing.length} original repositories of data/index.json (${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', …' : ''}); run npm run recent`);
      process.exit(1);
    }
    if (readFileSync(TARGET, 'utf8') !== text(recent)) {
      console.error('✗ data/recent.json is stale against data/index.json; run npm run derive');
      process.exit(1);
    }
    console.log(`data/recent.json: ${repos.length} repositories (${recent.archive} archive), every original of data/index.json, current`);
  } else {
    writeFileSync(TARGET, text(recent));
    console.log(`data/recent.json: ${repos.length} repositories re-derived (${stored.repos.length - repos.length} left the index)`);
  }
  process.exit(0);
}

const now = Date.now();

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
const stored = (() => { try { return JSON.parse(readFileSync(TARGET, 'utf8')); } catch { return { repos: [] }; } })();
const previous = stored.repos ?? [];
const measuredAt = stored.generated_at ?? '';
const keep = (before) => ({ last_commit: before.last_commit, last_message: before.last_message, commits: before.commits ?? [], languages: before.languages ?? [], readme: before.readme ?? null });
let kept = 0;
let asked = 0;
let unchanged = 0;
async function detailOf(r) {
  const before = previous.find((p) => p.name === r.name);
  // No activity on the host since the stored measurement: it still holds.
  if (!process.argv.includes('--all') && before?.last_commit && r.pushed_at && r.pushed_at <= measuredAt) {
    unchanged += 1;
    return keep(before);
  }
  asked += 1;
  try {
    const d = await forge.detail(r.hosts.github ?? r.hosts.gitlab, { commits: COMMITS });
    const latest = d.commits?.[0];
    return { last_commit: latest?.at ?? null, last_message: latest?.message ?? null, commits: d.commits ?? [], languages: d.languages ?? [], readme: excerpt(d.readme) };
  } catch (error) {
    console.error(`${r.name}: ${error instanceof GitLabBudgetError ? 'GitLab budget spent' : error.message}; ${before ? 'kept the last measurement' : 'listed without detail'}`);
    if (!before) return {};
    kept += 1;
    return keep(before);
  }
}

// Every original repository of the index: the one set the /work/ pages are made from. A
// repository no forge could describe is still listed (its page says what is known).
const out = await pool(index.repos, async (r) => row(r, await detailOf(r), now), 3);

const recent = document(out, now, asked);
writeFileSync(TARGET, text(recent));
console.log(`data/recent.json: ${out.length} original repositories, ${out.length - recent.archive} with a commit in the last ${PERIODS.at(-1)} months ` +
  `(${recent.periods.map((p) => `${p.repos} within ${p.months}`).join(', ')}), ${recent.archive} archive; ` +
  `${asked} asked, ${unchanged} unchanged since the last measurement; ` +
  `${out.filter((r) => r.readme).length} with a README excerpt` +
  `${out.filter((r) => !r.last_commit).length ? `; ${out.filter((r) => !r.last_commit).length} without a readable commit` : ''}` +
  `${kept ? `; ${kept} kept from the last measurement after an error` : ''}`);
