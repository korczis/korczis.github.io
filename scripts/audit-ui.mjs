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
import { cliArgs } from './lib/cli.mjs';

// Flags first: --help or a typo must answer before a browser is looked for.
const opts = cliArgs({ '--json': '<file>', '--shots': '<dir>', '--only': '<regexp>' });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:1111/').replace(/\/?$/, '/');
const SITE_DIR = process.env.SITE_DIR || 'public';
const JSON_OUT = opts.json;
const SHOTS = opts.shots;
const ONLY = opts.only ? new RegExp(opts.only) : null;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const FULL_RUNS = [[375, 'light'], [375, 'dark'], [1440, 'light'], [1440, 'dark']];
const LAYOUT_WIDTHS = [320, 768, 1024, 1920];
const CLS_LIMIT = 0.1;
// The first work page is whichever project was active most recently (derived, never typed).
const firstWork = JSON.parse(readFileSync(new URL('../data/recent.json', import.meta.url), 'utf8')).repos[0]?.name
  ?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const PAGES = [
  ['home', ''],
  ['about', 'about/'],
  ['projects', 'projects/'],
  ['repositories', 'repositories/'],
  ['work', 'work/'],
  ...(firstWork ? [['work-page', `work/${firstWork}/`]] : []),
  ['cs-home', 'cs/'],
  ...(firstWork ? [['cs-work-page', `cs/work/${firstWork}/`]] : []),
  ['category', 'projects/science/'],
  ['stack', 'stack/'],
  ['glossary', 'glossary/'],
  ['term', 'glossary/rust/'],
  ['cs-term', 'cs/glossary/osint/'],
  ['tags', 'tags/'],
  ['tag', 'tags/rust/'],
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
// Project sites share this origin on GitHub Pages (korczis.github.io/<repo>/) but are other
// repositories' builds: they are checked by scripts/check-live.mjs, not against this build.
const PROJECT_SITES = new Set(
  [...readFileSync(new URL('../data/projects.toml', import.meta.url), 'utf8').matchAll(/^url = "([^"]+)"/gm)]
    .map(([, url]) => new URL(url))
    .filter((url) => url.origin === new URL(BASE).origin && url.pathname.split('/').filter(Boolean).length > 0)
    .map((url) => url.pathname.split('/').filter(Boolean)[0]),
);

function collect(result) {
  const origin = new URL(BASE).origin;
  for (const [raw, abs] of result.hrefs) {
    if (!abs.startsWith(origin)) continue;
    const url = new URL(abs);
    const path = decodeURIComponent(url.pathname);
    // A same-origin path whose first segment this build does not have is another repository's
    // GitHub Pages site (korczis.github.io/<repo>/): checked by check-live, not against this build.
    const first = path.split('/').filter(Boolean)[0];
    if (first && (PROJECT_SITES.has(first) || !existsSync(join(SITE_DIR, first)))) continue;
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

// Every visual has a keyboard twin (rule project.viz-component-layer): its "show as a list" opens
// from the keyboard, fills with real links, and Tab reaches the first of them.
async function checkLists(browser) {
  const findings = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  for (const rel of ['', 'glossary/', 'work/', 'tags/']) {
    await page.goto(`${BASE}${rel}`, { waitUntil: 'networkidle' });
    const count = await page.locator('details[data-viz-list]').count();
    if (!count) findings.push(`/${rel}: no list twin`);
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
      const links = await details.locator('ul a[href]').count();
      if (!links) { findings.push(`/${rel}: the ${kind} list opened empty`); continue; }
      await page.keyboard.press('Tab');
      const focused = await page.evaluate((el) => el.contains(document.activeElement) && document.activeElement.tagName === 'A', await details.elementHandle());
      if (!focused) findings.push(`/${rel}: Tab from the ${kind} list summary did not reach its first link`);
    }
  }
  await context.close();
  return findings;
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
      // The deep link opens it maximized.
      await page.goto(`${BASE}${rel}?viz=${encodeURIComponent(id)}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      if (!(await page.locator(`[data-viz-frame="${id}"]`).evaluate((f) => f.classList.contains('is-max')))) findings.push(`${where}: ?viz=${id} did not open it maximized`);
      await page.goto(`${BASE}${rel}`, { waitUntil: 'networkidle' });
    }
  }
  if (!visuals) findings.push('no framed visual on any page: the gate would pass vacuously');
  await context.close();
  return { findings, visuals };
}

const browser = await chromium.launch();
const results = [];
let failed = 0;
try {
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
    const lists = await checkLists(browser).catch((error) => [`threw: ${error.message.split('\n')[0]}`]);
    if (lists.length) {
      failed += 1;
      console.log('FAIL visual list twins');
      for (const f of lists) console.log(`     ${f}`);
    } else {
      console.log('ok   lists: every visual on /, /glossary/, /work/, /tags/ opens as a list of links from the keyboard');
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
