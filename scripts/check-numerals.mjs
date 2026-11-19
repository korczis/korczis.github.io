#!/usr/bin/env node
// Number agreement over the built site (rule project.numerals-agree): a count written in running text
// agrees with the word after it, in every language. Data change every day, so "{n} pages" reads well
// at 7 and wrong at 1; a text with a count either picks its plural form (key__one, key__few,
// key__other) or is phrased so no form depends on the number ("Pages that build on it: {n}").
//
// What it refuses, in the visible text of every page (scripts, styles, code and attributes left out):
//   en  1 followed by a plural noun ("1 pages", "1 commits");
//   cs  1 followed by a genitive or locative plural ("1 měsíců", "v 1 commitech", "1 živých");
//       2-4 followed by a genitive plural ("3 repozitářů") unless a preposition governs the case
//       ("z 3 repozitářů", "od 2 lidí").
// A count that is a bucket floor ("2+"), a decimal, part of a date, a version or a larger number is
// not a count of the next word and is skipped.
//
// usage: npm run build && node scripts/check-numerals.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT } from './lib/derive.mjs';
import { cliArgs } from './lib/cli.mjs';

cliArgs();

const SITE = process.env.SITE_DIR || join(ROOT, 'public');

const decode = (s) => s.replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// A link, list item, cell or button ends its phrase: a count in one never counts the next one's word
// (a tag cloud's "Arduino 1 | astronomers 1").
const visible = (html) => decode(html
  .replace(/<(script|style|code|pre|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<\/(a|li|td|th|tr|button|option|dd|dt)>/gi, ' ¶ ')
  .replace(/<[^>]+>/g, ' '))
  .replace(/[\s  ]+/g, ' ');

// English words ending in s that are not plural nouns after "1".
const EN_NOT_PLURAL = new Set(['is', 'was', 'has', 'this', 'its', 'his', 'plus', 'us', 'yes', 'as', 'thus',
  'across', 'versus', 'less', 'process', 'access', 'analysis', 'status', 'focus', 'bus', 'gis', 'css',
  'os', 'aws', 'dns', 'https', 'js', 'ms', 'ux', 'basis', 'kubernetes', 'redis', 'ops', 'devops', 'jobs']);
// Czech prepositions that govern the genitive (or another case) of what follows the count.
const CS_GOVERN = new Set(['z', 'ze', 'od', 'do', 'u', 'bez', 'kromě', 'během', 'podle', 'místo', 'okolo',
  'kolem', 'vedle', 'pro', 'za', 'na', 'o', 'po', 'při', 'v', 've', 's', 'se', 'k', 'ke', 'mezi', 'nad', 'pod',
  'před', 'přes', 'proti', 'než', 'až', 'nejméně', 'nejvýše', 'aspoň', 'alespoň', 'celkem',
  'součástí', 'počet', 'počtu']); // and nouns that govern the genitive ("součástí 3 repozitářů")
const CS_GEN_PL = /^[a-záčďéěíňóřšťúůýž]+(ů|ých|ích)$/u; // genitive plural of nouns and adjectives
const CS_LOC_PL = /^[a-záčďéěíňóřšťúůýž]+(ech|ích|ách|ých)$/u; // locative plural

const COUNT = /(?<![\p{L}\p{N}.,:/+\-–])(\d+)(?![\p{N}.,:/+%\-–]\p{N}|\+|%|\.\d)(?= ([\p{L}]+))/gu;

function scan(text, lang) {
  const out = [];
  for (const m of text.matchAll(COUNT)) {
    const n = Number(m[1]);
    const word = m[2];
    const before = text.slice(Math.max(0, m.index - 24), m.index).trim().split(' ').pop()?.toLowerCase() ?? '';
    const at = text.slice(Math.max(0, m.index - 30), m.index + m[0].length + word.length + 30).trim();
    if (lang === 'cs') {
      const w = word.toLowerCase();
      if (word !== w) continue; // a capitalised word starts a new phrase or a caption
      if (n === 1 && (CS_GEN_PL.test(w) || CS_LOC_PL.test(w))) out.push(at);
      else if (n >= 2 && n <= 4 && CS_GEN_PL.test(w) && !w.endsWith('ích') && !CS_GOVERN.has(before)) out.push(at);
    } else if (n === 1 && /^[a-z]{3,}s$/.test(word) && !EN_NOT_PLURAL.has(word) && !/(ss|us|is)$/.test(word)) {
      out.push(at);
    }
  }
  return out;
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []);

const findings = new Map();
for (const file of walk(SITE)) {
  const html = readFileSync(file, 'utf8');
  const lang = /<html[^>]*\blang="([a-z]+)/.exec(html)?.[1] ?? 'en';
  for (const at of scan(visible(html), lang)) {
    const key = `${lang}: ${at}`;
    if (!findings.has(key)) findings.set(key, []);
    findings.get(key).push(relative(SITE, file));
  }
}

if (findings.size) {
  for (const [at, files] of findings) {
    console.error(`numerals: "${at}" (${files.length} page(s), e.g. ${files[0]})`);
  }
  console.error(`numerals: ${findings.size} count(s) disagree with the word after them; pick the key's plural form ` +
    '(key__one, key__few, key__other) or phrase it as "Label: {n}" (rule project.numerals-agree)');
  process.exit(1);
}
console.log('numerals: every count agrees with its word');
