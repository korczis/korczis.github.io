// What every generator and gate of the site shares, so none keeps its own copy (audit F10):
//   config(), languages(), identity()   zola.toml: the site's languages and the owner, never typed
//   limits()                            static/schemas/front-matter.schema.json: lengths and sizes
//   contentPages()                      every content/*.md with its parsed front matter and body
//   writeOrCheck()                      write derived files, or --check them (stale, missing, orphaned)
//   t(), plural()                       i18n/*.toml through loadStrings(), with {var} and plural forms
//   clip(), slug(), pool(), local()     small helpers that were copy-pasted three times
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { loadStrings } from './strings.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CONTENT = join(ROOT, 'content');
export const CHECK = process.argv.includes('--check');
// The one hint every stale derived file gives: npm run derive regenerates all of them offline.
export const HINT = 'run npm run derive';

export const readToml = (rel) => parse(readFileSync(join(ROOT, rel), 'utf8'));
export const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
export const q = (s) => JSON.stringify(s);

let configCache = null;
export function config() {
  configCache ??= readToml('zola.toml');
  return configCache;
}

// The site's languages, the default first: zola.toml's default_language and [languages.*].
export function languages() {
  const c = config();
  return [c.default_language, ...Object.keys(c.languages ?? {}).filter((l) => l !== c.default_language)];
}
export const defaultLanguage = () => config().default_language;
export const isDefault = (lang) => lang === defaultLanguage();
// "x.md" in the default language, "x.cs.md" in another; OG images carry "cs-" the same way.
export const suffix = (lang) => (isDefault(lang) ? '' : `.${lang}`);
export const ogPrefix = (lang) => (isDefault(lang) ? '' : `${lang}-`);
// A content file's language from its name (x.cs.md -> cs), the default otherwise.
export function langOf(file) {
  const m = file.match(/\.([a-z]{2})\.md$/);
  return m && languages().includes(m[1]) ? m[1] : defaultLanguage();
}
// A curated text field in a language: `name` in the default, `name_cs` in Czech (check-i18n twins).
// No fallback to the default language: a caller that has one says so.
export const local = (object, field, lang) => (isDefault(lang) ? object?.[field] : object?.[`${field}_${lang}`]);

// The owner, from zola.toml [extra]: every login, name and URL a script needs.
export function identity() {
  const c = config();
  const e = c.extra ?? {};
  for (const key of ['author', 'github']) if (!e[key]) throw new Error(`zola.toml [extra] has no ${key}`);
  const base = c.base_url.replace(/\/$/, '');
  return {
    author: e.author,
    authorNative: e.author_native ?? e.author,
    // The name as written in a language: the native spelling in every language but the default.
    nameIn: (lang) => (isDefault(lang) ? e.author : e.author_native ?? e.author),
    github: e.github,
    // zola.toml [extra] gitlab, when the GitLab login differs; the GitHub login otherwise.
    gitlab: e.gitlab ?? e.github,
    githubUrl: `https://github.com/${e.github}`,
    gitlabUrl: `https://gitlab.com/${e.gitlab ?? e.github}`,
    repoUrl: (repo) => `https://github.com/${e.github}/${repo}`,
    base,
    host: new URL(base).host,
    majordomusUrl: e.majordomus_url ?? null,
    majordomusBuild: e.majordomus_build ?? null,
  };
}

// The limits pages are held to, read from the front-matter schema (gates-dx owns it), so no script
// types 50, 165 or 70. The OG image size is not in the schema yet; it is kept here, once.
export function limits() {
  const schema = readJson('static/schemas/front-matter.schema.json');
  const extra = schema.properties.extra.properties;
  const og = extra.og_image;
  return {
    description: { min: schema.properties.description.minLength, max: schema.properties.description.maxLength },
    title: { max: extra.seo_title.maxLength },
    ogTitle: { min: extra.og_title.minLength, max: extra.og_title.maxLength },
    og: { width: og['x-width'] ?? 1200, height: og['x-height'] ?? 630, maxBytes: og['x-max-bytes'] },
  };
}

