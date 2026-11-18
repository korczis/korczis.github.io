#!/usr/bin/env node
// Gate for rule project.landing-contract over the built landing (public/index.html and every
// language's twin, or SITE_DIR). While data/cv.toml [hire] available is true it asserts:
//  - the chapter ids hero-title, terms, track, path, roles, case-majordomus, experience, skills,
//    body-of-work, instruments, proven, now, archive, faq and contact exist, in that order, the
//    same in every language (without availability: the chapters that do not hire);
//  - every <a> in <main> has an href that resolves to a built file, the page itself or an external
//    URL, and every fragment it names (#terms-*, #role-*, /hire/#role-*, /about/#cv-*, #faq-*, ...)
//    is an id of its target;
//  - at most four mailto: links in <main>;
//  - the landing's questions (#faq) are /hire/'s, in /hire/'s order, as a Flowbite accordion
//    (data-accordion="collapse", each question a button with aria-expanded and aria-controls, the
//    first open);
//  - every public repository data/experience.json names for a capability links its /work/ page;
//  - every role card (#role-<slug>) is a role of data/cv.toml, and data/role-slugs.json maps it;
//  - no library the owner does not claim (data/glossary.toml claimed = false, with its aliases)
//    appears in #skills, #roles or the sidebar's skillset ([data-skillset]);
//  - no "years of experience" and no "adopted" in <main>;
//  - nothing hidden (ADR 0007): no text inside aria-hidden="true", display:none, visibility:hidden
//    or a zero font size, no text in a `hidden` element that is not a responsive variant or a copy
//    button's state, no Unicode tag character, no screen-reader-only prose;
//  - the employer cards (#proof-<org>) are exactly the data/cv.toml roles that carry a url;
//  - no i18n value of a home_*, case_*, body_*, skills_*, proven_* or instruments_* key types a
//    digit outside a {placeholder} (rule project.data-measured).
//
// usage: npm run build && node scripts/check-landing.mjs
//        node scripts/check-landing.mjs --write   regenerate data/role-slugs.json ({slug: current
//          slug}: every current slug maps to itself; a slug a reworded role had keeps mapping to
//          the role now at its place, so an outreach link sent earlier still works); no build needed
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, identity, isDefault, languages, readToml } from './lib/derive.mjs';
import { loadStrings } from './lib/strings.mjs';
import { cliArgs } from './lib/cli.mjs';

const opts = cliArgs({ '--write': true });

const SITE = process.env.SITE_DIR || join(ROOT, 'public');
const SLUGS = join(ROOT, 'data/role-slugs.json');
const findings = [];
const fail = (where, what) => findings.push(`${where}: ${what}`);

const cv = readToml('data/cv.toml');
const experience = existsSync(join(ROOT, 'data/experience.json')) ? JSON.parse(readFileSync(join(ROOT, 'data/experience.json'), 'utf8')) : {};
const hire = cv.hire ?? {};
const available = hire.available === true;
const me = identity();
const langs = languages();
const prefix = (lang) => (isDefault(lang) ? '' : `${lang}/`);

// Tera's slugify for the ASCII the roles use: lower case, every run of other characters one dash.
const slugify = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const roleSlugs = (hire.roles ?? []).map((r) => slugify(r.split(':')[0]));

// --- data/role-slugs.json ------------------------------------------------------------------------
function slugMap() {
  const old = existsSync(SLUGS) ? JSON.parse(readFileSync(SLUGS, 'utf8')) : {};
  const previous = Object.keys(old).filter((k) => old[k] === k);
  const next = {};
  // A slug that was current and is not any more maps to the role now at its place; an alias that
  // led to it follows.
  previous.forEach((slug, i) => { if (!roleSlugs.includes(slug) && roleSlugs[i]) next[slug] = roleSlugs[i]; });
  for (const [k, v] of Object.entries(old)) {
    if (k in next || k === v) continue;
    next[k] = roleSlugs.includes(v) ? v : next[v] ?? roleSlugs[previous.indexOf(v)] ?? v;
  }
  // The current slugs first, in the roles' order (that order is how a later rewording is mapped),
  // then the aliases.
  return { ...Object.fromEntries(roleSlugs.map((slug) => [slug, slug])), ...next };
}
const slugText = `${JSON.stringify(slugMap(), null, 2)}\n`;
if (opts.write) {
  writeFileSync(SLUGS, slugText);
  console.log(`role-slugs: wrote ${Object.keys(slugMap()).length} slugs (${roleSlugs.length} current) to data/role-slugs.json`);
  process.exit(0);
}
if (!existsSync(SLUGS) || readFileSync(SLUGS, 'utf8') !== slugText) fail('data/role-slugs.json', 'is stale: run node scripts/check-landing.mjs --write');
const slugsOnDisk = existsSync(SLUGS) ? JSON.parse(readFileSync(SLUGS, 'utf8')) : {};
for (const [k, v] of Object.entries(slugsOnDisk)) if (!roleSlugs.includes(v)) fail('data/role-slugs.json', `${k} maps to ${v}, which is no current role`);

