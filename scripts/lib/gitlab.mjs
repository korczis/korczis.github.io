// GitLab for the fetchers (fetch-index, fetch-recent), one client for both.
//
// - Through `glab api` where glab is installed and logged in (the owner's machine); over REST
//   everywhere else (CI), with GITLAB_TOKEN when the environment has one, anonymously otherwise;
//   a token that is not one line, or that GitLab refuses (401), is dropped with a log line.
// - 404 is an answer: null. A rate limit (429) waits for Retry-After, or a capped backoff, says so,
//   and tries again. Any other failure throws.
// - Every call shares one time budget. Once it is spent, calls throw GitLabBudgetError, so a
//   refresh degrades (the caller keeps the last measured values) instead of hanging until the job
//   is cancelled, which is how three scheduled refreshes were lost on 2026-11-12/13.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export class GitLabBudgetError extends Error {}

// The budget: GITLAB_BUDGET_MS from the environment (the workflows set it), else 15 minutes.
export function gitlabClient({ budgetMs = Number(process.env.GITLAB_BUDGET_MS) || 15 * 60 * 1000, log = (m) => console.error(m) } = {}) {
  // The budget starts at the first GitLab call, not when the client is made: a fetcher makes it
  // before it reads GitHub, and that time is not GitLab's (it once left the listing unread).
  let deadline = null;
  let useGlab = null;
  let waits = 0;
  // A token is one line of printable characters; anything else (a CLI's help text stored as the
  // secret) is not sent, since fetch() would throw on that header for every call.
  let token = (process.env.GITLAB_TOKEN ?? '').trim() || null;
  if (token && !/^[\x21-\x7e]+$/.test(token)) {
    log('GitLab: GITLAB_TOKEN is not a single-line token; ignoring it and reading anonymously');
    token = null;
  }

  const left = () => (deadline ??= Date.now() + budgetMs) - Date.now();
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
    const headers = token ? { 'PRIVATE-TOKEN': token } : {};
    const response = await fetch(`https://gitlab.com/api/v4/${path}`, { headers, signal: AbortSignal.timeout(30000) });
    // A token GitLab refuses is dropped once, loudly, and the call is asked again anonymously:
    // a bad secret costs the rate limit it would have raised, never the refresh.
    if (response.status === 401 && token) {
      token = null;
      log('GitLab: GITLAB_TOKEN was refused (HTTP 401); continuing anonymously');
      return once(path);
    }
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
      log(useGlab ? 'GitLab: through glab' : `GitLab: over REST${token ? ' with GITLAB_TOKEN' : ', anonymously'}`);
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
