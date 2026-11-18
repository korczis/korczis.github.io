#!/usr/bin/env node
// Every original repository has its own page, complete (rule project.every-repository-page). Reads
// the built site (public/, or SITE_DIR) against the one set, the original repositories of
// data/index.json, and fails when:
//   - an original repository has no page in some language, or a built work page has no repository;
//   - a page lacks its <title> (naming the repository), description, og:title, og:description,
//     og:image (in the build, at the OG size), canonical (its own address, in the sitemap with a
//     lastmod), hreflang for every language and x-default, or JSON-LD whose page entity is a
//     SoftwareSourceCode with a codeRepository for every forge the repository is on, its languages,
//     its dates and its state (active or archive, as data/recent.json measured it);
//   - it links none of its own tag pages (/tags/<tag>/, its category and languages);
//   - static/llms-full.txt or static/site.json does not name the page in every language, or
//     site.json's pages[] gives it no category.
//
// usage: npm run build && node scripts/check-work-pages.mjs
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, identity, isDefault, languages, limits, readJson, report, slug, t } from './lib/derive.mjs';
import { cliArgs } from './lib/cli.mjs';

cliArgs();

const SITE = process.env.SITE_DIR || join(ROOT, 'public');
const me = identity();
const { width: OG_W, height: OG_H } = limits().og;
const index = readJson('data/index.json');
const recent = new Map(readJson('data/recent.json').repos.map((r) => [r.name, r]));
const llms = readFileSync(join(ROOT, 'static/llms-full.txt'), 'utf8');
const siteJson = readJson('static/site.json');
const site = new Map(siteJson.repositories.map((r) => [r.name, r]));
const sitePages = new Map(siteJson.pages.map((p) => [p.url, p]));
const sitemap = existsSync(join(SITE, 'sitemap.xml')) ? readFileSync(join(SITE, 'sitemap.xml'), 'utf8') : '';
const findings = [];
const fail = (where, what) => findings.push(`${where}: ${what}`);
if (!sitemap) report([`${SITE}/sitemap.xml is missing; run npm run build first`]);

const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const meta = (html, key) => {
  const m = html.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`));
  return m ? unescape(m[1]) : null;
};
const pngSize = (file) => {
  const header = readFileSync(file).subarray(0, 24);
  return [header.readUInt32BE(16), header.readUInt32BE(20)];
};
const prefixOf = (lang) => (isDefault(lang) ? '' : `${lang}/`);
const LANGS = languages();

let pages = 0;
for (const r of index.repos) {
  const s = slug(r.name);
  const detail = recent.get(r.name);
  const forges = Object.values(r.hosts);
  for (const lang of LANGS) {
    const rel = `${prefixOf(lang)}work/${s}/index.html`;
    const url = `${me.base}/${prefixOf(lang)}work/${s}/`;
    const file = join(SITE, rel);
    if (!existsSync(file)) { fail(rel, `${r.name} is an original repository of data/index.json without its page`); continue; }
    pages += 1;
    const html = readFileSync(file, 'utf8');
    const title = unescape((html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? '');
    if (!title) fail(rel, 'no <title>');
    for (const key of ['description', 'og:title', 'og:description', 'og:image', 'twitter:image']) if (!meta(html, key)) fail(rel, `no ${key}`);
    const image = meta(html, 'og:image');
    if (image) {
      const local = join(SITE, image.replace(`${me.base}/`, ''));
      if (!existsSync(local)) fail(rel, `og:image ${image} is not in the build`);
      else {
        const [w, h] = pngSize(local);
        if (w !== OG_W || h !== OG_H) fail(rel, `og:image is ${w}x${h}, not ${OG_W}x${OG_H}`);
      }
    }
    const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/) ?? [])[1];
    if (canonical !== url) fail(rel, `canonical ${canonical} is not ${url}`);
    const entry = sitemap.match(new RegExp(`<loc>${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>\\s*<lastmod>`));
    if (!entry) fail(rel, 'not in sitemap.xml with a lastmod');
    const alternates = Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="([a-z-]+)" href="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    for (const l of [...LANGS, 'x-default']) if (!alternates[l]) fail(rel, `no hreflang ${l}`);
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    let code = null;
    try {
      const graph = JSON.parse(ld?.[1] ?? 'null')?.['@graph'] ?? [];
      code = graph.map((n) => n.mainEntity).find((e) => e?.['@type'] === 'SoftwareSourceCode') ?? null;
    } catch (error) {
      fail(rel, `JSON-LD does not parse: ${error.message}`);
    }
    if (!code) { fail(rel, 'JSON-LD has no SoftwareSourceCode as the page entity'); continue; }
    const repos = [code.codeRepository].flat();
    for (const u of forges) if (!repos.includes(u)) fail(rel, `JSON-LD codeRepository lacks ${u}`);
    if (!code.dateCreated || !code.dateModified) fail(rel, 'JSON-LD SoftwareSourceCode has no dateCreated or dateModified');
    if ((detail?.languages?.length || detail?.language) && !code.programmingLanguage?.length) fail(rel, 'JSON-LD SoftwareSourceCode has no programmingLanguage');
    if (Array.isArray(code.programmingLanguage) && !code.programmingLanguage.length) fail(rel, 'JSON-LD SoftwareSourceCode has an empty programmingLanguage');
    // Each tag of the page (its category and languages) links its own tag page, not only /tags/.
    const tagsHere = [...html.matchAll(/<a [^>]*href="([^"]*\/tags\/[^"/]+\/)"/g)].length;
    if (!tagsHere) fail(rel, 'links no tag page of its own (/tags/<tag>/)');
    const state = t(detail?.period ? 'active' : 'archive', lang);
    if (code.creativeWorkStatus !== state) fail(rel, `JSON-LD creativeWorkStatus is ${code.creativeWorkStatus}, not ${state} as data/recent.json measured`);
  }
  // Every language's page, in llms-full.txt and site.json (repositories[].pages, and pages[] with
  // the repository's category).
  for (const lang of LANGS) {
    const url = `${me.base}/${prefixOf(lang)}work/${s}/`;
    if (!llms.includes(` ${url}`)) fail('static/llms-full.txt', `does not name the ${lang} page of ${r.name}`);
    if (site.get(r.name)?.pages?.[lang] !== url) fail('static/site.json', `repositories[] does not name the ${lang} page of ${r.name}`);
    const entry = sitePages.get(url);
    if (!entry) fail('static/site.json', `pages[] does not list ${url}`);
    else if (entry.category !== r.category) fail('static/site.json', `pages[] gives ${url} the category ${entry.category}, not ${r.category}`);
  }
  if (site.get(r.name)?.page !== `${me.base}/work/${s}/`) fail('static/site.json', `does not name the page of ${r.name}`);
}

// No built work page without its repository.
const own = new Set(index.repos.map((r) => slug(r.name)));
for (const lang of LANGS) {
  const dir = join(SITE, `${prefixOf(lang)}work`);
  for (const e of existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []) {
    if (e.isDirectory() && !own.has(e.name)) fail(`${prefixOf(lang)}work/${e.name}/`, 'is a work page without an original repository in data/index.json');
  }
}

report(findings, `work pages: ${index.repos.length} original repositories, ${pages} pages in ${LANGS.join('/')}, each with title, ` +
  'description, OG card, canonical in the sitemap, hreflang, SoftwareSourceCode on every forge, in llms-full.txt and site.json, PASS', 'run npm run derive && npm run build');
