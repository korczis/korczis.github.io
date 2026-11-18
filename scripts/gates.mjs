#!/usr/bin/env node
// The one list of the repository's gates. `npm run check`, `npm run verify` (scripts/verify-all.sh),
// the pre-push hook, CI (.github/workflows/ci.yml) and the six-hourly refresh all run this list,
// so a gate added here runs everywhere and a gate can no longer be missing from one of them (the
// glossary gates once ran locally and never in CI). README's gate table is generated from it.
//
// usage: node scripts/gates.mjs run [--ci] [--keep-going] [--from <id>] [--only <id,...>] [--skip <id,...>]
//          runs the offline gates in order, stops at the first failure, prints each gate's time;
//          --ci skips the gates marked ci: false and says why (the CI validate job and npm run check)
//          --keep-going runs every gate past a failure and fails at the end (CI: one missing secret
//          once hid the verdicts of 26 gates); a gate that needs a failed build is skipped, named
//        node scripts/gates.mjs list [--format text|github|json]   the gates; github: workflow steps
//        node scripts/gates.mjs check     parity: every gate script on disk is in this list, no
//          workflow or script keeps its own list or runs a gate script this list does not know,
//          and CI runs every gate here (ci: false gates name the CI job that runs them, or why not)
//        node scripts/gates.mjs cli       every script answers --help and exits 2 on --bogus
//        node scripts/gates.mjs readme [--check]   writes (or checks) README's generated sections
//        node scripts/gates.mjs deps      node_modules matches package-lock.json
//        node scripts/gates.mjs json --write|--check   writes (or checks) data/gates.json, this list as
//          the site's data: each gate's id, name, rule (and its file) and where it runs; the landing's
//          "How this page is proven" renders it (rule project.landing-contract)
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliArgs, header } from './lib/cli.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Offline gates, in the order they run: cheap and structural first, the build and what reads it
// last. run is argv (no shell); needs names what a gate requires besides node_modules:
//   majordomus        the CLI on PATH (skipped with the reason where it is absent)
//   flowbite-scanner  the owner's Pro scanner, ~/.claude/skills/flowbite-pro/verify.mjs
//   build             the built site in public/: the build gate runs first when it has not yet
// lands names the lane whose script has not merged yet: until the file exists the gate is skipped
// with that reason (and nowhere else); once it exists it runs like any other.
// NDA_DENYLIST (a secret in CI, an owner-level file locally) is read by check-nda.mjs itself.
const FLOWBITE_SCANNER = '~/.claude/skills/flowbite-pro/verify.mjs';

