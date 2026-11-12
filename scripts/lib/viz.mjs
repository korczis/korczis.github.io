// One [[extra.viz]] block of TOML front matter, as the generators declare visuals (rule
// project.viz-component-layer: pages compose visuals in front matter; viz-grid renders them).
// The defaults are the convention: a full-width, medium-height card on the night sky.
export function vizBlock({ kind, source, title, lead, span = 3, height = 'md', tone = 'night' }) {
  return `
[[extra.viz]]
kind = "${kind}"
source = "${source}"
title = "${title}"
lead = "${lead}"
span = ${span}
height = "${height}"${tone ? `\ntone = "${tone}"` : ''}
`;
}
