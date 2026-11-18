#!/usr/bin/env node
// Derives the Open Graph images (1200x630) from each page's front matter: [extra] og_title (or the
// title), og_description (or the description), and the og_image path. The card is an SVG drawn
// deterministically here (a seeded glyph field like the hero's); the PNG is rendered from it with
// rsvg-convert (librsvg), which reads the SVG from stdin, and only the PNG is kept: no page
// references the SVG, and its hash in data/og.json is the whole record of it.
//
// What a card shows, and where each piece comes from (rule project.seo-derived):
//   - the author, and under it the page's own address: the host and the permalink Zola gives the
//     page (scripts/lib/derive.mjs permalink()), so a card reads /work/<x>/ or /cs/hire/;
//   - the title and the description, wrapped by measured text width and clipped only between
//     words (the shared clip() of lib/derive.mjs), in the space left above the pills;
//   - the pills, in the card's language from i18n: a measured fact of the page on every card (on a
//     work page the repository's state from data/recent.json: supervised by Majordomus, active
//     within its period, or archive with its years; on every other page the site's own
//     supervision; i18n/derive.toml og_pill_*), and on the cards of the pages that present the
//     owner (front matter schema home, profile, hire) the availability text hero_hire, while
//     data/cv.toml [hire] available is true.
//
// data/og.json records, per image, the hash of the SVG each PNG was rendered from and of the PNG
// itself, so a PNG left behind by a changed card is caught anywhere (file times are not, in CI).
//
// Size: every page has a card (one per original repository and language, hundreds of them), so
// the PNG is quantised to a palette of ENCODER.colours with pngquant (no dithering, strongest
// compression setting): about a fifth of the size of the full-colour render and indistinguishable
// on a flat dark card. Each PNG stays within og_image x-max-bytes of the front-matter schema
// (--check fails over it and reports the total). The encoder's settings are recorded in
// data/og.json, and a change to them renders every card again. Its version is recorded per card:
// pngquant is deterministic for one version, but Ubuntu's 2.x (the scheduled refresh) and
// Homebrew's 3.x write different bytes, as librsvg does with other fonts. So a card is rendered
// again only when its SVG changed, and data/og.json says which version wrote the PNG it holds; a
// version alone never re-renders a card (two machines would otherwise rewrite every card in turn).
//
// Every tool used here is a package the scheduled refresh installs (RENDERERS: --check fails when
// .github/workflows/refresh.yml does not install one, since --check itself renders nothing).
//
// usage: node scripts/build-og.mjs                write static/og/<name>.png, remove orphans
//        node scripts/build-og.mjs --check        exit 1 if a PNG is missing, stale against its card,
//                                                 not of the OG size, over its byte budget, not the
//                                                 recorded render, a file of static/og is orphaned,
//                                                 or the refresh does not install a renderer; if the
//                                                 address drawn on a card is not the page's permalink;
//                                                 if a card of another language than the default
//                                                 carries a text of the default language; if a title
//                                                 or description is clipped inside a word; or if text
//                                                 overlaps the pills
//        node scripts/build-og.mjs --check --site public
//                                                 also: the drawn address is the canonical URL of the built
//                                                 page, and that page's og:image names the card
// CI runs --check only (no renderer needed); regenerate locally after changing front matter.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHECK, PROFILE_SCHEMAS, ROOT, clip, contentPages, cutAtWord, defaultLanguage, identity, isDefault, limits, permalink, readJson,
  readToml, report, t,
} from './lib/derive.mjs';
import { cliArgs } from './lib/cli.mjs';

const opts = cliArgs({ '--check': true, '--site': '<dir>' }, { derived: true });
if (opts.site && !CHECK) {
  process.stderr.write('build-og.mjs: --site is a check of the built site; use it with --check\n');
  process.exit(2);
}

