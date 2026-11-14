#!/usr/bin/env node
// Gate for rules project.viz-component-layer and project.viz-ergonomics, static (no browser).
// Every visual file is parsed (acorn), so a word in a comment or in unrelated code proves nothing.
//
// The layer:
//  - a chart, graph or sketch library is constructed only in static/js/viz/<name>.js;
//  - each such file registers exactly one visual, KorczisHub.viz('<name>', {…}), named after it;
//    a visual is static only by its registration (`static: '<reason>'`), never by its name;
//  - every data-viz="<name>" in templates/ has a registered visual, the template loads
//    js/viz/<name>.js, and its box has a role and an aria-label (or is aria-hidden);
//  - no template loads a script or stylesheet from another origin (everything is self-hosted);
//  - every ECharts series type a visual draws is registered in scripts/lib/echarts-entry.mjs;
//  - the front-matter schema's viz kind enum is the set of registered non-static visuals and its
//    source enum the set of data sources templates/partials/viz-grid.html renders (--fix writes
//    both enums from those registries); every declared source is one viz-grid renders.
// Every visual that is not static (a maximizable simulator):
//  - its mount returns a handle with items() (the list twin) and controls() (its parameters);
//  - keeps no ResizeObserver of its own (the layer resizes it) and navigates only through go();
//  - takes every duration from motion() or honours reducedMotion, with no literal duration;
//  - holds no colour literal (#hex, rgb(, rgba(, hsl(): colours come from palette();
//  - references neither Chart.js nor Cytoscape (one ECharts layer);
//  - answers a click or tap and shows the pointer where it does (ECharts does that itself).
// Everywhere in static/js: no site path is built by hand (`${base}projects/`, 'work/' + slug); the
// site's pages come from KorczisHub.link(kind, key), which knows the real addresses.
//
// usage: node scripts/check-viz-layer.mjs [--fix]   --fix rewrites the schema's kind and source enums
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from 'smol-toml';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliArgs } from './lib/cli.mjs';

const opts = cliArgs({ '--fix': true });

// acorn is p5's parser (a locked transitive dependency); scripts/vendor.mjs does not ship it.
const require = createRequire(import.meta.url);
const acorn = require('acorn');
const ROOT = process.env.VIZ_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const findings = [];
const CONSTRUCTORS = /\bnew\s+p5\s*\(|\bcytoscape\s*\(\s*\{|\becharts\.init\s*\(|\bnew\s+Chart\s*\(/;
const SCHEMA = 'static/schemas/front-matter.schema.json';

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'vendor' ? [] : walk(path);
    return [path];
  });
}

function parseJs(text, rel) {
  for (const sourceType of ['script', 'module']) {
    try {
      return acorn.parse(text, { ecmaVersion: 'latest', sourceType, locations: true });
    } catch (error) {
      if (sourceType === 'module') findings.push(`${rel}: does not parse (${error.message})`);
    }
  }
  return null;
}

// Every node under `node`; with `shallow`, nested functions are not entered (a mount's own returns).
function* nodes(node, shallow = false, top = true) {
  if (!node || typeof node.type !== 'string') return;
  if (!top && shallow && /Function/.test(node.type)) return;
  yield node;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc') continue;
    if (Array.isArray(value)) for (const v of value) yield* nodes(v, shallow, false);
    else if (value && typeof value.type === 'string') yield* nodes(value, shallow, false);
  }
}

const keyName = (prop) => (prop.type === 'Property' ? prop.key.name ?? prop.key.value : null);
const isMember = (node, object, property) => node?.type === 'MemberExpression'
  && (object === null || node.object.name === object || node.object.property?.name === object)
  && (node.property.name ?? node.property.value) === property;
const strings = (ast) => [...nodes(ast)].flatMap((n) => {
  if (n.type === 'Literal' && typeof n.value === 'string') return [[n.value, n]];
  if (n.type === 'TemplateLiteral') return n.quasis.map((q) => [q.value.cooked ?? q.value.raw, n]);
  return [];
});
const line = (n) => n.loc?.start.line ?? '?';

// The registration: KorczisHub.viz('<name>', { lib, static?, mount }).
function registration(ast) {
  const calls = [...nodes(ast)].filter((n) => n.type === 'CallExpression' && isMember(n.callee, 'KorczisHub', 'viz'));
  return calls.map((call) => {
    const [nameArg, spec] = call.arguments;
    const props = spec?.type === 'ObjectExpression' ? spec.properties : [];
    const prop = (name) => props.find((p) => keyName(p) === name);
    const staticProp = prop('static');
    const mount = prop('mount')?.value;
    return {
      name: nameArg?.type === 'Literal' ? nameArg.value : null,
      lib: prop('lib')?.value?.value ?? null,
      static: staticProp ? (staticProp.value.type === 'Literal' && typeof staticProp.value.value === 'string' && staticProp.value.value.trim()) || '' : null,
      mount: mount && /Function/.test(mount.type) ? mount : null,
    };
  });
}

// The handle a mount returns: every object it returns (directly, or through a const in the mount).
function handles(mount) {
  const declared = new Map();
  for (const n of nodes(mount.body, true)) {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init?.type === 'ObjectExpression') declared.set(n.id.name, n.init);
  }
  const out = [];
  const body = mount.body.type === 'BlockStatement' ? mount.body : { type: 'ReturnStatement', argument: mount.body };
  for (const n of nodes(body, true)) {
    if (n.type !== 'ReturnStatement') continue;
    const arg = n.argument;
    if (!arg || (arg.type === 'Literal' && arg.value === null)) continue;
    const object = arg.type === 'ObjectExpression' ? arg : arg.type === 'Identifier' ? declared.get(arg.name) : null;
    out.push(object
      ? { line: line(n), keys: new Set(object.properties.map(keyName).filter(Boolean)), spread: object.properties.some((p) => p.type === 'SpreadElement'), object }
      : { line: line(n), keys: null });
  }
  return out;
}

