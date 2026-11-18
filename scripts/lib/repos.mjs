// Rules over repository records, pure and offline so the gates and unit checks can run them:
//   inferCategory()  the scored category inference of data/projects.toml [inference]
//   ruleFindings()   rules that can never decide anything (shadowed or dead)
// fetch-index.mjs applies them; check-data.mjs and check-derive.mjs prove them.

// Words of a text: lower case, split on anything that is not a letter or digit, and camelCase
// split too ("MinervaEye" -> minerva, eye), so repository names read like their descriptions.
export function words(text) {
  return String(text ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// How well one keyword matches one list of words: a whole word (or a phrase of whole words), a
// word that starts with it (stems: "visuali" -> visualisation), or a word that holds it inside
// (compounds: "crawl" in microcrawler, "site" in website). Short keywords (at most `short`
// characters: ai, gis, sql) only ever match whole words, so "ai" never matches "air".
const INFLECTION = /^(s|es|ed|d|ing|er|ers|r|rs|ion|ions|ies|y)$/;
export function matchKind(keyword, list, { short = 3 } = {}) {
  const parts = words(keyword);
  if (!parts.length) return null;
  if (parts.length > 1) {
    for (let i = 0; i + parts.length <= list.length; i += 1) {
      if (parts.every((p, j) => (j === parts.length - 1 ? list[i + j].startsWith(p) : list[i + j] === p))) {
        return list[i + parts.length - 1] === parts.at(-1) ? 'word' : 'prefix';
      }
    }
    return null;
  }
  const [k] = parts;
  if (list.includes(k)) return 'word';
  if (k.length <= short) return null;
  // An inflected form is the same word: sniff -> sniffing, crawl -> crawler, game -> games.
  if (list.some((w) => w.startsWith(k) && INFLECTION.test(w.slice(k.length)))) return 'word';
  if (list.some((w) => w.startsWith(k))) return 'prefix';
  if (list.some((w) => w.length > k.length && w.includes(k))) return 'inside';
  return null;
}

// The category of a repository. Every keyword of every category is scored against the name,
// the topics and the description (name > topics > description, a whole word > a prefix > a word
// that holds it, a phrase counts once per word); the best total wins, an equal total goes to the
// earlier category of `precedence` (never the sidebar order). With no keyword at all the primary
// language decides, then the declared fallback.
export function inferCategory(repo, categories, inference) {
  const { precedence, fallback, weights, match, short } = inference;
  const fields = {
    name: words(repo.name),
    topics: (repo.topics ?? []).flatMap(words),
    description: words(repo.description),
  };
  const scores = new Map();
  const evidence = new Map();
  for (const key of precedence) {
    let total = 0;
    const hits = [];
    for (const keyword of categories[key].keywords ?? []) {
      let best = 0;
      let where = null;
      for (const [field, list] of Object.entries(fields)) {
        const kind = matchKind(keyword, list, { short });
        const score = kind ? weights[field] * match[kind] * words(keyword).length : 0;
        if (score > best) { best = score; where = `${field}:${kind}`; }
      }
      if (best) { total += best; hits.push(`${keyword.trim()}@${where}`); }
    }
    scores.set(key, total);
    evidence.set(key, hits);
  }
  let winner = null;
  for (const key of precedence) if (scores.get(key) > (winner ? scores.get(winner) : 0)) winner = key;
  if (winner) return { category: winner, by: 'keywords', score: scores.get(winner), evidence: evidence.get(winner) };
  if (repo.language) {
    const key = precedence.find((k) => (categories[k].languages ?? []).includes(repo.language));
    if (key) return { category: key, by: 'language', score: 0, evidence: [repo.language] };
  }
  return { category: fallback, by: 'fallback', score: 0, evidence: [] };
}

// Rules that cannot decide anything, from the rules alone:
//   - precedence must name every category exactly once, and the fallback must be one of them;
//   - a language on the fallback category is dead (with no keyword, the fallback wins anyway);
//   - a language on two categories is shadowed in the later one (precedence decides);
//   - a keyword on two categories, or twice on one, scores the same everywhere: shadowed;
//   - a keyword with no letters or digits, or with stray spaces, matches nothing as written.
export function ruleFindings(categories, inference) {
  const findings = [];
  const keys = Object.keys(categories);
  const { precedence = [], fallback } = inference ?? {};
  for (const k of keys) if (!precedence.includes(k)) findings.push(`[inference] precedence does not name category ${k}`);
  for (const k of precedence) if (!keys.includes(k)) findings.push(`[inference] precedence names ${k}, which is no category`);
  if (new Set(precedence).size !== precedence.length) findings.push('[inference] precedence names a category twice');
  if (!keys.includes(fallback)) findings.push(`[inference] fallback ${fallback} is no category`);
  for (const lang of categories[fallback]?.languages ?? []) {
    findings.push(`categories.${fallback}.languages: ${lang} is dead (the fallback category takes it anyway)`);
  }
  const language = new Map();
  const keyword = new Map();
  for (const k of precedence.filter((x) => keys.includes(x))) {
    for (const lang of categories[k].languages ?? []) {
      if (language.has(lang)) findings.push(`categories.${k}.languages: ${lang} is shadowed by categories.${language.get(lang)}`);
      else language.set(lang, k);
    }
    for (const raw of categories[k].keywords ?? []) {
      const norm = words(raw).join(' ');
      if (!norm) findings.push(`categories.${k}.keywords: "${raw}" has no word in it`);
      if (raw !== raw.trim()) findings.push(`categories.${k}.keywords: "${raw}" has stray spaces (matching is by words)`);
      if (keyword.has(norm)) findings.push(`categories.${k}.keywords: "${raw}" is shadowed by categories.${keyword.get(norm)}`);
      else keyword.set(norm, k);
    }
  }
  return findings;
}

// --- Authorship (fetch-index.mjs; ADR 0003) ---------------------------------------------------

const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const split = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

// Whether a contributor is the owner, from the identity in zola.toml [extra] (never a pattern in a
// script): the GitHub or GitLab login; a commit author name that holds a login ("<login> bot"); or
// a name made only of the owner's name parts or their initials and holding the surname, in any
// spelling, order or case (author "Jan Novak" matches "Jan Novák", "Novak Jan", "J. Novak",
// "novak"; never "Petr Novak").
export function ownerMatcher({ github, gitlab, author, authorNative }) {
  const logins = [...new Set([github, gitlab].filter(Boolean).map((l) => fold(l).replace(/[^a-z0-9]/g, '')))];
  const people = [author, authorNative].filter(Boolean).map(split).filter((p) => p.length);
  return (c) => {
    if (c.login && logins.includes(fold(c.login).replace(/[^a-z0-9]/g, ''))) return true;
    const parts = split(c.name);
    if (!parts.length) return false;
    if (logins.some((l) => parts.join('').includes(l))) return true;
    return people.some((person) => parts.includes(person.at(-1))
      && parts.every((x) => person.includes(x) || (x.length === 1 && person.some((y) => y[0] === x))));
  };
}

// Share of the listed commits written by the owner: 1 = all, 0 = none, null = no history.
export function ownerShare(contributors, isOwner) {
  const total = contributors.reduce((sum, c) => sum + c.count, 0);
  if (!total) return null;
  return contributors.filter(isOwner).reduce((sum, c) => sum + c.count, 0) / total;
}

// Every page of a paged list: fetchPage(page) -> array (or null for none); stops at the first
// short page, and at maxPages, so one huge repository cannot spend the whole refresh.
export async function paginate(fetchPage, { perPage = 100, maxPages = 10 } = {}) {
  const all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = (await fetchPage(page, perPage)) ?? [];
    all.push(...batch);
    if (batch.length < perPage) break;
  }
  return all;
}

// The owner's share of one repository. A failure to read the contributors is not an empty
// repository: the last measurement (from the stored index) is kept, and without one the state is
// "error", which is counted and never listed, and never mistaken for "empty".
//   -> { share, state: 'measured' | 'kept' | 'error' }
export async function measureShare({ contributors, isOwner, previous = null, rethrow = () => false }) {
  try {
    return { share: ownerShare(await contributors(), isOwner), state: 'measured' };
  } catch (error) {
    if (rethrow(error)) throw error;
    if (previous !== null && previous !== undefined) return { share: previous, state: 'kept' };
    return { share: null, state: 'error' };
  }
}

// The primary language of a GitLab project from /projects/:id/languages ({ Ruby: 66.7, ... }).
export function primaryLanguage(languages) {
  const top = Object.entries(languages ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return top ? top[0] : null;
}

// Repositories that were the owner's at the last measurement and are not now, with why. check-data
// fails on "empty": a repository with commits does not lose them, so it is a measuring fault (or a
// repository the owner emptied, to be put on the hidden list).
// A record that now carries the previous one's forge URL under another name was merged into it
// (a GitLab twin joining its GitHub repository): "merged", not gone.
export function droppedSince(previousOwn, records) {
  const now = new Map(records.map((r) => [r.name.toLowerCase(), r]));
  const urls = new Set(records.flatMap((r) => Object.values(r.hosts ?? {})));
  const out = [];
  for (const before of previousOwn) {
    const r = now.get(before.name.toLowerCase());
    if (!r && Object.values(before.hosts ?? {}).some((u) => urls.has(u))) out.push({ name: before.name, now: 'merged' });
    else if (!r) out.push({ name: before.name, now: 'gone' });
    else if (r.fork) out.push({ name: before.name, now: 'fork' });
    else if (r.share === null && r.state !== 'error') out.push({ name: before.name, now: 'empty' });
    else if (r.share !== null && r.share < 0.5) out.push({ name: before.name, now: 'mirror' });
  }
  return out;
}