const { width: W, height: H, maxBytes: MAX_BYTES } = limits().og;
const me = identity();
const ENCODER = { tool: 'pngquant', colours: 16, args: ['--speed', '1', '--strip', '--nofs'] };
const ENCODER_ID = `${ENCODER.tool} ${ENCODER.colours} ${ENCODER.args.join(' ')}`;
// The command each step runs, and the Ubuntu package the refresh installs it from.
const RENDERERS = [{ tool: 'rsvg-convert', apt: 'librsvg2-bin' }, { tool: ENCODER.tool, apt: 'pngquant' }];
let encoderVersion = null;
const versionOf = () => {
  try {
    encoderVersion ??= `${ENCODER.tool} ${execFileSync(ENCODER.tool, ['--version'], { encoding: 'utf8' }).trim().split(/\s/)[0]}`;
  } catch (error) {
    throw new Error(`${ENCODER.tool} is needed to encode the Open Graph cards (brew install pngquant, apt-get install pngquant): ${error.message}`);
  }
  return encoderVersion;
};
const hire = readToml('data/cv.toml').hire ?? {};
const COLOURS = {
  page: '#111827', ink: '#f9fafb', muted: '#9ca3af', primary: '#3b82f6', soft: '#1e3a8a', glyph: '#60a5fa', pill: '#bfdbfe',
  open: '#064e3b', openInk: '#a7f3d0',
};

// The layout, in pixels. Text runs from X to TEXT_RIGHT (the glyph field fades in from FIELD_LEFT);
// the pills sit on PILL.top, and no line of text may come closer to them than GAP.
const X = 80;
const FIELD_LEFT = 820;
const TEXT_RIGHT = 800;
const TITLE_TOP = 230;
const TITLE = { large: 66, small: 58, min: 40, lead: 8, maxLines: 3 };
const DESC = { size: 26, line: 36, gap: 26, width: 680, maxLines: 3 };
const PILL = { top: 540, height: 44, pad: 24, gap: 12, size: 20 };
const GAP = 16;
const DESCENT = 0.24; // below the baseline, as a share of the font size

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

// Text width at a font size: the advance widths of Helvetica (per 1000 units of the em), the face
// librsvg falls back to when Inter is not installed, widened for bold and by a margin for Inter,
// which runs a little wider. Accented letters take their base letter's width.
const ADVANCE = {
  ' ': 278, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833,
  n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722,
  O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '.': 278, ',': 278, ':': 278, ';': 278, '!': 278, '?': 556, "'": 191, '"': 355, '(': 333, ')': 333, '-': 333,
  '–': 556, '—': 1000, '·': 278, '…': 1000, '&': 667, '/': 278, '+': 584, '#': 556, '@': 1015, '%': 889,
};
function measure(text, size, weight = 400) {
  const bold = weight >= 700 ? 1.04 : weight >= 600 ? 1.05 : 1;
  let units = 0;
  for (const ch of text.normalize('NFD').replace(/\p{M}/gu, '')) units += ADVANCE[ch] ?? (/\d/.test(ch) ? 556 : 600);
  return (units / 1000) * size * bold * 1.06;
}

// Lines of whole words within a width; when the text needs more than maxLines, the last line is
// clipped between words with the shared clip(). Returns the lines and whether the text was cut.
function wrap(text, { size, weight, width, maxLines }) {
  const fits = (s) => measure(s, size, weight) <= width;
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  let used = 0;
  for (const [i, word] of words.entries()) {
    const next = line ? `${line} ${word}` : word;
    if (fits(next) || !line) {
      line = next;
      used = i + 1;
      continue;
    }
    if (lines.length === maxLines - 1) break;
    lines.push(line);
    line = word;
    used = i + 1;
  }
  if (used < words.length) {
    lines.push(clip([line, ...words.slice(used)].join(' '), width, { measure: (s) => measure(s, size, weight) }));
    return { lines, cut: true };
  }
  if (line) lines.push(line);
  return { lines, cut: false };
}

