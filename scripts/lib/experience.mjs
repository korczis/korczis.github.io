// The experience section as a library, shared by scripts/mine-experience.mjs (which writes
// data/experience.json) and scripts/check-experience.mjs (which checks it): the public rules
// (data/experience-rules.toml), keyword inference, scale buckets and the JSON Schema subset the
// committed file is validated against. Nothing here knows a private name.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'smol-toml';

export const RULES_FILE = 'data/experience-rules.toml';
export const DATA_FILE = 'data/experience.json';
export const SCHEMA_FILE = 'static/schemas/experience.schema.json';
export const SCHEMA_ID = 'korczis-hub-experience/v1';

export function loadRules(root) {
  return parse(readFileSync(join(root, RULES_FILE), 'utf8'));
}

// Lower case, no diacritics, words only: "Prověrka-ÚBO_2026" -> ["proverka", "ubo", "2026"].
// camelCase splits too, so a path segment such as "riskScore" reads as two words.
export function words(text) {
  return String(text ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// A keyword is one or more words; a trailing * on its last word matches any word it starts.
export function compileKeyword(keyword) {
  const prefix = keyword.endsWith('*');
  const parts = words(prefix ? keyword.slice(0, -1) : keyword);
  return { parts, prefix };
}

function matchesAt(tokens, i, { parts, prefix }) {
  for (let k = 0; k < parts.length; k += 1) {
    const token = tokens[i + k];
    if (token === undefined) return false;
    const last = k === parts.length - 1;
    if ((last && prefix) ? !token.startsWith(parts[k]) : token !== parts[k]) return false;
  }
  return true;
}

export function matches(tokens, compiled) {
  for (let i = 0; i < tokens.length; i += 1) for (const kw of compiled) if (matchesAt(tokens, i, kw)) return true;
  return false;
}

export function compileCapabilities(rules) {
  return Object.entries(rules.capabilities ?? {}).map(([key, cap]) => ({ key, keywords: (cap.keywords ?? []).map(compileKeyword) }));
}

// Text channels -> per capability: how many items of each channel matched, and the score.
// channels: { commits: [text], headings: [text], paths: [text] }. Only counts leave this function.
// A capability is kept when its score reaches the threshold and `relative` times the best score.
export function infer(rules, channels, threshold = rules.inference.threshold, relative = rules.inference.relative ?? 0) {
  const weights = rules.inference.weights;
  const tokenized = Object.fromEntries(Object.entries(channels).map(([c, items]) => [c, items.map(words)]));
  const found = [];
  for (const { key, keywords } of compileCapabilities(rules)) {
    const evidence = {};
    let score = 0;
    let total = 0;
    for (const [channel, items] of Object.entries(tokenized)) {
      const n = items.reduce((sum, tokens) => sum + (matches(tokens, keywords) ? 1 : 0), 0);
      evidence[channel] = n;
      total += n;
      score += (weights[channel] ?? 0) * Math.log2(1 + n);
    }
    if (score >= threshold && total >= rules.inference.min_items) found.push({ key, score: Math.round(score * 10) / 10, evidence });
  }
  const best = Math.max(0, ...found.map((f) => f.score));
  return found.filter((f) => f.score >= relative * best).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

// A measured count published as the largest bucket floor it reaches (0 stays 0).
export function bucket(rules, n) {
  let floor = 0;
  for (const b of rules.scale.buckets) if (n >= b) floor = b;
  return floor;
}

// The subset of JSON Schema the experience schema uses: type (also a list), required,
// properties with additionalProperties false or a schema, items, enum, pattern, minimum, $ref.
export function validate(schema, value, report, at = '$', defs = schema.$defs ?? {}) {
  if (schema.$ref) return validate(defs[schema.$ref.split('/').pop()], value, report, at, defs);
  const types = [].concat(schema.type ?? []);
  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
  const actual = typeOf(value);
  if (types.length && !types.some((t) => t === actual || (t === 'number' && actual === 'integer'))) {
    return report(`${at} is ${actual}, not ${types.join(' or ')}`);
  }
  if (schema.enum && !schema.enum.includes(value)) report(`${at} is not one of the allowed values`);
  if (actual === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) report(`${at} does not match ${schema.pattern}`);
    if (schema.minLength && value.length < schema.minLength) report(`${at} is too short`);
  }
  if ((actual === 'integer' || actual === 'number') && schema.minimum !== undefined && value < schema.minimum) report(`${at} is below ${schema.minimum}`);
  if (actual === 'array' && schema.items) value.forEach((item, i) => validate(schema.items, item, report, `${at}[${i}]`, defs));
  if (actual === 'object') {
    for (const key of schema.required ?? []) if (!(key in value)) report(`${at} has no ${key}`);
    for (const [key, item] of Object.entries(value)) {
      const sub = schema.properties?.[key] ?? (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : null);
      if (schema.propertyNames?.pattern && !new RegExp(schema.propertyNames.pattern).test(key)) report(`${at}.${key}: key does not match ${schema.propertyNames.pattern}`);
      if (sub) validate(sub, item, report, `${at}.${key}`, defs);
      else if (schema.additionalProperties === false) report(`${at}.${key} is not in the schema`);
    }
  }
}

// Months between two "YYYY-MM" (inclusive): 2026-04..2026-06 -> 3.
export function monthSpan(from, to) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}
