// The command-line contract every script in scripts/ shares, so none of them can be misread:
//  - `--help` (or -h) prints the script's own header comment: the file is its documentation, and
//    there is no second copy to drift;
//  - an unknown flag or a stray argument exits 2 and names it. Before this a typo such as
//    `--chek` fell through to the default, and a generator rewrote the files it was asked to check;
//  - a derived-file check (`{ derived: true }`, run with --check) that fails ends with the one hint
//    for every stale derived file: `npm run derive`.
//
// usage, right after a script's imports:
//   const opts = cliArgs({ '--check': true, '--json': '<file>' }, { derived: true });
//   opts.check   -> true when --check was given;   opts.json -> the value of --json (or --json=x)
//   opts._       -> positional arguments (only with { positional: '<name>...' }, else they exit 2)
// scripts/gates.mjs (gate `cli`) runs every script with --bogus and expects exit 2.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

export const STALE_HINT = 'a derived file is stale: run `npm run derive`, review the diff and commit it';

// The leading // comment block of a file (after its shebang), as plain text.
export function header(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const start = lines[0]?.startsWith('#!') ? 1 : 0;
  const out = [];
  for (const line of lines.slice(start)) {
    const m = line.match(/^\s*(?:\/\/|#)(?: ?)(.*)$/);
    if (!m || /^\s*#!/.test(line)) break;
    out.push(m[1]);
  }
  return out.join('\n').trimEnd();
}

const camel = (flag) => flag.replace(/^--?/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());

export function cliArgs(spec = {}, { positional = null, derived = false, argv = process.argv.slice(2), file = process.argv[1] } = {}) {
  const name = basename(file || 'script');
  const opts = { _: [] };
  const known = Object.keys(spec);
  const fail = (message) => {
    process.stderr.write(`${name}: ${message}\n`);
    process.stderr.write(`known: ${[...known, '--help'].join(' ')}${positional ? ` ${positional}` : ''}; run with --help\n`);
    process.exit(2);
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${header(file)}\n`);
      process.exit(0);
    }
    if (arg === '--') {
      if (!positional) fail(`unexpected arguments after --: ${argv.slice(i + 1).join(' ')}`);
      opts._.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('-')) {
      const [flag, inline] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
      if (!(flag in spec)) fail(`unknown flag ${flag}`);
      if (spec[flag] === true) {
        if (inline !== undefined) fail(`${flag} takes no value`);
        opts[camel(flag)] = true;
      } else {
        const value = inline ?? argv[(i += 1)];
        if (value === undefined || (inline === undefined && value.startsWith('--'))) fail(`${flag} needs a value ${spec[flag]}`);
        opts[camel(flag)] = value;
      }
      continue;
    }
    if (!positional) fail(`unexpected argument ${arg}`);
    opts._.push(arg);
  }
  for (const flag of known) if (!(camel(flag) in opts)) opts[camel(flag)] = spec[flag] === true ? false : null;
  if (derived && opts.check) {
    process.on('exit', (code) => {
      if (code === 1) process.stderr.write(`hint: ${STALE_HINT}\n`);
    });
  }
  return opts;
}
