#!/usr/bin/env node
// Profile gate over the built site (rule project.hire-surfaces): one positioning, taken from
// data/cv.toml [hire], and a way to hire from every page. While hire.available is true:
//  - the home h1 of every language holds the author (zola.toml [extra] author) and the headline in
//    that language (headline, headline_<lang>);
//  - every built page has a link to its language's /hire/ (/<lang>/hire/ in another tree) inside
//    the topbar (<nav id="topbar">), so a reader who lands anywhere from search can hire;
//  - /about/'s role line ([data-role-line]) is the headline, and its Open to work badge links /hire/;
//  - the home's closing section is the hiring section ([data-hire-cta]) and links /hire/.
// While it is false: the home h1 does not carry the headline, and no topbar links /hire/.
// Always: availability has one source; no template reads gh.profile.hireable (GitHub's flag).
// Reads public/ (or SITE_DIR).
//
// usage: npm run build && node scripts/check-profile.mjs
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, identity, isDefault, languages, readToml } from './lib/derive.mjs';
import { cliArgs } from './lib/cli.mjs';

cliArgs();

const SITE = process.env.SITE_DIR || join(ROOT, 'public');
const findings = [];
const fail = (where, what) => findings.push(`${where}: ${what}`);

if (!existsSync(join(SITE, 'index.html'))) {
  console.error(`✗ ${SITE}/index.html does not exist: run npm run build first`);
  process.exit(1);
}

const cv = readToml('data/cv.toml');
const hire = cv.hire ?? {};
const available = hire.available === true;
const { author } = identity();
const langs = languages();
const prefix = (lang) => (isDefault(lang) ? '' : `${lang}/`);
const headlineIn = (lang) => (isDefault(lang) ? hire.headline : hire[`headline_${lang}`] ?? hire.headline);

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const element = (html, open, tag) => {
  const at = html.search(open);
  if (at === -1) return null;
  const end = html.indexOf(`</${tag}>`, at);
  return end === -1 ? null : html.slice(at, end + tag.length + 3);
};
// The links an element holds; the language switch (an <a hreflang>) leads to the other language's
// twin of the same page, so it is never the hiring link.
const hrefs = (html) => [...html.matchAll(/<a\b([^>]*)>/g)].map((m) => m[1])
  .filter((attrs) => !/\bhreflang=/.test(attrs))
  .map((attrs) => decode(attrs.match(/\bhref="([^"]*)"/)?.[1] ?? ''));
// A link to the language's /hire/, absolute (the base URL) or relative to the root.
const hireHref = (lang) => new RegExp(`(?:^|//[^/]+)/${prefix(lang)}hire/(?:[#?].*)?$`);
const html = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const path = join(dir, e.name);
  return e.isDirectory() ? html(path) : e.name.endsWith('.html') ? [path] : [];
});
const langOfPage = (rel) => langs.find((l) => !isDefault(l) && rel.startsWith(`${l}/`)) ?? langs[0];

// 1. One source of availability.
const templates = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const path = join(dir, e.name);
  return e.isDirectory() ? templates(path) : e.name.endsWith('.html') ? [path] : [];
});
for (const file of templates(join(ROOT, 'templates'))) {
  if (/\bhireable\b/.test(readFileSync(file, 'utf8'))) {
    fail(file.slice(ROOT.length + 1), 'reads gh.profile.hireable: availability comes only from data/cv.toml [hire] available');
  }
}

// 2. The home h1 and the closing section, per language.
for (const lang of langs) {
  const rel = `${prefix(lang)}index.html`;
  const page = readFileSync(join(SITE, rel), 'utf8');
  const h1 = element(page, /<h1\b/, 'h1');
  if (!h1) { fail(rel, 'has no <h1>'); continue; }
  const heading = text(h1);
  const headline = headlineIn(lang);
  if (available) {
    if (!headline) fail('data/cv.toml', `[hire] is available but has no headline${isDefault(lang) ? '' : `_${lang}`}`);
    if (!heading.includes(author)) fail(rel, `h1 "${heading}" does not name ${author}`);
    if (headline && !heading.includes(headline)) fail(rel, `h1 "${heading}" does not carry the headline "${headline}"`);
    const cta = element(page, /<section\b[^>]*data-hire-cta/, 'section');
    if (!cta) fail(rel, 'the closing section is not the hiring section ([data-hire-cta])');
    else if (!hrefs(cta).some((h) => hireHref(lang).test(h))) fail(rel, `the hiring section does not link /${prefix(lang)}hire/`);
  } else if (headline && heading.includes(headline)) {
    fail(rel, 'h1 carries the hire headline while data/cv.toml [hire] available is false');
  }
}

// 3. The topbar of every page links the language's /hire/ (and none does while unavailable).
let pages = 0;
for (const file of html(SITE)) {
  const rel = file.slice(SITE.length + 1);
  const page = readFileSync(file, 'utf8');
  if (/<meta http-equiv="refresh"/.test(page)) continue;
  pages += 1;
  const nav = element(page, /<nav\b[^>]*\bid="topbar"/, 'nav');
  if (!nav) { fail(rel, 'has no topbar (<nav id="topbar">)'); continue; }
  const lang = rel === '404.html' ? langs[0] : langOfPage(rel);
  const linked = hrefs(nav).some((h) => hireHref(lang).test(h));
  if (available && !linked) fail(rel, `the topbar does not link /${prefix(lang)}hire/`);
  if (!available && hrefs(nav).some((h) => /\/hire\/(?:[#?].*)?$/.test(h))) fail(rel, 'the topbar links /hire/ while the owner is not available');
}

// 4. /about/'s role line is the headline, and its badge leads to /hire/.
if (available) {
  for (const lang of langs) {
    const rel = `${prefix(lang)}about/index.html`;
    if (!existsSync(join(SITE, rel))) { fail(rel, 'does not exist'); continue; }
    const page = readFileSync(join(SITE, rel), 'utf8');
    const line = page.match(/<p\b[^>]*data-role-line[^>]*>([\s\S]*?)<\/p>/);
    if (!line) fail(rel, 'has no role line ([data-role-line])');
    else if (text(line[1]) !== headlineIn(lang)) fail(rel, `role line "${text(line[1])}" is not the headline "${headlineIn(lang)}"`);
    const card = element(page, /<section\b[^>]*aria-labelledby="profile-title"/, 'section') ?? '';
    if (!hrefs(card).some((h) => hireHref(lang).test(h))) fail(rel, `the profile card does not link /${prefix(lang)}hire/`);
  }
}

if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  process.exit(1);
}
console.log(`profile: ${available ? 'available' : 'not available'}; home h1 in ${langs.join(', ')}, `
  + `the topbar of ${pages} pages, /about/'s role line and no second source of availability, PASS`);
