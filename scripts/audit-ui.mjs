#!/usr/bin/env node
// UI gate (rule project.ui-quality-gate). For every page, at 375 and 1440 px in the light and the
// dark theme: axe-core WCAG 2.2 AA violations, console and network errors, horizontal overflow,
// cumulative layout shift, and every visual reaching data-viz-state="ready" once scrolled into
// view. At 320, 768, 1024 and 1920 px: overflow and errors only. Then every internal link the
// pages rendered must resolve to a built file, every link with a fragment to an element with that
// id in the page it names, and on a page of another language than the default (/cs/) every
// internal page link stays in that language. While data/cv.toml [hire] available is true, the
// home's first viewport (375x667 and 1440x900, both themes, every language) shows the h1 and a
// /hire/ link, the topbar's Hire me is at least 24x24 px, and the proof band precedes the visuals
// (check name home-first-viewport). Any finding exits 1.
//
// The pages are derived, never named: one page per template and language, read from the built
// site's sitemap.xml, each URL's template inferred from the content front matter that renders it
// (template, the section's page_template, Zola's defaults; taxonomies; 404.html). The audit fails
// when a template in templates/ has no page in some language, or a URL maps to no template.
// Every list twin of every visual on those pages is opened and each of its links resolved.
//
// usage: BASE_URL=http://127.0.0.1:<port>/ SITE_DIR=<built site> node scripts/audit-ui.mjs
//          [--json <file>] [--shots <dir>] [--only <regexp on the page name>]
//        SITE_DIR=<built site> node scripts/audit-ui.mjs --pages   the derived pages and their
//          coverage, without a browser
// scripts/verify-all.sh builds, serves and calls this; CI does the same. One browser launch.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { parse } from 'smol-toml';
import { cliArgs } from './lib/cli.mjs';

// Flags first: --help or a typo must answer before a browser is looked for.
const opts = cliArgs({ '--json': '<file>', '--shots': '<dir>', '--only': '<regexp>', '--pages': true });
const require = createRequire(import.meta.url);

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:1111/').replace(/\/?$/, '/');
const SITE_DIR = process.env.SITE_DIR || 'public';
const JSON_OUT = opts.json;
const SHOTS = opts.shots;
const ONLY = opts.only ? new RegExp(opts.only) : null;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const FULL_RUNS = [[375, 'light'], [375, 'dark'], [1440, 'light'], [1440, 'dark']];
const LAYOUT_WIDTHS = [320, 768, 1024, 1920];
const CLS_LIMIT = 0.1;
const ROOT = new URL('..', import.meta.url).pathname;
const CONFIG = parse(readFileSync(join(ROOT, 'zola.toml'), 'utf8'));
const DEFAULT_LANG = CONFIG.default_language || 'en';
const LANGS = [DEFAULT_LANG, ...Object.keys(CONFIG.languages ?? {})];
const OTHER_LANGS = LANGS.slice(1);