export const GATES = [
  { id: 'deps', name: 'Installed dependencies match package-lock.json', run: ['node', 'scripts/gates.mjs', 'deps'], ci: true },
  { id: 'commits', name: 'Conventional commits on this branch', run: ['scripts/lint-commits.sh', '--branch'], ci: false,
    job: 'commits', why: 'the commits job lints the pushed or pull-request range' },
  { id: 'nda', name: 'No denylisted name in tracked files or commit messages (NDA)', run: ['node', 'scripts/check-nda.mjs'], ci: true },
  { id: 'cli', name: 'Every script answers --help and refuses an unknown flag', run: ['node', 'scripts/gates.mjs', 'cli'], ci: true },
  { id: 'gates', name: 'One gate list: workflows, scripts and hooks run this manifest', run: ['node', 'scripts/gates.mjs', 'check'], ci: true },
  { id: 'readme', name: 'README sections generated from this manifest are current', run: ['node', 'scripts/gates.mjs', 'readme', '--check'], ci: true },
  { id: 'i18n-build', name: 'Translations are generated and complete', run: ['node', 'scripts/build-i18n.mjs', '--check'], ci: true, rule: 'project.i18n-everywhere' },
  { id: 'i18n', name: 'Every text in every language', run: ['node', 'scripts/check-i18n.mjs'], ci: true, rule: 'project.i18n-everywhere' },
  { id: 'front-matter', name: 'Front matter matches its schema', run: ['node', 'scripts/check-front-matter.mjs'], ci: true, rule: 'project.front-matter-contract' },
  { id: 'data', name: 'Catalogue, snapshot and index are well-formed', run: ['node', 'scripts/check-data.mjs'], ci: true, rule: 'project.data-measured' },
  { id: 'index-derived', name: 'The index follows its rules (offline re-derivation)', run: ['node', 'scripts/fetch-index.mjs', '--derive', '--check'], ci: true, rule: 'project.data-measured' },
  { id: 'recent-derived', name: 'recent.json follows the index', run: ['node', 'scripts/fetch-recent.mjs', '--derive', '--check'], ci: true, rule: 'project.data-measured' },
  { id: 'derive-lib', name: 'Inference, authorship and derivation behave on their fixtures', run: ['node', 'scripts/check-derive.mjs'], ci: true, rule: 'project.data-measured' },
  { id: 'experience', name: 'Experience data matches its schema', run: ['node', 'scripts/check-experience.mjs'], ci: true },
  { id: 'dossiers', name: 'Repository dossiers are inferred, sourced, bilingual and NDA-clean', run: ['node', 'scripts/check-dossiers.mjs'], ci: true, rule: 'project.dossiers-inferred' },
  { id: 'categories', name: 'Category pages are current', run: ['node', 'scripts/build-categories.mjs', '--check'], ci: true, rule: 'project.data-measured' },
  { id: 'work', name: 'Work pages are current', run: ['node', 'scripts/build-work.mjs', '--check'], ci: true, rule: 'project.data-measured' },
  { id: 'glossary', name: 'Glossary pages are current', run: ['node', 'scripts/build-glossary.mjs', '--check'], ci: true, rule: 'project.pages-are-articles' },
  { id: 'articles', name: 'Every page is an article with glossary terms; every term is used', run: ['node', 'scripts/check-glossary.mjs'], ci: true, rule: 'project.pages-are-articles' },
  { id: 'llms', name: 'llms.txt is current', run: ['node', 'scripts/build-llms.mjs', '--check'], ci: true, rule: 'project.data-measured' },
  { id: 'resume', name: 'resume.json is derived and valid JSON Resume', run: ['node', 'scripts/build-resume.mjs', '--check'], ci: true, lands: 'W1C', rule: 'project.hire-surfaces' },
  { id: 'og', name: 'Open Graph images are current, within their byte budget, renderable by the refresh', run: ['node', 'scripts/build-og.mjs', '--check'], ci: true, rule: 'project.seo-derived' },
  { id: 'site-json', name: 'site.json is current', run: ['node', 'scripts/build-site-json.mjs', '--check'], ci: true, rule: 'project.front-matter-contract' },
  { id: 'interfaces', name: 'ai.json follows .ai/ and openapi.json the published files', run: ['node', 'scripts/build-interfaces.mjs', '--check'], ci: true, rule: 'project.data-measured' },
  { id: 'viz-layer', name: 'Every visual goes through the component layer and is a maximizable simulator', run: ['node', 'scripts/check-viz-layer.mjs'], ci: true, rule: 'project.viz-component-layer' },
  { id: 'build', name: 'Build (internal links are errors)', run: ['npm', 'run', '--silent', 'build'], ci: true, rule: 'project.site-zola-pages' },
  { id: 'seo', name: 'SEO derived from front matter (titles, descriptions, OG, JSON-LD, sitemap)', run: ['node', 'scripts/check-seo.mjs'], ci: true, needs: 'build', rule: 'project.seo-derived' },
  { id: 'work-pages', name: 'Every original repository has its own complete page (en, cs: SEO, OG, hreflang, JSON-LD on every forge)', run: ['node', 'scripts/check-work-pages.mjs'], ci: true, needs: 'build', rule: 'project.every-repository-page' },
  { id: 'profile', name: 'One positioning from the hire headline; every page links /hire/', run: ['node', 'scripts/check-profile.mjs'], ci: true, needs: 'build', lands: 'W1A', rule: 'project.hire-surfaces' },
  { id: 'nda-site', name: 'No denylisted name in the built site (NDA)', run: ['node', 'scripts/check-nda.mjs', '--site', 'public'], ci: true, needs: 'build' },
  { id: 'gates-json', name: 'data/gates.json is this gate list', run: ['node', 'scripts/gates.mjs', 'json', '--check'], ci: true, rule: 'project.landing-contract' },
  { id: 'landing', name: 'The landing keeps its contract: sections, links, CTA budget, nothing hidden', run: ['node', 'scripts/check-landing.mjs'], ci: true, needs: 'build', rule: 'project.landing-contract' },
  { id: 'flowbite', name: 'Flowbite Pro fidelity', run: ['test/cases/10_fleet_flowbite_pro.sh'], ci: false, needs: 'flowbite-scanner',
    why: 'the scanner lives on the owner\'s machine; in CI majordomus doctor judges the licence', rule: 'project.ui-uses-flowbite-pro' },
  { id: 'doctor', name: 'Majordomus supervision', run: ['majordomus', 'doctor'], ci: false, needs: 'majordomus',
    job: 'supervision', why: 'the supervision job installs the pinned majordomus and runs it with the licence evidence' },
];