// The fact a card's badge states, in its language (see the header): the repository's state on a
// work page, the site's own supervision on every other page.
const recent = readJson('data/recent.json');
const repoOf = new Map(recent.repos.map((r) => [r.name, r]));
function factOf(repo, lang) {
  const r = repo ? repoOf.get(repo) : null;
  if (!r) return t('og_pill_site', lang);
  if (r.supervised) return t('og_pill_supervised', lang);
  if (r.period) return t('og_pill_active', lang, { period: r.period });
  const years = [r.created_at, ...r.commits.map((c) => c.at)].filter(Boolean).map((x) => new Date(x).getUTCFullYear());
  const first = Math.min(...years);
  const last = new Date(r.last_commit ?? r.pushed_at).getUTCFullYear();
  return t('og_pill_archive', lang, { years: first < last ? `${first}–${last}` : String(last) });
}

// The pills of a card, in its language: availability first on the owner's pages, then the badge.
const CHROME = { badge: (lang, card) => factOf(card.repo, lang), available: (lang) => t('hero_hire', lang) };
function pills(card, lang = card.lang) {
  const list = [];
  if (hire.available && PROFILE_SCHEMAS.includes(card.schema)) {
    list.push({ key: 'available', text: CHROME.available(lang, card), fill: COLOURS.open, ink: COLOURS.openInk });
  }
  list.push({ key: 'badge', text: CHROME.badge(lang, card), fill: COLOURS.soft, ink: COLOURS.pill });
  let x = X;
  return list.map((p) => {
    const w = Math.ceil(measure(p.text, PILL.size, 600) + 2 * PILL.pad);
    const placed = { ...p, x, w };
    x += w + PILL.gap;
    return placed;
  });
}

// The whole card's geometry, computed once: the SVG draws it and --check asserts it.
function layout(card) {
  const { title, description } = card;
  // A word wider than the text column (a long repository name, a URL) could only be cut inside
  // itself: the title takes the size at which its widest word fits with the ellipsis, down to
  // TITLE.min, so every cut stays between words.
  const column = TEXT_RIGHT - X;
  const widest = Math.max(...title.split(/\s+/).filter(Boolean).map((w) => measure(`${w}…`, 1, 800)));
  const fit = Math.max(TITLE.min, Math.floor(column / widest));
  let titleSize = Math.min(TITLE.large, fit);
  let t1 = wrap(title, { size: titleSize, weight: 800, width: column, maxLines: 2 });
  if (t1.cut || titleSize < TITLE.large) {
    titleSize = Math.min(TITLE.small, fit);
    t1 = wrap(title, { size: titleSize, weight: 800, width: column, maxLines: TITLE.maxLines });
  }
  const titleStep = titleSize + TITLE.lead;
  const descTop = TITLE_TOP + t1.lines.length * titleStep + DESC.gap;
  // As many description lines as fit above the pills, at most DESC.maxLines.
  const room = Math.floor((PILL.top - GAP - DESCENT * DESC.size - descTop) / DESC.line) + 1;
  const maxLines = Math.max(1, Math.min(DESC.maxLines, room));
  const d1 = wrap(description, { size: DESC.size, weight: 400, width: DESC.width, maxLines });
  const descBottom = descTop + (d1.lines.length - 1) * DESC.line + DESCENT * DESC.size;
  return {
    title: { ...t1, size: titleSize, step: titleStep },
    desc: { ...d1, top: descTop, bottom: descBottom },
    pills: pills(card),
  };
}