// How often the data is re-measured, from .github/workflows/refresh.yml (the source of truth),
// never typed: { unit: 'hours' | 'days' | 'weeks', n }. The schedule may fire more often than
// it measures (it fires hourly because GitHub drops scheduled runs); then REFRESH_HOURS in the
// workflow is the cadence, and it must be a multiple of the cron's interval. Throws on a schedule
// it cannot read, so a changed cron is noticed instead of misdescribed.
export function cadence(workflow = '.github/workflows/refresh.yml') {
  const text = readFileSync(join(ROOT, workflow), 'utf8');
  const cron = text.match(/cron:\s*['"]([^'"]+)['"]/)?.[1];
  if (!cron) throw new Error(`${workflow}: no schedule cron`);
  const due = text.match(/^\s*REFRESH_HOURS:\s*(\d+)\s*$/m)?.[1];
  const [, hour, dom, mon, dow] = cron.trim().split(/\s+/);
  const every = (field) => (field === '*' ? 1 : /^\*\/(\d+)$/.test(field) ? Number(field.slice(2)) : null);
  if (dom === '*' && mon === '*' && dow === '*') {
    if (every(hour) && due) {
      if (Number(due) % every(hour)) {
        throw new Error(`${workflow}: REFRESH_HOURS ${due} is no multiple of ${cron}`);
      }
      return { unit: 'hours', n: Number(due), cron };
    }
    if (every(hour)) return { unit: 'hours', n: every(hour), cron };
    if (/^\d+$/.test(hour)) return { unit: 'days', n: 1, cron };
  }
  if (dom === '*' && mon === '*' && /^\d$/.test(dow) && /^\d+$/.test(hour)) return { unit: 'weeks', n: 1, cron };
  throw new Error(`${workflow}: cannot describe the schedule ${cron}`);
}

// Text cut to a limit at a word boundary, with an ellipsis; padded when it is too short.
export function clip(text, max, { min = 0, pad = '' } = {}) {
  let out = text;
  if (out.length > max) out = `${out.slice(0, max - 3).replace(/\s+\S*$/, '')}…`;
  if (out.length < min && pad) out = `${out} ${pad}`;
  return out;
}

// The URL slug of a repository name (content/work/<slug>.md, /work/<slug>/), one implementation.
export const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Run worker over items with at most `size` in flight; results in input order.
export async function pool(items, worker, size = 8) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await worker(items[index], index);
    }
  }));
  return out;
}

const FRONT = /^\+\+\+\n([\s\S]*?)\n\+\+\+\n?([\s\S]*)$/;
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    return e.isDirectory() ? walk(path) : e.name.endsWith('.md') ? [path] : [];
  });
}
// Every content page, sorted by path: { file, rel (to content/), path (to the repo), lang, fm, body }.
// fm is null when a file has no TOML front matter (check-front-matter reports it).
export function contentPages(dir = CONTENT) {
  return walk(dir).sort().map((file) => {
    const text = readFileSync(file, 'utf8');
    const match = text.match(FRONT);
    const rel = relative(CONTENT, file).replace(/\\/g, '/');
    return { file, rel, path: relative(ROOT, file), lang: langOf(rel), fm: match ? parse(match[1]) : null, body: match ? match[2] : text, text };
  });
}

// Write the wanted files (name -> text) into dir, or with check report every one that is missing or
// stale; a file in dir that carries `mark` and is no longer wanted is an orphan (removed, or
// reported). Exits 1 on any finding under check. Returns the number of files.
export function writeOrCheck(files, { dir, mark, check = CHECK, label, orphanWhy = 'is no longer derived' }) {
  const shown = relative(ROOT, dir);
  const findings = [];
  if (!check) mkdirSync(dir, { recursive: true });
  for (const [name, text] of files) {
    const path = join(dir, name);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (check) {
      if (current === null) findings.push(`${shown}/${name} is missing`);
      else if (current !== text) findings.push(`${shown}/${name} is stale`);
    } else if (current !== text) writeFileSync(path, text);
  }
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    if (files.has(name) || !name.endsWith('.md') || !mark || !readFileSync(join(dir, name), 'utf8').includes(mark)) continue;
    if (check) findings.push(`${shown}/${name} ${orphanWhy}`);
    else unlinkSync(join(dir, name));
  }
  report(findings, `${label}: ${files.size} files ${check ? 'current' : 'written'}`);
  return files.size;
}

// Print the findings with the one hint and exit 1, or print the success line.
export function report(findings, ok, hint = HINT) {
  if (findings.length) {
    for (const f of findings) console.error(`✗ ${f}; ${hint}`);
    process.exit(1);
  }
  if (ok) console.log(ok);
}

// Translated text for generators: i18n/*.toml through the coordinator's loadStrings(). With a
// numeric vars.n the plural form is chosen by Intl.PluralRules (key__one, key__few, key__other).
let stringsCache = null;
const rules = new Map();
export function plural(lang, n) {
  if (!rules.has(lang)) rules.set(lang, new Intl.PluralRules(lang));
  return rules.get(lang).select(n);
}
export function t(key, lang, vars = {}) {
  stringsCache ??= loadStrings();
  let entry = stringsCache[key];
  if (typeof vars.n === 'number') {
    entry = stringsCache[`${key}__${plural(lang, vars.n)}`] ?? stringsCache[`${key}__other`] ?? entry;
  }
  const text = entry?.[lang];
  if (typeof text !== 'string') throw new Error(`i18n: ${key} has no ${lang} text`);
  return text.replace(/\{(\w+)\}/g, (all, name) => (name in vars ? String(vars[name]) : all));
}
