#!/usr/bin/env node
// Derives the owner's CV as JSON Resume 1.0.0 (https://jsonresume.org/schema), one file per
// language: static/resume.json, and static/<lang>/resume.json for every other language of
// zola.toml. Sourcing tools, CV parsers and language models read this open format directly.
//
// Nothing here is typed; every field is read:
//   basics     the name (zola.toml [extra], native spelling in a translation), the label (the
//              headline of data/cv.toml [hire] while available, else the i18n software_engineer),
//              the email (data/github.json profile), the site, the avatar, the city and country of
//              zola.toml [extra] location (the country code resolved by Intl.DisplayNames), the
//              summary (the description of the about page in that language) and the profiles
//              (GitHub and GitLab logins, the links of data/cv.toml [links]);
//   work       data/cv.toml roles, word for word (titles, organisations, dates, summaries; an
//              anonymised organisation stays anonymised), in the language when a twin exists;
//   education, languages   data/cv.toml, the level through the i18n cv_level_<level>;
//   skills     data/index.json skills: every language and technology the glossary defines, with
//              the repositories or curated projects that show it as keywords;
//   projects   data/projects.toml, the curated catalogue: name, summary, site or repository, stack;
//   meta       the file's canonical URL, the schema version, and the date the data was measured.
//
// The schema is vendored at static/schemas/jsonresume.schema.json (jsonresume/resume-schema
// v1.0.0, MIT License, Copyright (c) 2014 JSON Resume) and served beside the site's own schemas;
// --check validates both files against it with the small validator below (the draft-04 keywords
// that schema uses, and nothing else: a keyword it does not know is a finding, not a pass).
//
// usage: node scripts/build-resume.mjs           write every resume.json
//        node scripts/build-resume.mjs --check   exit 1 if a file is stale or missing, or does not
//                                                validate against the vendored schema
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  CHECK, ROOT, config as siteConfig, contentPages, identity, isDefault, languages, local, readJson, readToml, report, t,
} from './lib/derive.mjs';
import { loadGlossary } from './lib/terms.mjs';
import { cliArgs } from './lib/cli.mjs';

cliArgs({ '--check': true }, { derived: true });

const SCHEMA_PATH = 'static/schemas/jsonresume.schema.json';
const SCHEMA_VERSION = 'v1.0.0';
const config = siteConfig();
const me = identity();
const cv = readToml('data/cv.toml');
const github = readJson('data/github.json');
const index = readJson('data/index.json');
const catalogue = readToml('data/projects.toml');
const glossary = loadGlossary(ROOT);
const pages = contentPages();
const termPages = new Set(pages.filter((p) => isDefault(p.lang) && p.rel.startsWith('glossary/')).map((p) => p.rel.replace(/^glossary\/|(\.[a-z]{2})?\.md$/g, '')));

// The text of a field in a language, the default language's when no twin exists.
const tr = (object, field, lang) => local(object, field, lang) ?? object?.[field];
const prefix = (lang) => (isDefault(lang) ? '' : `/${lang}`);
const target = (lang) => join(ROOT, 'static', prefix(lang).slice(1), 'resume.json');

// "Brno, Czech Republic" -> the city, and the ISO 3166 code whose name in a site language is the
// country part of the location in that language (Intl, never a typed table).
function location() {
  const parts = languages().map((l) => tr(config.extra, 'location', l)).filter(Boolean).map((s) => s.split(',').map((x) => x.trim()));
  const city = parts[0]?.[0];
  const names = new Set(parts.map((p) => p.at(-1)).filter((x) => x && x !== city));
  let countryCode = null;
  for (let a = 65; a <= 90 && !countryCode; a += 1) {
    for (let b = 65; b <= 90 && !countryCode; b += 1) {
      const code = String.fromCharCode(a, b);
      for (const l of languages()) {
        let name;
        try { name = new Intl.DisplayNames([l], { type: 'region', fallback: 'none' }).of(code); } catch { name = undefined; }
        if (name && names.has(name)) countryCode = code;
      }
    }
  }
  return { ...(city ? { city } : {}), ...(countryCode ? { countryCode } : {}) };
}

const NETWORK = { github: 'GitHub', gitlab: 'GitLab', linkedin: 'LinkedIn' };
function profiles() {
  const list = [
    { network: NETWORK.github, username: me.github, url: me.githubUrl },
    { network: NETWORK.gitlab, username: me.gitlab, url: me.gitlabUrl },
  ];
  for (const [key, url] of Object.entries(cv.links ?? {})) {
    list.push({ network: NETWORK[key] ?? key, username: new URL(url).pathname.split('/').filter(Boolean).at(-1), url });
  }
  return list;
}

function skills() {
  const termUrl = (name, lang) => {
    const id = glossary.byName.get(name.toLowerCase());
    return id && termPages.has(id) ? `${me.base}${prefix(lang)}/glossary/${id}/` : null;
  };
  return (lang) => [
    ...index.skills.languages.map((s) => ({ s, keywords: s.evidence.map((e) => e.name) })),
    ...index.skills.technologies.map((s) => ({ s, keywords: s.evidence.map((e) => e.name) })),
  ].filter(({ s }) => termUrl(s.name, lang))
    .map(({ s, keywords }) => ({ name: s.name, url: termUrl(s.name, lang), keywords }));
}
const skillsIn = skills();