function svg(card) {
  const { name, lang, address } = card;
  const seed = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const box = layout(card);
  const titleText = box.title.lines
    .map((l, i) => `<text x="${X}" y="${TITLE_TOP + i * box.title.step}" font-size="${box.title.size}" font-weight="800" fill="${COLOURS.ink}">${escape(l)}</text>`)
    .join('');
  const descText = box.desc.lines
    .map((l, i) => `<text x="${X}" y="${box.desc.top + i * DESC.line}" font-size="${DESC.size}" fill="${COLOURS.muted}">${escape(l)}</text>`)
    .join('');
  const pillMarks = box.pills
    .map((p) => `<rect x="${p.x}" y="${PILL.top}" width="${p.w}" height="${PILL.height}" rx="${PILL.height / 2}" fill="${p.fill}"/>`
      + `<text x="${p.x + PILL.pad}" y="${PILL.top + 29}" font-size="${PILL.size}" font-weight="600" fill="${p.ink}">${escape(p.text)}</text>`)
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xml:lang="${lang}">
<rect width="${W}" height="${H}" fill="${COLOURS.page}"/>
<g fill="none" stroke="${COLOURS.glyph}" stroke-width="2" stroke-linecap="round">${glyphField(seed)}</g>
<rect x="0" y="0" width="8" height="${H}" fill="${COLOURS.primary}"/>
<g font-family="Inter, Helvetica Neue, Helvetica, Arial, sans-serif">
<rect x="${X}" y="72" width="56" height="56" rx="12" fill="#1d4ed8"/>
<g fill="none" stroke="#fff" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"><path d="M97.5 86v28M97.5 100l15.7-14M104.5 93.9l12.3 20.1"/></g>
<text x="156" y="99" font-size="24" font-weight="700" fill="${COLOURS.ink}">${escape(me.nameIn(lang))}</text>
<text id="address" x="156" y="124" font-size="20" font-family="JetBrains Mono, Menlo, monospace" fill="${COLOURS.muted}">${escape(address)}</text>
${titleText}
${descText}
${pillMarks}
</g>
</svg>
`;
}

// The hero's glyph alphabet: segments of a 3x3 lattice, chosen by a seeded generator.
function glyphField(seed) {
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const LATTICE = [
    [0, 0, 1, 0], [1, 0, 2, 0], [0, 1, 1, 1], [1, 1, 2, 1], [0, 2, 1, 2], [1, 2, 2, 2],
    [0, 0, 0, 1], [0, 1, 0, 2], [1, 0, 1, 1], [1, 1, 1, 2], [2, 0, 2, 1], [2, 1, 2, 2],
    [0, 0, 1, 1], [1, 1, 2, 2], [2, 0, 1, 1], [1, 1, 0, 2],
  ];
  const cell = 34;
  const unit = cell / 3.2;
  const paths = [];
  for (let y = 0; y < H + cell; y += cell) {
    for (let x = FIELD_LEFT; x < W + cell; x += cell) {
      const fade = Math.min(1, (x - FIELD_LEFT) / 260);
      if (random() > fade * 0.85) continue;
      const strokes = 2 + Math.floor(random() * 3);
      const d = [];
      for (let i = 0; i < strokes; i += 1) {
        const [x1, y1, x2, y2] = LATTICE[Math.floor(random() * LATTICE.length)];
        d.push(`M${(x + x1 * unit).toFixed(1)} ${(y + y1 * unit).toFixed(1)}L${(x + x2 * unit).toFixed(1)} ${(y + y2 * unit).toFixed(1)}`);
      }
      const opacity = (0.18 + random() * 0.5 * fade).toFixed(2);
      paths.push(`<path d="${d.join('')}" opacity="${opacity}"/>`);
    }
  }
  return paths.join('');
}

// The assertions --check makes on a card: its SVG (the one its PNG is recorded as rendered from) draws the page's address, its texts
// were cut only between words, nothing overlaps the pills, and a translation carries none of the
// default language's texts.
function assertCard(card, box, text, rel) {
  const found = [];
  const drawn = unescape(text.match(/<text id="address"[^>]*>([^<]*)</)?.[1] ?? '');
  if (drawn !== card.address) found.push(`${rel}: the card draws ${drawn || 'no address'}, the page is ${card.address}`);
  const shownTitle = box.title.lines.join(' ');
  const shownDesc = box.desc.lines.join(' ');
  if (!cutAtWord(card.title, shownTitle)) found.push(`${rel}: the card's title is cut inside a word ("${shownTitle}")`);
  if (!cutAtWord(card.description, shownDesc)) found.push(`${rel}: the card's description is cut inside a word ("${shownDesc}")`);
  if (box.desc.bottom > PILL.top - GAP) {
    found.push(`${rel}: the description reaches y=${box.desc.bottom.toFixed(0)}, into the pills at ${PILL.top} (gap ${GAP})`);
  }
  const last = box.pills.at(-1);
  if (last && last.x + last.w > W - X) found.push(`${rel}: the pills run to x=${last.x + last.w}, past ${W - X}`);
  if (!isDefault(card.lang)) {
    const own = new Set(Object.values(CHROME).map((f) => f(card.lang, card)));
    const foreign = Object.values(CHROME).map((f) => f(defaultLanguage(), card)).filter((s) => !own.has(s));
    for (const [, s] of text.matchAll(/<text[^>]*>([^<]*)<\/text>/g)) {
      if (foreign.includes(unescape(s))) found.push(`${rel}: a ${card.lang} card carries the ${defaultLanguage()} text "${unescape(s)}"`);
    }
  }
  return found;
}

