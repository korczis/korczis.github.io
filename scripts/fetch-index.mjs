#!/usr/bin/env node
// Derives data/index.json: every public repository of korczis on GitHub and GitLab, with
// authorship measured from contributors, hosts merged by name, and a category inferred from the
// rules in data/projects.toml. Only original work is listed; forks and mirrors (repositories
// where someone else wrote most of the commits) are counted, never shown as the owner's work.
//
// usage: npm run index      (needs the authenticated CLIs `gh` and `glab`)
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parse } from 'smol-toml';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOGIN = 'korczis';
const OWNER_NAME = /korc(?:z|ak)/i; // commit author names: "Tomas Korcak", "korczis"
const POOL = 8;

const catalogue = parse(readFileSync(join(ROOT, 'data/projects.toml'), 'utf8'));
const curated = new Set(catalogue.projects.map((p) => p.repo.toLowerCase()));

async function gh(path) {
  const { stdout } = await run('gh', ['api', path], { maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) : null;
}

// GitLab through its CLI (`glab api`, authenticated: higher rate limits than anonymous REST). On a
// rate limit it waits and retries, up to six times.
// Where glab is not installed or not logged in (CI), the same API answers over REST, with
// GITLAB_TOKEN when the environment has one and anonymously otherwise.
let useGlab = null;
async function gitlab(path) {
  if (useGlab === null) {
    useGlab = await run('glab', ['auth', 'status']).then(() => true, () => false);
    if (!useGlab) console.error('glab unavailable: reading GitLab over REST');
  }
  for (let attempt = 0; ; attempt += 1) {
    try {
      if (useGlab) {
        const { stdout } = await run('glab', ['api', path.replace(/^\//, '')], { maxBuffer: 64 * 1024 * 1024 });
        return JSON.parse(stdout);
      }
      const headers = process.env.GITLAB_TOKEN ? { 'PRIVATE-TOKEN': process.env.GITLAB_TOKEN } : {};
      const response = await fetch(`https://gitlab.com/api/v4/${path.replace(/^\//, '')}`, { headers, signal: AbortSignal.timeout(30000) });
      if (response.ok) return response.json();
      const error = new Error(`GitLab ${path}: HTTP ${response.status}`);
      error.stderr = String(response.status);
      throw error;
    } catch (error) {
      if (!/429|rate limit/i.test(String(error.stderr ?? error.message)) || attempt >= 6) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 5000));
    }
  }
}

async function pool(items, worker, size = POOL) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await worker(items[index]);
    }
  }));
  return out;
}

// Share of the listed commits written by the owner: 1 = all, 0 = none, null = no history.
function ownerShare(contributors, isOwner) {
  const total = contributors.reduce((sum, c) => sum + c.count, 0);
  if (!total) return null;
  return contributors.filter(isOwner).reduce((sum, c) => sum + c.count, 0) / total;
}

// A description that says it is someone else's code marks a mirror even when the copy's own
// history was squashed into the owner's commits (osmocom-bb: "Mirror of git://...").
// Not when the copy is of the owner's own data (gists-search: "a mirror of korczis's gists").
const MIRROR = /\b(mirror of|mirrored from|cloned from|just cloned|leaked|repository from|fork of|copy of|import of)\b(?!\s+(?:korczis|my)\b)/i;
const curatedCategory = new Map(catalogue.projects.map((p) => [p.repo.toLowerCase(), p.category]));
const escape = (s) => s.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function infer(repo) {
  const known = curatedCategory.get(repo.name.toLowerCase());
  if (known) return known;
  const hay = ` ${repo.name} ${repo.description ?? ''} ${(repo.topics ?? []).join(' ')} `.toLowerCase().replace(/[-_]/g, ' ');
  const entries = Object.entries(catalogue.categories);
  // Keywords match from the start of a word (stems like "visuali" still match "visualisation").
  // Short keywords (ai, gis, sql) must be whole words: "ai" must not match "air".
  const hit = (k) => new RegExp(`\\b${escape(k)}${k.trim().length <= 3 ? '\\b' : ''}`, 'i').test(hay);
  for (const [key, c] of entries) if ((c.keywords ?? []).some(hit)) return key;
  for (const [key, c] of entries) if (repo.language && (c.languages ?? []).includes(repo.language)) return key;
  return 'tools';
}

