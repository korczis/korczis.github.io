// The glossary as a library: load data/glossary.toml and resolve which terms explain a thing
// (a repository, a category, a page) by convention, never by a hand-typed list:
//   languages and stack names  -> the term whose name or alias matches (case-insensitive)
//   catalogue category         -> concept terms that declare that category
//   every repository           -> repository, commit, open source (what any work page is about)
//   a live site on GitHub Pages -> github-pages
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'smol-toml';

export function loadGlossary(root) {
  const { terms } = parse(readFileSync(join(root, 'data/glossary.toml'), 'utf8'));
  const byName = new Map();
  for (const t of terms) for (const name of [t.term, t.id, ...(t.aliases ?? [])]) byName.set(name.toLowerCase(), t.id);
  const byCategory = new Map();
  for (const t of terms) for (const c of t.categories ?? []) byCategory.set(c, [...(byCategory.get(c) ?? []), t.id]);
  return { terms, byId: new Map(terms.map((t) => [t.id, t])), byName, byCategory };
}

const unique = (ids) => [...new Set(ids.filter(Boolean))];

export function termsForNames(g, names) {
  return unique(names.map((n) => g.byName.get(String(n).toLowerCase())));
}

export function termsForCategory(g, category, languages = []) {
  return unique([...(g.byCategory.get(category) ?? []), ...termsForNames(g, languages)]);
}

// A repository (data/recent.json row) and, when curated, its catalogue entry.
export function termsForRepo(g, r, curated) {
  return unique([
    ...termsForNames(g, (r.languages ?? []).map((l) => l.name)),
    ...termsForNames(g, [r.language]),
    ...termsForNames(g, curated?.stack ?? []),
    ...(g.byCategory.get(r.category) ?? []),
    r.site && /github\.io/.test(r.site) ? 'github-pages' : null,
    'repository', 'commit', 'open-source',
  ]);
}

// Markdown helpers for derived article bodies: a link to a term's glossary page (checked by Zola),
// a term by name when the glossary knows it (plain text otherwise), and escaping of foreign text.
export function termLink(g, id, lang, label) {
  const t = g.byId.get(id);
  const name = label ?? ((lang === 'cs' && t.term_cs) || t.term);
  return `[${name}](@/glossary/${id}${lang === 'cs' ? '.cs' : ''}.md)`;
}

export function nameLink(g, name, lang) {
  const id = g.byName.get(String(name).toLowerCase());
  return id ? termLink(g, id, lang, name) : name;
}

export const mdEscape = (text) => String(text).replace(/([\\`*_[\]<>#|])/g, '\\$1');

// "a, b and c" / "a, b a c"
export function listing(items, lang) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${lang === 'cs' ? 'a' : 'and'} ${items[items.length - 1]}`;
}
