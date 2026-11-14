#!/usr/bin/env node
// Derives data/index.json: every public repository of the owner (zola.toml [extra]) on GitHub and
// GitLab, with authorship measured from contributors, hosts merged by name, and a category inferred
// from the rules in data/projects.toml. Only original work is listed; forks and mirrors
// (repositories where someone else wrote most of the commits) are counted, never shown as the
// owner's work. A contributor list that cannot be read keeps the last measurement.
//
// usage: npm run index                                  (needs the authenticated CLIs `gh` and `glab`)
//        node scripts/fetch-index.mjs --derive [--check] re-apply the rules to the stored index offline
//        node scripts/fetch-index.mjs --probe            re-check the stored sites
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ROOT, identity, pool, readToml } from './lib/derive.mjs';
import { GitLabBudgetError, gitlabClient } from './lib/gitlab.mjs';
import { droppedSince, inferCategory, measureShare, ownerMatcher, paginate, primaryLanguage } from './lib/repos.mjs';

const run = promisify(execFile);
// Only the derivation can be checked offline; refuse before anything reaches the network.
if (process.argv.includes('--check') && !process.argv.includes('--derive')) {
  console.error('✗ --check needs --derive (the measurement itself is never checked offline)');
  process.exit(2);
}
const me = identity();
const isOwner = ownerMatcher(me);
const CONTRIBUTOR_PAGES = 10; // at most 1000 contributors per repository: the share is of those

const catalogue = readToml('data/projects.toml');
const curated = new Set(catalogue.projects.map((p) => p.repo.toLowerCase()));

