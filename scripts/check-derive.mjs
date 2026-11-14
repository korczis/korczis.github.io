#!/usr/bin/env node
// Unit checks of the derivation's pure rules (scripts/lib/repos.mjs, scripts/lib/derive.mjs),
// offline, against the fixtures in scripts/fixtures/derive/: the measuring paths of fetch-index
// (paginated contributors, an unreadable list keeping the last measurement, GitLab's language) are
// network code that no gate can run, so their logic is proven here instead.
//
// usage: node scripts/check-derive.mjs     exit 0 when every assertion holds, 1 with each failure
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, clip, identity, languages, plural, slug } from './lib/derive.mjs';
import { droppedSince, inferCategory, matchKind, measureShare, ownerMatcher, paginate, primaryLanguage, ruleFindings, words } from './lib/repos.mjs';

const FIX = join(ROOT, 'scripts/fixtures/derive');
const fixture = (name) => JSON.parse(readFileSync(join(FIX, name), 'utf8'));
const failures = [];
let passed = 0;
function check(what, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed += 1;
  else failures.push(`${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

// The owner, from zola.toml [extra]: logins and both spellings of the name, never another person.
const me = identity();
const isOwner = ownerMatcher(me);
for (const c of [{ login: me.github }, { name: me.author }, { name: me.authorNative }, { name: me.author.split(' ').reverse().join(' ').toLowerCase() },
  { name: me.author.replace(' ', '.').toLowerCase() }, { name: `${me.author[0]}. ${me.author.split(' ').at(-1)}` }, { name: `${me.github} bot` }]) {
  check(`owner ${JSON.stringify(c)}`, isOwner(c), true);
}
for (const c of [{ login: 'someone' }, { name: `Petr ${me.author.split(' ').at(-1)}` }, { name: `${me.author.split(' ')[0]} Novak` }, { name: '' }, {}]) {
  check(`not owner ${JSON.stringify(c)}`, isOwner(c), false);
}

// Contributors are read page by page to the end, not the first 10 or 20.
const pages = [1, 2, 3].map((n) => fixture(`github-contributors-${n}.json`));
const asked = [];
const all = await paginate(async (page) => { asked.push(page); return pages[page - 1] ?? []; }, { perPage: 100 });
check('paginate reads every page and stops at the short one', [all.length, asked], [237, [1, 2, 3]]);
check('paginate stops at maxPages', (await paginate(async () => pages[0], { perPage: 100, maxPages: 2 })).length, 200);
const list = all.map((c) => ({ login: c.login, name: c.name, count: c.contributions }));
const measured = await measureShare({ contributors: async () => list, isOwner });
check('share over every contributor', [measured.state, Math.round(measured.share * 1000) / 1000], ['measured', Math.round((524 / 736) * 1000) / 1000]);

// An unreadable list keeps the last measurement; without one it is an error, never "empty".
const failing = async () => { throw new Error('HTTP 502'); };
check('error keeps the last share', await measureShare({ contributors: failing, isOwner, previous: 0.9 }), { share: 0.9, state: 'kept' });
check('error without a last share', await measureShare({ contributors: failing, isOwner }), { share: null, state: 'error' });
check('an empty list is empty', await measureShare({ contributors: async () => [], isOwner, previous: 0.9 }), { share: null, state: 'measured' });
let rethrown = false;
try { await measureShare({ contributors: failing, isOwner, previous: 1, rethrow: () => true }); } catch { rethrown = true; }
check('a spent budget is rethrown', rethrown, true);

// GitLab's primary language from /projects/:id/languages.
check('GitLab primary language', primaryLanguage(fixture('gitlab-languages.json')), 'Ruby');
check('GitLab without languages', primaryLanguage({}), null);

// Own last time, empty now: reported; an unreadable list is not.
check('own -> empty is dropped', droppedSince([{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }],
  [{ name: 'a', share: null, state: 'measured' }, { name: 'b', share: null, state: 'error' }, { name: 'c', share: 0.2 }]),
  [{ name: 'a', now: 'empty' }, { name: 'c', now: 'mirror' }, { name: 'd', now: 'gone' }]);

// Keyword matching: whole words, inflections, prefixes, words inside compounds, short keywords.
check('words split camelCase and separators', words('MinervaEye korczis.github-io'), ['minerva', 'eye', 'korczis', 'github', 'io']);
check('ai is not air', matchKind('ai', words('air quality')), null);
check('crawl inside microcrawler', matchKind('crawl', words('microcrawler')), 'inside');
check('sniff inflected', matchKind('sniff', words('packet sniffing')), 'word');
check('visuali is a stem', matchKind('visuali', words('visualisation')), 'prefix');
check('a phrase', matchKind('web framework', words('a light web framework')), 'word');

const categories = {
  a: { keywords: ['graph'], languages: [] },
  b: { keywords: ['gooddata', 'site'], languages: ['Elixir'] },
  c: { keywords: [], languages: [] },
};
const inference = { precedence: ['a', 'b', 'c'], fallback: 'c', short: 3, weights: { name: 3, topics: 2, description: 1 }, match: { word: 1, prefix: 0.75, inside: 0.5 } };
check('the name outweighs a prefix', inferCategory({ name: 'gooddata-graphql' }, categories, inference).category, 'b');
check('a tie goes to precedence', inferCategory({ name: 'graph-site' }, categories, inference).category, 'a');
check('precedence, not declaration order', inferCategory({ name: 'graph-site' }, categories, { ...inference, precedence: ['b', 'a', 'c'] }).category, 'b');
check('language without a keyword', inferCategory({ name: 'x', language: 'Elixir' }, categories, inference).category, 'b');
check('the declared fallback', inferCategory({ name: 'x' }, categories, inference).category, 'c');
check('rule findings', ruleFindings({ ...categories, c: { keywords: ['graph'], languages: ['Elixir'] } }, inference), [
  'categories.c.languages: Elixir is dead (the fallback category takes it anyway)',
  'categories.c.languages: Elixir is shadowed by categories.b',
  'categories.c.keywords: "graph" is shadowed by categories.a',
]);

// The shared helpers.
check('languages from zola.toml', languages()[0], 'en');
check('slug', slug('pdf_renderer.Ex'), 'pdf-renderer-ex');
check('clip', clip('one two three four', 12), 'one two…');
check('Czech plural', [1, 2, 5, 0].map((n) => plural('cs', n)), ['one', 'few', 'other', 'other']);

if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`);
  console.error(`derive: ${failures.length} of ${passed + failures.length} assertions failed`);
  process.exit(1);
}
console.log(`derive: ${passed} assertions over scripts/lib/repos.mjs and derive.mjs, PASS`);