// --site: the built page of the card has the drawn address as its canonical URL and names the card.
function assertSite(dir, page, card, rel) {
  const file = join(dir, card.path, 'index.html');
  if (!existsSync(file)) return [`${rel}: ${card.path}index.html is not in the build at ${opts.site}`];
  const html = readFileSync(file, 'utf8');
  const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  const tags = [...html.matchAll(/<(?:link|meta)\b[^>]*>/g)].map((m) => m[0]);
  const canonical = tags.filter((x) => attr(x, 'rel') === 'canonical').map((x) => attr(x, 'href'))[0];
  const image = tags.filter((x) => attr(x, 'property') === 'og:image').map((x) => attr(x, 'content'))[0];
  const found = [];
  if (!canonical) found.push(`${rel}: the built page ${card.path} has no canonical URL`);
  else if (canonical.replace(/^https?:\/\//, '') !== card.address) {
    found.push(`${rel}: the card draws ${card.address}, the built page's canonical is ${canonical}`);
  }
  if (!image?.endsWith(`/${page.fm.extra.og_image}`)) {
    found.push(`${rel}: the built page ${card.path} names ${image ?? 'no og:image'}, not ${page.fm.extra.og_image}`);
  }
  return found;
}

function pngSize(file) {
  const header = readFileSync(file).subarray(0, 24);
  return [header.readUInt32BE(16), header.readUInt32BE(20)];
}

const sha = (data) => createHash('sha256').update(data).digest('hex').slice(0, 16);
const DIR = join(ROOT, 'static/og');
const MANIFEST = join(ROOT, 'data/og.json');
const stored = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { images: {} };
const manifest = { schema: 'korczis-hub-og/v1', encoder: ENCODER_ID, images: {} };
// Cards rendered by another encoder are rendered again (and --check reports them).
const reencode = stored.encoder !== ENCODER_ID;
const findings = [];
if (CHECK && reencode) findings.push(`data/og.json records the encoder ${stored.encoder ?? 'none'}, not ${ENCODER_ID}`);
if (CHECK) {
  // The refresh renders the cards a new repository or a moved one needs: it must install each tool.
  const workflow = readFileSync(join(ROOT, '.github/workflows/refresh.yml'), 'utf8');
  const installed = new Set([...workflow.matchAll(/apt-get install ([^\n]+)/g)].flatMap((m) => m[1].split(/\s+/)));
  for (const r of RENDERERS) {
    if (!installed.has(r.apt)) findings.push(`.github/workflows/refresh.yml does not install ${r.apt} (${r.tool}), which renders the cards`);
  }
}
const wanted = new Set();
const site = opts.site ? join(ROOT, opts.site) : null;
if (site && !existsSync(site)) {
  process.stderr.write(`build-og.mjs: no built site at ${opts.site}; run npm run build first\n`);
  process.exit(2);
}
mkdirSync(DIR, { recursive: true });
let bytes = 0;
for (const page of contentPages()) {
  const { path: file, fm } = page;
  if (!fm?.extra?.og_image) continue;
  const png = join(ROOT, 'static', fm.extra.og_image);
  const name = fm.extra.og_image.replace(/^og\//, '').replace(/\.png$/, '');
  wanted.add(`${name}.png`);
  const path = permalink(page);
  const card = {
    title: fm.extra.og_title || fm.title,
    description: fm.extra.og_description || fm.description,
    name,
    schema: fm.extra.schema,
    repo: fm.extra.repo ?? null,
    lang: page.lang,
    path,
    address: `${me.host}${path}`,
  };
  const text = svg(card);
  const record = stored.images[name];
  if (CHECK) {
    findings.push(...assertCard(card, layout(card), text, file));
    if (site) findings.push(...assertSite(site, page, card, file));
    if (!existsSync(png)) { findings.push(`${fm.extra.og_image} is missing`); continue; }
    const [w, h] = pngSize(png);
    if (w !== W || h !== H) findings.push(`${fm.extra.og_image} is ${w}x${h}, not ${W}x${H}`);
    const size = statSync(png).size;
    bytes += size;
    if (size > MAX_BYTES) findings.push(`${fm.extra.og_image} is ${size} bytes, over the ${MAX_BYTES} of the front-matter schema (og_image x-max-bytes)`);
    if (!record) findings.push(`${fm.extra.og_image} has no record in data/og.json`);
    else if (record.svg !== sha(text)) findings.push(`${fm.extra.og_image} is stale: its card (front matter, address or pill) changed since it was rendered`);
    else if (record.png !== sha(readFileSync(png))) findings.push(`${fm.extra.og_image} is not the PNG data/og.json recorded`);
    else if (!record.by) findings.push(`${fm.extra.og_image} has no encoder version recorded in data/og.json`);
    continue;
  }
  // Render only when the card's SVG changed (its hash in data/og.json), the PNG is missing or not
  // the recorded one, or the encoder's settings changed: renderers on other machines use other
  // fonts and encoder versions, and an unchanged card must not churn in a diff. The SVG is never
  // written: rsvg-convert reads it from stdin, and its hash is the whole record of it.
  if (reencode || !record || !existsSync(png) || record.svg !== sha(text) || record.png !== sha(readFileSync(png))) {
    execFileSync('rsvg-convert', ['--width', String(W), '--height', String(H), '--output', png], { input: text });
    const by = versionOf();
    execFileSync(ENCODER.tool, [...ENCODER.args, '--force', '--output', png, String(ENCODER.colours), png]);
    manifest.images[name] = { svg: sha(text), png: sha(readFileSync(png)), by };
    console.log(`og: ${fm.extra.og_image} from ${file}`);
    continue;
  }
  manifest.images[name] = record;
}

// A file no page names any more (an orphan card, or an SVG source of the earlier layout).
for (const f of readdirSync(DIR).filter((x) => !wanted.has(x)).sort()) {
  if (CHECK) findings.push(`static/og/${f} is named by no page`);
  else { unlinkSync(join(DIR, f)); console.log(`og: removed the orphan static/og/${f}`); }
}

if (CHECK) {
  const extra = Object.keys(stored.images).filter((n) => !wanted.has(`${n}.png`));
  for (const n of extra) findings.push(`data/og.json records ${n}, which no page names`);
  const mib = (n) => `${(n / 2 ** 20).toFixed(1)} MiB`;
  report(findings, `og images: ${wanted.size} current, rendered from their cards, no orphan; ${mib(bytes)} in all, `
    + `${Math.round(bytes / wanted.size / 1024)} KiB a card, none over ${Math.round(MAX_BYTES / 1024)} KiB; each draws its page's address`
    + `${site ? ' (the built canonical)' : ''} in its language, clipped between words, clear of the pills`);
} else {
  manifest.images = Object.fromEntries(Object.entries(manifest.images).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
}
