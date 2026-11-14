#!/usr/bin/env node
// Derives data/experience.json: the owner's client engagements, measured and anonymised.
//
// The engagements are under a legal NDA, so their map is private and owner-level
// (~/.config/korczis-hub/experience.toml, or EXPERIENCE_MAP): per engagement a neutral id (e1, e2,
// ...), the client (never read here beyond the NDA gate), a sector key, the local source folders,
// and the roles and extra capabilities the owner declares. This script reads each source through
// git only (log, ls-tree, cat-file; never a walk of the file tree, never a copy):
//   - a folder that is its own repository is measured whole (every branch);
//   - a folder inside a bigger repository, or one that no longer exists, is measured by its path
//     in the enclosing repository's history (the files as they were at its last commit);
//   - a folder that is not a repository is a group: each sub-folder that is one is measured, and a
//     MOVED.md stub is followed to the path it names; clones of one repository count once.
// What it keeps (and the only thing data/experience.json holds): the id, the sector and role keys,
// the period of the owner's commits (year-month, UTC) and their count per month, scale as rounded
// buckets (data/experience-rules.toml [scale]), public technology names from the rules' controlled
// vocabulary, and the capabilities inferred by the rules' keywords with the counts of the items
// that matched. The owner is the identity in zola.toml [extra] (author, author_native, github) and
// every name or email git shows next to it. No name, path, subject or heading leaves this process.
//
// It also infers the same capabilities in the owner's public work (data/recent.json, the
// repositories with a work page), so the section can link each capability to public projects.
//
// usage: node scripts/mine-experience.mjs           mine the private sources, write the file
//        node scripts/mine-experience.mjs --explain also print every capability's evidence counts,
//                                                   kept or not (counts only, never the text)
//        node scripts/mine-experience.mjs --check   verify the committed file without the private
//                                                   sources: schema, vocabulary, the NDA gate and
//                                                   the public part re-derived. It cannot re-mine
//                                                   (CI has no private sources) and says so.
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { DATA_FILE, SCHEMA_ID, bucket, infer, loadRules, words } from './lib/experience.mjs';
import { MAP_FILE } from './lib/nda.mjs';
import { checkExperience } from './check-experience.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: node scripts/mine-experience.mjs [--check | --explain]');
  process.exit(0);
}
for (const a of args) if (a !== '--check' && a !== '--explain') { console.error(`✗ unknown argument ${a}`); process.exit(2); }
const CHECK = args.includes('--check');
const EXPLAIN = args.includes('--explain');
const rules = loadRules(ROOT);

// --- The public part: capabilities seen in the owner's public work. ------------------------------
function publicWork() {
  const recent = JSON.parse(readFileSync(join(ROOT, 'data/recent.json'), 'utf8'));
  const catalogue = parse(readFileSync(join(ROOT, 'data/projects.toml'), 'utf8'));
  const curated = new Map((catalogue.projects ?? []).map((p) => [p.repo, p]));
  const out = {};
  for (const r of recent.repos) {
    const p = curated.get(r.name);
    const found = infer(rules, {
      commits: (r.commits ?? []).map((c) => c.message),
      headings: [r.name, r.description, r.readme, p?.tagline, p?.summary].filter(Boolean),
      paths: [],
    }, rules.inference.public_threshold, 0);
    for (const f of found) (out[f.key] ??= []).push({ repo: r.name, score: f.score });
  }
  return Object.fromEntries(Object.keys(rules.capabilities).filter((k) => out[k])
    .map((k) => [k, out[k].sort((a, b) => b.score - a.score || a.repo.localeCompare(b.repo)).slice(0, 6).map((x) => x.repo)]));
}