function resume(lang) {
  const about = pages.find((p) => p.lang === lang && p.fm?.extra?.schema === 'profile');
  const hire = cv.hire?.available ? cv.hire : null;
  const label = hire ? tr(hire, 'headline', lang) : t('software_engineer', lang).replace(/\s*·\s*$/, '');
  const measured = [github.generated_at, index.generated_at].filter(Boolean).sort().at(-1);
  return {
    $schema: `${me.base}/schemas/jsonresume.schema.json`,
    basics: {
      name: me.nameIn(lang),
      label,
      image: `https://avatars.githubusercontent.com/${me.github}`,
      ...(github.profile?.email ? { email: github.profile.email } : {}),
      url: `${me.base}${prefix(lang)}/`,
      ...(about?.fm?.description ? { summary: about.fm.description } : {}),
      location: location(),
      profiles: profiles(),
    },
    work: (cv.roles ?? []).map((r) => ({
      name: r.organisation,
      position: tr(r, 'title', lang),
      ...(r.url ? { url: r.url } : {}),
      startDate: r.start,
      ...(r.end ? { endDate: r.end } : {}),
      ...(tr(r, 'summary', lang) ? { summary: tr(r, 'summary', lang) } : {}),
    })),
    education: (cv.education ?? []).map((e) => ({
      institution: e.institution,
      ...(e.url ? { url: e.url } : {}),
      area: tr(e, 'degree', lang),
      ...(e.start ? { startDate: e.start } : {}),
      ...(e.end ? { endDate: e.end } : {}),
    })),
    skills: skillsIn(lang),
    languages: (cv.languages ?? []).map((l) => ({ language: tr(l, 'name', lang), fluency: t(`cv_level_${l.level}`, lang) })),
    projects: catalogue.projects.map((p) => ({
      name: p.name,
      description: tr(p, 'summary', lang).replace(/\s+/g, ' ').trim(),
      url: p.url ?? me.repoUrl(p.repo),
      keywords: p.stack ?? [],
    })),
    meta: {
      canonical: `${me.base}${prefix(lang)}/resume.json`,
      version: SCHEMA_VERSION,
      ...(measured ? { lastModified: measured } : {}),
    },
  };
}

// The draft-04 keywords the vendored schema uses: type, properties, additionalProperties, items,
// additionalItems, $ref (to #/definitions), pattern, format (uri, email, date). Annotations
// (title, description, $schema, definitions) carry no constraint.
const KNOWN = new Set(['type', 'properties', 'additionalProperties', 'items', 'additionalItems', '$ref', 'pattern', 'format', 'title', 'description', '$schema', 'definitions']);
const FORMATS = {
  uri: (v) => { try { return Boolean(new URL(v)); } catch { return false; } },
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
};
function validate(data, root) {
  const found = [];
  const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v);
  const walk = (value, rule, where) => {
    for (const key of Object.keys(rule)) if (!KNOWN.has(key)) found.push(`${where}: the schema uses ${key}, which this validator does not check`);
    if (rule.$ref) {
      const ref = rule.$ref.match(/^#\/definitions\/(.+)$/)?.[1];
      if (!ref || !root.definitions?.[ref]) return found.push(`${where}: unresolved $ref ${rule.$ref}`);
      walk(value, root.definitions[ref], where);
    }
    const type = typeOf(value);
    const types = [rule.type].flat().filter(Boolean);
    if (types.length && !types.includes(type) && !(type === 'integer' && types.includes('number'))) {
      return found.push(`${where}: expected ${types.join(' or ')}, got ${type}`);
    }
    if (type === 'string') {
      if (rule.pattern && !new RegExp(rule.pattern, 'u').test(value)) found.push(`${where}: "${value}" does not match ${rule.pattern}`);
      if (rule.format && FORMATS[rule.format] && !FORMATS[rule.format](value)) found.push(`${where}: "${value}" is not a valid ${rule.format}`);
      if (rule.format && !FORMATS[rule.format]) found.push(`${where}: format ${rule.format} is not checked by this validator`);
    }
    if (type === 'array' && rule.items && !Array.isArray(rule.items)) value.forEach((item, i) => walk(item, rule.items, `${where}[${i}]`));
    if (type === 'object') {
      for (const [key, v] of Object.entries(value)) {
        if (rule.properties?.[key]) walk(v, rule.properties[key], `${where}.${key}`);
        else if (rule.additionalProperties === false) found.push(`${where}: ${key} is not allowed by the schema`);
      }
    }
    return found;
  };
  walk(data, root, '$');
  return found;
}

const schema = existsSync(join(ROOT, SCHEMA_PATH)) ? readJson(SCHEMA_PATH) : null;
const findings = [];
if (!schema) findings.push(`${SCHEMA_PATH} is missing (vendor jsonresume/resume-schema ${SCHEMA_VERSION})`);
const written = [];
for (const lang of languages()) {
  const data = resume(lang);
  const text = `${JSON.stringify(data, null, 1)}\n`;
  const file = target(lang);
  const rel = file.slice(ROOT.length + 1);
  if (schema) findings.push(...validate(data, schema).map((f) => `${rel}: ${f}`));
  if (CHECK) {
    if (!existsSync(file)) findings.push(`${rel} is missing`);
    else if (readFileSync(file, 'utf8') !== text) findings.push(`${rel} is stale`);
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  written.push(`${rel} (${data.work.length} roles, ${data.skills.length} skills, ${data.projects.length} projects)`);
}
report([...new Set(findings)], `JSON Resume ${SCHEMA_VERSION}: ${written.join(', ')} ${CHECK ? 'current' : 'written'}, valid against ${SCHEMA_PATH}`);
