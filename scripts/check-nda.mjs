#!/usr/bin/env node
// NDA gate: no name under a confidentiality agreement may reach this public repository or the
// site built from it. The names are never in the repository (scripts/lib/nda.mjs says where they
// come from); this gate scans, case-insensitively and as whole words:
//   - every tracked text file, and every untracked file git would add (binaries and the vendor
//     bundles are skipped);
//   - the built site, when given a directory (--site public);
//   - every commit message and the branch name in origin/master..HEAD.
// It prints only "<file>:<line> matches a denylisted name", never the name.
//
// With no denylist it skips locally (exit 0), but fails in CI (CI set), because there a missing
// list means the secret was never set. In CI a missing base ref fails too: a shallow checkout
// once passed with "history not scanned" (the validate job now fetches the full history).
//
// The CI secret must hold the whole list this gate composes locally (the denylist file plus every
// client and source folder of the engagement map): once it held only the file, 4 names of 14.
// --secret writes that list to a pipe, never to a terminal and never in CI, for the owner to set:
//   node scripts/check-nda.mjs --secret | gh secret set NDA_DENYLIST -R korczis/korczis.github.io
//
// usage: node scripts/check-nda.mjs [--site <dir>] [--root <repository>] [--base <ref>]
//        node scripts/check-nda.mjs --secret | <consumer>
//        exit 0 clean or skipped, 1 on a match or a missing list or base in CI, 2 on bad arguments
//        or --secret to a terminal or in CI
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileDenylist, loadDenylist, matchingLines } from './lib/nda.mjs';
import { cliArgs } from './lib/cli.mjs';

const flags = cliArgs({ '--site': '<dir>', '--root': '<repository>', '--base': '<ref>', '--secret': true });
const opts = {
  root: flags.root ? resolve(flags.root) : join(dirname(fileURLToPath(import.meta.url)), '..'),
  site: flags.site ? resolve(flags.site) : null,
  base: flags.base || 'origin/master',
};

const { names, sources } = loadDenylist();
const SECRET_COMMAND = 'node scripts/check-nda.mjs --secret | gh secret set NDA_DENYLIST -R korczis/korczis.github.io';
if (flags.secret) {
  // The names leave this process only into a pipe the owner wrote: never a screen, a log or CI.
  if (process.env.CI) { console.error('✗ nda: --secret never runs in CI'); process.exit(2); }
  if (process.stdout.isTTY) { console.error(`✗ nda: --secret writes the names only into a pipe: ${SECRET_COMMAND}`); process.exit(2); }
  if (!names.length) { console.error('✗ nda: no denylist here to write'); process.exit(1); }
  process.stdout.write(`${names.join('\n')}\n`);
  console.error(`nda: ${names.length} names from ${sources.join(' and ')} written to the pipe`);
  process.exit(0);
}
if (!names.length) {
  if (process.env.CI) {
    console.error('✗ nda: no denylist in CI. The owner sets it once with:');
    console.error(`  ${SECRET_COMMAND}`);
    process.exit(1);
  }
  console.log('nda: skipped: no denylist (NDA_DENYLIST, ~/.config/korczis-hub/nda-denylist.txt or the engagement map)');
  process.exit(0);
}
const test = compileDenylist(names);
const findings = [];
const git = (...a) => spawnSync('git', ['-C', opts.root, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });

// Vendor bundles are third-party code built from node_modules; a minified bundle is one long line.
const SKIP = /(^|\/)(node_modules|vendor)\/|\.min\.(js|css)$|\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|zip|gz)$/i;
function scanFile(path, label) {
  if (SKIP.test(label)) return 0;
  let buffer;
  try {
    if (statSync(path).size > 8 << 20) return 0;
    buffer = readFileSync(path);
  } catch {
    return 0;
  }
  if (buffer.subarray(0, 8000).includes(0)) return 0; // binary
  for (const line of matchingLines(test, buffer.toString('utf8'))) findings.push(`${label}:${line} matches a denylisted name`);
  return 1;
}

// 1. The repository's files: tracked, plus untracked ones git would add.
let files = 0;
const listed = git('ls-files', '-z', '--cached', '--others', '--exclude-standard');
if (listed.status !== 0) {
  console.error(`✗ nda: ${opts.root} is not a git repository`);
  process.exit(2);
}
for (const rel of new Set(listed.stdout.split('\0').filter(Boolean))) files += scanFile(join(opts.root, rel), rel);

// 2. The built site.
let pages = 0;
if (opts.site) {
  if (!existsSync(opts.site)) {
    console.error(`✗ nda: no site at ${opts.site}`);
    process.exit(2);
  }
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  for (const file of walk(opts.site)) pages += scanFile(file, `site/${relative(opts.site, file)}`);
}

// 3. What this branch adds to history: its commit messages and its name.
let commits = 0;
const hasBase = git('rev-parse', '--verify', '--quiet', opts.base).status === 0;
if (!hasBase && process.env.CI) {
  console.error(`✗ nda: no ${opts.base} in CI, so the branch's commit messages would go unscanned; check out with fetch-depth: 0`);
  process.exit(1);
}
if (hasBase) {
  const log = git('log', '--format=%h%x1f%B%x1e', `${opts.base}..HEAD`).stdout;
  for (const entry of log.split('\x1e').map((e) => e.trim()).filter(Boolean)) {
    const [hash, body = ''] = entry.split('\x1f');
    commits += 1;
    for (const line of matchingLines(test, body)) findings.push(`commit ${hash}:${line} matches a denylisted name`);
  }
}
const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
if (test(branch)) findings.push('the branch name matches a denylisted name');

if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  console.error(`nda: ${findings.length} match(es), FAIL`);
  process.exit(1);
}
const range = hasBase ? `${commits} commit(s) since ${opts.base}` : `no ${opts.base}, history not scanned`;
console.log(`nda: ${names.length} names from ${sources.join(' and ')}; ${files} files${opts.site ? `, ${pages} site files` : ''}, ${range}, PASS`);