if (CHECK) {
  const committed = JSON.parse(readFileSync(join(ROOT, DATA_FILE), 'utf8'));
  const findings = checkExperience(ROOT);
  if (JSON.stringify(committed.public_work) !== JSON.stringify(publicWork())) {
    findings.push(`${DATA_FILE}: public_work is stale against data/recent.json; run node scripts/mine-experience.mjs`);
  }
  if (findings.length) {
    for (const f of findings) console.error(`✗ ${f}`);
    process.exit(1);
  }
  console.log(`experience: ${committed.engagements.length} engagements mined ${committed.generated_at}; schema, vocabulary, NDA and public work current, PASS`);
  console.log('experience: the private sources are not re-mined here (they exist only on the owner\'s machine)');
  process.exit(0);
}

// --- The private part. ---------------------------------------------------------------------------
if (!existsSync(MAP_FILE)) {
  console.error(`✗ no engagement map at ${MAP_FILE}: mining needs the owner's private sources (use --check elsewhere)`);
  process.exit(1);
}
const map = parse(readFileSync(MAP_FILE, 'utf8'));
const zola = parse(readFileSync(join(ROOT, 'zola.toml'), 'utf8'));

const git = (dir, ...a) => {
  const r = spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8', maxBuffer: 1 << 30 });
  return r.status === 0 ? r.stdout : null;
};
const expand = (p) => resolve(p.replace(/^~(?=\/|$)/, homedir()));
const real = (p) => { try { return realpathSync(p); } catch { return p; } };
const isDir = (p) => { try { return readdirSync(p) && true; } catch { return false; } };

