// The site's interface texts, grouped by feature: every i18n/*.toml file, read in name order and
// merged into one table (key -> { en, cs, ..., client? }). A key defined in two files is an error
// naming both, so a feature can own its file without anyone keeping one long list.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const I18N_DIR = join(ROOT, 'i18n');

export function loadStrings() {
  const strings = {};
  const owner = {};
  const clashes = [];
  for (const file of readdirSync(I18N_DIR).filter((f) => f.endsWith('.toml')).sort()) {
    for (const [key, values] of Object.entries(parse(readFileSync(join(I18N_DIR, file), 'utf8')))) {
      if (owner[key]) clashes.push(`${key} is in both i18n/${owner[key]} and i18n/${file}`);
      owner[key] = file;
      strings[key] = values;
    }
  }
  if (clashes.length) {
    for (const c of clashes) console.error(`✗ ${c}`);
    process.exit(1);
  }
  return strings;
}
