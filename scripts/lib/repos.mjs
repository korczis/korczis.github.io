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