// --- the pages: one per template and language, derived ------------------------------------------
// Kinds: '' (home), '<dir>/' (a section, or a top-level page), '<dir>/*' (a page of a section).
function derivePages() {
  const findings = [];
  const kinds = new Map(); // `${lang} ${kind}` -> template
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const files = walk(join(ROOT, 'content')).filter((f) => f.endsWith('.md'));
  const front = (file) => {
    const m = readFileSync(file, 'utf8').match(/^\+\+\+\n([\s\S]*?)\n\+\+\+/);
    return m ? parse(m[1]) : {};
  };
  const langOf = (file) => file.match(/\.([a-z]{2})\.md$/)?.[1] ?? DEFAULT_LANG;
  const sections = new Map(); // `${lang} ${dir}` -> front matter
  for (const file of files.filter((f) => /\/_index(\.[a-z]{2})?\.md$/.test(f))) {
    const dir = relative(join(ROOT, 'content'), join(file, '..'));
    sections.set(`${langOf(file)} ${dir}`, front(file));
  }
  const pageTemplate = (lang, dir) => {
    for (let d = dir; ; d = d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '') {
      const t = sections.get(`${lang} ${d}`)?.page_template;
      if (t) return t;
      if (d === '') return 'page.html';
    }
  };
  for (const file of files) {
    const lang = langOf(file);
    const dir = relative(join(ROOT, 'content'), join(file, '..'));
    const fm = front(file);
    const section = /\/_index(\.[a-z]{2})?\.md$/.test(file);
    const stem = file.split('/').pop().replace(/(\.[a-z]{2})?\.md$/, '');
    const kind = section ? (dir ? `${dir}/` : '') : (dir ? `${dir}/*` : `${stem}/`);
    const template = fm.template ?? (section ? (dir ? 'section.html' : 'index.html') : pageTemplate(lang, dir));
    const key = `${lang} ${kind}`;
    if (kinds.has(key) && kinds.get(key) !== template) findings.push(`${kind} (${lang}) is rendered by both ${kinds.get(key)} and ${template}; the audit samples one per kind`);
    kinds.set(key, template);
  }
  for (const lang of LANGS) {
    const taxonomies = (lang === DEFAULT_LANG ? CONFIG.taxonomies : CONFIG.languages?.[lang]?.taxonomies) ?? [];
    for (const { name } of taxonomies) {
      kinds.set(`${lang} ${name}/`, existsSync(join(ROOT, `templates/${name}/list.html`)) ? `${name}/list.html` : 'taxonomy_list.html');
      kinds.set(`${lang} ${name}/*`, existsSync(join(ROOT, `templates/${name}/single.html`)) ? `${name}/single.html` : 'taxonomy_single.html');
    }
  }
  // The built URLs, in sitemap order, relative to the configured base path.
  const basePath = new URL(CONFIG.base_url.replace(/\/?$/, '/')).pathname;
  const urls = [...readFileSync(join(SITE_DIR, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(([, loc]) => decodeURIComponent(new URL(loc).pathname))
    .map((path) => (path.startsWith(basePath) ? path.slice(basePath.length) : path.replace(/^\//, '')));
  const pages = [];
  const seen = new Set();
  for (const rel of urls) {
    let segs = rel.split('/').filter(Boolean);
    const lang = OTHER_LANGS.includes(segs[0]) ? segs[0] : DEFAULT_LANG;
    if (lang !== DEFAULT_LANG) segs = segs.slice(1);
    const template = segs.length === 0 ? kinds.get(`${lang} `)
      : kinds.get(`${lang} ${segs.join('/')}/`) ?? kinds.get(`${lang} ${segs.slice(0, -1).join('/')}/*`);
    if (!template) { findings.push(`/${rel}: no content file or taxonomy tells which template renders it`); continue; }
    if (seen.has(`${template} ${lang}`)) continue;
    seen.add(`${template} ${lang}`);
    const stem = template.replace(/\.html$/, '').replace(/\//g, '-');
    pages.push([lang === DEFAULT_LANG ? stem : `${lang}-${stem}`, rel, template, lang]);
  }
  // Zola renders 404.html once, for every language (its texts follow the visitor's language).
  if (existsSync(join(SITE_DIR, '404.html'))) { pages.push(['404', '404.html', '404.html', '*']); seen.add('404.html *'); }
  // Coverage: every page template in templates/ (not the base layout, macros or partials), in
  // every language (404.html once).
  const templates = readdirSync(join(ROOT, 'templates'), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() && e.name !== 'partials'
      ? readdirSync(join(ROOT, 'templates', e.name)).map((f) => `${e.name}/${f}`) : [e.name]))
    .filter((t) => t.endsWith('.html') && !['base.html', 'components.html'].includes(t) && !t.startsWith('partials'));
  for (const t of templates) {
    for (const lang of t === '404.html' ? ['*'] : LANGS) {
      if (!seen.has(`${t} ${lang}`)) findings.push(`template ${t} has no page in language ${lang} in ${SITE_DIR}/sitemap.xml: the audit would not see it`);
    }
  }
  return { pages, findings, templates };
}

const DERIVED = derivePages();
const PAGES = DERIVED.pages.map(([name, rel]) => [name, rel]);
if (opts.pages) {
  for (const [name, rel, template, lang] of DERIVED.pages) console.log(`${name.padEnd(28)} ${lang.padEnd(3)} ${template.padEnd(22)} /${rel}`);
  for (const f of DERIVED.findings) console.log(`FAIL ${f}`);
  console.log(`pages: ${DERIVED.pages.length} pages cover ${DERIVED.templates.length} templates x ${LANGS.length} languages, ${DERIVED.findings.length} findings`);
  process.exit(DERIVED.findings.length ? 1 : 0);
}
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function measure(browser, name, rel, width, scheme, full) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: scheme,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const origin = new URL(BASE).origin;
  const errors = [];
  let bytes = 0;
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // A failed request to another origin (the live pulse asking api.github.com, rate-limited from a
    // shared runner) is the browser's echo of a response the network rule below already excuses:
    // the visual falls back to its snapshot and says so. Our own scripts' errors still count.
    if (/^Failed to load resource/.test(m.text()) && !(m.location()?.url ?? '').startsWith(origin)) return;
    errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on('response', (r) => {
    // The live Majordomus card may fail offline; the card then says "Snapshot". Not a finding.
    if (r.status() >= 400 && r.url().startsWith(origin)) errors.push(`${r.status()} ${r.url()}`);
    bytes += Number(r.headers()['content-length'] || 0);
  });
  await page.addInitScript(() => {
    window.__cls = 0;
    window.__shifts = [];
    const describe = (n) => (n && n.tagName ? n.tagName.toLowerCase() + (n.id ? `#${n.id}` : '') : '?');
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          window.__cls += entry.value;
          window.__shifts.push({ value: entry.value, nodes: (entry.sources || []).map((s) => describe(s.node)) });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  });
  const expectStatus = rel === '404.html' ? [200, 404] : [200];
  const response = await page.goto(BASE + rel, { waitUntil: 'networkidle', timeout: 90000 });
  if (!response || !expectStatus.includes(response.status())) errors.push(`HTTP ${response && response.status()}`);
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    cls: Math.round(window.__cls * 1000) / 1000,
    shifts: window.__shifts.sort((a, b) => b.value - a.value).slice(0, 3)
      .map((s) => `${Math.round(s.value * 1000) / 1000} ${s.nodes.slice(0, 3).join(', ')}`),
  }));

  let vizFailures = [];
  if (full) {
    // Scroll through the page so every lazy visual mounts, then require each to be ready.
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
    });
    try {
      await page.waitForFunction(
        // Ready and visibly drawn: a visual whose drawing surface is 0 px high counts as broken.
        () => [...document.querySelectorAll('[data-viz]')].every((b) => b.dataset.vizState === 'ready'
          && [...b.querySelectorAll('canvas, svg')].some((c) => c.getBoundingClientRect().height > 0)),
        null,
        { timeout: 20000 },
      );
    } catch {
      vizFailures = await page.evaluate(() => [...document.querySelectorAll('[data-viz]')]
        .filter((b) => b.dataset.vizState !== 'ready'
          || ![...b.querySelectorAll('canvas, svg')].some((c) => c.getBoundingClientRect().height > 0))
        .map((b) => `visual ${b.dataset.viz} is ${b.dataset.vizState === 'ready' ? 'ready but draws nothing (0 px)' : b.dataset.vizState || 'not mounted'}`));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
  }

  const hrefs = full
    ? await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => [a.getAttribute('href'), a.href, a.hreflang]))
    : [];
  let axe = [];
  if (full) {
    await page.addScriptTag({ content: AXE });
    axe = await page.evaluate(async (tags) => {
      const result = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } });
      // axe judges SVG text by the CSS colour and the box's background, never by the fill and the
      // shape it is drawn on; inside a visual those verdicts are noise, and the svg text check below
      // measures them instead. Everything else axe reports stands.
      const svgText = (n) => n.target.length === 1 && document.querySelector(n.target[0])?.closest('[data-viz] svg') && /^(?:text|tspan)$/.test(document.querySelector(n.target[0]).tagName);
      for (const v of result.violations) if (v.id === 'color-contrast') v.nodes = v.nodes.filter((n) => !svgText(n));
      return result.violations.filter((v) => v.nodes.length).map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      }));
    }, TAGS);
    // axe judges SVG text against the box's CSS background, never against the fill, gradient or
    // halo it is drawn on, so a label on a bubble is not judged at all. This measures what axe
    // cannot: every visible <text> of a visual, its fill against the shape under its centre (every
    // stop of a gradient, translucent fills composited over the box), or against its own halo stroke
    // when it has one. WCAG 1.4.3: 4.5:1, or 3:1 from 24 px (18.66 px bold).
    const svgText = await page.evaluate(async () => {
      const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const rgba = (css) => {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = 'rgba(0, 0, 0, 0)';
        probe.fillStyle = css;
        probe.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
        return [r, g, b, a / 255];
      };
      const over = ([r, g, b, a], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
      const lum = (c) => {
        const [r, g, b] = c.map((x) => { const v = x / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a, b) => { const [p, q] = [lum(a), lum(b)].sort((x, y) => y - x); return (p + 0.05) / (q + 0.05); };
      const ground = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const c = rgba(getComputedStyle(n).backgroundColor);
          if (c[3] > 0) return c.slice(0, 3);
        }
        return [255, 255, 255];
      };
      const found = [];
      for (const box of document.querySelectorAll('[data-viz]')) {
        const texts = [...box.querySelectorAll('svg text')];
        if (!texts.length) continue;
        box.scrollIntoView({ block: 'center' });
        await new Promise((r) => setTimeout(r, 120));
        const base = ground(box);
        for (const t of texts) {
          const style = getComputedStyle(t);
          const rect = t.getBoundingClientRect();
          if (!rect.width || !rect.height || style.visibility === 'hidden' || Number(style.opacity) === 0 || style.fill === 'none') continue;
          const ink = over(rgba(style.fill), base);
          const size = parseFloat(style.fontSize);
          const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
          const need = large ? 3 : 4.5;
          let grounds;
          if (style.stroke !== 'none' && parseFloat(style.strokeWidth) >= 2 && style.paintOrder.startsWith('stroke')) {
            grounds = [over(rgba(style.stroke), base)];
          } else {
            // The topmost shape of the same drawing whose fill holds the label's centre, found by
            // geometry (elementsFromPoint skips shapes with pointer-events: none).
            const svg = t.ownerSVGElement;
            const cx = rect.x + rect.width / 2;
            const cy = rect.y + rect.height / 2;
            const shapes = [...svg.querySelectorAll('circle, rect, path, ellipse, polygon')].filter((e) => !t.contains(e));
            const under = shapes.reverse().find((e) => {
              const st = getComputedStyle(e);
              if (st.fill === 'none' || st.display === 'none' || st.visibility === 'hidden') return false;
              const m = e.getScreenCTM();
              if (!m) return false;
              const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
              return e.isPointInFill(p);
            });
            const fill = under ? getComputedStyle(under).fill : null;
            const alpha = under ? Number(getComputedStyle(under).fillOpacity) * Number(getComputedStyle(under).opacity) : 1;
            // Chrome reports a paint server as an absolute address: url("http://host/page/#id").
            const gradient = fill?.match(/url\("?[^#")]*#([^")]+)"?\)/)?.[1];
            const colours = gradient ? [...(document.getElementById(gradient)?.querySelectorAll('stop') ?? [])].map((s) => getComputedStyle(s).stopColor) : fill ? [fill] : [];
            grounds = colours.length ? colours.map((c) => { const v = rgba(c); return over([v[0], v[1], v[2], v[3] * alpha], base); }) : [base];
          }
          const worst = Math.min(...grounds.map((g) => ratio(ink, g)));
          if (worst < need) found.push(`${box.dataset.viz}: "${t.textContent.trim().slice(0, 24)}" ${worst.toFixed(2)}:1 < ${need}:1`);
        }
      }
      window.scrollTo(0, 0);
      return found;
    });
    if (svgText.length) errors.push(`svg text contrast: ${svgText.length} label(s) under WCAG 1.4.3, e.g. ${svgText.slice(0, 3).join(' | ')}`);
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: join(SHOTS, `${name}-${width}-${scheme}.png`), fullPage: true });
    }
  }
  await context.close();
  return { name, path: rel, width, scheme, full, errors: errors.concat(vizFailures), kb: Math.round(bytes / 1024), axe, hrefs, ...before };
}

