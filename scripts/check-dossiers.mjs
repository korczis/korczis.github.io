#!/usr/bin/env node
// Gate for the repository dossiers (rule project.dossiers-inferred), offline: every
// data/dossiers/<repo>.json is inferred from that repository's own files and is checked for
//   - the shape of static/schemas/dossier.schema.json (korczis-hub-dossier/v1), no field outside it;
//   - its repository: the file is named after it, and it is an original of data/index.json that is
//     not on the [index] hidden list of data/projects.toml, with the same GitHub and GitLab URLs;
//   - provenance: provenance inferred, sources.commit, sources.read_at and a confidence;
//   - related: only other originals, each once, never itself;
//   - its architecture: a Mermaid flowchart LR or TD of 4 to 12 nodes, with no HTML and no click,
//     style, linkStyle, classDef, class or %% init directive;
//   - every text in every language of the site (zola.toml: en and cs), none blank;
//   - the NDA denylist (scripts/lib/nda.mjs), which must match nothing in it.
// Originals with no dossier are reported, not failed (a dossier waits for its repository to be read).
//
// usage: node scripts/check-dossiers.mjs              exit 0 clean, 1 with every finding listed
//        node scripts/check-dossiers.mjs --dir <dir>  check the dossiers in another directory
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parse } from 'smol-toml';
import { ROOT, languages } from './lib/derive.mjs';
import { validate } from './lib/experience.mjs';
import { compileDenylist, loadDenylist, matchingLines } from './lib/nda.mjs';
import { cliArgs } from './lib/cli.mjs';

