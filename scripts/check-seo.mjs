#!/usr/bin/env node
// SEO gate over the built site (rule project.seo-derived): every indexable page has a unique title
// (at most 70 characters), a unique description of 50-165 characters, a unique og:description, an absolute canonical URL listed in
// the sitemap, Open Graph and Twitter tags whose image exists in the build at 1200x630, valid
// JSON-LD, exactly one <h1> and a lang attribute; 404.html is noindex. Reads public/ (or SITE_DIR).
//
// Structured data states only what the page shows, and only what data/ holds:
//   - Person.knowsAbout is exactly the measured skills (data/index.json skills) and the client-work
//     technologies (data/experience.json) that have a glossary term the owner claims (glossary
//     claimed = false is never named), each a DefinedTerm whose url is its built glossary page in
//     the page's language; on /hire/ each one is a visible row of the skills list (data-skill);
//   - Person.sameAs names profiles only: GitHub, GitLab and the data/cv.toml [links];
//   - every data/cv.toml [[roles]] entry is a dated OrganizationRole (worksFor while it runs,
//     alumniOf once it ended) with its organisation, which has a url only when cv.toml gives one;
//   - while cv.toml [hire] available: the /hire/ h1 names the author, the FAQPage questions and
//     answers are exactly the visible accordion (data-faq-item) both ways, every hire role links at
//     least one built work page of its language (data-hire-evidence; another language's links stay
//     under its prefix), and every <time> carries a valid datetime.
//
// usage: npm run build && node scripts/check-seo.mjs
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, identity, isDefault, languages, limits, readToml } from './lib/derive.mjs';
import { cliArgs } from './lib/cli.mjs';

cliArgs();

