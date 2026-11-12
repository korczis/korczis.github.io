---
id: project.viz-component-layer
version: 1
kind: rule
title: Every visual goes through one component layer
description: p5.js, Cytoscape.js, Apache ECharts and Chart.js are constructed only in static/js/viz/<name>.js, registered with KorczisHub.viz, lazy-loaded, themed from the CSS tokens and given a text alternative.
statement: Construct a visual only in static/js/viz/<name>.js registered as KorczisHub.viz('<name>'), mount it with data-viz="<name>" on a box that reserves its size, read colours from KorczisHub.palette(), and give the box a role and an aria-label that states what it shows.
status: active
class: blocking
depends_on: []
tags: [ui, visualisation, performance, accessibility]
---

# Rationale

The four libraries weigh about 900 KB gzipped together. Loading them only when their box nears
the viewport keeps the first paint light; one layer also means one place for theming, redraw on
theme change, error reporting and the ready state the audit waits for.

# Required behaviour

- `static/js/site.js` owns the layer: `viz`, `lib` (lazy script loading), `data` (embedded JSON),
  `palette` (the `--hub-*` tokens of `styles/app.css`, converted to rgb), and the `dark-mode`
  event that asks every mounted visual to `update()`.
- A visual's data is embedded by the template as `<script type="application/json" id=…>` from
  `data/github.json` or `data/projects.toml`; a visual never fetches data itself. The only
  runtime fetch is the Majordomus release card (an Alpine component, not a visual), which shows
  the build-time snapshot until majordomus.dev answers.
- Pages compose their visuals in front matter (`[[extra.viz]]`: kind, source, title and lead
  i18n keys, span, height); `templates/partials/viz-grid.html` renders them and the base layout
  loads each declared kind's script. The schema enumerates kinds and named data sources.
- Art first: the D3 visuals (`spiral`, `pack`, `stream`) draw with the art palette (`--hub-art-*`,
  a hue walk from the brand blue through sky to violet), gradients and glow, animate in, answer
  hover with the shared tooltip (`KorczisHub.tooltip`, hidden from assistive tech because the
  card's aria-label states the same) and open the matching work on click.
- Everything clickable: every visual answers a click or tap and leads somewhere (a repository,
  a work page, a filtered index, GitHub activity of a day), and shows the pointer where it does.
  `scripts/check-viz-layer.mjs` refuses a visual without a click handler or pointer cursor (the
  decorative hero `glyphs` excepted; ECharts sets the pointer itself), and a visual no page uses.
- The constellation draws the whole index as a galaxy on a canvas with its own 3D projection
  (no WebGL: 211 points need none, and the browser audit runs headless).
- Motion respects `prefers-reduced-motion`; a decorative visual is `aria-hidden`.
- Alpine.js components live in `static/js/components/` and only enhance markup the template
  already rendered.

# Failure behaviour

`scripts/check-viz-layer.mjs` exits 1 with the file and the reason; the audit fails a visual that
does not reach `ready`.

# Verification

```sh
node scripts/check-viz-layer.mjs
```
