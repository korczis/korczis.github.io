#!/usr/bin/env node
// SEO gate over the built site (rule project.seo-derived): every indexable page has a unique title
// (at most 70 characters), a description of 50-165 characters, an absolute canonical URL listed in
// the sitemap, Open Graph and Twitter tags whose image exists in the build at 1200x630, valid
// JSON-LD, exactly one <h1> and a lang attribute; 404.html is noindex. Reads public/ (or SITE_DIR).
//
// usage: npm run build && node scripts/check-seo.mjs
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.SITE_DIR || join(ROOT, 'public');
const BASE = parse(readFileSync(join(ROOT, 'zola.toml'), 'utf8')).base_url.replace(/\/$/, '');
const findings = [];
const fail = (where, what) => findings.push(`${where}: ${what}`);

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
  if (title.length > 70) fail(rel, `title is ${title.length} > 70 characters`);
  if (titles.has(title)) fail(rel, `title duplicates ${titles.get(title)}`);
  titles.set(title, rel);
  const description = meta(text, 'description') || '';
  if (description.length < 50 || description.length > 165) fail(rel, `description is ${description.length} characters, not 50-165`);
  const canonical = (text.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  if (!canonical || !canonical.startsWith(`${BASE}/`)) fail(rel, `canonical ${canonical} is not absolute under ${BASE}`);
  else if (!sitemap.includes(`<loc>${canonical}</loc>`)) fail(rel, `canonical ${canonical} is not in sitemap.xml`);
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
      if (w !== 1200 || h !== 630) fail(rel, `og:image is ${w}x${h}, not 1200x630`);
    }
  }
  const ld = text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!ld) fail(rel, 'no JSON-LD');
  else {
    try {
      const graph = JSON.parse(ld[1])['@graph'];
      if (!Array.isArray(graph) || !graph.some((n) => n['@type'] === 'Person')) fail(rel, 'JSON-LD has no Person in @graph');
    } catch (error) {
      fail(rel, `JSON-LD does not parse: ${error.message}`);
    }
  }
}

if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  process.exit(1);
}
console.log(`seo: ${pages} pages, ${titles.size} unique titles, tags, images and JSON-LD valid, PASS`);