async function githubRepos() {
  const pages = [];
  for (let page = 1; ; page += 1) {
    const batch = await gh(`users/${LOGIN}/repos?type=owner&per_page=100&page=${page}`);
    pages.push(...batch);
    if (batch.length < 100) break;
  }
  return pool(pages.filter((r) => !r.private), async (r) => {
    let share = null;
    if (!r.fork) {
      try {
        const list = (await gh(`repos/${LOGIN}/${r.name}/contributors?per_page=10&anon=1`)) ?? [];
        share = ownerShare(
          list.map((c) => ({ login: c.login, name: c.name, count: c.contributions })),
          (c) => c.login === LOGIN || OWNER_NAME.test(c.name ?? ''),
        );
      } catch {
        share = null;
      }
    }
    return {
      name: r.name,
      host: 'github',
      url: r.html_url,
      homepage: r.homepage || null,
      pages: r.has_pages ? `https://${LOGIN}.github.io/${r.name}/` : null,
      description: r.description,
      language: r.language,
      topics: r.topics ?? [],
      stars: r.stargazers_count,
      created_at: r.created_at,
      pushed_at: r.pushed_at,
      archived: r.archived,
      fork: r.fork,
      share,
    };
  });
}

async function gitlabRepos() {
  const all = [];
  for (let page = 1; ; page += 1) {
    const batch = await gitlab(`/users/${LOGIN}/projects?visibility=public&per_page=100&page=${page}`);
    // Authenticated, the API also returns private projects: only public ones are listed.
    all.push(...batch.filter((p) => p.visibility === 'public'));
    if (batch.length < 100) break;
  }
  return pool(all, async (p) => {
    let share = null;
    if (!p.forked_from_project) {
      try {
        const list = await gitlab(`/projects/${p.id}/repository/contributors?per_page=20`);
        share = ownerShare(list.map((c) => ({ name: c.name, count: c.commits })), (c) => OWNER_NAME.test(c.name ?? ''));
      } catch {
        share = null;
      }
    }
    return {
      name: p.path,
      host: 'gitlab',
      url: p.web_url,
      homepage: null,
      pages: null,
      description: p.description ? p.description.split('\n')[0].trim() : null,
      language: null,
      topics: p.topics ?? p.tag_list ?? [],
      stars: p.star_count,
      created_at: p.created_at,
      pushed_at: p.last_activity_at,
      archived: p.archived,
      fork: Boolean(p.forked_from_project),
      share,
    };
  }, 4);
}

// Everything below the fetch is derivation: it runs again with --derive on the stored index, so a
// change to the category rules or the catalogue needs no network.
function derive(allRepos, fetchedCounts, generatedAt) {
  // Owner-curated lists apply here, so they take effect with --derive and no network.
  const mirrorList = new Set((catalogue.index?.mirrors ?? []).map((n) => n.toLowerCase()));
  const hiddenList = new Set((catalogue.index?.hidden ?? []).map((n) => n.toLowerCase()));
  const counts = { ...fetchedCounts, mirrors: fetchedCounts.mirrors_measured ?? fetchedCounts.mirrors, hidden: 0 };
  counts.mirrors_measured = counts.mirrors;
  const repos = [];
  for (const r of allRepos) {
    const key = r.name.toLowerCase();
    if (mirrorList.has(key) || MIRROR.test(r.description ?? '')) counts.mirrors += 1;
    else if (hiddenList.has(key)) counts.hidden += 1;
    else repos.push(r);
  }
  counts.own = repos.length;
  for (const r of repos) {
    r.category = infer(r);
    r.curated = curated.has(r.name.toLowerCase());
  }
  repos.sort((a, b) => b.pushed_at.localeCompare(a.pushed_at));
  const years = {};
  const totals = {};
  const byCategory = {};
  for (const r of repos) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    if (!r.language) continue;
    const year = r.created_at.slice(0, 4);
    years[year] ??= {};
    years[year][r.language] = (years[year][r.language] ?? 0) + 1;
    totals[r.language] = (totals[r.language] ?? 0) + 1;
  }
  // Per category: how many, how many with a site, the most used language (the category pages' KPIs).
  const categoryDetail = {};
  for (const [key, n] of Object.entries(byCategory)) {
    const members = repos.filter((r) => r.category === key);
    const langCount = {};
    for (const r of members) if (r.language) langCount[r.language] = (langCount[r.language] ?? 0) + 1;
    const top = Object.entries(langCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    categoryDetail[key] = {
      repos: n,
      sites: members.filter((r) => r.site).length,
      top_language: top ? top[0] : null,
      since: members.map((r) => r.created_at.slice(0, 4)).sort()[0] ?? null,
    };
  }
  const languages = Object.entries(totals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, repos]) => ({ name, repos }));
  // Skills, each with its evidence: languages from the repositories (count and the three most
  // recently active), technologies from the curated projects' stacks, domains from the categories.
  const url = (r) => r.hosts.github ?? r.hosts.gitlab;
  const skills = {
    languages: languages.map((l) => ({
      name: l.name,
      repos: l.repos,
      evidence: repos.filter((r) => r.language === l.name).slice(0, 3).map((r) => ({ name: r.name, url: url(r) })),
    })),
    technologies: Object.values(catalogue.projects.reduce((acc, p) => {
      for (const tech of p.stack) {
        acc[tech] ??= { name: tech, projects: 0, evidence: [] };
        acc[tech].projects += 1;
        acc[tech].evidence.push({ name: p.name, repo: p.repo });
      }
      return acc;
    }, {})).filter((t) => !(t.name in totals)).sort((a, b) => b.projects - a.projects || a.name.localeCompare(b.name)),
  };
  // The recent window: the N most recently active repositories, as category -> language counts
  // (the landing's skillset sunburst) and their language totals.
  const windowSize = catalogue.index?.window ?? 100;
  const recent = repos.slice(0, windowSize);
  const mix = {};
  for (const r of recent) {
    mix[r.category] ??= {};
    const lang = r.language ?? 'Unspecified';
    mix[r.category][lang] = (mix[r.category][lang] ?? 0) + 1;
  }
  const recentWindow = {
    size: recent.length,
    from: recent.length ? recent[recent.length - 1].pushed_at : null,
    to: recent.length ? recent[0].pushed_at : null,
    mix,
  };
  return {
    schema: 'korczis-hub-index/v1',
    generated_at: generatedAt,
    rule: 'original = the owner wrote at least half of the listed commits; forks and mirrors are counted, not listed',
    counts,
    all_repos: allRepos,
    by_category: byCategory,
    categories: categoryDetail,
    languages,
    languages_by_year: years,
    skills,
    recent: recentWindow,
    repos,
  };
}

