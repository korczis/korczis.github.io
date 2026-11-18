#!/usr/bin/env node
// Derives the Open Graph images (1200x630) from each page's front matter: [extra] og_title (or the
// title), og_description (or the description), and the og_image path. The SVG is deterministic (a seeded glyph field
// like the hero's); the PNG is rendered from it with rsvg-convert (librsvg).
//
// data/og.json records, per image, the hash of the SVG each PNG was rendered from and of the PNG
// itself, so a PNG left behind by a changed SVG is caught anywhere (file times are not, in CI).
//
// Size: every page has a card (one per original repository and language, hundreds of them), so
// the PNG is quantised to a palette of ENCODER.colours with pngquant (no dithering, strongest
// compression setting): deterministic, about a quarter of the size of the full-colour render and
// indistinguishable on a flat dark card. The encoder is recorded in data/og.json; a change to it
// renders every card again.
//
// The card shows the page's real address (its path from content/, as Zola publishes it) and a pill
// with a measured fact of the page: on a work page the repository's state (supervised by
// Majordomus, active within its period, or archive with its years) from data/recent.json; on every
// other page the site's own supervision. Its texts are i18n (i18n/derive.toml og_pill_*).
//
// usage: node scripts/build-og.mjs           write static/og/<name>.svg and .png, remove orphans
//        node scripts/build-og.mjs --check   exit 1 if an SVG is stale, a PNG is missing, not of the
//                                            OG size, not rendered from its SVG, or an image is orphaned
// CI runs --check only (no renderer needed); regenerate locally after changing front matter.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHECK, ROOT, contentPages, identity, isDefault, limits, readJson, report, t } from './lib/derive.mjs';
import { cliArgs } from './lib/cli.mjs';

cliArgs({ '--check': true }, { derived: true });

const { width: W, height: H } = limits().og;
const me = identity();
const ENCODER = { tool: 'pngquant', colours: 32, args: ['--speed', '1', '--strip', '--nofs'] };
const ENCODER_ID = `${ENCODER.tool} ${ENCODER.colours} ${ENCODER.args.join(' ')}`;
const COLOURS = { page: '#111827', ink: '#f9fafb', muted: '#9ca3af', primary: '#3b82f6', soft: '#1e3a8a', glyph: '#60a5fa' };

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(text, width, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line ? `${line} ${word}` : word).length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[\s,.;:]+\S*$/, '')}…`;
  }
  return lines;
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
    for (let x = 820; x < W + cell; x += cell) {
      const fade = Math.min(1, (x - 820) / 260);
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

// The page's address as Zola publishes it: content/x.md -> /x/, content/x.cs.md -> /cs/x/,
// content/s/_index.md -> /s/, the home -> "" (the host alone).
function addressOf({ rel, lang }, fm) {
  if (fm.path) return `/${fm.path.replace(/^\/|\/$/g, '')}/`;
  const prefix = isDefault(lang) ? '' : `/${lang}`;
  const file = rel.replace(/\.[a-z]{2}\.md$/, '.md');
  if (file === '_index.md') return prefix ? `${prefix}/` : '';
  if (file.endsWith('/_index.md')) return `${prefix}/${file.slice(0, -'_index.md'.length)}`;
  return `${prefix}/${file.replace(/\.md$/, '')}/`;
}

// The pill: a measured fact of the page (see the header).
const recent = readJson('data/recent.json');
const repoOf = new Map(recent.repos.map((r) => [r.name, r]));
function pillOf(fm, lang) {
  const r = fm.extra?.repo ? repoOf.get(fm.extra.repo) : null;
  if (!r) return t('og_pill_site', lang);
  if (r.supervised) return t('og_pill_supervised', lang);
  if (r.period) return t('og_pill_active', lang, { period: r.period });
  const first = Math.min(...[r.created_at, ...r.commits.map((c) => c.at)].filter(Boolean).map((x) => new Date(x).getUTCFullYear()));
  const last = new Date(r.last_commit ?? r.pushed_at).getUTCFullYear();
  return t('og_pill_archive', lang, { years: first < last ? `${first}–${last}` : String(last) });
}

function svg({ title, description, path, address, pill }) {
  const seed = [...path].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const pillWidth = Math.round(48 + pill.length * 11);
  const titleLines = wrap(title, 21, 3);
  const descLines = wrap(description, 46, 3);
  const titleSize = titleLines.length > 2 ? 58 : 66;
  const titleTop = 230;
  const titleText = titleLines
    .map((l, i) => `<text x="80" y="${titleTop + i * (titleSize + 8)}" font-size="${titleSize}" font-weight="800" fill="${COLOURS.ink}">${escape(l)}</text>`)
    .join('');
  const descTop = titleTop + titleLines.length * (titleSize + 8) + 26;
  const descText = descLines
    .map((l, i) => `<text x="80" y="${descTop + i * 36}" font-size="26" fill="${COLOURS.muted}">${escape(l)}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${COLOURS.page}"/>
