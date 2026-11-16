// One connection to every forge the owner publishes on, asked the same questions.
//
// - A repository is addressed by its URL (data/index.json `hosts`), never by a hand-typed owner
//   or host: the forge, the owner and the name are inferred from it, so a new host or a renamed
//   account needs no code here, only an adapter for its API.
// - GitHub is asked through the `gh` CLI (the owner's login locally, GH_TOKEN in CI); GitLab
//   through the shared client (scripts/lib/gitlab.mjs: glab locally, REST in CI), which brings its
//   time budget and rate-limit handling with it.
// - hasFile() answers true or false, and throws on anything that is not an answer (the caller
//   keeps the last measurement); a missing repository or file is an answer: false.
// - detail() gives the same shape from either forge: the latest commits of the default branch,
//   the language bytes as shares, and the README's text; {} for a repository the forge does not
//   have. A rate limit is waited out (gh: up to six times; GitLab: the client's own budget).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// `gh api` with the rate limit waited out; null for an answer that is not there (404 and the like).
async function ghApi(args) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { stdout } = await run('gh', ['api', ...args], { maxBuffer: 32 * 1024 * 1024 });
      return stdout;
    } catch (error) {
      const why = String(error.stderr ?? error.message);
      if (!/429|rate limit|too many|502|503/i.test(why) || attempt >= 6) return null;
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 3000));
    }
  }
}
const json = (text) => { try { return text ? JSON.parse(text) : null; } catch { return null; } };
const top = (list) => list.sort((a, b) => b.share - a.share).slice(0, 6);

// https://github.com/<owner>/<name> -> { forge: 'github', path: '<owner>/<name>' }
export function locate(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const path = parsed.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  if (!path.includes('/')) return null;
  if (parsed.hostname === 'github.com') return { forge: 'github', path };
  if (parsed.hostname === 'gitlab.com') return { forge: 'gitlab', path };
  return null;
}

export function forges({ gitlab }) {
  const adapters = {
    github: {
      async hasFile(path, file) {
        try {
          await run('gh', ['api', '--silent', `repos/${path}/contents/${file}`], { timeout: 60000 });
          return true;
        } catch (error) {
          const why = String(error.stderr ?? error.message);
          if (/HTTP 404|Not Found/i.test(why)) return false;
          throw new Error(`gh api repos/${path}/contents/${file}: ${why.trim().split('\n')[0]}`);
        }
      },
      async detail(path, { commits }) {
        const [log, langs, readme] = await Promise.all([
          ghApi([`repos/${path}/commits?per_page=${commits}`]),
          ghApi([`repos/${path}/languages`]),
          ghApi(['-H', 'Accept: application/vnd.github.raw', `repos/${path}/readme`]),
        ]);
        const bytes = json(langs) ?? {};
        const total = Object.values(bytes).reduce((a, b) => a + b, 0);
        return {
          commits: (json(log) ?? []).map((x) => ({ at: x.commit.committer.date, message: x.commit.message.split('\n')[0], url: x.html_url })),
          languages: total ? top(Object.entries(bytes).map(([name, n]) => ({ name, share: Math.round((n / total) * 1000) / 10 }))) : [],
          readme: readme || null,
        };
      },
    },
    gitlab: {
      async hasFile(path, file) {
        // ref=HEAD is the default branch; a 404 (no project, no file) comes back as null.
        const answer = await gitlab(`projects/${encodeURIComponent(path)}/repository/files/${encodeURIComponent(file)}?ref=HEAD`);
        return answer !== null;
      },
      async detail(path, { commits }) {
        const id = encodeURIComponent(path);
        const project = await gitlab(`projects/${id}`);
        if (!project) return {};
        const branch = encodeURIComponent(project.default_branch ?? 'main');
        const [log, langs, readme] = await Promise.all([
          gitlab(`projects/${id}/repository/commits?per_page=${commits}&ref_name=${branch}`),
          gitlab(`projects/${id}/languages`),
          gitlab(`projects/${id}/repository/files/README.md/raw?ref=${branch}`, { raw: true }),
        ]);
        return {
          commits: (log ?? []).map((x) => ({ at: x.committed_date, message: x.title, url: x.web_url })),
          languages: top(Object.entries(langs ?? {}).map(([name, share]) => ({ name, share: Math.round(share * 10) / 10 }))),
          readme: readme || null,
        };
      },
    },
  };
  const on = (url) => {
    const where = locate(url);
    return where ? { adapter: adapters[where.forge], path: where.path } : null;
  };
  return {
    // Is `file` on the default branch of the repository at `url`? null for a host with no adapter.
    async hasFile(url, file) {
      const at = on(url);
      return at ? at.adapter.hasFile(at.path, file) : null;
    },
    // The latest `commits` commits, the languages and the README of the repository at `url`.
    async detail(url, { commits = 30 } = {}) {
      const at = on(url);
      return at ? at.adapter.detail(at.path, { commits }) : {};
    },
  };
}