// A source folder -> [{ repo, path }]: path null for a whole repository, else a path inside it.
function resolveSource(dir, depth = 0) {
  if (depth > 2) return [];
  if (isDir(dir)) {
    const top = git(dir, 'rev-parse', '--show-toplevel')?.trim();
    if (top && real(top) === real(dir)) return [{ repo: dir, path: null }];
    const found = [];
    for (const stub of ['.MOVED.md', 'MOVED.md']) {
      const file = join(dir, stub);
      if (!existsSync(file)) continue;
      const target = readFileSync(file, 'utf8').match(/`(~?\/[^`\s]+)`/)?.[1];
      if (target) found.push(...resolveSource(expand(target).replace(/\/+$/, ''), depth + 1));
    }
    for (const child of readdirSync(dir, { withFileTypes: true })) {
      if (!child.isDirectory() || child.name.startsWith('.')) continue;
      const sub = join(dir, child.name);
      const subTop = git(sub, 'rev-parse', '--show-toplevel')?.trim();
      if (subTop && real(subTop) === real(sub)) found.push({ repo: sub, path: null });
    }
    if (top && git(top, 'log', '-1', '--format=%H', '--', relative(real(top), real(dir)))?.trim()) {
      found.push({ repo: top, path: relative(real(top), real(dir)) });
    }
    return found;
  }
  // Gone from disk: the nearest folder that still exists, and the path's history in its repository.
  let up = dirname(dir);
  while (up !== dirname(up) && !isDir(up)) up = dirname(up);
  const top = git(up, 'rev-parse', '--show-toplevel')?.trim();
  if (!top) return [];
  const rel = relative(real(top), join(real(up), relative(up, dir)));
  return git(top, 'log', '--all', '-1', '--format=%H', '--', rel)?.trim() ? [{ repo: top, path: rel }] : [];
}

const SEP = '\x1f';
function commitsOf({ repo, path }) {
  const out = git(repo, 'log', '--all', `--format=%H${SEP}%an${SEP}%ae${SEP}%aI${SEP}%s`, ...(path ? ['--', path] : [])) ?? '';
  return out.split('\n').filter(Boolean).map((line) => {
    const [hash, name, email, at, subject] = line.split(SEP);
    return { hash, name, email: email.toLowerCase(), at, subject };
  });
}

// The files of a source: HEAD for a repository; for a path, the tree of the newest commit that
// still held it (the parent of the commit that removed it).
function filesOf({ repo, path }, commits) {
  if (!path) return { rev: 'HEAD', files: (git(repo, 'ls-tree', '-r', '--name-only', '-z', 'HEAD') ?? '').split('\0').filter(Boolean) };
  for (const c of commits) {
    for (const rev of [c.hash, `${c.hash}^`]) {
      const files = (git(repo, 'ls-tree', '-r', '--name-only', '-z', rev, '--', path) ?? '').split('\0').filter(Boolean);
      if (files.length) return { rev, files };
    }
  }
  return { rev: null, files: [] };
}

// Read many small blobs in one git process.
function blobs(repo, specs) {
  if (!specs.length) return [];
  const r = spawnSync('git', ['-C', repo, 'cat-file', '--batch'], { input: `${specs.join('\n')}\n`, maxBuffer: 1 << 30 });
  const buf = r.stdout;
  const texts = [];
  let at = 0;
  while (at < buf.length) {
    const nl = buf.indexOf(10, at);
    const header = buf.subarray(at, nl).toString();
    at = nl + 1;
    const size = Number(header.split(' ')[2]);
    if (header.endsWith('missing') || Number.isNaN(size)) { texts.push(''); continue; }
    texts.push(size < 512 * 1024 ? buf.subarray(at, at + size).toString('utf8') : '');
    at += size + 1;
  }
  return texts;
}

const README = /(^|\/)readme[^/]*\.md$/i;
const ADR = /(^|\/)(adrs?|decisions)\/[^/]+\.md$/i;
const RULE = /^\.ai\/repo\/rules\/.+\.md$/;
const MANIFEST = /(^|\/)(mix\.exs|package\.json|Cargo\.toml|pyproject\.toml|requirements[^/]*\.txt|go\.mod|Gemfile)$/;
const TEST = /(^|\/)(tests?|spec|__tests__|e2e)\/|(^|\/)test_[^/]+\.py$|_test\.\w+$|\.(test|spec)\.\w+$|_spec\.rb$/i;

function headingsOf(text, rel) {
  const out = [];
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  const title = fm?.[1].match(/^title:\s*(.+)$/m)?.[1];
  if (title) out.push(title);
  if (RULE.test(rel)) return out;
  for (const m of text.matchAll(/^#{1,3}\s+(.+)$/gm)) out.push(m[1]);
  return ADR.test(rel) ? out.slice(0, 2) : out;
}

function depsOf(text, rel) {
  const name = basename(rel);
  const out = [];
  if (name === 'package.json') {
    try {
      const pkg = JSON.parse(text);
      for (const k of ['dependencies', 'devDependencies', 'peerDependencies']) out.push(...Object.keys(pkg[k] ?? {}));
    } catch {}
  } else if (name === 'mix.exs') {
    for (const m of text.matchAll(/\{\s*:(\w+)\s*,/g)) out.push(m[1]);
  } else if (name === 'Cargo.toml' || name === 'pyproject.toml') {
    try {
      const t = parse(text);
      const tables = [t.dependencies, t['dev-dependencies'], t.workspace?.dependencies, t.tool?.poetry?.dependencies];
      for (const table of tables) out.push(...Object.keys(table ?? {}));
      for (const spec of [...(t.project?.dependencies ?? []), ...Object.values(t.project?.['optional-dependencies'] ?? {}).flat()]) out.push(String(spec).split(/[\s<>=!~;[]/)[0]);
    } catch {}
  } else if (/^requirements/.test(name)) {
    for (const line of text.split('\n')) if (/^[A-Za-z]/.test(line)) out.push(line.split(/[\s<>=!~;[]/)[0]);
  } else if (name === 'go.mod') {
    for (const m of text.matchAll(/^\s*(?:require\s+)?([\w.-]+\/[\w./-]+)\s+v/gm)) out.push(m[1].split('/').pop());
  } else if (name === 'Gemfile') {
    for (const m of text.matchAll(/^\s*gem\s+['"]([\w-]+)['"]/gm)) out.push(m[1]);
  }
  return out.map((d) => d.toLowerCase());
}

// The owner: the identity zola.toml declares, then every name or email git shows next to it.
const ownerNames = new Set([zola.extra.author, zola.extra.author_native, zola.extra.github].filter(Boolean).map((n) => words(n).join(' ')));
const ownerLogin = String(zola.extra.github ?? '').toLowerCase();
function ownerFilter(all) {
  const emails = new Set();
  const names = new Set(ownerNames);
  for (let pass = 0; pass < 3; pass += 1) {
    for (const c of all) {
      const n = words(c.name).join(' ');
      if (names.has(n) || emails.has(c.email) || c.email.split('@')[0] === ownerLogin) { emails.add(c.email); names.add(n); }
    }
  }
  return (c) => names.has(words(c.name).join(' ')) || emails.has(c.email);
}
const BOT = /\[bot\]|^(github-actions|dependabot|lockfile-bot|renovate)\b|^test( user)?$/i;
function people(commits) {
  // Union names and emails that appear together; count the groups (no name is kept).
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x; };
  const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
  for (const c of commits) {
    if (BOT.test(c.name) || /@example\.|\.invalid$/.test(c.email)) continue;
    const a = `n:${words(c.name).join(' ')}`;
    const b = `e:${c.email}`;
    add(a); add(b);
    parent.set(find(a), find(b));
  }
  return new Set([...parent.keys()].map(find)).size;
}

const techRules = Object.entries(rules.technologies);
const byExt = new Map();
for (const [name, t] of techRules) for (const ext of t.extensions ?? []) byExt.set(ext, name);

function measure(engagement) {
  const sources = (engagement.sources ?? []).flatMap((s) => resolveSource(expand(s).replace(/\/+$/, '')));
  const commits = new Map();
  const files = new Map();
  const headings = new Set();
  const deps = new Set();
  const repos = new Set();
  const authored = new Set();
  const all = sources.map((s) => ({ s, list: commitsOf(s) }));
  const isOwner = ownerFilter(all.flatMap((x) => x.list));
  for (const { s, list } of all) {
    if (!list.length) continue;
    const rootCommit = (git(s.repo, 'rev-list', '--max-parents=0', 'HEAD') ?? '').split('\n')[0];
    const key = `${rootCommit}:${s.path ?? ''}`;
    repos.add(key);
    if (list.some(isOwner)) authored.add(key);
    for (const c of list) commits.set(c.hash, c);
    const { rev, files: tree } = filesOf(s, list);
    const strip = (f) => (s.path ? f.slice(s.path.length + 1) : f);
    for (const f of tree) files.set(`${key}:${strip(f)}`, strip(f));
    const picked = { readme: [], adr: [], rule: [], manifest: [] };
    for (const f of tree) {
      const rel = strip(f);
      if (README.test(rel)) picked.readme.push(f);
      else if (ADR.test(rel)) picked.adr.push(f);
      else if (RULE.test(rel)) picked.rule.push(f);
      if (MANIFEST.test(rel) && rel.split('/').length <= 4 && !/node_modules|vendor/.test(rel)) picked.manifest.push(f);
    }
    const docs = [...picked.readme.slice(0, 80), ...picked.adr.slice(0, 150), ...picked.rule.slice(0, 250)];
    blobs(s.repo, docs.map((f) => `${rev}:${f}`)).forEach((text, i) => headingsOf(text, strip(docs[i])).forEach((h) => headings.add(h)));
    const manifests = picked.manifest.slice(0, 80);
    blobs(s.repo, manifests.map((f) => `${rev}:${f}`)).forEach((text, i) => depsOf(text, manifests[i]).forEach((d) => deps.add(d)));
  }
  const list = [...commits.values()];
  const mine = list.filter(isOwner);
  const months = {};
  for (const c of mine) {
    const m = new Date(c.at).toISOString().slice(0, 7);
    months[m] = (months[m] ?? 0) + 1;
  }
  const sorted = Object.keys(months).sort();
  const paths = [...files.values()];
  const extCount = new Map();
  for (const p of paths) {
    if (TEST.test(p)) continue;
    const lang = byExt.get(p.split('.').pop().toLowerCase());
    if (lang) extCount.set(lang, (extCount.get(lang) ?? 0) + 1);
  }
  const code = [...extCount.values()].reduce((a, b) => a + b, 0);
  const languages = [...extCount].filter(([, n]) => n >= 5 && n >= code * 0.03).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n]) => n);
  const segments = new Set(paths.flatMap((p) => {
    const parts = p.split('/');
    return [...parts, ...parts.map((_, i) => parts.slice(0, i + 1).join('/'))];
  }));
  const detected = techRules.filter(([, t]) => (t.deps ?? []).some((d) => deps.has(d)) || (t.paths ?? []).some((m) => segments.has(m))).map(([n]) => n);
  const technologies = [...new Set([...languages, ...detected])];
  const tests = paths.filter((p) => TEST.test(p)).length;
  const modules = paths.filter((p) => !TEST.test(p) && byExt.has(p.split('.').pop().toLowerCase())).length;

  // The folder names are text too (a repository is often named after what it does).
  const names = [...new Set([...(engagement.sources ?? []), ...sources.map((s) => s.path ?? s.repo)].map((p) => basename(p.replace(/\/+$/, ''))))];
  const channels = { commits: mine.map((c) => c.subject), headings: [...headings, ...names], paths };
  const found = infer(rules, channels);
  if (EXPLAIN) {
    console.log(`${engagement.id}: items commits ${channels.commits.length}, headings ${channels.headings.length}, paths ${paths.length}`);
    for (const f of infer(rules, channels, -1, 0)) {
      console.log(`  ${found.some((k) => k.key === f.key) ? 'kept' : '    '} ${f.key} ${f.score} (${f.evidence.commits}/${f.evidence.headings}/${f.evidence.paths})`);
    }
  }
  const extra = (engagement.extra ?? []).filter((k) => !found.some((f) => f.key === k));
  const capabilities = [
    ...found.map((f) => ({ ...f, declared: (engagement.extra ?? []).includes(f.key) })),
    ...extra.map((key) => ({ key, score: 0, evidence: { commits: 0, headings: 0, paths: 0 }, declared: true })),
  ];
  const b = (n) => bucket(rules, n);
  return {
    id: engagement.id,
    sector: engagement.sector || null,
    roles: engagement.roles ?? [],
    period: sorted.length ? { from: sorted[0], to: sorted[sorted.length - 1] } : null,
    months: Object.fromEntries(sorted.map((m) => [m, b(months[m])])),
    scale: {
      commits: b(mine.length),
      repositories: b(repos.size),
      authored: b(authored.size),
      team: b(people(list)),
      files: b(paths.length),
      modules: b(modules),
      tests: b(tests),
    },
    technologies,
    capabilities,
  };
}

// Newest first (by the last month of the owner's commits), engagements without any after them.
const engagements = (map.engagement ?? []).map(measure).sort((a, b) => (!a.period - !b.period)
  || (b.period?.to ?? '').localeCompare(a.period?.to ?? '') || (b.period?.from ?? '').localeCompare(a.period?.from ?? '')
  || a.id.localeCompare(b.id, 'en', { numeric: true }));
const out = { schema: SCHEMA_ID, generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), engagements, public_work: publicWork() };
writeFileSync(join(ROOT, DATA_FILE), `${JSON.stringify(out, null, 2)}\n`);
const findings = checkExperience(ROOT);
for (const e of engagements) {
  const caps = e.capabilities.map((c) => `${c.key} ${c.score} (${c.evidence.commits}/${c.evidence.headings}/${c.evidence.paths})`).join(', ');
  console.log(`${e.id}: ${e.period ? `${e.period.from}..${e.period.to}` : 'no owner commits'}, ${e.scale.commits}+ commits, ${e.capabilities.length} capabilities${caps ? `: ${caps}` : ''}`);
}
if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  console.error(`experience: written, but ${findings.length} finding(s); fix the map or the rules`);
  process.exit(1);
}
console.log(`experience: ${engagements.length} engagements written to ${DATA_FILE}`);