if (!existsSync(join(SITE, 'index.html'))) {
  console.error(`✗ ${SITE}/index.html does not exist: run npm run build first`);
  process.exit(1);
}

// --- HTML, read without a parser: tags balanced by name ------------------------------------------
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (html) => decode(html.replace(/<svg\b[\s\S]*?<\/svg>/g, ' ').replace(/<script\b[\s\S]*?<\/script>/g, ' ')
  .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// The element whose opening tag starts at `at`, with its end (the matching close tag).
function elementAt(html, at) {
  const name = html.slice(at + 1).match(/^([a-zA-Z][\w-]*)/)[1].toLowerCase();
  const openEnd = html.indexOf('>', at) + 1;
  if (VOID.has(name) || html[openEnd - 2] === '/') return html.slice(at, openEnd);
  const re = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi');
  re.lastIndex = openEnd;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(at, m.index + m[0].length);
  }
  return html.slice(at);
}
const byId = (html, id) => {
  const at = html.search(new RegExp(`<[a-zA-Z][\\w-]*\\b[^>]*\\sid="${id}"`));
  return at === -1 ? null : elementAt(html, at);
};
const mainOf = (html) => {
  const at = html.search(/<main\b/);
  return at === -1 ? '' : elementAt(html, at).replace(/<template\b[\s\S]*?<\/template>/g, '');
};
const idsOf = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const pages = new Map();
const builtFile = (path) => {
  const rel = path.replace(/^\//, '');
  const file = rel === '' || rel.endsWith('/') ? join(SITE, rel, 'index.html') : join(SITE, rel);
  return existsSync(file) ? file : null;
};
const htmlOf = (file) => {
  if (!pages.has(file)) pages.set(file, readFileSync(file, 'utf8'));
  return pages.get(file);
};

// --- the chapters ---------------------------------------------------------------------------------
const CHAPTERS = ['hero-title', 'terms', 'track', 'path', 'roles', 'case-majordomus', 'experience', 'skills',
  'body-of-work', 'instruments', 'proven', 'now', 'archive', 'faq', 'contact'];
const HIRE_ONLY = new Set(['terms', 'roles', 'faq']);
const want = CHAPTERS.filter((id) => available || !HIRE_ONLY.has(id));
const orders = {};

// Libraries the owner does not claim, by every name they go by.
const glossary = readToml('data/glossary.toml').terms ?? [];
const UNCLAIMED = [...new Set(glossary.filter((t) => t.claimed === false).flatMap((t) => [t.term, ...(t.aliases ?? [])]))];
const FORBIDDEN = [/years of experience/i, /\badopted\b/i];
// The project sites under this site's origin (data/projects.toml url) are other repositories' Pages.
const PROJECT_SITES = (readToml('data/projects.toml').projects ?? []).map((p) => p.url).filter((u) => u && u.startsWith(`${me.base}/`));
const employers = [...new Set((cv.roles ?? []).filter((r) => r.url).map((r) => slugify(r.organisation)))].sort();

let links = 0;
let fragments = 0;
for (const lang of langs) {
  const rel = `${prefix(lang)}index.html`;
  const file = join(SITE, rel);
  if (!existsSync(file)) { fail(rel, 'is not built'); continue; }
  const page = htmlOf(file);
  const main = mainOf(page);
  if (!main) { fail(rel, 'has no <main>'); continue; }
  const ids = idsOf(page);

  // Chapters, in order.
  const found = want.map((id) => [id, main.search(new RegExp(`\\sid="${id}"`))]);
  for (const [id, at] of found) if (at === -1) fail(rel, `has no chapter #${id}`);
  const present = found.filter(([, at]) => at !== -1);
  const order = [...present].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  if (order.join(' ') !== present.map(([id]) => id).join(' ')) fail(rel, `chapters are out of order: ${order.join(', ')}`);
  orders[lang] = order.join(' ');
  if (!main.includes('id="majordomus-title"')) fail(rel, 'the case study lost its heading #majordomus-title');

  // Every link resolves, every fragment names an element.
  let mailto = 0;
  for (const m of main.matchAll(/<a\b([^>]*)>/g)) {
    const attrs = m[1];
    const raw = attrs.match(/(?:^|\s)href="([^"]*)"/)?.[1];
    if (raw === undefined) { fail(rel, `an <a> in <main> has no href: <a${attrs.slice(0, 80)}>`); continue; }
    const href = decode(raw);
    links += 1;
    if (href.startsWith('mailto:')) { mailto += 1; continue; }
    let url;
    try { url = new URL(href, `${me.base}/${prefix(lang)}`); } catch { fail(rel, `href ${href} is no URL`); continue; }
    if (url.origin !== new URL(me.base).origin) {
      if (!/^https?:$/.test(url.protocol)) fail(rel, `href ${href} is neither a page nor a web address`);
      continue;
    }
    if (PROJECT_SITES.some((site) => url.href.startsWith(site))) continue;
    const target = builtFile(decodeURIComponent(url.pathname));
    if (!target) { fail(rel, `href ${href} leads to no built file`); continue; }
    if (url.hash && url.hash.length > 1) {
      fragments += 1;
      const id = decodeURIComponent(url.hash.slice(1));
      const there = target === file ? ids : idsOf(htmlOf(target));
      if (!there.has(id)) fail(rel, `href ${href}: ${target.slice(SITE.length + 1)} has no #${id}`);
    }
  }
  if (mailto > 4) fail(rel, `<main> holds ${mailto} mailto: links, at most 4 (the CTA budget)`);

  // Nothing hidden (ADR 0007).
  if (/[\u{E0000}-\u{E007F}]/u.test(page)) fail(rel, 'holds Unicode tag characters (invisible text)');
  const RESPONSIVE = /(?:^|\s)(?:sm|md|lg|xl|2xl):(?:block|flex|inline|inline-flex|inline-block|grid|table|table-row|table-cell|table-header-group|contents)\b/;
  for (const m of main.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
    const attrs = m[2];
    const cls = ` ${attrs.match(/\sclass="([^"]*)"/)?.[1] ?? ''} `;
    const style = attrs.match(/\sstyle="([^"]*)"/)?.[1] ?? '';
    let why = null;
    if (/\saria-hidden="true"/.test(attrs)) why = 'aria-hidden';
    else if (/display:\s*none|visibility:\s*hidden|font-size:\s*0(?![.\d])/.test(style)) why = `style "${style}"`;
    else if (/\shidden\s/.test(cls) && !RESPONSIVE.test(cls) && !/\sdata-copy-(?:success|default)/.test(attrs)) why = 'class hidden';
    else if (/\ssr-only\s/.test(cls)) {
      const t = text(elementAt(main, m.index));
      if (t.length > 160) fail(rel, `screen-reader-only prose (${t.length} characters): "${t.slice(0, 60)}…"`);
      continue;
    }
    if (!why) continue;
    const t = text(elementAt(main, m.index));
    if (t) fail(rel, `text inside an element hidden by ${why}: "${t.slice(0, 60)}"`);
  }

  // Labels: no inflation; no unclaimed library as a skill.
  const mainText = text(main);
  for (const re of FORBIDDEN) if (re.test(mainText)) fail(rel, `says "${mainText.match(re)[0]}" (rule project.landing-contract: public evidence, never that)`);
  for (const id of ['skills', 'roles']) {
    const part = byId(main, id);
    if (!part) continue;
    const t = text(part);
    for (const name of UNCLAIMED) if (t.includes(name)) fail(rel, `#${id} names ${name}, a library the owner does not claim`);
  }
  // The sidebar's skillset ([data-skillset], outside <main>) is a list of skills on the landing too.
  const skillset = page.match(/<div\b[^>]*\sdata-skillset[^>]*>/);
  if (!skillset) fail(rel, 'the sidebar has no skillset ([data-skillset])');
  else {
    const t = text(elementAt(page, skillset.index));
    for (const name of UNCLAIMED) if (t.includes(name)) fail(rel, `the sidebar skillset names ${name}, a library the owner does not claim`);
  }

  // Employer cards are the CV's roles with a url.
  const cards = [...main.matchAll(/\sid="proof-([a-z0-9-]+)"/g)].map((m) => m[1]).filter((s) => s !== 'majordomus' && s !== 'output').sort();
  if (cards.join(' ') !== employers.join(' ')) fail(rel, `employer cards are [${cards.join(', ')}], data/cv.toml roles with a url give [${employers.join(', ')}]`);

  if (available) {
    // Role cards: every one a current role, and data/role-slugs.json knows it.
    const cardsRoles = [...(byId(main, 'roles') ?? '').matchAll(/\sid="role-([a-z0-9-]+)"/g)].map((m) => m[1]);
    if (cardsRoles.join(' ') !== roleSlugs.join(' ')) fail(rel, `role cards are [${cardsRoles.join(', ')}], data/cv.toml [hire] roles give [${roleSlugs.join(', ')}]`);
    for (const s of cardsRoles) if (slugsOnDisk[s] !== s) fail(rel, `role ${s} is not in data/role-slugs.json`);

    // The FAQ asks /hire/'s questions, in /hire/'s order.
    const hireFile = join(SITE, prefix(lang), 'hire', 'index.html');
    if (!existsSync(hireFile)) fail(rel, `/${prefix(lang)}hire/ is not built`);
    else {
      const asked = [...htmlOf(hireFile).matchAll(/<details\b[^>]*data-faq-item[^>]*>[\s\S]*?<summary\b[^>]*>([\s\S]*?)<\/summary>/g)].map((x) => text(x[1]));
      const shown = [...(byId(main, 'faq') ?? '').matchAll(/<h3\b[^>]*id="faq-[^"]+"[^>]*>([\s\S]*?)<\/h3>/g)].map((x) => text(x[1]));
      if (!shown.length) fail(rel, '#faq asks no question');
      shown.forEach((q, i) => { if (q !== asked[i]) fail(rel, `#faq question ${i + 1} "${q}" is not /hire/'s "${asked[i] ?? '(none)'}"`); });
    }

    // Under md the FAQ is the Flowbite accordion: one collapse group, every question a button
    // with aria-expanded and aria-controls naming its answer, the first one open.
    const faq = byId(main, 'faq') ?? '';
    if (!/\sdata-accordion="collapse"/.test(faq)) fail(rel, '#faq is not a Flowbite accordion (data-accordion="collapse")');
    const triggers = [...faq.matchAll(/<button\b([^>]*)\sdata-accordion-target="#([^"]+)"([^>]*)>/g)].map((x) => ({ attrs: x[1] + x[3], body: x[2] }));
    if (triggers.length !== (faq.match(/<h3\b[^>]*id="faq-/g) ?? []).length) fail(rel, '#faq: not every question is an accordion trigger');
    triggers.forEach((t, i) => {
      const expanded = t.attrs.match(/\saria-expanded="(true|false)"/)?.[1];
      if (expanded !== (i === 0 ? 'true' : 'false')) fail(rel, `#faq trigger ${i + 1}: aria-expanded is ${expanded ?? 'missing'}, the first open and the rest closed`);
      if (!t.attrs.includes(` aria-controls="${t.body}"`)) fail(rel, `#faq trigger ${i + 1}: aria-controls does not name #${t.body}`);
      if (!new RegExp(`\\sid="${t.body}"`).test(faq)) fail(rel, `#faq trigger ${i + 1}: no answer #${t.body}`);
    });
  }

  // Client work: every public repository named for a capability is a link to its page.
  const xpPart = byId(main, 'experience') ?? '';
  for (const [cap, repos] of Object.entries(experience.public_work ?? {})) {
    if (!xpPart.includes(`id="xp-cap-${cap}"`)) continue;
    for (const repo of repos) {
      const a = xpPart.match(new RegExp(`<a\\s+href="([^"]+)"[^>]*\\sdata-public-work="${repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
      if (!a) fail(rel, `#xp-cap-${cap}: the public repository ${repo} is not a link`);
      else if (!/\/work\/[^/]+\/$|\/projects\/\?project=/.test(a[1])) fail(rel, `#xp-cap-${cap}: ${repo} links ${a[1]}, not its /work/<slug>/ page`);
    }
  }
}
const distinct = new Set(Object.values(orders));
if (distinct.size > 1) fail('public/', `the chapters differ between languages: ${Object.entries(orders).map(([l, o]) => `${l}: ${o}`).join(' | ')}`);

// --- i18n: the landing's words type no figure ----------------------------------------------------
const strings = loadStrings();
let keys = 0;
for (const [key, values] of Object.entries(strings)) {
  if (!/^(?:home|case|body|skills|proven|instruments)_/.test(key)) continue;
  keys += 1;
  for (const lang of langs) {
    // A name with a digit inside it (B2B) is a word, not a figure.
    const v = String(values[lang] ?? '').replace(/\{[a-z_]+\}/g, '').replace(/\b[A-Z]+\d[A-Z]+\b/g, '');
    if (/\d/.test(v)) fail(`i18n ${key}.${lang}`, `types a digit ("${values[lang]}"): a figure comes from data/ through a {placeholder}`);
  }
}

if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  process.exit(1);
}
console.log(`landing: ${want.length} chapters in order in ${langs.join(', ')}, ${links} links and ${fragments} fragments resolve, `
  + `${roleSlugs.length} roles, ${employers.length} employers, nothing hidden, ${keys} keys type no figure, PASS`);