const SITE = process.env.SITE_DIR || join(ROOT, 'public');
const BASE = identity().base;
const LIMITS = limits();
const { width: OG_W, height: OG_H } = LIMITS.og;
const findings = [];
const fail = (where, what) => findings.push(`${where}: ${what}`);
const ME = identity();
const CV = readToml('data/cv.toml');
const GLOSSARY = readToml('data/glossary.toml').terms;
const INDEX = JSON.parse(readFileSync(join(ROOT, 'data/index.json'), 'utf8'));
const XP_FILE = join(ROOT, 'data/experience.json');
const XP = existsSync(XP_FILE) ? JSON.parse(readFileSync(XP_FILE, 'utf8')) : { engagements: [] };
const HIRING = Boolean(CV.hire?.available);
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const plain = (s) => decode(s.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const prefix = (lang) => (isDefault(lang) ? BASE : `${BASE}/${lang}`);
const builtPage = (url) => url.startsWith(`${BASE}/`) && existsSync(join(SITE, url.slice(BASE.length + 1), 'index.html'));

// The glossary term a name stands for (its term or an alias), as scripts/lib/terms.mjs resolves it.
const termOf = (name) => GLOSSARY.find((t) => t.term === name || (t.aliases ?? []).includes(name));
// knowsAbout as data/ derives it: skill names in order, one per glossary term, unclaimed terms out.
const KNOWS = (() => {
  const names = [...INDEX.skills.languages.map((l) => l.name), ...INDEX.skills.technologies.map((t) => t.name),
    ...XP.engagements.flatMap((e) => e.technologies ?? [])];
  const seen = new Map();
  for (const n of names) {
    const t = termOf(n);
    if (t && t.claimed !== false && !seen.has(t.id)) seen.set(t.id, n);
  }
  return seen;
})();
const UNCLAIMED = GLOSSARY.filter((t) => t.claimed === false).flatMap((t) => [t.term, ...(t.aliases ?? [])]);
const PROFILES = new Set([ME.githubUrl, ME.gitlabUrl, ...Object.values(CV.links ?? {})]);

function checkPerson(rel, lang, person) {
  const knows = person.knowsAbout ?? [];
  const names = knows.map((k) => k.name);
  const want = [...KNOWS.values()];
  if (names.join('|') !== want.join('|')) fail(rel, `knowsAbout is [${names.join(', ')}], data/ derives [${want.join(', ')}]`);
  for (const k of knows) {
    if (k['@type'] !== 'DefinedTerm') fail(rel, `knowsAbout ${k.name} is not a DefinedTerm`);
    if (UNCLAIMED.includes(k.name)) fail(rel, `knowsAbout names ${k.name}, a term the owner does not claim`);
    const t = termOf(k.name);
    if (t && k.url !== `${prefix(lang)}/glossary/${t.id}/`) fail(rel, `knowsAbout ${k.name} url ${k.url} is not ${prefix(lang)}/glossary/${t.id}/`);
    else if (!builtPage(k.url)) fail(rel, `knowsAbout ${k.name} url ${k.url} is no page of the build`);
  }
  for (const u of person.sameAs ?? []) if (!PROFILES.has(u)) fail(rel, `sameAs ${u} is not a profile of the person (GitHub, GitLab, cv.toml [links])`);
  for (const r of CV.roles ?? []) {
    const prop = r.end ? 'alumniOf' : 'worksFor';
    const role = (person[prop] ?? []).find((x) => x['@type'] === 'OrganizationRole' && x.startDate === r.start &&
      (r.end ? x.endDate === r.end : x.endDate === undefined) && x[prop]?.name === r.organisation &&
      [r.title, r[`title_${lang}`]].includes(x.roleName));
    if (!role) fail(rel, `cv.toml role "${r.title}, ${r.organisation}" (${r.start}) is no dated OrganizationRole in ${prop}`);
    else if ((role[prop].url ?? null) !== (r.url ?? null)) fail(rel, `${r.organisation} has url ${role[prop].url}, cv.toml gives ${r.url ?? 'none'}`);
  }
}

function checkHire(rel, lang, text, graph) {
  const h1 = plain((text.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/) || [])[1] ?? '');
  if (!h1.includes(ME.author)) fail(rel, `the h1 "${h1}" does not name ${ME.author}`);
  // FAQPage parity, both ways.
  const faq = graph.find((n) => n['@type'] === 'FAQPage');
  const shown = [...text.matchAll(/<details\b[^>]*data-faq-item[^>]*>([\s\S]*?)<\/details>/g)].map((m) => ({
    q: plain((m[1].match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/) || [])[1] ?? ''),
    a: plain(m[1].replace(/<summary\b[\s\S]*?<\/summary>/, '')),
  }));
  if (!faq) fail(rel, 'no FAQPage while cv.toml [hire] available');
  else {
    const asked = (faq.mainEntity ?? []).map((q) => ({ q: q.name, a: q.acceptedAnswer?.text }));
    for (const x of asked) {
      const v = shown.find((s) => s.q === x.q);
      if (!v) fail(rel, `FAQPage question "${x.q}" is not a visible <summary>`);
      else if (v.a !== x.a) fail(rel, `FAQPage answer to "${x.q}" differs from the visible one`);
    }
    for (const s of shown) if (!asked.some((x) => x.q === s.q)) fail(rel, `visible question "${s.q}" is not in the FAQPage`);
  }
  // Every hire role links its evidence: a built work page of this language.
  const roles = CV.hire[`roles_${lang}`] ?? CV.hire.roles;
  const blocks = [...text.matchAll(/<p\b[^>]*data-hire-evidence="(\d+)"[^>]*>([\s\S]*?)<\/p>/g)];
  if (blocks.length !== roles.length) fail(rel, `${blocks.length} roles carry evidence, cv.toml [hire] has ${roles.length}`);
  for (const [, i, body] of blocks) {
    const hrefs = [...body.matchAll(/href="([^"]*)"/g)].map((m) => decode(m[1]));
    const work = hrefs.filter((u) => u.startsWith(`${prefix(lang)}/work/`) && builtPage(u));
    if (!work.length) fail(rel, `role ${i} links no built work page under ${prefix(lang)}/work/`);
    if (!isDefault(lang)) for (const u of hrefs) if (u.startsWith(`${BASE}/`) && !u.startsWith(`${prefix(lang)}/`)) fail(rel, `role ${i} links ${u}, outside ${prefix(lang)}/`);
  }
  // knowsAbout is what the page shows.
  const skills = new Set([...text.matchAll(/data-skill="([^"]*)"/g)].map((m) => decode(m[1])));
  for (const n of KNOWS.values()) if (!skills.has(n)) fail(rel, `knowsAbout ${n} is no visible row of the skills list`);
  for (const m of text.matchAll(/<time\b([^>]*)>/g)) {
    const dt = (m[1].match(/datetime="([^"]*)"/) || [])[1];
    if (!dt || !/^\d{4}(-\d{2}(-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?)?)?$/.test(dt)) fail(rel, `<time${m[1]}> has no valid datetime`);
  }
}
let hirePages = 0;

