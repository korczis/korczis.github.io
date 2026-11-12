#!/usr/bin/env node
// Derives the Open Graph images (1200x630) from each page's front matter: [extra] og_title (or the
// title), og_description (or the description), and the og_image path. The SVG is deterministic (a seeded glyph field
// like the hero's); the PNG is rendered from it with rsvg-convert (librsvg).
//
// usage: node scripts/build-og.mjs           write static/og/<name>.svg and .png
//        node scripts/build-og.mjs --check   exit 1 if an SVG is stale or a PNG is missing,
//                                            not 1200x630, or older than its SVG source text
// CI runs --check only (no renderer needed); regenerate locally after changing front matter.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const W = 1200;
const H = 630;
const COLOURS = { page: '#111827', ink: '#f9fafb', muted: '#9ca3af', primary: '#3b82f6', soft: '#1e3a8a', glyph: '#60a5fa' };

function frontMatter(file) {
  const text = readFileSync(file, 'utf8');
  const match = text.match(/^\+\+\+\n([\s\S]*?)\n\+\+\+/);
  return match ? parse(match[1]) : null;
}

function contentFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    return e.isDirectory() ? contentFiles(path) : e.name.endsWith('.md') ? [path] : [];
  });
}

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

function svg({ title, description, path }) {
  const seed = [...path].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
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
<text x="156" y="99" font-size="24" font-weight="700" fill="${COLOURS.ink}">Tomas Korcak</text>
<text x="156" y="124" font-size="20" font-family="JetBrains Mono, Menlo, monospace" fill="${COLOURS.muted}">korczis.github.io${escape(path === 'home' ? '' : `/${path}/`)}</text>
${titleText}
${descText}
<rect x="80" y="540" width="292" height="44" rx="22" fill="${COLOURS.soft}"/>
<text x="104" y="569" font-size="20" font-weight="600" fill="#bfdbfe">Supervised by Majordomus</text>
</g>
</svg>
`;
}

function pngSize(file) {
  const header = readFileSync(file).subarray(0, 24);
  return [header.readUInt32BE(16), header.readUInt32BE(20)];
}

const findings = [];
mkdirSync(join(ROOT, 'static/og'), { recursive: true });
for (const file of contentFiles(join(ROOT, 'content'))) {
  const fm = frontMatter(file);
  if (!fm?.extra?.og_image) continue;
  const png = join(ROOT, 'static', fm.extra.og_image);
  const name = fm.extra.og_image.replace(/^og\//, '').replace(/\.png$/, '');
  const source = join(ROOT, 'static/og', `${name}.svg`);
  const text = svg({
    title: fm.extra.og_title || fm.title,
    description: fm.extra.og_description || fm.description,
    path: name,
  });
  if (CHECK) {
    if (!existsSync(source) || readFileSync(source, 'utf8') !== text) findings.push(`${source.slice(ROOT.length + 1)} is stale`);
    if (!existsSync(png)) findings.push(`${fm.extra.og_image} is missing`);
    else {
      const [w, h] = pngSize(png);
      if (w !== W || h !== H) findings.push(`${fm.extra.og_image} is ${w}x${h}, not ${W}x${H}`);
      if (existsSync(source) && statSync(png).mtimeMs + 1000 < statSync(source).mtimeMs && !process.env.CI) {
        findings.push(`${fm.extra.og_image} is older than its SVG`);
      }
    }
    continue;
  }
  // Re-render only when the SVG changed (or the PNG is missing): renderers on other machines use
  // other fonts, and an unchanged image must not churn in a diff.
  if (existsSync(source) && existsSync(png) && readFileSync(source, 'utf8') === text) continue;
  writeFileSync(source, text);
  execFileSync('rsvg-convert', ['--width', String(W), '--height', String(H), '--output', png, source]);
  console.log(`og: ${fm.extra.og_image} from ${file.slice(ROOT.length + 1)}`);
}

if (CHECK) {
  if (findings.length) {
    for (const f of findings) console.error(`✗ ${f}; run node scripts/build-og.mjs`);
    process.exit(1);
  }
  console.log('og images are current');
}