// --- the visuals ---------------------------------------------------------------------------------
const registered = new Map();
const used = new Set();
// The site's sections, derived: content/'s top-level directories and pages, and the taxonomies.
const sectionNames = (() => {
  const content = readdirSync(join(ROOT, 'content'), { withFileTypes: true })
    .map((e) => (e.isDirectory() ? e.name : e.name.replace(/(\.[a-z]{2})?\.md$/, '')))
    .filter((n) => n && !n.startsWith('_'));
  const taxonomies = [...readFileSync(join(ROOT, 'zola.toml'), 'utf8').matchAll(/taxonomies\s*=\s*\[([^\]]*)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/name\s*=\s*"([\w-]+)"/g)].map((n) => n[1]));
  return [...new Set([...content, ...taxonomies])];
})();
const SITE_PATH = sectionNames.length ? new RegExp(`(?:^|/)(?:${sectionNames.join('|')})/`) : /(?!)/;

for (const file of walk(join(ROOT, 'static/js')).filter((f) => f.endsWith('.js'))) {
  const rel = file.slice(ROOT.length + 1);
  const text = readFileSync(file, 'utf8');
  const inViz = rel.startsWith('static/js/viz/');
  if (CONSTRUCTORS.test(text) && !inViz) findings.push(`${rel}: constructs a visual outside static/js/viz/`);
  const ast = parseJs(text, rel);
  if (!ast) continue;

  // A hand-built site path: a template literal with an interpolation, or a + concatenation, whose
  // text names a section of the site.
  for (const n of nodes(ast)) {
    const hand = (n.type === 'TemplateLiteral' && n.expressions.length && n.quasis.some((q) => SITE_PATH.test(q.value.cooked ?? '')))
      || (n.type === 'BinaryExpression' && n.operator === '+'
        && [n.left, n.right].some((s) => s.type === 'Literal' && typeof s.value === 'string' && SITE_PATH.test(s.value)));
    if (hand) findings.push(`${rel}:${line(n)}: builds a site path by hand (${text.slice(n.start, Math.min(n.end, n.start + 60)).replace(/\s+/g, ' ')}); use KorczisHub.link(kind, key)`);
  }
  if (!inViz) continue;

  const regs = registration(ast);
  const expected = basename(file, '.js');
  if (regs.length !== 1 || regs[0].name !== expected) {
    findings.push(`${rel}: must register exactly one visual named '${expected}' (found ${regs.map((r) => r.name).join(', ') || 'none'})`);
    if (!regs.length) continue;
  }
  const reg = regs[0];
  registered.set(reg.name, reg);
  if (reg.static === '') findings.push(`${rel}: static must give its reason, static: '<why this visual is not a simulator>'`);
  if (!reg.mount) { findings.push(`${rel}: registers no mount function`); continue; }
  const all = [...nodes(ast)];

  if (reg.lib === 'echarts') {
    const entry = readFileSync(join(ROOT, 'scripts/lib/echarts-entry.mjs'), 'utf8').match(/echarts\.use\(\[([^\]]*)\]/)?.[1] ?? '';
    // Only a series object's own `type` names a chart; a nested one (lineStyle, markLine, areaStyle)
    // is a style, not a series.
    for (const s of all.filter((n) => n.type === 'Property' && keyName(n) === 'series')) {
      const objects = s.value.type === 'ArrayExpression' ? s.value.elements : [s.value];
      for (const o of objects.filter((e) => e && e.type === 'ObjectExpression')) {
        const t = o.properties.find((p) => p.type === 'Property' && keyName(p) === 'type');
        if (!t || t.value.type !== 'Literal' || typeof t.value.value !== 'string') continue;
        const chart = `${t.value.value[0].toUpperCase()}${t.value.value.slice(1)}Chart`;
        if (!new RegExp(`\\b${chart}\\b`).test(entry)) findings.push(`${rel}: draws an ECharts '${t.value.value}' series, but scripts/lib/echarts-entry.mjs does not register ${chart}`);
      }
    }
    if (all.some((n) => n.type === 'Property' && keyName(n) === 'tooltip') && !/\bTooltipComponent\b/.test(entry)) findings.push(`${rel}: uses an ECharts tooltip, but scripts/lib/echarts-entry.mjs does not register TooltipComponent`);
  }

  // Navigation goes through go() in every visual file, static or not.
  for (const n of all) {
    if (n.type === 'AssignmentExpression' && isMember(n.left, 'location', 'href')) findings.push(`${rel}:${line(n)}: navigates with location.href =; use go(url, event)`);
    if (n.type === 'CallExpression' && (isMember(n.callee, 'window', 'open') || isMember(n.callee, 'location', 'assign') || isMember(n.callee, 'location', 'replace'))) {
      findings.push(`${rel}:${line(n)}: navigates with ${text.slice(n.callee.start, n.callee.end)}(); use go(url, event)`);
    }
  }
  if (reg.static) continue;

  // The handle: items() and controls(), from the object the mount returns.
  const returned = handles(reg.mount);
  if (!returned.length) findings.push(`${rel}: mount returns no handle`);
  for (const h of returned) {
    if (!h.keys) { findings.push(`${rel}:${h.line}: mount returns a handle that is not an object literal (or a const holding one); the gate cannot read it`); continue; }
    // Only the handle of no data at all (empty: true, written as the literal) owes no parameter; a
    // handle whose empty flag is computed (empty: !rows.length) is held to the whole contract.
    const emptyNode = h.object?.properties.find((p) => keyName(p) === 'empty');
    if (emptyNode?.value.type === 'Literal' && emptyNode.value.value === true) {
      if (!h.keys.has('items')) findings.push(`${rel}:${h.line}: the empty handle has no items(); its list twin must still open`);
      continue;
    }
    // A controls() that returns an empty array literal declares no parameter.
    const controlsNode = h.object?.properties.find((p) => keyName(p) === 'controls');
    const fn = controlsNode?.value;
    const body = fn && /Function/.test(fn.type) ? (fn.body.type === 'BlockStatement' ? fn.body.body.find((st) => st.type === 'ReturnStatement')?.argument : fn.body) : null;
    if (body?.type === 'ArrayExpression' && !body.elements.length) findings.push(`${rel}:${h.line}: controls() returns no parameter; a simulator declares at least one`);
    for (const need of ['items', 'controls']) {
      if (h.keys.has(need)) continue;
      const why = need === 'controls' ? 'a simulator declares its parameters' : 'the list twin is how a keyboard reaches it';
      findings.push(`${rel}:${h.line}: the handle has no ${need}() (${why})${h.spread ? '; a spread is not read' : ''}`);
    }
  }
  const ids = (name) => all.filter((n) => n.type === 'Identifier' && n.name === name);
  for (const n of all) {
    const observer = n.type === 'NewExpression' && (n.callee.name === 'ResizeObserver' || (n.callee.type === 'MemberExpression' && n.callee.property?.name === 'ResizeObserver'));
    if (observer) findings.push(`${rel}:${line(n)}: keeps its own ResizeObserver; the layer calls resize() or update()`);
    const listen = n.type === 'CallExpression' && isMember(n.callee, null, 'addEventListener') && n.arguments[0]?.type === 'Literal' && n.arguments[0].value === 'resize';
    if (listen) findings.push(`${rel}:${line(n)}: listens to resize itself; the layer calls resize() or update()`);
  }
  if (!all.some((n) => n.type === 'CallExpression' && (n.callee.name === 'go' || isMember(n.callee, null, 'go')))) findings.push(`${rel}: never navigates through go(url, event)`);
  if (!ids('motion').length && !ids('reducedMotion').length) findings.push(`${rel}: animates without motion() or reducedMotion`);
  const literal = (v) => v?.type === 'Literal' && typeof v.value === 'number' && v.value > 0;
  for (const n of all) {
    if (n.type === 'CallExpression' && ['duration', 'delay'].some((p) => isMember(n.callee, null, p)) && literal(n.arguments[0])) {
      findings.push(`${rel}:${line(n)}: a literal ${n.callee.property.name}(${n.arguments[0].value}); take it from motion()`);
    }
    if (n.type === 'Property' && /^(?:duration|animationDuration(?:Update)?|animationDelay(?:Update)?)$/.test(keyName(n) ?? '') && literal(n.value)) {
      findings.push(`${rel}:${line(n)}: a literal ${keyName(n)}: ${n.value.value}; take it from motion()`);
    }
  }
  for (const [value, n] of strings(ast)) {
    const colour = value.match(/(?:^|[\s,(:])(#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4}))(?![\w-])|\b(?:rgba?|hsla?)\(/i);
    if (colour) findings.push(`${rel}:${line(n)}: a colour literal (${colour[1] ?? colour[0]}); take colours from palette()`);
  }
  for (const n of [...ids('Chart'), ...ids('cytoscape')]) findings.push(`${rel}:${line(n)}: references ${n.name}; charts and graphs are ECharts through the layer`);
  if (['chartjs', 'cytoscape'].includes(reg.lib)) findings.push(`${rel}: lib '${reg.lib}'; charts and graphs are ECharts through the layer`);

  // Interactive: a click or tap handler, and the pointer shown (ECharts sets the pointer itself).
  const clicks = all.some((n) => n.type === 'CallExpression'
    && (isMember(n.callee, null, 'on') || isMember(n.callee, null, 'addEventListener'))
    && n.arguments[0]?.type === 'Literal' && ['click', 'tap', 'pointerup', 'pointerdown'].includes(n.arguments[0].value))
    || all.some((n) => n.type === 'Property' && keyName(n) === 'onClick');
  if (!clicks) findings.push(`${rel}: answers no click or tap; every visual leads somewhere`);
  const cursor = reg.lib === 'echarts' || all.some((n) => (n.type === 'Literal' && n.value === 'cursor')
    || (n.type === 'MemberExpression' && (n.property.name ?? n.property.value) === 'cursor')
    || (n.type === 'Property' && keyName(n) === 'cursor'));
  if (!cursor) findings.push(`${rel}: never sets the pointer cursor; show what is clickable`);
}
const simulators = [...registered.values()].filter((r) => !r.static).map((r) => r.name).sort();
const statics = new Set([...registered.values()].filter((r) => r.static).map((r) => r.name));

// --- templates -----------------------------------------------------------------------------------
for (const file of walk(join(ROOT, 'templates')).filter((f) => f.endsWith('.html'))) {
  const rel = file.slice(ROOT.length + 1);
  const text = readFileSync(file, 'utf8');
  for (const [tag, name] of text.matchAll(/<[a-z]+\b[^>]*\bdata-viz="([^"]+)"[^>]*>/g)) {
    if (!/aria-hidden="true"/.test(tag) && !(/\brole="/.test(tag) && /\baria-label="/.test(tag))) findings.push(`${rel}: the data-viz="${name}" box has no role and aria-label (or aria-hidden="true")`);
    if (name.includes('{')) continue;
    used.add(name);
    if (!registered.has(name)) findings.push(`${rel}: data-viz="${name}" has no static/js/viz/${name}.js`);
    if (!text.includes(`js/viz/${name}.js`)) findings.push(`${rel}: uses data-viz="${name}" but does not load js/viz/${name}.js`);
  }
  // Only what the browser fetches counts: scripts and stylesheet, preload or icon links. A link
  // that merely names another page (rel=me, canonical, alternate) loads nothing.
  for (const [tag] of text.matchAll(/<(?:script|link)\b[^>]*>/g)) {
    const url = (tag.match(/(?:src|href)="(https?:\/\/[^"]+)"/) || [])[1];
    if (!url) continue;
    const fetched = tag.startsWith('<script') || /rel="(?:stylesheet|preload|modulepreload|icon|apple-touch-icon|manifest)"/.test(tag);
    if (fetched) findings.push(`${rel}: loads ${url} from another origin; self-host it (scripts/vendor.mjs)`);
  }
  // Every visual box (but a static one) is followed by its list twin.
  const boxes = [...text.matchAll(/data-viz="([^"]+)"/g)].filter((m) => !statics.has(m[1])).length;
  const twins = (text.match(/partials\/viz-list\.html/g) || []).length;
  if (boxes > twins) findings.push(`${rel}: ${boxes} visual(s) but ${twins} list twin(s); include partials/viz-list.html after each box`);
}

// The data sources viz-grid renders, one {% if v.source == "…" %} branch each.
const grid = readFileSync(join(ROOT, 'templates/partials/viz-grid.html'), 'utf8');
const sources = [...new Set([...grid.matchAll(/v\.source\s*==\s*"([\w.-]+)"/g)].map((m) => m[1]))];

// Visuals declared in front matter ([[extra.viz]]) and, for taxonomy pages, in data/site.toml.
const declared = [];
for (const file of walk(join(ROOT, 'content')).filter((f) => f.endsWith('.md'))) {
  const match = readFileSync(file, 'utf8').match(/^\+\+\+\n([\s\S]*?)\n\+\+\+/);
  if (match) for (const v of parse(match[1]).extra?.viz ?? []) declared.push([file.slice(ROOT.length + 1), v]);
}
{
  const site = parse(readFileSync(join(ROOT, 'data/site.toml'), 'utf8'));
  for (const v of [...(site.taxonomy?.list_viz ?? []), ...(site.taxonomy?.single_viz ?? [])]) declared.push(['data/site.toml', v]);
}
for (const [where, v] of declared) {
  used.add(v.kind);
  if (!registered.has(v.kind)) findings.push(`${where}: visual kind "${v.kind}" has no static/js/viz/${v.kind}.js`);
  else if (statics.has(v.kind)) findings.push(`${where}: visual kind "${v.kind}" is static; a card holds a simulator`);
  if (!sources.includes(v.source)) findings.push(`${where}: visual source "${v.source}" is not a branch of templates/partials/viz-grid.html`);
}
for (const name of registered.keys()) if (!used.has(name)) findings.push(`static/js/viz/${name}.js: no template or front matter uses visual '${name}'; remove it or use it`);

// The schema's enums are these registries (F7): derived, never a second hand-kept list.
{
  const schema = JSON.parse(readFileSync(join(ROOT, SCHEMA), 'utf8'));
  const item = schema.properties?.extra?.properties?.viz?.items?.properties;
  if (!item?.kind?.enum || !item?.source?.enum) findings.push(`${SCHEMA}: no extra.viz.items kind/source enum to compare`);
  else if (opts.fix) {
    item.kind.enum = simulators;
    item.source.enum = sources;
    writeFileSync(join(ROOT, SCHEMA), `${JSON.stringify(schema, null, 2)}\n`);
    console.log(`${SCHEMA}: kind enum = ${simulators.length} registered simulators, source enum = ${sources.length} viz-grid sources`);
  } else {
    const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
    const diff = (have, want) => `missing ${want.filter((x) => !have.includes(x)).join(', ') || 'none'}; extra ${have.filter((x) => !want.includes(x)).join(', ') || 'none'}`;
    if (!same(item.kind.enum, simulators)) findings.push(`${SCHEMA}: viz kind enum is not the registered non-static visuals (${diff(item.kind.enum, simulators)}); run node scripts/check-viz-layer.mjs --fix`);
    if (!same(item.source.enum, sources)) findings.push(`${SCHEMA}: viz source enum is not viz-grid.html's sources (${diff(item.source.enum, sources)}); run node scripts/check-viz-layer.mjs --fix`);
  }
}

if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  console.error(`viz layer: ${findings.length} finding(s) in ${registered.size} visuals (${simulators.length} simulators, ${statics.size} static)`);
  process.exit(1);
}
console.log(`viz layer: ${registered.size} visuals (${simulators.length} simulators with items and controls, ${statics.size} static), registered, loaded, self-hosted and derived, PASS`);
