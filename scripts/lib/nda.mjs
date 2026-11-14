// The NDA denylist as a library (scripts/check-nda.mjs, scripts/mine-experience.mjs --check).
// The names themselves never live in this repository, which is public: they come from the
// environment (NDA_DENYLIST, newline-separated; CI sets it from a secret), from the owner-level
// file ~/.config/korczis-hub/nda-denylist.txt, and from the owner's private engagement map
// (every `client` and the folder name of every source). Callers report only where a name
// matched, never which one.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { parse } from 'smol-toml';

export const DENYLIST_FILE = join(homedir(), '.config/korczis-hub/nda-denylist.txt');
export const MAP_FILE = process.env.EXPERIENCE_MAP || join(homedir(), '.config/korczis-hub/experience.toml');

const lines = (text) => text.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);

// -> { names: [string], sources: [where the names came from] }
export function loadDenylist() {
  const names = new Set();
  const sources = [];
  if (process.env.NDA_DENYLIST) {
    lines(process.env.NDA_DENYLIST).forEach((n) => names.add(n));
    sources.push('NDA_DENYLIST');
  } else if (existsSync(DENYLIST_FILE)) {
    lines(readFileSync(DENYLIST_FILE, 'utf8')).forEach((n) => names.add(n));
    sources.push('the owner-level denylist file');
  }
  if (existsSync(MAP_FILE)) {
    const map = parse(readFileSync(MAP_FILE, 'utf8'));
    for (const e of map.engagement ?? []) {
      if (e.client) names.add(e.client);
      for (const s of e.sources ?? []) names.add(basename(s.replace(/\/+$/, '')));
    }
    sources.push('the private engagement map');
  }
  return { names: [...names].filter((n) => n.length >= 2), sources };
}

const strip = (text) => text.normalize('NFD').replace(/\p{M}/gu, '');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One case-insensitive, whole-word matcher over every name, also blind to diacritics. An
// underscore counts as a word boundary, so an identifier that embeds a name still matches.
export function compileDenylist(names) {
  if (!names.length) return () => false;
  const alternation = names.map((n) => escapeRe(strip(n))).sort((a, b) => b.length - a.length).join('|');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`, 'iu');
  return (text) => re.test(text) || re.test(strip(text));
}

// Line numbers (1-based) of a text where a denylisted name appears.
export function matchingLines(test, text) {
  const hits = [];
  text.split('\n').forEach((line, i) => { if (test(line)) hits.push(i + 1); });
  return hits;
}
