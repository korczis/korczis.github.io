#!/usr/bin/env node
// Derives static/site.json: the whole site as data, for machines. Every page with its front
// matter (url, title, description, JSON-LD type, OG image, keywords), every category with its
// counts, every curated project and every original repository with its links. Nothing here is
// typed: it is read from content/, data/projects.toml and data/index.json.
//
// usage: node scripts/build-site-json.mjs           write static/site.json
//        node scripts/build-site-json.mjs --check   exit 1 if the committed file is stale
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHECK, ROOT, config as siteConfig, contentPages, identity, isDefault, readJson, readToml, report } from './lib/derive.mjs';

const TARGET = join(ROOT, 'static/site.json');
const config = siteConfig();
const catalogue = readToml('data/projects.toml');
const index = readJson('data/index.json');
const me = identity();
const base = me.base;

// The public URL of a content file: a translation (x.cs.md) lives under /cs/.
function urlOf({ rel: file, lang }, fm) {
  if (fm.path) return `${base}/${fm.path}/`;
  const prefix = isDefault(lang) ? '' : `/${lang}`;
  const rel = file.replace(/\.[a-z]{2}\.md$/, '.md');
  if (rel === '_index.md') return `${base}${prefix}/`;
  if (rel.endsWith('/_index.md')) return `${base}${prefix}/${rel.slice(0, -'_index.md'.length)}`;
  return `${base}${prefix}/${rel.replace(/\.md$/, '')}/`;
}

const pages = contentPages().map((page) => {
  const fm = page.fm;
  if (!fm) throw new Error(`${page.path} has no front matter`);
  return {
    url: urlOf(page, fm),
    lang: page.lang,
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
  author: { name: me.author, github: me.githubUrl, gitlab: me.gitlabUrl, location: config.extra.location },
  front_matter_schema: `${base}/schemas/front-matter.schema.json`,
  data_as_of: { snapshot: readJson('data/github.json').generated_at, index: index.generated_at },
  pages,
  categories: Object.entries(catalogue.categories).map(([key, c]) => ({
    key, name: c.name, description: c.description, url: `${base}/projects/${key}/`, repositories: index.by_category[key] ?? 0,
  })),
  projects: catalogue.projects.map((p) => ({
    name: p.name, repo: me.repoUrl(p.repo), url: `${base}/projects/?project=${p.repo}`,
    site: p.url ?? null, category: p.category, tagline: p.tagline, stack: p.stack,
  })),
  repositories: index.repos.map((r) => ({
    name: r.name, description: r.description, language: r.language, category: r.category,
    github: r.hosts.github ?? null, gitlab: r.hosts.gitlab ?? null, site: r.site, created: r.created_at, active: r.pushed_at,
  })),
  counts: index.counts,
};

const text = `${JSON.stringify(site, null, 1)}\n`;
if (CHECK) {
  let current = '';
  try { current = readFileSync(TARGET, 'utf8'); } catch {}
  report(current === text ? [] : ['static/site.json is stale'], 'static/site.json is current');
} else {
  writeFileSync(TARGET, text);
  console.log(`static/site.json: ${pages.length} pages, ${site.categories.length} categories, ${site.repositories.length} repositories`);
}