const LINKS = new Map();
const LINK_FAILURES = [];
// In-page anchors: a link with a fragment needs an element with that id (or name) in the built
// page it points to, or it scrolls nowhere and nothing else would notice.
const FRAGMENTS = new Map();
// Project sites share this origin on GitHub Pages (korczis.github.io/<repo>/) but are other
// repositories' builds: they are checked by scripts/check-live.mjs, not against this build.
const PROJECT_SITES = new Set(
  [...readFileSync(new URL('../data/projects.toml', import.meta.url), 'utf8').matchAll(/^url = "([^"]+)"/gm)]
    .map(([, url]) => new URL(url))
    .filter((url) => url.origin === new URL(BASE).origin && url.pathname.split('/').filter(Boolean).length > 0)
    .map((url) => url.pathname.split('/').filter(Boolean)[0]),
);

// A link's path inside this build, or null when it leaves the build: another origin, or a
// same-origin path whose first segment this build does not have (another repository's GitHub Pages
// site, korczis.github.io/<repo>/, checked by check-live, not against this build).
// A link to the production address (zola.toml base_url) is internal too: the audit serves the site
// under another origin, so such a link once passed here and failed only in production (a Czech
// page linking the English home through a repository's own site, 2026-11-15).
const PRODUCTION = new URL(`${String(CONFIG.base_url).replace(/\/+$/, '')}/`);
function internal(abs) {
  const url = new URL(abs);
  const home = url.origin === new URL(BASE).origin ? new URL(BASE) : url.origin === PRODUCTION.origin ? PRODUCTION : null;
  if (!home) return null;
  const basePath = home.pathname;
  let rel = decodeURIComponent(url.pathname);
  rel = rel.startsWith(basePath) ? rel.slice(basePath.length) : rel.replace(/^\//, '');
  const first = rel.split('/').filter(Boolean)[0];
  if (first && (PROJECT_SITES.has(first) || !existsSync(join(SITE_DIR, first)))) return null;
  return rel;
}
const builtFile = (rel) => join(SITE_DIR, rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel);
const langOfPath = (rel) => (OTHER_LANGS.includes(rel.split('/')[0]) ? rel.split('/')[0] : DEFAULT_LANG);

// A page of another language than the default links to pages of its own language: every internal
// link without a file extension (a page, not an asset, llms*.txt, a schema, an OG image, the
// sitemap or a well-known URI) stays under /<lang>/, except the language switch itself (hreflang).
function languageFinding(fromRel, raw, abs, hreflang) {
  const lang = langOfPath(fromRel);
  if (lang === DEFAULT_LANG || hreflang) return null;
  const rel = internal(abs);
  if (rel === null) return null;
  if (/\.[a-z0-9]+$/i.test(rel.split('/').pop()) && !rel.endsWith('.html')) return null;
  // A well-known URI (RFC 8615: the API catalogue) is a machine resource with no language.
  if (rel.startsWith('.well-known/')) return null;
  return rel.split('/')[0] === lang ? null : `/${fromRel}: link ${raw} leaves /${lang}/`;
}

function collect(result) {
  for (const [raw, abs, hreflang] of result.hrefs) {
    const rel = internal(abs);
    if (rel === null) continue;
    if (rel !== rel.toLowerCase()) LINK_FAILURES.push(`/${result.path}: upper case in link ${raw}`);
    const wrongLanguage = languageFinding(result.path, raw, abs, hreflang);
    if (wrongLanguage && !LINK_FAILURES.includes(wrongLanguage)) LINK_FAILURES.push(wrongLanguage);
    const url = new URL(abs);
    const fragment = url.hash.length > 1 ? decodeURIComponent(url.hash.slice(1)) : '';
    url.hash = '';
    url.search = '';
    if (!LINKS.has(url.href)) LINKS.set(url.href, `/${result.path}`);
    if (fragment && !FRAGMENTS.has(`${url.href}#${fragment}`)) FRAGMENTS.set(`${url.href}#${fragment}`, { href: url.href, fragment, from: `/${result.path}` });
  }
}

function checkLinks() {
  for (const [href, from] of LINKS) {
    const rel = internal(href);
    if (rel !== null && !existsSync(builtFile(rel))) LINK_FAILURES.push(`404 ${href} (linked from ${from})`);
  }
  const ids = new Map();
  for (const { href, fragment, from } of FRAGMENTS.values()) {
    const file = builtFile(internal(href));
    if (!existsSync(file)) continue;
    if (!ids.has(file)) {
      const html = readFileSync(file, 'utf8');
      ids.set(file, new Set([...html.matchAll(/\s(?:id|name)="([^"]+)"/g)].map((m) => m[1])));
    }
    if (!ids.get(file).has(fragment)) LINK_FAILURES.push(`no #${fragment} in ${href} (linked from ${from})`);
  }
  return LINKS.size;
}

// The Pro shell's mobile drawer, driven like a person would: open, focus inside, a link inside is
// on top (not under the backdrop), Escape closes and focus returns to the toggle; at desktop width
// the sidebar is visible and not aria-hidden.
async function checkDrawer(browser) {
  const findings = [];
  const context = await browser.newContext({ viewport: { width: 375, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const state = () => page.evaluate(() => {
    const s = document.getElementById('sidebar');
    return { inert: s.hasAttribute('inert'), hidden: s.getAttribute('aria-hidden'), left: Math.round(s.getBoundingClientRect().left),
      expanded: document.getElementById('toggleSidebarMobile').getAttribute('aria-expanded'), focusInside: s.contains(document.activeElement) };
  });
  let st = await state();
  if (!st.inert || st.left >= 0) findings.push(`closed drawer must be inert and off-screen (inert=${st.inert}, left=${st.left})`);
  await page.click('#toggleSidebarMobile');
  await page.waitForTimeout(400);
  st = await state();
  if (st.inert || st.left !== 0 || st.expanded !== 'true' || !st.focusInside) findings.push(`open drawer: ${JSON.stringify(st)}`);
  const onTop = await page.evaluate(() => {
    const link = document.querySelector('#sidebar a[href*="/projects/"]');
    const r = link.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return link.contains(hit);
  });
  if (!onTop) findings.push('a link in the open drawer is covered (backdrop above the sidebar)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  st = await state();
  if (!st.inert || st.expanded !== 'false') findings.push(`Escape did not close the drawer: ${JSON.stringify(st)}`);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);
  st = await state();
  if (st.inert || st.hidden === 'true' || st.left !== 0) findings.push(`desktop sidebar must be visible and exposed: ${JSON.stringify(st)}`);
  await context.close();
  return findings;
}

// The Pro shell's desktop collapse, driven like a person would at 1440 px: the toggle narrows the
// sidebar to its icons and the content follows, labels leave the eye but not the accessibility
// tree, hover and keyboard focus widen it again, the choice survives a reload, the toggle's
// aria-expanded and label follow, and nothing overflows.
async function checkCollapse(browser) {
  const findings = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const away = async () => { await page.mouse.move(900, 600); await page.evaluate(() => document.activeElement?.blur?.()); await page.waitForTimeout(250); };
  const state = () => page.evaluate(() => {
    const s = document.getElementById('sidebar');
    const t = document.getElementById('toggleSidebar');
    const label = s.querySelector('[data-sidebar-label]');
    const links = [...s.querySelectorAll('a[href]')];
    return {
      width: Math.round(s.getBoundingClientRect().width),
      margin: Math.round(parseFloat(getComputedStyle(document.getElementById('main-content')).marginLeft)),
      expanded: t?.getAttribute('aria-expanded'), label: t?.getAttribute('aria-label'),
      labelExpand: t?.dataset.labelExpand, labelCollapse: t?.dataset.labelCollapse,
      labelWidth: Math.round(label?.getBoundingClientRect().width ?? -1),
      unnamed: links.filter((a) => !(a.getAttribute('aria-label') || a.innerText.trim())).length,
      overflow: document.scrollingElement.scrollWidth > window.innerWidth,
    };
  });
  await away();
  let st = await state();
  if (st.expanded === undefined || st.expanded === null) { await context.close(); return ['no #toggleSidebar in the navbar']; }
  if (st.width !== 256 || st.margin !== 256 || st.expanded !== 'true' || st.label !== st.labelCollapse) findings.push(`expanded at first: ${JSON.stringify(st)}`);
  await page.click('#toggleSidebar');
  await away();
  st = await state();
  if (st.width !== 64 || st.margin !== 64 || st.expanded !== 'false' || st.label !== st.labelExpand) findings.push(`collapsed: ${JSON.stringify(st)}`);
  if (st.labelWidth > 1) findings.push(`collapsed, a label is still visible (${st.labelWidth} px wide)`);
  if (st.unnamed || st.overflow) findings.push(`collapsed: ${st.unnamed} unnamed link(s), overflow=${st.overflow}`);
  await page.hover('#sidebar a[href]');
  await page.waitForTimeout(250);
  st = await state();
  if (st.width !== 256 || st.margin !== 64 || st.labelWidth <= 1) findings.push(`hovered, the collapsed sidebar must widen over the content: ${JSON.stringify(st)}`);
  await away();
  await page.focus('#sidebar a[href]');
  await page.waitForTimeout(250);
  st = await state();
  if (st.width !== 256) findings.push(`focused, the collapsed sidebar must widen: ${JSON.stringify(st)}`);
  await away();
  await page.reload({ waitUntil: 'networkidle' });
  await away();
  st = await state();
  if (st.width !== 64 || st.expanded !== 'false') findings.push(`after a reload the collapse must hold: ${JSON.stringify(st)}`);
  await page.click('#toggleSidebar');
  await away();
  await page.reload({ waitUntil: 'networkidle' });
  await away();
  st = await state();
  if (st.width !== 256 || st.margin !== 256 || st.expanded !== 'true') findings.push(`expanded again and reloaded: ${JSON.stringify(st)}`);
  await context.close();
  return findings;
}

// The catalogue's detail drawer: Details opens it with focus on its close button and the project
// in the address; Escape closes it, makes it inert again and returns focus to the trigger; the
// table view filters with the cards.
async function checkDetail(browser) {
  const findings = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${BASE}projects/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const trigger = page.locator('[data-card] button:has-text("Details")').first();
  await trigger.click();
  await page.waitForTimeout(400);
  let st = await page.evaluate(() => {
    const d = document.getElementById('project-drawer');
    return { inert: d.hasAttribute('inert'), right: Math.round(d.getBoundingClientRect().right), title: document.getElementById('project-drawer-title')?.textContent,
      focus: d.contains(document.activeElement), query: window.location.search };
  });
  if (st.inert || st.right !== 1280 || !st.title || !st.focus || !st.query.includes('project=')) findings.push(`detail drawer did not open properly: ${JSON.stringify(st)}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  st = await page.evaluate(() => ({ inert: document.getElementById('project-drawer').hasAttribute('inert'),
    focusBack: document.activeElement?.textContent?.includes('Details'), query: window.location.search }));
  if (!st.inert || !st.focusBack || st.query.includes('project=')) findings.push(`detail drawer did not close properly: ${JSON.stringify(st)}`);
  await page.click('#view-table-tab');
  await page.fill('#project-search', 'rust');
  await page.waitForTimeout(400);
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-row]')].filter((r) => !r.hidden).length);
  const cards = await page.evaluate(() => [...document.querySelectorAll('[data-card]')].filter((c) => !c.hidden).length);
  if (rows !== cards || rows === 0) findings.push(`table view does not follow the filter: ${rows} rows, ${cards} cards`);
  await context.close();
  return findings;
}

// The command palette: Ctrl+K from any page opens it with focus in the combobox, typing filters,
// Enter on the first result opens that project's detail in the catalogue; Escape restores focus.
async function checkPalette(browser) {
  const findings = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${BASE}stack/`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(200);
  let st = await page.evaluate(() => ({ focus: document.activeElement?.id, visible: !!document.getElementById('palette-input')?.offsetParent }));
  if (st.focus !== 'palette-input' || !st.visible) findings.push(`Ctrl+K did not open the palette: ${JSON.stringify(st)}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  st = await page.evaluate(() => ({ visible: !!document.getElementById('palette-input')?.offsetParent }));
  if (st.visible) findings.push('Escape did not close the palette');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('oscilla');
  await page.waitForTimeout(200);
  const first = await page.evaluate(() => document.querySelector('#palette-option-0')?.textContent?.replace(/\s+/g, ' ').trim());
  if (!first?.includes('Oscilla')) findings.push(`first result for "oscilla" is ${first}`);
  // Enter opens the first result, whichever page that is (the work page or the catalogue detail);
  // the destination must then show Oscilla as its heading or open detail.
  await Promise.all([page.waitForURL(/oscilla/i, { timeout: 15000 }), page.keyboard.press('Enter')]);
  await page.waitForTimeout(800);
  const shown = await page.evaluate(() => {
    const drawer = document.getElementById('project-drawer');
    if (drawer && !drawer.hasAttribute('inert')) return document.getElementById('project-drawer-title')?.textContent;
    return document.querySelector('h1')?.textContent?.trim();
  });
  if (shown !== 'Oscilla') findings.push(`Enter did not open Oscilla (shown: ${shown})`);
  await context.close();
  return findings;
}

// Every visual has a keyboard twin (rule project.viz-component-layer), on every page of PAGES that
// has a visual: its "show as a list" opens from the keyboard, fills with real links, Tab reaches the
// first of them, and every link resolves (V4: the addresses a visual builds in JS are checked here,
// against the built files, and stay in the page's language).
async function checkLists(browser) {
  const findings = [];
  let pages = 0;
  let links = 0;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  for (const [, rel] of PAGES) {
    await page.goto(`${BASE}${rel}`, { waitUntil: 'networkidle' });
    const boxes = await page.locator('[data-viz]:not([aria-hidden="true"])').count();
    if (!boxes) continue;
    pages += 1;
    const count = await page.locator('details[data-viz-list]').count();
    if (count < boxes) findings.push(`/${rel}: ${boxes} visual(s) but ${count} list twin(s)`);
    for (let i = 0; i < count; i += 1) {
      const details = page.locator('details[data-viz-list]').nth(i);
      // The visual is the list's previous sibling, or inside it when the layer framed it.
      const box = details.locator('xpath=preceding-sibling::*[1]/descendant-or-self::*[@data-viz][1]');
      await box.scrollIntoViewIfNeeded();
      await page.waitForFunction((el) => ['ready', 'error'].includes(el.dataset.vizState), await box.elementHandle(), { timeout: 15000 }).catch(() => {});
      const kind = await box.getAttribute('data-viz');
      await details.locator('summary').focus();
      await page.keyboard.press('Enter');
      // The list fills on the toggle event, which fires after the keypress task: wait for a link.
      await details.locator('ul a[href]').first().waitFor({ timeout: 3000 }).catch(() => {});
      const hrefs = await details.locator('ul a').evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.href, a.hreflang]));
      if (!hrefs.length) { findings.push(`/${rel}: the ${kind} list opened empty`); continue; }
      await page.keyboard.press('Tab');
      const focused = await page.evaluate((el) => el.contains(document.activeElement) && document.activeElement.tagName === 'A', await details.elementHandle());
      if (!focused) findings.push(`/${rel}: Tab from the ${kind} list summary did not reach its first link`);
      for (const [raw, abs, hreflang] of hrefs) {
        links += 1;
        if (!raw || raw === '#' || /^(?:null|undefined)$|\/(?:null|undefined)(?:\/|$)/.test(raw)) { findings.push(`/${rel}: the ${kind} list has a link without an address (${raw})`); continue; }
        const target = internal(abs);
        if (target !== null && !existsSync(builtFile(target))) findings.push(`/${rel}: the ${kind} list links ${raw}, which the build does not have`);
        const wrongLanguage = languageFinding(rel, raw, abs, hreflang);
        if (wrongLanguage) findings.push(`${wrongLanguage} (the ${kind} list)`);
      }
    }
  }
  if (!pages) findings.push('no page of PAGES has a visual: the list check would pass vacuously');
  await context.close();
  return { findings, pages, links };
}

// Every visual that is not static is maximizable and a simulator (rule project.viz-ergonomics),
// driven as a person would, on every page of PAGES that has one:
//  - Maximize covers the viewport, the visual redraws to the new box, ?viz=<id> is in the address,
//    and Escape restores it and returns focus to the button;
//  - the deep link ?viz=<id> opens it maximized;
//  - it declares at least one parameter, and every parameter round-trips: set it, the address
//    carries it, reload that address, the control holds the value.
async function checkFrames(browser) {
  const findings = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (e) => findings.push(`page error: ${e.message}`));
  let visuals = 0;
  for (const [, rel] of PAGES) {
    await page.goto(`${BASE}${rel}`, { waitUntil: 'networkidle' });
    const ids = await page.$$eval('[data-viz-frame]', (els) => els.map((e) => e.dataset.vizFrame));
    const statics = await page.$$eval('[data-viz]', (els) => els.filter((b) => !b.closest('[data-viz-frame]') && !b.matches('[aria-hidden="true"]')).map((b) => b.dataset.viz));
    for (const kind of statics) findings.push(`/${rel}: visual ${kind} has no frame and is not aria-hidden (declare it static with a reason, or let it be maximized)`);
    for (const id of ids) {
      visuals += 1;
      const where = `/${rel} ${id}`;
      const frame = page.locator(`[data-viz-frame="${id}"]`);
      const box = frame.locator(':scope > [data-viz]');
      await box.scrollIntoViewIfNeeded();
      await page.waitForFunction((el) => ['ready', 'error'].includes(el.dataset.vizState), await box.elementHandle(), { timeout: 15000 }).catch(() => {});
      if ((await box.getAttribute('data-viz-state')) !== 'ready') { findings.push(`${where}: not ready (${await box.getAttribute('data-viz-state')})`); continue; }
      const surface = () => box.evaluate((b) => {
        const r = b.getBoundingClientRect();
        const drawn = [...b.querySelectorAll('canvas, svg')].map((c) => c.getBoundingClientRect()).sort((x, y) => y.width * y.height - x.width * x.height)[0];
        return { w: r.width, h: r.height, dw: drawn?.width ?? 0, dh: drawn?.height ?? 0 };
      });
      const small = await surface();
      const maxButton = frame.locator('[data-viz-tool="max"]');
      await maxButton.click();
      await page.waitForTimeout(700);
      const vp = page.viewportSize();
      const rect = await frame.evaluate((f) => f.getBoundingClientRect().toJSON());
      if (rect.width < vp.width * 0.98 || rect.height < vp.height * 0.98) findings.push(`${where}: maximized frame is ${Math.round(rect.width)}x${Math.round(rect.height)}, not the viewport`);
      const big = await surface();
      if (big.h <= small.h * 1.2) findings.push(`${where}: the box did not grow when maximized (${Math.round(small.h)} -> ${Math.round(big.h)} px high)`);
      if (big.dw < big.w * 0.8 || big.dh < big.h * 0.8) findings.push(`${where}: the visual did not redraw to the maximized box (draws ${Math.round(big.dw)}x${Math.round(big.dh)} in ${Math.round(big.w)}x${Math.round(big.h)})`);
      await page.waitForTimeout(250);
      if (new URL(page.url()).searchParams.get('viz') !== id) findings.push(`${where}: maximized, but the address does not say ?viz=${id}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      if (await frame.evaluate((f) => f.classList.contains('is-max'))) findings.push(`${where}: Escape did not restore it`);
      if (!(await maxButton.evaluate((b) => b === document.activeElement))) findings.push(`${where}: focus did not return to the maximize button`);
      // Parameters: at least one, each round-tripping through the address.
      const keys = await frame.locator('.viz-panel [data-viz-control], .viz-bar [data-viz-control]').evaluateAll((els) => els.map((e) => e.dataset.vizControl));
      if (!keys.length) findings.push(`${where}: declares no simulation parameter (handle.controls())`);
      const panelButton = frame.locator('[data-viz-tool="sliders"]');
      if (await panelButton.count()) await panelButton.click();
      const set = await frame.evaluate((f) => {
        const out = {};
        for (const row of f.querySelectorAll('.viz-panel [data-viz-control]')) {
          const input = row.querySelector('input, select');
          if (!input) continue;
          if (input.type === 'range') input.value = input.max === input.value ? input.min : input.max;
          else if (input.type === 'checkbox') input.checked = !input.checked;
          else if (input.tagName === 'SELECT') {
            if (input.options.length < 2) continue;
            input.selectedIndex = input.selectedIndex === input.options.length - 1 ? 0 : input.options.length - 1;
          }
          input.dispatchEvent(new Event(input.type === 'range' ? 'input' : 'change', { bubbles: true }));
          out[row.dataset.vizControl] = input.type === 'checkbox' ? String(input.checked) : input.value;
        }
        return out;
      });
      await page.waitForTimeout(400);
      const address = page.url();
      for (const key of Object.keys(set)) if (!new URL(address).searchParams.has(`${id}.${key}`)) findings.push(`${where}: parameter ${key} changed, but the address does not carry ${id}.${key}`);
      if (Object.keys(set).length) {
        await page.goto(address, { waitUntil: 'networkidle' });
        const again = page.locator(`[data-viz-frame="${id}"]`);
        await again.scrollIntoViewIfNeeded();
        await page.waitForFunction((el) => ['ready', 'error'].includes(el.dataset.vizState), await again.locator(':scope > [data-viz]').elementHandle(), { timeout: 15000 }).catch(() => {});
        const held = await again.evaluate((f) => Object.fromEntries([...f.querySelectorAll('.viz-panel [data-viz-control]')].map((row) => {
          const input = row.querySelector('input, select');
          return [row.dataset.vizControl, input ? (input.type === 'checkbox' ? String(input.checked) : input.value) : null];
        })));
        for (const [key, value] of Object.entries(set)) if (held[key] !== value) findings.push(`${where}: parameter ${key}=${value} did not survive a reload of its address (holds ${held[key]})`);
      }
      // Play (a toolbar parameter) round-trips too: toggle it, reload its address, the state holds.
      const play = frame.locator('.viz-bar [data-viz-control]');
      if (await play.count()) {
        await page.goto(`${BASE}${rel}`, { waitUntil: 'networkidle' });
        const again = page.locator(`[data-viz-frame="${id}"]`);
        await again.scrollIntoViewIfNeeded();
        await page.waitForFunction((el) => ['ready', 'error'].includes(el.dataset.vizState), await again.locator(':scope > [data-viz]').elementHandle(), { timeout: 15000 }).catch(() => {});
        const button = again.locator('.viz-bar [data-viz-control]').first();
        const before = await button.getAttribute('aria-pressed');
        await button.click();
        await page.waitForTimeout(400);
        const toggled = page.url();
        const key = `${id}.${await button.getAttribute('data-viz-control')}`;
        if (!new URL(toggled).searchParams.has(key)) findings.push(`${where}: play toggled, but the address does not carry ${key}`);
        await page.goto(toggled, { waitUntil: 'networkidle' });
        await page.locator(`[data-viz-frame="${id}"]`).scrollIntoViewIfNeeded();
        await page.waitForTimeout(600);
        const after = await page.locator(`[data-viz-frame="${id}"] .viz-bar [data-viz-control]`).first().getAttribute('aria-pressed');
        if (after === before) findings.push(`${where}: play=${before === 'true' ? 'off' : 'on'} did not survive a reload of its address`);
      }
      // The deep link opens it maximized, as a modal: the sidebar stays inert after the page has
      // loaded (the drawer's own sync must not undo it), and Escape restores everything.
      await page.goto(`${BASE}${rel}?viz=${encodeURIComponent(id)}`, { waitUntil: 'load' });
      await page.waitForTimeout(800);
      const deep = page.locator(`[data-viz-frame="${id}"]`);
      if (!(await deep.evaluate((f) => f.classList.contains('is-max')))) findings.push(`${where}: ?viz=${id} did not open it maximized`);
      const sidebarInert = () => page.evaluate(() => { const s = document.getElementById('sidebar'); return s ? s.inert : null; });
      if ((await sidebarInert()) === false) findings.push(`${where}: opened by ?viz=, the sidebar behind the dialog is not inert`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      if (await deep.evaluate((f) => f.classList.contains('is-max'))) findings.push(`${where}: Escape did not restore the deep-linked visual`);
      if ((await sidebarInert()) === true) findings.push(`${where}: restored at desktop width, the sidebar stays inert`);
      await page.goto(`${BASE}${rel}`, { waitUntil: 'networkidle' });
    }
  }
  if (!visuals) findings.push('no framed visual on any page: the gate would pass vacuously');
  await context.close();
  return { findings, visuals };
}

// The home's first viewport, as a hiring manager sees it in ten seconds (rule project.hire-surfaces,
// under project.ui-quality-gate): while data/cv.toml [hire] available is true, at 375x667 and
// 1440x900 in both themes and in every language, the h1 and a link to the language's /hire/ are
// inside the first viewport, the topbar's Hire me button meets the 24x24 px target size (WCAG 2.2
// 2.5.8), and the proof band comes first: #majordomus-title precedes the first visual after the hero.
// Rule project.landing-contract adds: a mailto: link and the rate ([data-rate], the cv.toml rate)
// are in the first viewport too, and a probe of /?role=<slug> (the first role, and the last, which
// must move) finds the badge visible, #role-<slug> the first role card on screen, the canonical
// unchanged and the text of <main>, minus the badge, the default text (no cloaking).
const FIRST_VIEWPORTS = [[375, 667], [1440, 900]];
const slugify = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
async function checkRoleProbe(browser, lang, rel, cv) {
  const findings = [];
  const slugs = (cv.hire?.roles ?? []).map((r) => slugify(r.split(':')[0]));
  if (!slugs.length) return findings;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const snapshot = () => page.evaluate(() => {
    const badge = document.querySelector('[data-role-badge]');
    // The text of <main> without the badge and without what a live component writes (x-text: the
    // live release, its date), which may differ between two loads whatever the address says.
    const copy = document.querySelector('main')?.cloneNode(true);
    copy?.querySelectorAll('[data-role-badge], template, script').forEach((el) => el.remove());
    copy?.querySelectorAll('[x-text]').forEach((el) => { el.textContent = ''; });
    const b = badge?.getBoundingClientRect();
    const cards = [...document.querySelectorAll('#roles [id^="role-"]')].map((el) => [el.id, el.getBoundingClientRect()])
      .sort((x, y) => x[1].top - y[1].top || x[1].left - y[1].left);
    return {
      badge: Boolean(b && b.width > 0 && b.height > 0 && b.top >= 0 && b.bottom <= window.innerHeight),
      first: cards[0]?.[0] ?? null,
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
      text: (copy?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    };
  });
  await page.goto(BASE + rel, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(300);
  const plain = await snapshot();
  for (const slug of [...new Set([slugs[0], slugs[slugs.length - 1]])]) {
    await page.goto(`${BASE}${rel}?role=${slug}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(300);
    const r = await snapshot();
    const where = `/${rel}?role=${slug}`;
    if (!r.badge) findings.push(`${where}: the role badge is not visible`);
    if (r.first !== `role-${slug}`) findings.push(`${where}: the first role card is #${r.first}, not #role-${slug}`);
    if (r.canonical !== plain.canonical) findings.push(`${where}: the canonical is ${r.canonical}, not ${plain.canonical}`);
    if (r.text !== plain.text) findings.push(`${where}: <main> says something the default page does not (cloaking)`);
  }
  await context.close();
  return findings;
}
// WCAG 2.2 SC 2.4.11 (focus not obscured) for hash navigation: a deep link to a #terms-* row, a
// #faq-* question or a chapter lands with its target below the fixed #topbar and inside the
// viewport, at both first viewports. And the #faq contract (templates/partials/hire-faq.html):
// under md an accordion whose first answer is open and the others closed, a click opens one and
// sets aria-expanded; from md up every answer is shown and every trigger says aria-expanded true.
const HASH_TARGETS = ['terms-start', 'terms-rate', 'faq-available', 'track', 'skills', 'contact'];
async function checkHashAndFaq(browser, lang, rel) {
  const findings = [];
  for (const [width, height] of FIRST_VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    for (const id of HASH_TARGETS) {
      await page.goto(`${BASE}${rel}#${id}`, { waitUntil: 'networkidle', timeout: 90000 });
      await page.waitForTimeout(300);
      const r = await page.evaluate((target) => {
        const el = document.getElementById(target);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        const bar = document.getElementById('topbar')?.getBoundingClientRect();
        return { top: Math.round(b.top), bar: Math.round(bar ? bar.bottom : 0), inView: b.top < window.innerHeight && b.bottom > 0 };
      }, id);
      const where = `/${rel}#${id} ${width}x${height}`;
      if (r === null) continue; // a row cv.toml does not state is not rendered; check-landing owns presence
      if (r.top < r.bar) findings.push(`${where}: the target's top (${r.top} px) is under the fixed topbar (${r.bar} px), WCAG 2.4.11`);
      if (!r.inView) findings.push(`${where}: the target is outside the viewport after the hash navigation`);
    }
    await page.goto(BASE + rel, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(300);
    const state = () => page.evaluate(() => [...document.querySelectorAll('#faq [data-accordion-target]')].map((btn) => {
      const body = document.querySelector(btn.getAttribute('data-accordion-target'));
      return { expanded: btn.getAttribute('aria-expanded'), shown: Boolean(body && body.getBoundingClientRect().height > 0) };
    }));
    const where = `/${rel}#faq ${width}x${height}`;
    const before = await state();
    if (!before.length) { await context.close(); continue; }
    if (width < 768) {
      if (!before[0].shown || before[0].expanded !== 'true') findings.push(`${where}: the first question is not open`);
      if (before.slice(1).some((x) => x.shown || x.expanded !== 'false')) findings.push(`${where}: a question other than the first is open on load`);
      if (before.length > 1) {
        await page.locator('#faq [data-accordion-target]').nth(1).click();
        const after = await state();
        if (!after[1].shown || after[1].expanded !== 'true') findings.push(`${where}: a click does not open the second question (aria-expanded ${after[1].expanded})`);
        if (after[0].shown || after[0].expanded !== 'false') findings.push(`${where}: opening the second question leaves the first open (collapse)`);
      }
    } else if (before.some((x) => !x.shown || x.expanded !== 'true')) {
      findings.push(`${where}: from md up every answer is shown with aria-expanded true`);
    }
    await context.close();
  }
  return findings;
}
async function checkFirstViewport(browser) {
  const findings = [];
  const cv = parse(readFileSync(join(ROOT, 'data/cv.toml'), 'utf8'));
  if (cv.hire?.available !== true) return { findings, runs: 0 };
  let runs = 0;
  for (const lang of LANGS) {
    const rel = lang === DEFAULT_LANG ? '' : `${lang}/`;
    for (const [width, height] of FIRST_VIEWPORTS) {
      for (const scheme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, reducedMotion: 'reduce' });
        const page = await context.newPage();
        await page.goto(BASE + rel, { waitUntil: 'networkidle', timeout: 90000 });
        await page.waitForTimeout(300);
        const where = `/${rel} ${width}x${height} ${scheme}`;
        const r = await page.evaluate(([prefix, basePath, rateText]) => {
          const inside = (el) => {
            if (!el) return false;
            const b = el.getBoundingClientRect();
            const st = getComputedStyle(el);
            return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && b.top >= 0 && b.left >= 0
              && b.bottom <= window.innerHeight && b.right <= window.innerWidth;
          };
          // The language switch (hreflang) leads to the other language's twin, never to hiring.
          const links = [...document.querySelectorAll('a[href]')].filter((a) => {
            const url = new URL(a.href);
            return !a.hasAttribute('hreflang') && url.origin === window.location.origin && url.pathname === `${basePath}${prefix}hire/`;
          });
          const button = document.querySelector('#topbar [data-hire-topbar] a');
          const box = button?.getBoundingClientRect();
          const hero = document.querySelector('section[aria-labelledby="hero-title"]');
          const firstViz = [...document.querySelectorAll('[data-viz]')].find((v) => !hero?.contains(v));
          const title = document.getElementById('majordomus-title');
          const rate = document.querySelector('[data-rate]');
          return {
            h1: inside(document.querySelector('h1')),
            hire: links.some(inside),
            mail: [...document.querySelectorAll('main a[href^="mailto:"]')].some(inside),
            rate: !rateText || Boolean(rate && inside(rate) && rate.textContent.includes(rateText)),
            button: box ? [Math.round(box.width), Math.round(box.height), inside(button)] : null,
            order: Boolean(title && firstViz && (title.compareDocumentPosition(firstViz) & Node.DOCUMENT_POSITION_FOLLOWING)),
            noViz: !firstViz,
          };
        }, [rel, new URL(BASE).pathname, cv.hire.rate_from === undefined ? '' : `${cv.hire.rate_currency} ${cv.hire.rate_from}`]);
        if (!r.h1) findings.push(`${where}: the h1 is not inside the first viewport`);
        if (!r.mail) findings.push(`${where}: no mailto: link is inside the first viewport`);
        if (!r.rate) findings.push(`${where}: the rate ([data-rate]) is not inside the first viewport`);
        if (!r.hire) findings.push(`${where}: no link to /${rel}hire/ is inside the first viewport`);
        if (!r.button) findings.push(`${where}: the topbar has no Hire me button ([data-hire-topbar] a)`);
        else if (r.button[0] < 24 || r.button[1] < 24 || !r.button[2]) findings.push(`${where}: the topbar's Hire me is ${r.button[0]}x${r.button[1]} px${r.button[2] ? '' : ', outside the viewport'} (needs 24x24, WCAG 2.5.8)`);
        if (!r.order && !r.noViz) findings.push(`${where}: #majordomus-title does not precede the first visual after the hero (proof first)`);
        if (SHOTS) {
          mkdirSync(SHOTS, { recursive: true });
          await page.screenshot({ path: join(SHOTS, `home-first-viewport-${lang}-${width}x${height}-${scheme}.png`) });
        }
        runs += 1;
        await context.close();
      }
    }
    findings.push(...await checkRoleProbe(browser, lang, rel, cv));
    findings.push(...await checkHashAndFaq(browser, lang, rel));
  }
  return { findings, runs };
}

const results = [];
let failed = 0;
let pageFailures = 0;
if (DERIVED.findings.length) {
  failed += 1;
  console.log('FAIL pages: the derived pages do not cover every template and language');
  for (const f of DERIVED.findings) console.log(`     ${f}`);
} else {
  console.log(`ok   pages: ${PAGES.length} pages, one per template and language (${LANGS.join(', ')}), derived from ${SITE_DIR}/sitemap.xml`);
}
const browser = await chromium.launch();
try {
  if (!ONLY || ONLY.test('home-first-viewport')) {
    const { findings: first, runs } = await checkFirstViewport(browser).catch((error) => ({ findings: [`threw: ${error.message.split('\n')[0]}`], runs: 0 }));
    if (first.length) {
      failed += 1;
      console.log('FAIL home first viewport (hiring first)');
      for (const f of first) console.log(`     ${f}`);
    } else {
      console.log(runs ? `ok   home first viewport: h1, a /hire/ link, a mailto:, the rate and a 24x24 Hire me in view in ${runs} runs; proof precedes the visuals; ?role= reorders and labels, never cloaks; hash targets clear the topbar (2.4.11); #faq is an accordion under md`
        : 'ok   home first viewport: not available for hire (data/cv.toml), nothing to show');
    }
  }
  if (!ONLY || ONLY.test('palette')) {
    const palette = await checkPalette(browser).catch((error) => [`threw: ${error.message.split('\n')[0]}`]);
    if (palette.length) {
      failed += 1;
      console.log('FAIL command palette');
      for (const f of palette) console.log(`     ${f}`);
    } else {
      console.log('ok   palette: Ctrl+K opens with focus, Escape closes, search ranks, Enter opens the project');
    }
  }
  if (!ONLY || ONLY.test('lists')) {
    const { findings: lists, pages, links } = await checkLists(browser).catch((error) => ({ findings: [`threw: ${error.message.split('\n')[0]}`], pages: 0, links: 0 }));
    if (lists.length) {
      failed += 1;
      console.log('FAIL visual list twins');
      for (const f of lists) console.log(`     ${f}`);
    } else {
      console.log(`ok   lists: every visual on ${pages} pages opens as a list from the keyboard; ${links} links resolve in the page's language`);
    }
  }
  if (!ONLY || ONLY.test('frames')) {
    const { findings: frames, visuals } = await checkFrames(browser).catch((error) => ({ findings: [`threw: ${error.message.split('\n')[0]}`], visuals: 0 }));
    if (frames.length) {
      failed += 1;
      console.log('FAIL maximizable simulators');
      for (const f of frames) console.log(`     ${f}`);
    } else {
      console.log(`ok   frames: ${visuals} visuals maximize to the viewport, redraw, restore with Escape, deep-link, and round-trip every parameter`);
    }
  }
  if (!ONLY || ONLY.test('detail')) {
    const detail = await checkDetail(browser).catch((error) => [`threw: ${error.message.split('\n')[0]}`]);
    if (detail.length) {
      failed += 1;
      console.log('FAIL detail drawer and table view (/projects/)');
      for (const f of detail) console.log(`     ${f}`);
    } else {
      console.log('ok   detail: Details opens with focus and address, Escape closes and returns focus, table follows filter');
    }
  }
  if (!ONLY || ONLY.test('drawer')) {
    const drawer = await checkDrawer(browser).catch((error) => [`threw: ${error.message.split('\n')[0]}`]);
    if (drawer.length) {
      failed += 1;
      console.log('FAIL drawer (375 px, then 1280 px)');
      for (const f of drawer) console.log(`     ${f}`);
    } else {
      console.log('ok   drawer: opens, focus inside, links on top, Escape closes, desktop exposed');
    }
  }
  if (!ONLY || ONLY.test('collapse')) {
    const collapse = await checkCollapse(browser).catch((error) => [`threw: ${error.message.split('\n')[0]}`]);
    if (collapse.length) {
      failed += 1;
      console.log('FAIL sidebar collapse (1440 px)');
      for (const f of collapse) console.log(`     ${f}`);
    } else {
      console.log('ok   collapse: icons only, labels named, hover and focus widen, held across reloads, toggle state follows');
    }
  }
  for (const [name, rel] of PAGES.filter(([n]) => !ONLY || ONLY.test(n))) {
    const runs = FULL_RUNS.map(([w, s]) => [w, s, true]).concat(LAYOUT_WIDTHS.map((w) => [w, 'light', false]));
    for (const [width, scheme, full] of runs) {
      const r = await measure(browser, name, rel, width, scheme, full);
      collect(r);
      delete r.hrefs;
      results.push(r);
      const findings = r.axe
        .map((v) => `axe ${v.id} (${v.impact}) x${v.nodes}: ${v.targets.join(' | ')}`)
        .concat(r.errors)
        .concat(r.overflow > 0 ? [`horizontal overflow ${r.overflow} px`] : [])
        .concat(r.cls > CLS_LIMIT ? [`CLS ${r.cls} > ${CLS_LIMIT}: ${r.shifts.join(' | ')}`] : []);
      const label = `/${rel} (${name}, ${width}/${scheme}${full ? '' : ', layout only'}) cls=${r.cls} ${r.kb} kB`;
      if (findings.length) {
        failed += 1;
        pageFailures += 1;
        console.log(`FAIL ${label}`);
        for (const f of findings) console.log(`     ${f}`);
      } else {
        console.log(`ok   ${label}`);
      }
    }
  }
} finally {
  await browser.close();
}

const checked = checkLinks();
for (const f of LINK_FAILURES) console.log(`FAIL link ${f}`);
console.log(`links: ${checked} internal addresses and ${FRAGMENTS.size} in-page anchors checked, ${LINK_FAILURES.length} findings`);
if (LINK_FAILURES.length) failed += 1;
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
console.log(`audit: ${results.length - pageFailures}/${results.length} page runs without a finding, `
  + `${failed - pageFailures ? `${failed - pageFailures} other check(s) failed` : 'every other check passed'}`);
process.exit(failed ? 1 : 0);
