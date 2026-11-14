#!/usr/bin/env node
// Gate for the experience section, offline: data/experience.json conforms to
// static/schemas/experience.schema.json (no field outside it), every key it uses exists in
// data/experience-rules.toml (sector, role, capability, technology), every number is a valid
// scale bucket, periods are ordered and hold their months, every public repository it links has
// a work page's data (data/recent.json), every capability's glossary term and categories exist,
// and the NDA denylist (scripts/lib/nda.mjs) matches nothing in it.
//
// usage: node scripts/check-experience.mjs      exit 0 clean, 1 with every finding listed
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { DATA_FILE, RULES_FILE, SCHEMA_FILE, loadRules, validate } from './lib/experience.mjs';
import { compileDenylist, loadDenylist, matchingLines } from './lib/nda.mjs';

export function checkExperience(root) {
  const findings = [];
  const fail = (where, what) => findings.push(`${where}: ${what}`);
  const rules = loadRules(root);
  const text = readFileSync(join(root, DATA_FILE), 'utf8');
  const data = JSON.parse(text);
  const schema = JSON.parse(readFileSync(join(root, SCHEMA_FILE), 'utf8'));
  validate(schema, data, (what) => fail(DATA_FILE, what));
  if (findings.length) return findings;

  // The vocabulary itself: every capability names a known domain, glossary term and category.
  const glossary = new Set(parse(readFileSync(join(root, 'data/glossary.toml'), 'utf8')).terms.map((t) => t.id));
  const categories = parse(readFileSync(join(root, 'data/projects.toml'), 'utf8')).categories ?? {};
  for (const [kind, table] of Object.entries({ sectors: rules.sectors, domains: rules.domains, capabilities: rules.capabilities, roles: rules.roles })) {
    for (const [key, v] of Object.entries(table ?? {})) {
      const at = `${RULES_FILE} [${kind}.${key}]`;
      if (!/^[a-z][a-z-]*$/.test(key)) fail(at, 'key is not lower-case words with hyphens');
      if (!v.name || !v.name_cs) fail(at, 'needs name and name_cs');
      if ((kind === 'capabilities' || kind === 'roles') && (!v.description || !v.description_cs)) fail(at, 'needs description and description_cs');
      if (v.term && !glossary.has(v.term)) fail(at, `term ${v.term} is not in data/glossary.toml`);
      if (v.category && !categories[v.category]) fail(at, `category ${v.category} is not in data/projects.toml`);
      for (const c of v.categories ?? []) if (!categories[c]) fail(at, `category ${c} is not in data/projects.toml`);
      if (kind === 'capabilities') {
        if (!rules.domains?.[v.domain]) fail(at, `domain ${v.domain} is not in [domains]`);
        if (!v.term) fail(at, 'names no glossary term');
        if (!(v.keywords ?? []).length) fail(at, 'has no keywords to infer it by');
      }
    }
  }

  const buckets = new Set([0, ...rules.scale.buckets]);
  const recent = new Set(JSON.parse(readFileSync(join(root, 'data/recent.json'), 'utf8')).repos.map((r) => r.name));
  const ids = new Set();
  for (const e of data.engagements) {
    const at = `${DATA_FILE} ${e.id}`;
    if (ids.has(e.id)) fail(at, 'duplicate id');
    ids.add(e.id);
    if (e.sector !== null && !rules.sectors[e.sector]) fail(at, `sector ${e.sector} is not in [sectors]`);
    for (const r of e.roles) if (!rules.roles[r]) fail(at, `role ${r} is not in [roles]`);
    for (const t of e.technologies) if (!rules.technologies[t]) fail(at, `technology ${t} is not in [technologies]`);
    for (const [k, n] of Object.entries(e.scale)) if (!buckets.has(n)) fail(at, `scale.${k} = ${n} is not a bucket floor`);
    for (const [m, n] of Object.entries(e.months)) {
      if (!buckets.has(n) || n === 0) fail(at, `months.${m} = ${n} is not a bucket floor`);
      if (!e.period || m < e.period.from || m > e.period.to) fail(at, `month ${m} is outside the period`);
    }
    if (e.period && e.period.from > e.period.to) fail(at, 'period ends before it starts');
    if (!e.period && e.scale.commits) fail(at, 'commits without a period');
    const seen = new Set();
    for (const c of e.capabilities) {
      if (!rules.capabilities[c.key]) fail(at, `capability ${c.key} is not in [capabilities]`);
      if (seen.has(c.key)) fail(at, `capability ${c.key} twice`);
      seen.add(c.key);
      if (!c.declared && c.score < rules.inference.threshold) fail(at, `capability ${c.key} scores ${c.score}, under the threshold, and is not declared`);
    }
  }
  for (const [key, repos] of Object.entries(data.public_work)) {
    if (!rules.capabilities[key]) fail(`${DATA_FILE} public_work`, `${key} is not in [capabilities]`);
    for (const r of repos) if (!recent.has(r)) fail(`${DATA_FILE} public_work.${key}`, `${r} has no work page (not in data/recent.json)`);
  }

  // The NDA gate on the file the section renders (scripts/check-nda.mjs scans everything else).
  const { names } = loadDenylist();
  if (names.length) for (const line of matchingLines(compileDenylist(names), text)) fail(`${DATA_FILE}:${line}`, 'matches a denylisted name');
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) {
    console.log('usage: node scripts/check-experience.mjs');
    process.exit(process.argv.includes('--help') ? 0 : 2);
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const findings = checkExperience(root);
  if (findings.length) {
    for (const f of findings) console.error(`✗ ${f}`);
    console.error(`experience: ${findings.length} finding(s), FAIL`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(join(root, DATA_FILE), 'utf8'));
  const caps = new Set(data.engagements.flatMap((e) => e.capabilities.map((c) => c.key)));
  console.log(`experience: ${data.engagements.length} engagements, ${caps.size} capabilities, every key in the rules, every number a bucket, PASS`);
}