// Gates that need a browser or the network, run by the workflows named here (never offline).
export const ONLINE = [
  { id: 'audit', name: 'Browser audit: axe WCAG 2.2 AA, CLS, overflow, visuals, list twins, links', run: ['scripts/verify-all.sh', '--audit-only'],
    script: 'scripts/audit-ui.mjs', where: 'npm run verify; ci.yml validate; pages.yml and monitor.yml against production', rule: 'project.ui-quality-gate' },
  { id: 'live', name: 'Every live project site answers', run: ['node', 'scripts/check-live.mjs'], where: 'pages.yml after deploy; monitor.yml daily', rule: 'project.data-measured' },
  { id: 'fresh', name: 'The measured data is younger than 24 hours', run: ['node', 'scripts/check-fresh.mjs'], where: 'monitor.yml daily', rule: 'project.data-measured' },
];

// Prerequisites, for README (generated). Versions are read from the files that pin them.
const TOOLS = () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const zola = readFileSync(join(ROOT, '.zola-version'), 'utf8').trim();
  const playwright = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')).packages?.['node_modules/playwright-core']?.version;
  return [
    ['Node.js', `${pkg.engines.node} (CI: 22)`, 'every script; `npm ci` installs the pinned tools'],
    ['Zola', `${zola} (\`.zola-version\`)`, '`npm run dev`, the build gate'],
    ['majordomus', 'v1.0.1 (as CI)', 'the git hooks and the doctor gate (<https://majordomus.dev>)'],
    ['python3', 'any 3.x', '`npm run verify`: a free port and the static server for the browser audit'],
    ['rsvg-convert', 'librsvg', '`npm run og` / `npm run derive`: renders the Open Graph PNGs'],
    ['pngquant', '2.x (Ubuntu, the refresh) or 3.x', '`npm run og` / `npm run derive`: quantises the Open Graph PNGs (32 colours; the version is recorded per card in `data/og.json`)'],
    ['gh, glab', 'authenticated', '`npm run data`, `index`, `recent`, `refresh`: measuring GitHub and GitLab'],
    ['Chromium headless shell', `playwright-core ${playwright}`, 'the browser audit: `npx playwright-core install chromium-headless-shell`'],
  ];
};

// Scripts that do not take the shared CLI yet, because another lane owns them; the cli gate lists
// them and fails once one adopts it (then it leaves this list).
const PENDING = {
  'lundra-runner.sh': 'owner (registers a runner over ssh: never run it to test it)',
};

