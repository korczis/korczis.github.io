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
- Realtime: the pulse is the one visual that reads the network, in two modes: `recent.commits`
  (home: the owner's public events, a lane per repository) and `work.commits` (every work page,
  declared by `build-work.mjs`: the project's latest 30 commits, a lane per conventional commit
  type; live for GitHub, the six-hourly snapshot for GitLab). The page embeds the measured
  snapshot; the browser then polls the public GitHub events API every five minutes while the
  visual is on screen, with `If-None-Match` so a quiet poll costs no rate limit, and falls back to
  the snapshot (labelled "Snapshot") when offline or limited. A failed poll is never a console
  error. Any future live visual follows the same shape: snapshot first, live on top, labelled.
- Every listing and article type carries a visual, declared by its generator through
  `scripts/lib/viz.mjs` (`vizBlock`, the convention: full width, night sky): the glossary and
  every term page an `atlas` (co-occurrence map of terms, a term page centred on itself), every
  category page the `constellation` with its own arm lit (`source.focus`), the work list a
  `pulse` of all recent commits (`work.all`, a lane per category), every work page its own pulse.
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