const opts = cliArgs({ '--dir': '<dir>' });
const DIR = opts.dir ? (isAbsolute(opts.dir) ? opts.dir : resolve(opts.dir)) : join(ROOT, 'data/dossiers');
const SCHEMA = 'static/schemas/dossier.schema.json';
const NODES = { min: 4, max: 12 };
const DIRECTIONS = ['flowchart LR', 'flowchart TD'];
const DIRECTIVES = /^\s*(click|style|linkStyle|classDef|class)\b|(%%)/gm;
const HTML = /<\/?[a-z][^>]*>|&[a-z#0-9]+;/i;
// Words of the flowchart grammar that are not node ids.
const KEYWORDS = new Set(['flowchart', 'graph', 'subgraph', 'end', 'direction', 'LR', 'RL', 'TD', 'TB', 'BT']);

const findings = [];
const fail = (where, what) => findings.push(`${where}: ${what}`);
const shown = (file) => (relative(ROOT, file).startsWith('..') ? file : relative(ROOT, file));

// A line with every label removed: text inside brackets of any shape, quotes and |edge labels|.
function bare(line) {
  const open = { '[': ']', '(': ')', '{': '}' };
  const stack = [];
  let out = '';
  let pipe = false;
  let quote = false;
  for (const ch of line) {
    if (quote) { if (ch === '"') quote = false; continue; }
    if (ch === '"') { quote = true; continue; }
    if (!stack.length && ch === '|') { pipe = !pipe; continue; }
    if (pipe) continue;
    if (open[ch]) { stack.push(open[ch]); continue; }
    if (stack.length) { if (ch === stack[stack.length - 1]) stack.pop(); continue; }
    out += ch;
  }
  return { out, balanced: !stack.length && !pipe && !quote };
}

// The node ids of a flowchart, or the reason it is not one this site renders.
function mermaidNodes(source) {
  const lines = source.split('\n').map((l) => l.trim()).filter(Boolean);
  const problems = [];
  if (!DIRECTIONS.includes(lines[0])) problems.push(`starts with "${lines[0] ?? ''}", not ${DIRECTIONS.join(' or ')}`);
  if (HTML.test(source)) problems.push('contains HTML');
  for (const kind of new Set([...source.matchAll(DIRECTIVES)].map((m) => m[1] ?? m[2]))) problems.push(`contains a ${kind} directive`);
  const nodes = new Set();
  for (const [i, line] of lines.slice(1).entries()) {
    const { out, balanced } = bare(line);
    if (!balanced) problems.push(`line ${i + 2} has an unclosed label`);
    if (/^(subgraph|end|direction)\b/.test(out.trim())) continue;
    for (const id of out.match(/[A-Za-z_][\w]*/g) ?? []) if (!KEYWORDS.has(id)) nodes.add(id);
  }
  if (nodes.size < NODES.min || nodes.size > NODES.max) problems.push(`has ${nodes.size} nodes, not ${NODES.min} to ${NODES.max}`);
  return { nodes, problems };
}

// Every text object ({ en, cs, ... }) of a dossier, with where it is.
function texts(d) {
  const out = [['summary', d.summary], ['problem', d.problem], ['solution', d.solution], ['architecture.caption', d.architecture?.caption]];
  for (const [i, h] of (d.highlights ?? []).entries()) out.push([`highlights[${i}]`, h]);
  return out;
}

const index = JSON.parse(readFileSync(join(ROOT, 'data/index.json'), 'utf8'));
const hidden = new Set((parse(readFileSync(join(ROOT, 'data/projects.toml'), 'utf8')).index?.hidden ?? []).map((n) => n.toLowerCase()));
const originals = new Map(index.repos.map((r) => [r.name, r]));
const schema = JSON.parse(readFileSync(join(ROOT, SCHEMA), 'utf8'));
const langs = languages();
const { names } = loadDenylist();
const denied = names.length ? compileDenylist(names) : null;

if (!existsSync(DIR)) {
  console.error(`✗ ${shown(DIR)}: no such directory`);
  process.exit(1);
}
const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const covered = new Set();
const counts = { confidence: {}, kind: {} };
for (const file of files) {
  const path = join(DIR, file);
  const where = shown(path);
  const text = readFileSync(path, 'utf8');
  let d;
  try {
    d = JSON.parse(text);
  } catch (e) {
    fail(where, `is not JSON (${e.message})`);
    continue;
  }
  validate(schema, d, (what) => fail(where, what));
  if (denied) for (const line of matchingLines(denied, text)) fail(`${where}:${line}`, 'matches a denylisted name');
  // The checks below read these fields; the schema finding above already names a missing one.
  const usable = d && typeof d.repo === 'string' && d.sources && typeof d.architecture?.mermaid === 'string'
    && Array.isArray(d.related) && Array.isArray(d.highlights) && Array.isArray(d.sources.read);
  if (!usable) continue;

  if (file !== `${d.repo}.json`) fail(where, `holds the dossier of ${d.repo}: name it ${d.repo}.json`);
  const repo = originals.get(d.repo);
  if (hidden.has(d.repo.toLowerCase())) fail(where, `${d.repo} is on the [index] hidden list of data/projects.toml`);
  else if (!repo) fail(where, `${d.repo} is not an original of data/index.json`);
  else {
    covered.add(d.repo);
    for (const host of ['github', 'gitlab']) {
      if ((repo.hosts?.[host] ?? null) !== d.sources[host]) fail(where, `sources.${host} is ${d.sources[host]}, the index has ${repo.hosts?.[host] ?? null}`);
    }
  }
  if (d.provenance !== 'inferred') fail(where, 'provenance must be inferred');
  if (!d.highlights.length) fail(where, 'has no highlights');
  if (!d.sources.read.length) fail(where, 'sources.read names no file');

  const seen = new Set();
  for (const r of d.related) {
    if (r === d.repo) fail(where, 'related names the repository itself');
    else if (!originals.has(r) || hidden.has(r.toLowerCase())) fail(where, `related ${r} is not an original of data/index.json`);
    if (seen.has(r)) fail(where, `related ${r} twice`);
    seen.add(r);
  }

  for (const problem of mermaidNodes(d.architecture.mermaid).problems) fail(where, `architecture.mermaid ${problem}`);

  for (const [at, t] of texts(d)) {
    for (const lang of langs) if (typeof t?.[lang] !== 'string' || !t[lang].trim()) fail(where, `${at} has no ${lang} text`);
  }
  counts.confidence[d.confidence] = (counts.confidence[d.confidence] ?? 0) + 1;
  counts.kind[d.kind] = (counts.kind[d.kind] ?? 0) + 1;
}

const missing = [...originals.keys()].filter((n) => !covered.has(n) && !hidden.has(n.toLowerCase())).sort();
if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  console.error(`dossiers: ${findings.length} finding(s) in ${files.length} file(s), FAIL`);
  process.exit(1);
}
const by = (o) => Object.entries(o).sort().map(([k, n]) => `${n} ${k}`).join(', ');
console.log(`dossiers: ${files.length} of ${originals.size} originals, every one inferred with its commit, date and confidence (${by(counts.confidence)}), PASS`);
if (missing.length) {
  console.log(`report: ${missing.length} original(s) without a dossier yet: ${missing.join(' ')}`);
}
