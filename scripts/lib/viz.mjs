// One [[extra.viz]] block of TOML front matter, as the generators declare visuals (rule
// project.viz-component-layer: pages compose visuals in front matter; viz-grid renders them).
// The defaults are the convention: a full-width, medium-height card on the night sky.
// vars: values for the {placeholders} of the title and lead strings, in the page's language.
export function vizBlock({ kind, source, title, lead, span = 3, height = 'md', tone = 'night', vars = null }) {
  const table = vars && Object.keys(vars).length
    ? `\nvars = { ${Object.entries(vars).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(', ')} }` : '';
  return `
[[extra.viz]]
kind = "${kind}"
source = "${source}"
title = "${title}"
lead = "${lead}"
span = ${span}
height = "${height}"${tone ? `\ntone = "${tone}"` : ''}${table}
`;
}
