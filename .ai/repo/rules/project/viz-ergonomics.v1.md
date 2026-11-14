---
id: project.viz-ergonomics
version: 1
kind: rule
title: Every visual is a maximizable simulator on the best library
description: Every visual that is not declared static can be maximized to the viewport, deep-linked, restored with Escape, and is a model the visitor drives through declared parameters whose state lives in the address; charts and graphs are Apache ECharts through the layer, D3 is for bespoke layouts and physics, p5 for generative art.
statement: Build every visual as a simulator through the layer in static/js/site.js — return controls() with at least one parameter that changes the model, resize() for the box the layer gives it, items() for its list twin — or declare it static with the reason; never construct a toolbar, a maximize view, a resize observer, a URL state or a navigation of your own; use Apache ECharts for charts and graphs, never Chart.js or Cytoscape.
status: active
class: blocking
depends_on: [project.viz-component-layer@1, project.ui-quality-gate@1]
tags: [ui, visualisation, simulation, ergonomics, enforcement]

x-majordomus:
  reviewed_because: the decision is the repository's own gates, scripts/check-viz-layer.mjs (static) and scripts/audit-ui.mjs checkFrames (browser), which the gate manifest runs in npm run check, npm run verify, the pre-push hook and CI; no validator of the Majordomus doctrine dispatches them
---

# Rationale

ADR 0005, the owner's order of 2026-11-14 (verbatim there): "zmer se na ergonomii /
maximalizovatelnost visualizaci - prefereruj simulatory pred visualizacemi, puzij vzdy nejlepsi
knihhovny ... vsechny tyto pozadavky od ted vynucuj, vzdy, kazdy task". A picture of the data
answers the question its author asked; a simulator lets the visitor ask their own. A visual in a
card a few hundred pixels high cannot be read in depth, so every one opens to the whole screen.
Done once in the layer, both hold for every visual, including the next one.

# Required behaviour

- **The frame is the layer's.** `static/js/site.js` wraps every non-static `[data-viz]` box in a
  frame and pins a Flowbite toolbar over it: play (when declared), the parameters panel, maximize,
  and full screen while maximized. Maximized, the frame covers the viewport, the rest of the page
  is inert, Escape restores it and returns focus, and `?viz=<id>` opens it maximized.
- **A simulator declares its model.** `handle.controls()` returns the parameters (range, select,
  toggle, play, action) with translated labels; each changes what the visual simulates (time,
  physics, metric, filter, depth), never only its look. The layer keeps every value in the
  address (`?<id>.<key>=value`) and restores it on load, so a configured simulation is a link.
- **The box decides the size.** The layer observes the box and calls `resize()` (or `update()`);
  the visual draws to whatever box it has, and plays its entrance once, not on every resize.
- **Static is declared, with the reason**, in the registration (`static: '<reason>'`), and only
  for a visual that is decorative and `aria-hidden` (the hero glyphs).
- **One motion, one navigation.** Durations come from `ctx.motion()` (zero under reduced motion);
  navigation goes through `ctx.go(url, event)`, so Ctrl/Cmd-click opens a new tab as a link would.
- **The best library for the job.** Charts and graphs (bars, sunburst, treemap, sankey, graph,
  time series) are Apache ECharts through the layer, following the owner's standard
  (`~/.claude/skills/echarts-viz-layer`): custom drill with an HTML breadcrumb, Ctrl-wheel zoom,
  the validated palette from the `--hub-*` tokens. D3 stays for bespoke layouts and force physics,
  p5 for generative art. Chart.js and Cytoscape are not part of the bundle.

# Failure behaviour

`scripts/check-viz-layer.mjs` exits 1, naming the file and the missing piece, on a non-static
visual without `controls` or `items`, with its own ResizeObserver, its own navigation
(`location.href =`, `window.open(`), colour literals, or a Chart.js or Cytoscape reference.
`scripts/audit-ui.mjs` (checkFrames) exits 1 when a visual on any page does not maximize to the
viewport, does not redraw to the maximized box, does not restore with Escape and return focus,
does not open from `?viz=<id>`, declares no parameter, or loses a parameter across a reload of its
address.

# Verification

```sh
node scripts/check-viz-layer.mjs
npm run verify -- --audit-only --only frames
```
