#!/usr/bin/env node
// Derives data/github.json: every number the site shows about GitHub, measured, with the time it
// was measured. Reads data/projects.toml for the catalogue; asks GitHub through the `gh` CLI
// (authenticated, so the rate limit is the user's) and probes each live site over HTTPS.
//
// usage: npm run data            (writes data/github.json)
//        node scripts/fetch-github.mjs --stdout
//
// The snapshot is committed: the build never touches the network, and every figure on the page
// says "as of <generated_at>". Re-run it to refresh; check-data.mjs gates its shape in CI.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOGIN = 'korczis';
const MAJORDOMUS_BUILD = 'https://majordomus.dev/build.json';
const TOP_LANGUAGES = 10;

function gh(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

function graphql(query, variables = {}) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    if (value !== null && value !== undefined) args.push('-F', `${key}=${value}`);
  }
  return gh(args).data;
}

function exists(path) {
  try {
    execFileSync('gh', ['api', '--silent', path], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function probe(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': 'korczis.github.io data refresh' },
    });
    return response.status;
  } catch {
    return 0;
  }
}

function profileAndRepos() {
  const repos = [];
  let cursor = null;
  let user = null;
  do {
    const data = graphql(
      `query($login: String!, $cursor: String) {
        user(login: $login) {
          login name location createdAt followers { totalCount }
          repositories(first: 100, after: $cursor, privacy: PUBLIC, ownerAffiliations: OWNER,
                       isFork: false, orderBy: { field: PUSHED_AT, direction: DESC }) {
            totalCount
            pageInfo { hasNextPage endCursor }
            nodes { name primaryLanguage { name color } isArchived }
          }
        }
      }`,
      { login: LOGIN, cursor },
    );
    user = data.user;
    repos.push(...user.repositories.nodes);
    cursor = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
  } while (cursor);
  return { user, repos };
}

function contributions() {
  const data = graphql(
    `query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          startedAt endedAt
          contributionCalendar {
            totalContributions
            weeks { contributionDays { date contributionCount } }
          }
        }
      }
    }`,
    { login: LOGIN },
  );
  const collection = data.user.contributionsCollection;
  const days = collection.contributionCalendar.weeks
    .flatMap((week) => week.contributionDays)
    .map((day) => [day.date, day.contributionCount]);
  return {
    total: collection.contributionCalendar.totalContributions,
    from: days[0][0],
    to: days[days.length - 1][0],
    days,
  };
}

function languages(repos) {
  const counts = new Map();
  for (const repo of repos) {
    const name = repo.primaryLanguage?.name ?? null;
    if (!name) continue;
    const entry = counts.get(name) ?? { name, color: repo.primaryLanguage.color, repos: 0 };
    entry.repos += 1;
    counts.set(name, entry);
  }
  const sorted = [...counts.values()].sort((a, b) => b.repos - a.repos || a.name.localeCompare(b.name));
  const top = sorted.slice(0, TOP_LANGUAGES);
  const rest = sorted.slice(TOP_LANGUAGES).reduce((sum, entry) => sum + entry.repos, 0);
  if (rest > 0) top.push({ name: 'Other', color: null, repos: rest });
  return top;
}

// Inferred, not claimed: how alive a project is follows from its last push, relative to the moment
// of this snapshot (so the label ages honestly with the data it came from).
const NOW = Date.now();
function activity(pushedAt) {
  const days = (NOW - Date.parse(pushedAt)) / 86400000;
  if (days <= 45) return 'active';
  if (days <= 365) return 'maintained';
  return 'dormant';
}

async function project(entry) {
  const repo = gh(['api', `repos/${LOGIN}/${entry.repo}`]);
  const status = entry.url ? await probe(entry.url) : null;
  return [
    entry.repo,
    {
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      license: repo.license?.spdx_id ?? null,
      created_at: repo.created_at,
      pushed_at: repo.pushed_at,
      activity: activity(repo.pushed_at),
      archived: repo.archived,
      fork: repo.fork,
      visibility: repo.visibility,
      live_status: status,
      live: status === null ? null : status >= 200 && status < 400,
      supervised: exists(`repos/${LOGIN}/${entry.repo}/contents/.ai/manifest.yaml`),
    },
  ];
}

async function majordomus() {
  try {
    const response = await fetch(MAJORDOMUS_BUILD, { signal: AbortSignal.timeout(15000) });
    const build = await response.json();
    return {
      source: MAJORDOMUS_BUILD,
      version: build.release?.version ?? build.source_version ?? null,
      tag: build.release?.tag ?? null,
      published_at: build.release?.published_at ?? null,
      notes_url: build.release?.notes_url ?? null,
      commit: build.commit ?? null,
      commit_time: build.commit_time ?? null,
    };
  } catch (error) {
    throw new Error(`majordomus.dev/build.json unreachable: ${error.message}`);
  }
}

const catalogue = parse(readFileSync(join(ROOT, 'data/projects.toml'), 'utf8'));
const { user, repos } = profileAndRepos();
const projects = [];
for (const entry of catalogue.projects) projects.push(await project(entry));

const snapshot = {
  schema: 'korczis-hub-github/v1',
  generated_at: new Date(NOW).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  profile: {
    login: user.login,
    name: user.name,
    location: user.location,
    created_at: user.createdAt,
    followers: user.followers.totalCount,
    public_repos: user.repositories.totalCount,
  },
  contributions: contributions(),
  languages: languages(repos),
  projects: Object.fromEntries(projects),
  majordomus: await majordomus(),
};

const text = `${JSON.stringify(snapshot, null, 2)}\n`;
if (process.argv.includes('--stdout')) {
  process.stdout.write(text);
} else {
  writeFileSync(join(ROOT, 'data/github.json'), text);
  const live = projects.filter(([, p]) => p.live).length;
  console.log(
    `data/github.json: ${snapshot.profile.public_repos} public repos, ` +
      `${snapshot.contributions.total} contributions, ${projects.length} projects (${live} live), ` +
      `majordomus ${snapshot.majordomus.version}`,
  );
}
