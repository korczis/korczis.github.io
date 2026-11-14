// GitLab for the fetchers (fetch-index, fetch-recent), one client for both.
//
// - Through `glab api` where glab is installed and logged in (the owner's machine); over REST
//   everywhere else (CI), with GITLAB_TOKEN when the environment has one, anonymously otherwise.
// - 404 is an answer: null. A rate limit (429) waits for Retry-After, or a capped backoff, says so,
//   and tries again. Any other failure throws.
// - Every call shares one time budget. Once it is spent, calls throw GitLabBudgetError, so a
//   refresh degrades (the caller keeps the last measured values) instead of hanging until the job
//   is cancelled, which is how three scheduled refreshes were lost on 2026-11-12/13.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export class GitLabBudgetError extends Error {}

export function gitlabClient({ budgetMs = 15 * 60 * 1000, log = (m) => console.error(m) } = {}) {
  const deadline = Date.now() + budgetMs;
  let useGlab = null;
  let waits = 0;

  const left = () => deadline - Date.now();
  const spent = (path) => {
    if (left() <= 0) throw new GitLabBudgetError(`GitLab budget of ${Math.round(budgetMs / 1000)} s spent at ${path}`);
  };

  async function once(path) {
    if (useGlab) {
      try {
        const { stdout } = await run('glab', ['api', path], { maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
        return { status: 200, body: stdout };
      } catch (error) {
        const why = String(error.stderr ?? error.message);
        if (/404|not found/i.test(why)) return { status: 404 };
        if (/429|rate limit|too many/i.test(why)) return { status: 429 };
        throw new Error(`glab api ${path}: ${why.trim().split('\n')[0]}`);
      }
    }
    const headers = process.env.GITLAB_TOKEN ? { 'PRIVATE-TOKEN': process.env.GITLAB_TOKEN } : {};
    const response = await fetch(`https://gitlab.com/api/v4/${path}`, { headers, signal: AbortSignal.timeout(30000) });
    if (response.status === 404) return { status: 404 };
    if (response.status === 429) return { status: 429, retryAfter: Number(response.headers.get('retry-after')) || null };
    if (!response.ok) throw new Error(`GitLab ${path}: HTTP ${response.status}`);
    return { status: 200, body: await response.text() };
  }

  // gitlab('projects/123/languages') -> parsed JSON; gitlab(path, { raw: true }) -> text.
  return async function gitlab(path, { raw = false } = {}) {
    path = path.replace(/^\//, '');
    if (useGlab === null) {
      useGlab = await run('glab', ['auth', 'status'], { timeout: 15000 }).then(() => true, () => false);
      log(useGlab ? 'GitLab: through glab' : `GitLab: over REST${process.env.GITLAB_TOKEN ? ' with GITLAB_TOKEN' : ', anonymously'}`);
    }
    for (let attempt = 0; ; attempt += 1) {
      spent(path);
      const answer = await once(path);
      if (answer.status === 404) return null;
      if (answer.status === 200) {
        if (raw) return answer.body;
        try { return answer.body.trim() ? JSON.parse(answer.body) : null; } catch { return null; }
      }
      // 429: wait as told, or back off (5, 10, 20, 40, 60 s), never past the budget.
      const wait = Math.min((answer.retryAfter ?? 5 * 2 ** attempt) * 1000, 60000, Math.max(0, left()));
      waits += 1;
      log(`GitLab: rate limited at ${path}, waiting ${Math.round(wait / 1000)} s (wait ${waits})`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  };
}
