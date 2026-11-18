#!/usr/bin/env node
// The site's machine interfaces, derived: the /interfaces/ page, the topbar's interfaces menu and
// two published files read them.
//   static/ai.json       the repository's Majordomus layer as Majordomus itself indexes it: every
//                        object of .ai/ with its MCP resource URI (majordomus://<kind>/<identity>),
//                        title, description and source path, plus the counts of the capabilities
//                        the Majordomus server projects over MCP and HTTP. Measured with
//                        `majordomus run objects.list` and `capabilities.list` (--measure), and
//                        stamped with the tracked .ai tree it was measured from, so a change to
//                        .ai/ that was not re-measured is caught offline (in CI, with no Majordomus).
//   static/openapi.json  an OpenAPI 3.1 description of every machine-readable file the site
//                        publishes (static/*.json, *.txt, schemas/*.json, the translations'
//                        static/<lang>/*.json such as cs/resume.json, sitemap.xml), each summary
//                        read from the file itself; Swagger UI renders it.
//   static/.well-known/api-catalog
//                        the API catalogue of RFC 9727 (a linkset, RFC 9264): the site's anchor with
//                        its service-desc (openapi.json), service-doc (/interfaces/) and describedby
//                        (ai.json); every page links all three from its head (RFC 8631).
//
// usage: node scripts/build-interfaces.mjs            write openapi.json and api-catalog from the published files
//        node scripts/build-interfaces.mjs --measure  ask Majordomus for the layer, then write every file
//        node scripts/build-interfaces.mjs --check    exit 1 if a file is stale, or if .ai/ changed
//                                                     since static/ai.json was measured
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, identity, isDefault, languages, report } from './lib/derive.mjs';
import { cliArgs } from './lib/cli.mjs';

const opts = cliArgs({ '--check': true, '--measure': true }, { derived: true });
const AI = join(ROOT, 'static/ai.json');
const OPENAPI = join(ROOT, 'static/openapi.json');
const CATALOG = join(ROOT, 'static/.well-known/api-catalog');
const me = identity();
const text = (value) => `${JSON.stringify(value, null, 1)}\n`;