const opts = cliArgs({
  '--ci': true, '--keep-going': true, '--from': '<id>', '--only': '<id,...>', '--skip': '<id,...>', '--format': '<text|github|json>', '--check': true, '--write': true,
}, { positional: '<run|list|check|cli|readme|deps|json>' });
const [command = 'run', ...extra] = opts._;
const fail2 = (message) => {
  process.stderr.write(`gates.mjs: ${message}; run with --help\n`);
  process.exit(2);
};
if (extra.length) fail2(`unexpected arguments ${extra.join(' ')}`);

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const shown = (argv) => argv.join(' ');
const ids = (list) => (list ? list.split(',').map((s) => s.trim()).filter(Boolean) : []);
for (const id of [opts.from, ...ids(opts.only), ...ids(opts.skip)].filter(Boolean)) {
  if (!GATES.some((g) => g.id === id)) fail2(`no gate '${id}' (gates: ${GATES.map((g) => g.id).join(' ')})`);
}

const expand = (arg) => (arg.startsWith('~/') ? join(homedir(), arg.slice(2)) : arg);
const has = (tool) => spawnSync('sh', ['-c', `command -v ${tool}`], { stdio: 'ignore' }).status === 0;
function missing(gate) {
  if (gate.lands && !existsSync(join(ROOT, scriptOf(gate.run)))) return `${scriptOf(gate.run)} has not landed yet (${gate.lands} lane)`;
  if (gate.needs === 'majordomus' && !has('majordomus')) return 'majordomus is not on PATH (https://majordomus.dev)';
  // The skill's behavioural case (test/cases/10_fleet_flowbite_pro.sh) runs the owner's scanner.
  if (gate.needs === 'flowbite-scanner' && !existsSync(expand(FLOWBITE_SCANNER))) return `no scanner at ${FLOWBITE_SCANNER}; majordomus doctor judges the licence here`;
  return null;
}