const html = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const path = join(dir, e.name);
  return e.isDirectory() ? html(path) : e.name.endsWith('.html') ? [path] : [];
});
const meta = (text, key) => {
  const m = text.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`));
  return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'") : null;
};
const pngSize = (file) => {
  const header = readFileSync(file).subarray(0, 24);
  return [header.readUInt32BE(16), header.readUInt32BE(20)];
};

const sitemap = readFileSync(join(SITE, 'sitemap.xml'), 'utf8');
const titles = new Map();
const descriptions = new Map();
const ogDescriptions = new Map();
const alternates = new Map(); // canonical -> {rel, lang -> href}
let pages = 0;
for (const file of html(SITE)) {
  const rel = file.slice(SITE.length + 1);
  const text = readFileSync(file, 'utf8');
  if (/<meta http-equiv="refresh"/.test(text)) continue;
  pages += 1;
  const title = (text.match(/<title>([^<]*)<\/title>/) || [])[1];
  if (!/<html lang="[a-z]{2}/.test(text)) fail(rel, 'no lang on <html>');
  if (!title) fail(rel, 'no <title>');
  if ((text.match(/<h1\b/g) || []).length !== 1) fail(rel, `has ${(text.match(/<h1\b/g) || []).length} <h1>, not 1`);
  if (rel === '404.html') {
    if (meta(text, 'robots') !== 'noindex, follow') fail(rel, '404 must be noindex');
    continue;
  }
  if (meta(text, 'robots') === 'noindex, follow') {
    // A tag with a single page (templates/partials/seo.html): kept for its links, never indexed.
    const here = `${BASE}/${rel.replace(/index\.html$/, '')}`;
    if (!/(^|\/)tags\//.test(rel)) fail(rel, 'noindex outside a tag page');
    if (sitemap.includes(`<loc>${here}</loc>`)) fail(rel, 'noindex but listed in sitemap.xml');
    continue;
  }
  if (title.length > LIMITS.title.max) fail(rel, `title is ${title.length} > ${LIMITS.title.max} characters`);
  if (titles.has(title)) fail(rel, `title duplicates ${titles.get(title)}`);
  titles.set(title, rel);
  const description = meta(text, 'description') || '';
  // A description or social description another page has too tells a search engine nothing about
  // this page (a template's README paragraph, a sentence with no fact of its own).
  for (const [key, value, seen] of [['description', description, descriptions], ['og:description', meta(text, 'og:description'), ogDescriptions]]) {
    if (!value) continue;
    if (seen.has(value)) fail(rel, `${key} duplicates ${seen.get(value)}`);
    seen.set(value, rel);
  }
  const { min, max } = LIMITS.description;
  if (description.length < min || description.length > max) fail(rel, `description is ${description.length} characters, not ${min}-${max}`);
  const canonical = (text.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  if (!canonical || !canonical.startsWith(`${BASE}/`)) fail(rel, `canonical ${canonical} is not absolute under ${BASE}`);
  else if (!sitemap.includes(`<loc>${canonical}</loc>`)) fail(rel, `canonical ${canonical} is not in sitemap.xml`);
  const links = Object.fromEntries([...text.matchAll(/<link rel="alternate" hreflang="([a-z-]+)" href="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  if (canonical) alternates.set(canonical, { rel, lang: (text.match(/<html lang="([a-z]{2})/) || [])[1], links });
  for (const key of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'twitter:card', 'twitter:image']) {
    if (!meta(text, key)) fail(rel, `no ${key}`);
  }
  if (meta(text, 'twitter:card') !== 'summary_large_image') fail(rel, 'twitter:card is not summary_large_image');
  const image = meta(text, 'og:image');
  if (image) {
    const local = join(SITE, image.replace(`${BASE}/`, ''));
    if (!image.startsWith(`${BASE}/`) || !existsSync(local)) fail(rel, `og:image ${image} is not in the build`);
    else {
      const [w, h] = pngSize(local);
      if (w !== OG_W || h !== OG_H) fail(rel, `og:image is ${w}x${h}, not ${OG_W}x${OG_H}`);
    }
  }
  const ld = text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!ld) fail(rel, 'no JSON-LD');
  else {
    let graph = null;
    try {
      graph = JSON.parse(ld[1])['@graph'];
      if (!Array.isArray(graph) || !graph.some((n) => n['@type'] === 'Person')) fail(rel, 'JSON-LD has no Person in @graph');
    } catch (error) {
      fail(rel, `JSON-LD does not parse: ${error.message}`);
    }
    const lang = (text.match(/<html lang="([a-z]{2})/) || [])[1];
    const person = Array.isArray(graph) ? graph.find((n) => n['@type'] === 'Person') : null;
    // The Person is the same node on every page; check it where it is the page's subject.
    if (person && meta(text, 'og:type') === 'profile') checkPerson(rel, lang, person);
    if (person && HIRING && languages().some((l) => rel === `${isDefault(l) ? '' : `${l}/`}hire/index.html`)) {
      hirePages += 1;
      checkHire(rel, lang, text, graph);
    }
  }
}

// hreflang: every indexable page names its translation in every language of zola.toml (the site
// is in all of them, check-i18n), itself and an x-default; every alternate is an indexable page of
// this build that names this page back (Google ignores one-way pairs).
const LANGS = languages();
let pairs = 0;
for (const [canonical, { rel, lang, links }] of alternates) {
  const langs = Object.keys(links).filter((l) => l !== 'x-default');
  for (const l of LANGS) if (!links[l]) fail(rel, `no hreflang ${l}`);
  if (!langs.length) continue;
  if (links[lang] !== canonical) fail(rel, `hreflang ${lang} is ${links[lang]}, not the page itself`);
  if (!links['x-default']) fail(rel, 'hreflang without x-default');
  for (const l of langs.filter((x) => x !== lang)) {
    const other = alternates.get(links[l]);
    if (!other) fail(rel, `hreflang ${l} ${links[l]} is no indexable page of the build`);
    else if (other.links[lang] !== canonical) fail(rel, `hreflang ${l} ${links[l]} does not name this page back`);
    else pairs += 1;
  }
}

if (HIRING && hirePages !== languages().length) fail('hire', `${hirePages} /hire/ pages checked, the site has ${languages().length} languages`);

if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  process.exit(1);
}
console.log(`seo: ${pages} pages, ${titles.size} indexable with unique titles and descriptions, tags, images and JSON-LD valid, ` +
  `hreflang ${LANGS.join('/')} on every one, ${pairs / 2} pairs mutual; knowsAbout ${KNOWS.size} terms, sameAs ` +
  `profiles only, ${(CV.roles ?? []).length} dated roles${HIRING ? `, /hire/ FAQ, evidence and times on ${hirePages} pages` : ''}, PASS`);
