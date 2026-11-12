#!/usr/bin/env node
// UI gate (rule project.ui-quality-gate). For every page, at 375 and 1440 px in the light and the
// dark theme: axe-core WCAG 2.2 AA violations, console and network errors, horizontal overflow,
// cumulative layout shift, and every visual reaching data-viz-state="ready" once scrolled into
// view. At 320, 768, 1024 and 1920 px: overflow and errors only. Then every internal link the
// pages rendered must resolve to a built file. Any finding exits 1.
//
// usage: BASE_URL=http://127.0.0.1:<port>/ SITE_DIR=<built site> node scripts/audit-ui.mjs
//          [--json <file>] [--shots <dir>] [--only <regexp on the page name>]
// scripts/verify-all.sh builds, serves and calls this; CI does the same. One browser launch.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:1111/').replace(/\/?$/, '/');
const SITE_DIR = process.env.SITE_DIR || 'public';
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const JSON_OUT = opt('--json');
const SHOTS = opt('--shots');
const ONLY = opt('--only') ? new RegExp(opt('--only')) : null;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const FULL_RUNS = [[375, 'light'], [375, 'dark'], [1440, 'light'], [1440, 'dark']];
const LAYOUT_WIDTHS = [320, 768, 1024, 1920];
const CLS_LIMIT = 0.1;
const PAGES = [
  ['home', ''],
  ['projects', 'projects/'],
  ['stack', 'stack/'],
  ['404', '404.html'],
];

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
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`);
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
        () => [...document.querySelectorAll('[data-viz]')].every((b) => b.dataset.vizState === 'ready'),
        null,
        { timeout: 20000 },
      );
    } catch {
      vizFailures = await page.evaluate(() => [...document.querySelectorAll('[data-viz]')]
        .filter((b) => b.dataset.vizState !== 'ready')
        .map((b) => `visual ${b.dataset.viz} is ${b.dataset.vizState || 'not mounted'}`));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
  }

  const hrefs = full
    ? await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => [a.getAttribute('href'), a.href]))
    : [];
  let axe = [];
  if (full) {
    await page.addScriptTag({ content: AXE });
    axe = await page.evaluate(async (tags) => {
      const result = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } });
      return result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      }));
    }, TAGS);
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

function collect(result) {
  const origin = new URL(BASE).origin;
  for (const [raw, abs] of result.hrefs) {
    if (!abs.startsWith(origin)) continue;
    const url = new URL(abs);
    const path = decodeURIComponent(url.pathname);
    if (path !== path.toLowerCase()) LINK_FAILURES.push(`/${result.path}: upper case in link ${raw}`);
    url.hash = '';
    url.search = '';
    if (!LINKS.has(url.href)) LINKS.set(url.href, `/${result.path}`);
  }
}

function checkLinks() {
  const basePath = new URL(BASE).pathname;
  for (const [href, from] of LINKS) {
    let rel = decodeURIComponent(new URL(href).pathname);
    rel = rel.startsWith(basePath) ? rel.slice(basePath.length) : rel.replace(/^\//, '');
    const file = join(SITE_DIR, rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel);
    if (!existsSync(file)) LINK_FAILURES.push(`404 ${href} (linked from ${from})`);
  }
  return LINKS.size;
}

const browser = await chromium.launch();
const results = [];
let failed = 0;
try {
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
console.log(`links: ${checked} internal addresses checked, ${LINK_FAILURES.length} findings`);
if (LINK_FAILURES.length) failed += 1;
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
console.log(`audit: ${results.length - failed}/${results.length} runs without a finding`);
process.exit(failed ? 1 : 0);