function runGates() {
  let selected = GATES;
  if (opts.from) selected = selected.slice(selected.findIndex((g) => g.id === opts.from));
  if (opts.only) selected = selected.filter((g) => ids(opts.only).includes(g.id));
  if (opts.skip) selected = selected.filter((g) => !ids(opts.skip).includes(g.id));
  const gha = process.env.GITHUB_ACTIONS === 'true';
  const done = new Set();
  const rows = [];
  const total = Date.now();
  const exec = (gate, index) => {
    const label = `[${index}/${selected.length}] ${gate.name} (${gate.id})`;
    process.stdout.write(gha ? `::group::${label}\n` : `\n== ${label}\n`);
    const start = Date.now();
    const result = spawnSync(gate.run[0], gate.run.slice(1).map(expand), { cwd: ROOT, stdio: 'inherit' });
    const seconds = ((Date.now() - start) / 1000).toFixed(1);
    if (gha) process.stdout.write('::endgroup::\n');
    done.add(gate.id);
    rows.push([gate.id, result.status === 0 ? 'ok' : 'FAIL', `${seconds} s`]);
    if (result.status === 0) {
      console.log(`ok   ${gate.id} in ${seconds} s`);
      return true;
    }
    const why = result.error ? result.error.message : `exit ${result.status ?? result.signal}`;
    console.log(`FAIL ${gate.id} in ${seconds} s (${why})`);
    console.log(`     again:         ${shown(gate.run)}`);
    console.log(`     resume from it: node scripts/gates.mjs run --from ${gate.id}${opts.ci ? ' --ci' : ''}`);
    if (gha) console.log(`::error title=gate ${gate.id} failed::${gate.name}: ${shown(gate.run)}`);
    return false;
  };
  const failed = [];
  for (const [i, gate] of selected.entries()) {
    if (failed.length && !opts.keepGoing) break;
    if (opts.ci && !gate.ci) {
      console.log(`\nskip ${gate.id}: ci: false (${gate.why})`);
      rows.push([gate.id, 'skip', 'ci: false']);
      continue;
    }
    const absent = missing(gate);
    if (absent) {
      console.log(`\nskip ${gate.id}: ${absent}`);
      rows.push([gate.id, 'skip', absent]);
      continue;
    }
    if (gate.needs === 'build' && failed.includes('build')) {
      console.log(`\nskip ${gate.id}: the build failed`);
      rows.push([gate.id, 'skip', 'the build failed']);
      continue;
    }
    if (gate.needs === 'build' && !done.has('build')) {
      console.log(`\n${gate.id} needs the build: running it first`);
      if (!exec(GATES.find((g) => g.id === 'build'), i + 1)) {
        failed.push('build');
        rows.push([gate.id, 'skip', 'the build failed']);
        continue;
      }
    }
    if (!exec(gate, i + 1)) failed.push(gate.id);
  }
  const ok = failed.length === 0;
  const summary = `${rows.filter((r) => r[1] === 'ok').length} passed, ${rows.filter((r) => r[1] === 'skip').length} skipped, `
    + `${ok ? 'none' : `${failed.length} (${failed.join(', ')})`} failed, ${((Date.now() - total) / 1000).toFixed(1)} s`;
  console.log(`\ngates: ${summary}`);
  for (const [id, state, time] of rows) console.log(`  ${state.padEnd(4)} ${id.padEnd(13)} ${time}`);
  if (gha && process.env.GITHUB_STEP_SUMMARY) {
    const table = rows.map(([id, state, time]) => `| ${id} | ${state} | ${time} |`).join('\n');
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Gates: ${summary}\n\n| gate | result | time |\n| --- | --- | --- |\n${table}\n`, { flag: 'a' });
  }
  process.exit(ok ? 0 : 1);
}

function list() {
  const format = opts.format || 'text';
  if (format === 'json') return console.log(JSON.stringify({ gates: GATES, online: ONLINE }, null, 2));
  if (format === 'github') {
    // The offline gates as workflow steps, one per gate (for a job that wants each in its own step).
    for (const g of GATES.filter((x) => x.ci)) console.log(`- name: ${g.name}\n  run: node scripts/gates.mjs run --only ${g.id}`);
    return undefined;
  }
  if (format !== 'text') fail2(`unknown --format ${format} (text, github, json)`);
  for (const g of GATES) console.log(`${g.id.padEnd(13)} ${g.ci ? 'ci  ' : 'no-ci'} ${g.name}\n${' '.repeat(20)}${shown(g.run)}${g.ci ? '' : `  (${g.why})`}`);
  for (const g of ONLINE) console.log(`${g.id.padEnd(13)} online ${g.name}\n${' '.repeat(20)}${shown(g.run)}  (${g.where})`);
  return undefined;
}

// --- parity --------------------------------------------------------------------------------------
// A gate script is a scripts/check-*.mjs, a scripts/build-*.mjs that has --check, the browser audit
// or the commit linter. What runs one, and how, is read from every place that can run one.
const GATE_SCRIPT = /scripts\/(?:check-[\w-]+\.mjs|build-[\w-]+\.mjs\s+--check|audit-ui\.mjs|lint-commits\.sh)/g;
const scriptOf = (argv) => argv.find((a) => a.startsWith('scripts/') && a !== 'scripts/gates.mjs') ?? null;
const keyOf = (text) => text.replace(/\s+/g, ' ');

function jobs(yaml) {
  const out = {};
  const body = yaml.split(/^jobs:\s*$/m)[1] ?? '';
  for (const part of body.split(/^(?= {2}[\w-]+:\s*$)/m)) {
    const name = part.match(/^ {2}([\w-]+):/)?.[1];
    if (name) out[name] = part;
  }
  return out;
}

function parity() {
  const findings = [];
  const all = [...GATES, ...ONLINE];
  const known = new Map();
  for (const g of all) {
    const script = g.script ?? scriptOf(g.run);
    if (!script) continue;
    known.set(keyOf(`${script}${g.run.includes('--check') ? ' --check' : ''}`), g);
  }
  // 1. Every gate script on disk is in the manifest.
  for (const file of readdirSync(join(ROOT, 'scripts')).sort()) {
    const rel = `scripts/${file}`;
    let key = null;
    if (/^check-[\w-]+\.mjs$/.test(file)) key = rel;
    else if (/^build-[\w-]+\.mjs$/.test(file) && /--check/.test(read(rel))) key = `${rel} --check`;
    else if (file === 'audit-ui.mjs' || file === 'lint-commits.sh') key = rel;
    if (key && !known.has(key)) findings.push(`${key} is a gate no entry of scripts/gates.mjs runs: add it to GATES (or ONLINE)`);
  }
  // 2. Nothing runs a gate script the manifest does not know, and nothing keeps a second list.
  const sites = [
    ...readdirSync(join(ROOT, '.github/workflows')).filter((f) => /\.ya?ml$/.test(f)).map((f) => `.github/workflows/${f}`),
    ...readdirSync(join(ROOT, '.github/actions')).map((d) => `.github/actions/${d}/action.yml`).filter((f) => existsSync(join(ROOT, f))),
    ...readdirSync(join(ROOT, '.githooks')).map((f) => `.githooks/${f}`),
    'scripts/verify-all.sh',
    'package.json',
  ];
  for (const site of sites) {
    const text = read(site);
    const direct = new Set();
    for (const m of text.matchAll(GATE_SCRIPT)) {
      const key = keyOf(m[0]);
      const gate = known.get(key);
      const line = text.slice(0, m.index).split('\n').length;
      if (!gate) { findings.push(`${site}:${line} runs ${key}, which scripts/gates.mjs does not know`); continue; }
      if (GATES.includes(gate)) direct.add(gate.id);
    }
    // A single alias (package.json "seo") is a shortcut; two or more offline gates are a list.
    const offline = [...direct].filter((id) => GATES.find((g) => g.id === id)?.job === undefined);
    if (offline.length > 1) findings.push(`${site} runs ${offline.length} gates itself (${offline.join(', ')}): run node scripts/gates.mjs run instead`);
  }
  // 3. The entry points run the manifest.
  const pkg = JSON.parse(read('package.json'));
  if (!/node scripts\/gates\.mjs run --ci\b/.test(pkg.scripts.check ?? '')) findings.push('package.json "check" must be node scripts/gates.mjs run --ci');
  if (!/node scripts\/gates\.mjs run\b/.test(read('scripts/verify-all.sh'))) findings.push('scripts/verify-all.sh must run node scripts/gates.mjs run');
  const ci = jobs(read('.github/workflows/ci.yml'));
  if (!/node scripts\/gates\.mjs run --ci\b/.test(ci.validate ?? '')) findings.push('ci.yml job validate must run node scripts/gates.mjs run --ci: CI would not run the ci: true gates');
  if (!/npm run --silent check\b|node scripts\/gates\.mjs run\b/.test(read('.github/workflows/refresh.yml'))) findings.push('refresh.yml must run npm run check before it commits');
  // 4. Every gate runs in CI: ci: true through validate; ci: false in the job it names, or says why not.
  for (const g of GATES.filter((x) => !x.ci)) {
    if (!g.why) findings.push(`gate ${g.id} is ci: false without a why`);
    if (!g.job) continue;
    const runs = g.run[0] === 'majordomus' ? /^\s*majordomus doctor\s*$/m : new RegExp(scriptOf(g.run).replace(/[.]/g, '\\.'));
    if (!runs.test(ci[g.job] ?? '')) findings.push(`gate ${g.id} says ci.yml job ${g.job} runs it, but that job does not run ${shown(g.run)}`);
  }
  // 5. Online gates run where they say (the audit through verify-all.sh, so its server is one).
  const workflows = sites.filter((s) => s.startsWith('.github/workflows/')).map(read).join('\n');
  for (const g of ONLINE) {
    const pattern = g.id === 'audit' ? /scripts\/verify-all\.sh --audit-only|scripts\/audit-ui\.mjs/ : new RegExp(scriptOf(g.run).replace(/[.]/g, '\\.'));
    if (!pattern.test(workflows)) findings.push(`online gate ${g.id} runs in no workflow`);
  }
  for (const f of findings) console.error(`✗ ${f}`);
  if (findings.length) process.exit(1);
  console.log(`gates: ${GATES.length} offline and ${ONLINE.length} online gates; every gate script is listed, every entry point runs this list, CI runs every gate, PASS`);
}

// --- cli smoke loop ------------------------------------------------------------------------------
function cliGate() {
  const findings = [];
  let checked = 0;
  for (const file of readdirSync(join(ROOT, 'scripts')).filter((f) => /\.(mjs|sh)$/.test(f)).sort()) {
    const rel = `scripts/${file}`;
    const text = read(rel);
    const adopts = file.endsWith('.mjs') ? /from '\.\/lib\/cli\.mjs'/.test(text) : /^\s*--help\|-h\)/m.test(text);
    if (PENDING[file]) {
      if (adopts) findings.push(`${rel} adopted the CLI contract: remove it from PENDING in scripts/gates.mjs`);
      else console.log(`pending ${rel} (owner: ${PENDING[file]})`);
      continue;
    }
    if (!adopts) { findings.push(`${rel} does not take the shared CLI (scripts/lib/cli.mjs; a shell script handles --help|-h) and unknown flags)`); continue; }
    const argv = (flag) => (file.endsWith('.mjs') ? ['node', [rel, flag]] : ['bash', [rel, flag]]);
    const [cmd, bogus] = argv('--bogus');
    const b = spawnSync(cmd, bogus, { cwd: ROOT, encoding: 'utf8', timeout: 20000 });
    if (b.status !== 2 || !b.stderr.includes('--bogus')) findings.push(`${rel} --bogus exits ${b.status ?? b.signal} (expected 2, naming the flag): ${(b.stderr || b.stdout).trim().split('\n')[0]}`);
    const [, help] = argv('--help');
    const h = spawnSync(cmd, help, { cwd: ROOT, encoding: 'utf8', timeout: 20000 });
    const expected = header(join(ROOT, rel)).split('\n')[0];
    if (h.status !== 0 || !expected || !h.stdout.includes(expected)) findings.push(`${rel} --help exits ${h.status} without its header comment`);
    checked += 1;
  }
  for (const f of findings) console.error(`✗ ${f}`);
  if (findings.length) process.exit(1);
  console.log(`cli: ${checked} scripts print their header on --help and exit 2 on --bogus, ${Object.keys(PENDING).length} pending their owners, PASS`);
}

// --- README --------------------------------------------------------------------------------------
const cell = (s) => String(s).replace(/\|/g, '\\|');
function readmeSections() {
  const where = (g) => (g.ci ? 'check, verify, CI' : `verify; CI: ${g.job ? `${g.job} job` : 'no'}`);
  const gates = [
    '| Gate | Command | Runs in | Rule |',
    '| --- | --- | --- | --- |',
    ...GATES.map((g) => `| ${cell(g.name)} | \`${cell(shown(g.run))}\` | ${where(g)} | ${g.rule ? `\`${g.rule}\`` : ''} |`),
    ...ONLINE.map((g) => `| ${cell(g.name)} | \`${cell(shown(g.run))}\` | ${cell(g.where)} | ${g.rule ? `\`${g.rule}\`` : ''} |`),
  ].join('\n');
  const tools = ['| Tool | Version | Needed for |', '| --- | --- | --- |', ...TOOLS().map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
  return { gates, prerequisites: tools };
}

function readme() {
  const file = join(ROOT, 'README.md');
  const text = readFileSync(file, 'utf8');
  let next = text;
  for (const [name, body] of Object.entries(readmeSections())) {
    const begin = `<!-- ${name}:begin (generated by node scripts/gates.mjs readme; do not edit) -->`;
    const end = `<!-- ${name}:end -->`;
    const at = next.indexOf(begin);
    const stop = next.indexOf(end);
    if (at === -1 || stop === -1) { console.error(`✗ README.md has no ${begin} … ${end} section`); process.exit(1); }
    next = `${next.slice(0, at + begin.length)}\n${body}\n${next.slice(stop)}`;
  }
  if (opts.check) {
    if (next !== text) {
      console.error('✗ README.md: a generated section is stale: run node scripts/gates.mjs readme');
      process.exit(1);
    }
    console.log('readme: the gate table and the prerequisites are current');
    return;
  }
  writeFileSync(file, next);
  console.log('readme: wrote the gate table and the prerequisites');
}

function deps() {
  const r = spawnSync('npm', ['ls', '--depth=0'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status === 0) return console.log('every locked dependency is installed at its locked version');
  // Every gate reads node_modules: an install behind the lock judges with the wrong tools (a
  // dependency landed from another worktree once made a pre-push die halfway, ERR_MODULE_NOT_FOUND).
  console.error(`${r.stdout}${r.stderr}`.split('\n').filter((l) => /missing|invalid|ERR/.test(l)).slice(0, 5).join('\n'));
  console.error(`node_modules is behind package-lock.json: run npm ci in ${ROOT}, then again`);
  return process.exit(1);
}

// --- data/gates.json ----------------------------------------------------------------------------
// The gate list as the site's data, without a timestamp (it changes only when a gate does): what
// each gate checks, the rule it enforces with that rule's file, and where it runs (CI, the
// pre-push hook through npm run verify, a workflow against the deployed site, or only locally).
const RULES_DIR = '.ai/repo/rules/project';
function gatesData() {
  const ruleFiles = {};
  for (const file of readdirSync(join(ROOT, RULES_DIR)).filter((f) => f.endsWith('.md')).sort()) {
    const id = read(`${RULES_DIR}/${file}`).match(/^id:\s*(\S+)\s*$/m)?.[1];
    if (id) ruleFiles[id] = `${RULES_DIR}/${file}`;
  }
  const CI = '.github/workflows/ci.yml';
  const PREPUSH = '.githooks/pre-push';
  const where = (g) => {
    if (g.where) {
      return [...new Set(g.where.match(/\b[\w-]+\.yml\b/g) ?? [])].map((f) => ({ kind: f === 'ci.yml' ? 'ci' : 'online', file: `.github/workflows/${f}` }));
    }
    const out = [];
    if (g.ci || g.job) out.push({ kind: 'ci', file: CI });
    else out.push({ kind: 'local', file: null });
    out.push({ kind: 'prepush', file: PREPUSH });
    return out;
  };
  const row = (g) => ({ id: g.id, name: g.name, rule: g.rule ?? null, rule_file: g.rule ? ruleFiles[g.rule] ?? null : null, ci: Boolean(g.ci || g.job), where: where(g) });
  return { schema: 'korczis-hub-gates/v1', source: 'node scripts/gates.mjs json --write', gates: [...GATES.map(row), ...ONLINE.map(row)] };
}

function json() {
  const file = join(ROOT, 'data/gates.json');
  const text = `${JSON.stringify(gatesData(), null, 2)}\n`;
  const unknown = gatesData().gates.filter((g) => g.rule && !g.rule_file).map((g) => `${g.id} names ${g.rule}, which no file of ${RULES_DIR} declares`);
  for (const u of unknown) console.error(`✗ ${u}`);
  if (unknown.length) process.exit(1);
  if (opts.check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) {
      console.error('✗ data/gates.json is stale: run node scripts/gates.mjs json --write (npm run derive)');
      process.exit(1);
    }
    console.log(`gates.json: ${gatesData().gates.length} gates, each with its rule and where it runs, current`);
    return;
  }
  if (!opts.write) fail2('json needs --write or --check');
  writeFileSync(file, text);
  console.log(`gates.json: wrote ${gatesData().gates.length} gates`);
}

const COMMANDS = { run: runGates, list, check: parity, cli: cliGate, readme, deps, json };
if (!COMMANDS[command]) fail2(`unknown command ${command} (${Object.keys(COMMANDS).join(', ')})`);
COMMANDS[command]();