// The tracked .ai tree (the path and the working-tree content of every file git tracks under .ai/,
// .ai/local excluded): what the snapshot was measured from. It reads the files themselves, so an
// edit not yet staged counts too, and it needs no Majordomus and no network.
function aiTree() {
  const files = execFileSync('git', ['ls-files', '-z', '--', '.ai', ':(exclude).ai/local'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0').filter(Boolean).sort();
  const hash = createHash('sha256');
  for (const rel of files) {
    hash.update(`${rel}\0`);
    if (existsSync(join(ROOT, rel))) hash.update(readFileSync(join(ROOT, rel)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function majordomus(capability) {
  const out = execFileSync('majordomus', ['run', capability, '--input', '{}', '--format', 'json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const run = JSON.parse(out);
  if (run.state !== 'succeeded') throw new Error(`majordomus run ${capability}: ${run.state}`);
  return run.output;
}

function measure() {
  const version = execFileSync('majordomus', ['--version'], { encoding: 'utf8' }).trim().split(/\s+/).pop();
  const objects = majordomus('objects.list').objects
    .map((o) => ({ uri: o.uri, kind: o.kind, identity: o.identity, title: o.title ?? null, description: o.description ?? null, path: o.path }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.identity.localeCompare(b.identity));
  const caps = majordomus('capabilities.list').capabilities;
  const kinds = {};
  for (const o of objects) kinds[o.kind] = (kinds[o.kind] ?? 0) + 1;
  return {
    schema: 'korczis-hub-ai/v1',
    description: `The Majordomus layer of ${me.github}/${me.github}.github.io: every object of .ai/ with its MCP resource URI`,
    source: 'majordomus run objects.list, capabilities.list',
    majordomus: version,
    tree: aiTree(),
    counts: {
      objects: objects.length,
      kinds,
      capabilities: caps.length,
      mcp_tools: caps.filter((c) => c.exposure?.mcp?.tool).length,
      mcp_resources: caps.filter((c) => c.exposure?.mcp?.resource).length,
      http_routes: caps.filter((c) => c.exposure?.http).length,
    },
    objects,
  };
}

// One summary per published file, read from the file: a JSON document's description, title, name
// or schema; an llms.txt file's title and its summary line (`> ...`, llmstxt.org).
function summaryOf(rel, body) {
  if (rel.endsWith('.json')) {
    const j = JSON.parse(body);
    // A JSON Resume (jsonresume.org) has no description of its own: who it is and in what role.
    if (j.basics?.name && j.meta?.canonical) return `JSON Resume of ${j.basics.name}: ${j.basics.label ?? 'CV'}`;
    return j.description ?? j.title ?? j.name ?? j.schema ?? rel;
  }
  if (rel.endsWith('.xml')) return 'Every page of the site, in both languages (sitemaps.org)';
  if (rel === '.well-known/api-catalog') return 'The API catalogue (RFC 9727): where the description, the documentation and the Majordomus layer are';
  const lines = body.split('\n');
  const title = lines.find((l) => l.startsWith('# '))?.slice(2).trim();
  const lead = lines.find((l) => l.startsWith('> '))?.slice(2).trim();
  return [title, lead].filter(Boolean).join(': ') || rel;
}

function openapi() {
  const files = [];
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${prefix}${entry.name}`;
      const translation = !prefix && languages().some((l) => !isDefault(l) && l === entry.name);
      if (entry.isDirectory() && (entry.name === 'schemas' || entry.name === '.well-known' || translation)) walk(join(dir, entry.name), `${rel}/`);
      else if (entry.isFile() && (/\.(json|txt)$/.test(entry.name) || rel === '.well-known/api-catalog') && rel !== 'openapi.json') files.push(rel);
    }
  };
  walk('static');
  files.sort();
  const paths = {};
  const add = (rel, body, type) => {
    paths[`/${rel}`] = {
      get: {
        operationId: rel.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, ''),
        summary: summaryOf(rel, body),
        tags: [rel.startsWith('schemas/') ? 'schemas' : rel.endsWith('.txt') ? 'text' : 'data'],
        responses: { 200: { description: 'The file, as published', content: { [type]: { schema: /json$/.test(type) ? { type: 'object' } : { type: 'string' } } } } },
      },
    };
  };
  const typeOf = (rel) => (rel === '.well-known/api-catalog' ? 'application/linkset+json'
    : rel.startsWith('schemas/') ? 'application/schema+json' : rel.endsWith('.json') ? 'application/json' : 'text/plain');
  for (const rel of files) add(rel, readFileSync(join(ROOT, 'static', rel), 'utf8'), typeOf(rel));
  add('sitemap.xml', '', 'application/xml');
  return {
    openapi: '3.1.0',
    info: {
      title: `${me.author} · ${me.github}.github.io`,
      description: 'Every machine-readable file this static site publishes. Read-only; no authentication.',
      version: '1',
    },
    servers: [{ url: me.base }],
    tags: [
      { name: 'data', description: 'The site as data: pages, projects, repositories, the Majordomus layer' },
      { name: 'text', description: 'Plain text for language models (llms.txt)' },
      { name: 'schemas', description: 'JSON Schemas the site validates its own data against' },
    ],
    paths,
  };
}

// RFC 9727: one linkset entry for the site, naming its machine description, its documentation for
// people in every language, and the Majordomus layer.
function catalog() {
  return {
    linkset: [{
      anchor: `${me.base}/`,
      'service-desc': [{ href: `${me.base}/openapi.json`, type: 'application/openapi+json' }],
      'service-doc': [{ href: `${me.base}/interfaces/`, type: 'text/html', hreflang: ['en'] }, { href: `${me.base}/cs/interfaces/`, type: 'text/html', hreflang: ['cs'] }],
      describedby: [{ href: `${me.base}/ai.json`, type: 'application/json', title: 'The Majordomus layer (.ai/) with MCP resource URIs' }],
    }],
  };
}

const findings = [];
const linkset = text(catalog());
if (opts.check) {
  if (!existsSync(CATALOG) || readFileSync(CATALOG, 'utf8') !== linkset) findings.push('static/.well-known/api-catalog is stale');
} else {
  mkdirSync(join(ROOT, 'static/.well-known'), { recursive: true });
  writeFileSync(CATALOG, linkset);
}
let ai = existsSync(AI) ? JSON.parse(readFileSync(AI, 'utf8')) : null;
if (opts.measure) {
  ai = measure();
  writeFileSync(AI, text(ai));
}
if (!ai) findings.push('static/ai.json is missing: run node scripts/build-interfaces.mjs --measure (needs majordomus)');
else if (ai.tree !== aiTree()) findings.push('.ai/ changed since static/ai.json was measured: run node scripts/build-interfaces.mjs --measure (needs majordomus)');
for (const o of ai?.objects ?? []) {
  if (!existsSync(join(ROOT, o.path))) findings.push(`static/ai.json: ${o.uri} names ${o.path}, which does not exist`);
}
const spec = text(openapi());
if (opts.check) {
  if (!existsSync(OPENAPI) || readFileSync(OPENAPI, 'utf8') !== spec) findings.push('static/openapi.json is stale');
} else {
  writeFileSync(OPENAPI, spec);
}
report(findings, `interfaces: ${ai?.counts.objects} objects of .ai/ (Majordomus ${ai?.majordomus}), ` +
  `${Object.keys(JSON.parse(spec).paths).length} published files in static/openapi.json${opts.check ? ', current' : ''}`);
