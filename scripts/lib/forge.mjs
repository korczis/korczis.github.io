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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

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
    },
    gitlab: {
      async hasFile(path, file) {
        // ref=HEAD is the default branch; a 404 (no project, no file) comes back as null.
        const answer = await gitlab(`projects/${encodeURIComponent(path)}/repository/files/${encodeURIComponent(file)}?ref=HEAD`);
        return answer !== null;
      },
    },
  };
  return {
    // Is `file` on the default branch of the repository at `url`? null for a host with no adapter.
    async hasFile(url, file) {
      const where = locate(url);
      if (!where) return null;
      return adapters[where.forge].hasFile(where.path, file);
    },
  };
}
