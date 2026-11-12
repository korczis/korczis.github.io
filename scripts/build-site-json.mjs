#!/usr/bin/env node
// Derives static/site.json: the whole site as data, for machines. Every page with its front
// matter (url, title, description, JSON-LD type, OG image, keywords), every category with its
// counts, every curated project and every original repository with its links. Nothing here is
// typed: it is read from content/, data/projects.toml and data/index.json.
//
// usage: node scripts/build-site-json.mjs           write static/site.json
//        node scripts/build-site-json.mjs --check   exit 1 if the committed file is stale
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'static/site.json');
const config = parse(readFileSync(join(ROOT, 'zola.toml'), 'utf8'));
const catalogue = parse(readFileSync(join(ROOT, 'data/projects.toml'), 'utf8'));
const index = JSON.parse(readFileSync(join(ROOT, 'data/index.json'), 'utf8'));
const base = config.base_url.replace(/\/$/, '');

const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const path = join(dir, e.name);
  return e.isDirectory() ? files(path) : e.name.endsWith('.md') ? [path] : [];
});
function urlOf(file, fm) {
  const rel = relative(join(ROOT, 'content'), file).replace(/\\/g, '/');
  if (fm.path) return `${base}/${fm.path}/`;
  if (rel === '_index.md') return `${base}/`;
  if (rel.endsWith('/_index.md')) return `${base}/${rel.slice(0, -'_index.md'.length)}`;
  return `${base}/${rel.replace(/\.md$/, '')}/`;
}

const pages = files(join(ROOT, 'content')).map((file) => {
  const fm = parse(readFileSync(file, 'utf8').match(/^\+\+\+\n([\s\S]*?)\n\+\+\+/)[1]);
  return {
    url: urlOf(file, fm),
    title: fm.extra?.seo_title ?? (fm.title ? `${fm.title} · ${config.title}` : config.title),
    description: fm.description,
    type: fm.extra?.schema ?? null,
    category: fm.extra?.category ?? null,
    og_image: fm.extra?.og_image ? `${base}/${fm.extra.og_image}` : null,
    keywords: fm.extra?.keywords ?? [],
  };
}).sort((a, b) => a.url.localeCompare(b.url));

const site = {
  schema: 'korczis-hub-site/v1',
  url: `${base}/`,
  name: config.title,
  description: config.description,
  author: { name: config.extra.author, github: `https://github.com/${config.extra.github}`, gitlab: `https://gitlab.com/${config.extra.github}`, location: config.extra.location },
  front_matter_schema: `${base}/schemas/front-matter.schema.json`,
  data_as_of: { snapshot: JSON.parse(readFileSync(join(ROOT, 'data/github.json'), 'utf8')).generated_at, index: index.generated_at },
  pages,
  categories: Object.entries(catalogue.categories).map(([key, c]) => ({
    key, name: c.name, description: c.description, url: `${base}/projects/${key}/`, repositories: index.by_category[key] ?? 0,
  })),
  projects: catalogue.projects.map((p) => ({
    name: p.name, repo: `https://github.com/korczis/${p.repo}`, url: `${base}/projects/?project=${p.repo}`,
    site: p.url ?? null, category: p.category, tagline: p.tagline, stack: p.stack,
  })),
  repositories: index.repos.map((r) => ({
    name: r.name, description: r.description, language: r.language, category: r.category,
    github: r.hosts.github ?? null, gitlab: r.hosts.gitlab ?? null, site: r.site, created: r.created_at, active: r.pushed_at,
  })),
  counts: index.counts,
};

const text = `${JSON.stringify(site, null, 1)}\n`;
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(TARGET, 'utf8'); } catch {}
  if (current !== text) { console.error('static/site.json is stale: run npm run site'); process.exit(1); }
  console.log('static/site.json is current');
} else {
  writeFileSync(TARGET, text);
  console.log(`static/site.json: ${pages.length} pages, ${site.categories.length} categories, ${site.repositories.length} repositories`);
}