async function gh(path) {
  const { stdout } = await run('gh', ['api', path], { maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) : null;
}

// GitLab through the shared client (scripts/lib/gitlab.mjs): glab locally, REST in CI, one time
// budget so a slow or rate-limited GitLab degrades the refresh instead of hanging it.
const gitlab = gitlabClient();

// A description that says it is someone else's code marks a mirror even when the copy's own
// history was squashed into the owner's commits (osmocom-bb: "Mirror of git://...").
// Not when the copy is of the owner's own data (gists-search: "a mirror of <login>'s gists").
const MIRROR = new RegExp(`\\b(mirror of|mirrored from|cloned from|just cloned|leaked|repository from|fork of|copy of|import of)\\b(?!\\s+(?:${[me.github, me.gitlab, 'my'].join('|')})\\b)`, 'i');
const curatedCategory = new Map(catalogue.projects.map((p) => [p.repo.toLowerCase(), p.category]));

// Curated projects keep their curated category; every other repository is scored against the
// declared rules (data/projects.toml [inference], scripts/lib/repos.mjs).
function infer(repo) {
  return curatedCategory.get(repo.name.toLowerCase()) ?? inferCategory(repo, catalogue.categories, catalogue.inference).category;
}

// The last measurement of every repository the stored index listed: what an unreadable
// contributor list falls back to.
const lastShare = (stored, host) => new Map((stored?.all_repos ?? []).filter((r) => r.hosts?.[host]).map((r) => [r.name.toLowerCase(), r]));

async function githubRepos(stored) {
  const known = lastShare(stored, 'github');
  const pages = await paginate((page) => gh(`users/${me.github}/repos?type=owner&per_page=100&page=${page}`), { maxPages: 50 });
  let kept = 0;
  const list = await pool(pages.filter((r) => !r.private), async (r) => {
    let measured = { share: null, state: 'measured' };
    if (!r.fork) {
      measured = await measureShare({
        contributors: async () => (await paginate((page) => gh(`repos/${me.github}/${r.name}/contributors?per_page=100&anon=1&page=${page}`), { maxPages: CONTRIBUTOR_PAGES }))
          .map((c) => ({ login: c.login, name: c.name, count: c.contributions })),
        isOwner,
        previous: known.get(r.name.toLowerCase())?.share,
      });
      if (measured.state === 'kept') kept += 1;
    }
    return {
      name: r.name,
      host: 'github',
      url: r.html_url,
      homepage: r.homepage || null,
      pages: r.has_pages ? `https://${me.github}.github.io/${r.name}/` : null,
      description: r.description,
      language: r.language,
      topics: r.topics ?? [],
      stars: r.stargazers_count,
      created_at: r.created_at,
      pushed_at: r.pushed_at,
      archived: r.archived,
      fork: r.fork,
      share: measured.share,
      state: measured.state,
    };
  });
  console.error(`GitHub: ${list.length} public repositories, ${kept} kept their last measurement`);
  return list;
}

// The owner's share of a project's commits changes only with new commits: a project whose last
// activity is the one already measured keeps its stored share (and language), and only active
// projects are asked again. That keeps an anonymous refresh within GitLab's rate limits. A
// project's primary language comes from /projects/:id/languages, asked only for original work.
async function gitlabRepos(stored) {
  const known = lastShare(stored, 'gitlab');
  let reused = 0;
  let kept = 0;
  const all = (await paginate((page) => gitlab(`/users/${me.gitlab}/projects?visibility=public&per_page=100&page=${page}`), { maxPages: 50 }))
    // Authenticated, the API also returns private projects: only public ones are listed.
    .filter((p) => p.visibility === 'public');
  return pool(all, async (p) => {
    const before = known.get(p.path.toLowerCase());
    const unchanged = before && before.pushed_at === p.last_activity_at;
    let measured = { share: null, state: 'measured' };
    if (!p.forked_from_project && unchanged && before.share !== null && before.share !== undefined) {
      measured = { share: before.share, state: 'measured' };
      reused += 1;
    } else if (!p.forked_from_project) {
      measured = await measureShare({
        contributors: async () => (await paginate((page) => gitlab(`/projects/${p.id}/repository/contributors?per_page=100&page=${page}`), { maxPages: CONTRIBUTOR_PAGES }))
          .map((c) => ({ name: c.name, count: c.commits })),
        isOwner,
        previous: before?.share,
        // A spent budget ends the whole GitLab reading; any other failure is this project's alone.
        rethrow: (error) => error instanceof GitLabBudgetError,
      });
      if (measured.state === 'kept') kept += 1;
    }
    let language = unchanged && !before.hosts?.github ? before.language ?? null : null;
    if (!language && !p.forked_from_project && measured.share !== null && measured.share >= 0.5) {
      language = await gitlab(`/projects/${p.id}/languages`).then(primaryLanguage, (error) => {
        if (error instanceof GitLabBudgetError) throw error;
        return before?.language ?? null;
      });
    }
    return {
      name: p.path,
      host: 'gitlab',
      url: p.web_url,
      homepage: null,
      pages: null,
      description: p.description ? p.description.split('\n')[0].trim() : null,
      language,
      topics: p.topics ?? p.tag_list ?? [],
      stars: p.star_count,
      created_at: p.created_at,
      pushed_at: p.last_activity_at,
      archived: p.archived,
      fork: Boolean(p.forked_from_project),
      share: measured.share,
      state: measured.state,
    };
  }, 4).then((list) => {
    console.error(`GitLab: ${list.length} public projects, ${reused} shares reused from the last measurement, ${kept} kept after an error`);
    return list;
  });
}

// When GitLab cannot be read in time, its projects keep their last measured records (from the
// stored index), so the site loses nothing; the refresh says so, and GitHub is still current.
function storedGitlab(stored) {
  return (stored?.all_repos ?? []).filter((r) => r.hosts?.gitlab).map((r) => ({
    name: r.name, host: 'gitlab', url: r.hosts.gitlab, homepage: null, pages: null, description: r.description,
    language: r.hosts.github ? null : r.language, topics: r.topics ?? [], stars: r.stars, created_at: r.created_at,
    pushed_at: r.pushed_at, archived: r.archived, fork: false, share: r.share, state: 'kept',
  }));
}

// Everything below the fetch is derivation: it runs again with --derive on the stored index, so a
// change to the category rules or the catalogue needs no network.
function derive(allRepos, fetchedCounts, generatedAt, dropped) {
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
    // Measured at the last fetch: repositories that were original before and are not now.
    ...(dropped ? { dropped } : {}),
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
    if (r.site.replace(/\/$/, '') === `https://${me.github}.github.io/${me.github}.github.io`) { r.site = null; return; }
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
  index = derive(all, stored.counts, stored.generated_at, stored.dropped);
} else if (process.argv.includes('--derive')) {
  const stored = JSON.parse(readFileSync(TARGET, 'utf8'));
  index = derive(stored.all_repos ?? stored.repos, stored.counts, stored.generated_at, stored.dropped);
} else {
  const previous = existsSync(TARGET) ? JSON.parse(readFileSync(TARGET, 'utf8')) : null;
  const github = await githubRepos(previous);
  let gitlabList;
  try {
    gitlabList = await gitlabRepos(previous);
  } catch (error) {
    gitlabList = storedGitlab(previous);
    console.error(`GitLab: ${error.message}; kept the last measured ${gitlabList.length} projects`);
  }

  // Merge by name: GitHub is the primary record (language, stars), GitLab adds its link; a project
  // only on GitLab stands on its own.
  const byName = new Map();
  for (const r of github) byName.set(r.name.toLowerCase(), { ...r, hosts: { github: r.url } });
  for (const r of gitlabList) {
    const key = r.name.toLowerCase();
    const known = byName.get(key);
    if (known) {
      known.hosts.gitlab = r.url;
      if (known.share === null && r.share !== null) { known.share = r.share; known.state = r.state; }
      if (!known.language && r.language) known.language = r.language;
    } else {
      byName.set(key, { ...r, hosts: { gitlab: r.url } });
    }
  }

  const counts = { github: github.length, gitlab: gitlabList.length, merged: byName.size, own: 0, forks: 0, mirrors: 0, empty: 0, unmeasured: 0 };
  const repos = [];
  for (const r of byName.values()) {
    if (r.fork) { counts.forks += 1; continue; }
    // Unreadable and never measured: counted, not listed, and not called empty.
    if (r.share === null && r.state === 'error') { counts.unmeasured += 1; continue; }
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
  // What was the owner's work at the last measurement and is not now (check-data fails on "empty").
  const dropped = droppedSince(previous?.all_repos ?? [], [...byName.values()]);
  index = derive(repos, counts, new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), dropped);
}

const text = `${JSON.stringify(index, null, 1)}\n`;
if (process.argv.includes('--check')) {
  // Only the derivation can be checked offline: a rule, mirror or hidden change in data/projects.toml
  // that the committed index does not reflect yet.
  if (readFileSync(TARGET, 'utf8') !== text) {
    console.error('✗ data/index.json is stale against the rules of data/projects.toml; run npm run derive');
    process.exit(1);
  }
  console.log(`data/index.json: ${index.counts.own} original repositories, current against data/projects.toml`);
  process.exit(0);
}
writeFileSync(TARGET, text);
const c = index.counts;
console.log(`data/index.json: ${c.github} GitHub + ${c.gitlab} GitLab -> ${c.merged} by name; ` +
  `${c.own} original listed, ${c.mirrors} mirrors, ${c.forks} forks, ${c.empty} without history` +
  `${c.unmeasured ? `, ${c.unmeasured} unreadable` : ''}; ` +
  `categories ${JSON.stringify(index.by_category)}`);