<g fill="none" stroke="${COLOURS.glyph}" stroke-width="2" stroke-linecap="round">${glyphField(seed)}</g>
<rect x="0" y="0" width="8" height="${H}" fill="${COLOURS.primary}"/>
<g font-family="Inter, Helvetica Neue, Helvetica, Arial, sans-serif">
<rect x="80" y="72" width="56" height="56" rx="12" fill="#1d4ed8"/>
<g fill="none" stroke="#fff" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"><path d="M97.5 86v28M97.5 100l15.7-14M104.5 93.9l12.3 20.1"/></g>
<text x="156" y="99" font-size="24" font-weight="700" fill="${COLOURS.ink}">${escape(me.author)}</text>
<text x="156" y="124" font-size="20" font-family="JetBrains Mono, Menlo, monospace" fill="${COLOURS.muted}">${escape(me.host)}${escape(address)}</text>
${titleText}
${descText}
<rect x="80" y="540" width="${pillWidth}" height="44" rx="22" fill="${COLOURS.soft}"/>
<text x="104" y="569" font-size="20" font-weight="600" fill="#bfdbfe">${escape(pill)}</text>
</g>
</svg>
`;
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
const wanted = new Set();
mkdirSync(DIR, { recursive: true });
for (const page of contentPages()) {
  const { path: file, fm } = page;
  if (!fm?.extra?.og_image) continue;
  const png = join(ROOT, 'static', fm.extra.og_image);
  const name = fm.extra.og_image.replace(/^og\//, '').replace(/\.png$/, '');
  const source = join(DIR, `${name}.svg`);
  wanted.add(`${name}.svg`).add(`${name}.png`);
  const text = svg({
    title: fm.extra.og_title || fm.title,
    description: fm.extra.og_description || fm.description,
    path: name,
    address: addressOf(page, fm),
    pill: pillOf(fm, page.lang),
  });
  const record = stored.images[name];
  if (CHECK) {
    if (!existsSync(source) || readFileSync(source, 'utf8') !== text) findings.push(`${source.slice(ROOT.length + 1)} is stale`);
    if (!existsSync(png)) { findings.push(`${fm.extra.og_image} is missing`); continue; }
    const [w, h] = pngSize(png);
    if (w !== W || h !== H) findings.push(`${fm.extra.og_image} is ${w}x${h}, not ${W}x${H}`);
    if (!record) findings.push(`${fm.extra.og_image} has no record in data/og.json`);
    else if (record.svg !== sha(text)) findings.push(`${fm.extra.og_image} was rendered from another SVG`);
    else if (record.png !== sha(readFileSync(png))) findings.push(`${fm.extra.og_image} is not the PNG data/og.json recorded`);
    continue;
  }
  // Re-render only when the SVG changed (or the PNG is missing or unrecorded as its render):
  // renderers on other machines use other fonts, and an unchanged image must not churn in a diff.
  const same = existsSync(source) && existsSync(png) && readFileSync(source, 'utf8') === text;
  if (!same || reencode || (record && (record.svg !== sha(text) || record.png !== sha(readFileSync(png))))) {
    writeFileSync(source, text);
    execFileSync('rsvg-convert', ['--width', String(W), '--height', String(H), '--output', png, source]);
    execFileSync(ENCODER.tool, [...ENCODER.args, '--force', '--output', png, String(ENCODER.colours), png]);
    console.log(`og: ${fm.extra.og_image} from ${file}`);
  }
  // An unrecorded pair whose SVG is current is adopted as it is (the first run of the record).
  manifest.images[name] = { svg: sha(text), png: sha(readFileSync(png)) };
}

// An image no page names any more: an orphan.
for (const f of readdirSync(DIR).filter((x) => /\.(svg|png)$/.test(x) && !wanted.has(x)).sort()) {
  if (CHECK) findings.push(`static/og/${f} is named by no page`);
  else { unlinkSync(join(DIR, f)); console.log(`og: removed the orphan static/og/${f}`); }
}

if (CHECK) {
  const extra = Object.keys(stored.images).filter((n) => !wanted.has(`${n}.png`));
  for (const n of extra) findings.push(`data/og.json records ${n}, which no page names`);
  report(findings, `og images: ${wanted.size / 2} current, rendered from their SVGs, no orphan`);
} else {
  manifest.images = Object.fromEntries(Object.entries(manifest.images).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
}
