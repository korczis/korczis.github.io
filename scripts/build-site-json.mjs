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
import { CHECK, ROOT, config as siteConfig, contentPages, identity, isDefault, languages, readJson, readToml, report, slug } from './lib/derive.mjs';
import { cliArgs } from './lib/cli.mjs';

cliArgs({ '--check': true }, { derived: true });

const TARGET = join(ROOT, 'static/site.json');
const config = siteConfig();
const catalogue = readToml('data/projects.toml');
const index = readJson('data/index.json');
const me = identity();
const cv = readToml('data/cv.toml');
const base = me.base;
const detail = new Map(readJson('data/recent.json').repos.map((r) => [r.name, r]));

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
    // A category page names its category; a work page is in its repository's.
    category: fm.extra?.category ?? detail.get(fm.extra?.repo)?.category ?? null,
    og_image: fm.extra?.og_image ? `${base}/${fm.extra.og_image}` : null,
    keywords: fm.extra?.keywords ?? [],
  };
}).sort((a, b) => a.url.localeCompare(b.url));

const site = {
  schema: 'korczis-hub-site/v1',
  url: `${base}/`,
  name: config.title,
  description: config.description,
  author: {
    name: me.author, github: me.githubUrl, gitlab: me.gitlabUrl, location: config.extra.location,
    // The owner's facts (ADR 0004, 0007): profile links, availability for hire and the work history,
    // so a consumer of this file (the GitHub profile README, ADR 0004) states them without a copy.
    ...Object.fromEntries(Object.entries(cv.links ?? {})),
    email: readJson('data/github.json').profile?.email ?? null,
  },
  hire: cv.hire?.available ? {
    url: `${base}/hire/`, headline: cv.hire.headline, roles: cv.hire.roles, engagement: cv.hire.engagement,
    workplace: cv.hire.workplace, regions: cv.hire.regions, since: cv.hire.since ?? null,
    rate: cv.hire.rate_from ? { from: cv.hire.rate_from, currency: cv.hire.rate_currency, unit: cv.hire.rate_unit } : null,
  } : null,
  experience: (cv.roles ?? []).map((r) => ({ title: r.title, organisation: r.organisation, url: r.url ?? null, start: r.start, end: r.end ?? null })),
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
  // Every original repository with its own page (scripts/build-work.mjs) and its measured dates:
  // the last commit, and recent (the period of months that holds it) or archive (period null).
  repositories: index.repos.map((r) => {
    const d = detail.get(r.name);
    return {
      name: r.name, description: r.description, language: r.language, category: r.category,
      // Its page in every language (the default language at the root, every other under /<lang>/).
      page: `${base}/work/${slug(r.name)}/`,
      pages: Object.fromEntries(languages().map((l) => [l, `${base}${isDefault(l) ? '' : `/${l}`}/work/${slug(r.name)}/`])),
      github: r.hosts.github ?? null, gitlab: r.hosts.gitlab ?? null, site: r.site, created: r.created_at, active: r.pushed_at,
      last_commit: d?.last_commit ?? null, period: d ? d.period : null, archive: d ? d.period === null : null,
      stars: r.stars, supervised: r.supervised ?? null,
    };
  }),
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
