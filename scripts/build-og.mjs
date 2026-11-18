#!/usr/bin/env node
// Derives the Open Graph images (1200x630) from each page's front matter: [extra] og_title (or the
// title), og_description (or the description), and the og_image path. The card is an SVG drawn
// deterministically here (a seeded glyph field like the hero's); the PNG is rendered from it with
// rsvg-convert (librsvg), and only the PNG is kept: no page references the SVG.
//
// data/og.json records, per image, the hash of the SVG each PNG was rendered from and of the PNG
// itself, so a PNG left behind by a changed card is caught anywhere (file times are not, in CI).
//
// Size: every page has a card (one per original repository and language, hundreds of them), so
// the PNG is quantised to a palette of ENCODER.colours with pngquant (no dithering, strongest
// compression setting): about a fifth of the size of the full-colour render and indistinguishable
// on a flat dark card. Each PNG stays within og_image x-max-bytes of the front-matter schema
// (--check fails over it and reports the total). The encoder's settings are recorded in data/og.json, and a
// change to them renders every card again. Its version is recorded per card: pngquant is
// deterministic for one version, but Ubuntu's 2.x (the scheduled refresh) and Homebrew's 3.x write
// different bytes, as librsvg does with other fonts. So a card is rendered again only when its SVG
// changed, and data/og.json says which version wrote the PNG it holds; a version alone never
// re-renders a card (two machines would otherwise rewrite every card in turn).
//
// Every tool used here is a package the scheduled refresh installs (RENDERERS: --check fails when
// .github/workflows/refresh.yml does not install one, since --check itself renders nothing).
//
// The card shows the page's real address (its path from content/, as Zola publishes it) and a pill
// with a measured fact of the page: on a work page the repository's state (supervised by
// Majordomus, active within its period, or archive with its years) from data/recent.json; on every
// other page the site's own supervision. Its texts are i18n (i18n/derive.toml og_pill_*).
//
// usage: node scripts/build-og.mjs           write static/og/<name>.png, remove orphans
//        node scripts/build-og.mjs --check   exit 1 if a PNG is missing, stale against its card, not
//                                            of the OG size, over its byte budget, not the recorded
//                                            render, a file of static/og is orphaned, or the refresh
//                                            does not install a renderer
// CI runs --check only (no renderer needed); regenerate locally after changing front matter.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHECK, ROOT, contentPages, identity, isDefault, limits, readJson, report, t } from './lib/derive.mjs';
import { cliArgs } from './lib/cli.mjs';

cliArgs({ '--check': true }, { derived: true });

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
if (CHECK) {
  // The refresh renders the cards a new repository or a moved one needs: it must install each tool.
  const workflow = readFileSync(join(ROOT, '.github/workflows/refresh.yml'), 'utf8');
  const installed = new Set([...workflow.matchAll(/apt-get install ([^\n]+)/g)].flatMap((m) => m[1].split(/\s+/)));
  for (const r of RENDERERS) if (!installed.has(r.apt)) findings.push(`.github/workflows/refresh.yml does not install ${r.apt} (${r.tool}), which renders the cards`);
}
const wanted = new Set();
mkdirSync(DIR, { recursive: true });
let bytes = 0;
for (const page of contentPages()) {
  const { path: file, fm } = page;
  if (!fm?.extra?.og_image) continue;
  const png = join(ROOT, 'static', fm.extra.og_image);
  const name = fm.extra.og_image.replace(/^og\//, '').replace(/\.png$/, '');
  wanted.add(`${name}.png`);
  const text = svg({
    title: fm.extra.og_title || fm.title,
    description: fm.extra.og_description || fm.description,
    path: name,
    address: addressOf(page, fm),
    pill: pillOf(fm, page.lang),
  });
  const record = stored.images[name];
  if (CHECK) {
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
  report(findings, `og images: ${wanted.size} current, rendered from their cards, no orphan; ${mib(bytes)} in all, ` +
    `${Math.round(bytes / wanted.size / 1024)} KiB a card, none over ${Math.round(MAX_BYTES / 1024)} KiB`);
} else {
  manifest.images = Object.fromEntries(Object.entries(manifest.images).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
}