// A site is listed only when it answers: GitHub Pages being enabled is not a site (some are
// empty, some moved to their own domain). --probe re-checks the stored index without refetching.
async function probeSites(repos) {
  await pool(repos, async (r) => {
    if (!r.site) return;
    if (r.site.replace(/\/$/, '') === `https://${LOGIN}.github.io/${LOGIN}.github.io`) { r.site = null; return; }
    try {
      const response = await fetch(r.site, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!response.ok) r.site = null;
    } catch {
      r.site = null;
    }
  });
}

const TARGET = join(ROOT, 'data/index.json');
let index;
if (process.argv.includes('--probe')) {
  const stored = JSON.parse(readFileSync(TARGET, 'utf8'));
  const all = stored.all_repos ?? stored.repos;
  await probeSites(all);
  index = derive(all, stored.counts, stored.generated_at);
} else if (process.argv.includes('--derive')) {
  const stored = JSON.parse(readFileSync(TARGET, 'utf8'));
  index = derive(stored.all_repos ?? stored.repos, stored.counts, stored.generated_at);
} else {
  const github = await githubRepos();
  const gitlabList = await gitlabRepos();

  // Merge by name: GitHub is the primary record (language, stars), GitLab adds its link; a project
  // only on GitLab stands on its own.
  const byName = new Map();
  for (const r of github) byName.set(r.name.toLowerCase(), { ...r, hosts: { github: r.url } });
  for (const r of gitlabList) {
    const key = r.name.toLowerCase();
    const known = byName.get(key);
    if (known) {
      known.hosts.gitlab = r.url;
      if (known.share === null && r.share !== null) known.share = r.share;
    } else {
      byName.set(key, { ...r, hosts: { gitlab: r.url } });
    }
  }

  const counts = { github: github.length, gitlab: gitlabList.length, merged: byName.size, own: 0, forks: 0, mirrors: 0, empty: 0 };
  const repos = [];
  for (const r of byName.values()) {
    if (r.fork) { counts.forks += 1; continue; }
    if (r.share === null) { counts.empty += 1; continue; }
    if (r.share < 0.5) { counts.mirrors += 1; continue; }
    counts.own += 1;
    repos.push({
      name: r.name,
      description: r.description,
      language: r.language,
      topics: r.topics,
      stars: r.stars,
      created_at: r.created_at,
      pushed_at: r.pushed_at,
      archived: r.archived,
      share: Math.round(r.share * 100) / 100,
      hosts: r.hosts,
      site: r.pages || r.homepage || null,
    });
  }
  await probeSites(repos);
  index = derive(repos, counts, new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
}

writeFileSync(TARGET, `${JSON.stringify(index, null, 1)}\n`);
const c = index.counts;
console.log(`data/index.json: ${c.github} GitHub + ${c.gitlab} GitLab -> ${c.merged} by name; ` +
  `${c.own} original listed, ${c.mirrors} mirrors, ${c.forks} forks, ${c.empty} without history; ` +
  `categories ${JSON.stringify(index.by_category)}`);
