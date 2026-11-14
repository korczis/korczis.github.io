---
schema: adr/v1
id: adr-0005
kind: adr
title: Visuals are maximizable simulators on the best library, everything interlinked, enforced every task
status: proposed
date: 2026-11-14
tags:
  - ui
  - visualisation
  - enforcement
provenance:
  origin: authored
---

# 5. Visuals are maximizable simulators on the best library, everything interlinked, enforced every task

## Context

The owner wrote in Claude Code session `8ab4cca0-a58f-4aec-a06b-8c8a1a13b6c5` on 2026-11-14 (about
20:20 UTC), verbatim:

> prostuduj si project specific .ai/
> budu potrebovat vse dynamic/generic/derived/infered rozsirih sjednotit kvalitu na top notch
> veskere visualizace
> vesker ui/ux/dx tooling
> back and forth
> /evolve majordomus

and, in the same turn:

> zmer se na ergonomii / maximalizovatelnost visualizaci - prefereruj simulatory pred
> visualizacemi, puzij vzdy nejlepsi knihhovny,vse vzdy propopojuj, vsechny tyto pozadavky od ted
> vynucuj, vzdy, kazdy task, musi byt reflected v .ai/ tooling always working automagicaly

> use all of our best agents parallel
> all skillset
> max perfromance

Measured on master 3a76b45 that day: ten visuals on five libraries (p5, Cytoscape, Chart.js, ECharts,
D3) plus hand-written canvas; none could be maximized; none exposed a parameter a visitor could change,
so each was a picture of the data, not a model of it; the gate list existed three times (package.json
`check`, `scripts/verify-all.sh`, `.github/workflows/ci.yml`) and had drifted (the glossary gates ran
locally and not in CI, PR #7). The owner's charting standard (`~/.claude/skills/echarts-viz-layer`)
names Apache ECharts through one layer and no Chart.js or Cytoscape in the output.

## Decision

1. **Maximizable.** Every visual card can be maximized to the whole screen (Fullscreen API, with a
   fixed overlay where the element API is missing), from a button, the `f` key and a deep link
   (`?viz=<id>`); Escape restores it; the visual resizes to the new box.
2. **Simulator first.** A visual is a model the visitor drives: it exposes its parameters
   (`controls()`: ranges, toggles, selects, play and scrub of time) through one shared control bar,
   and its state lives in the URL, so a configured simulation is a link. A visual that only shows
   (the decorative hero) is declared static, with the reason, in one place.
3. **Best library, one layer.** Charts and graphs are Apache ECharts through the layer (the owner's
   standard); D3 stays for bespoke layouts and force physics, p5 for generative art. Chart.js and
   Cytoscape leave the bundle.
4. **Interlinked.** Every mark a visual draws leads somewhere on the site or to its source, every
   page links its neighbours, and every link is proven at build time.
5. **Enforced every task.** These are blocking project rules (`project.viz-ergonomics`,
   `project.everything-interlinked`) with gates in the one gate manifest that `npm run check`,
   `npm run verify`, CI and the hooks all read, so no task can land without them.

## Alternatives rejected

- Keeping five chart libraries: two of them (Chart.js, Cytoscape) duplicate what ECharts does and
  contradict the owner's standard.
- A maximize button per visual: decays with the next visual; the layer renders it once for all.
- Memory or advice only: the owner asked for enforcement "vzdy, kazdy task"; advice nothing checks
  decays.

## Consequences

- Every new visual must implement `controls()` and a resize path, or be declared static with a reason;
  `scripts/check-viz-layer.mjs` refuses it otherwise, and the browser audit maximizes each one.
- The gate list has one source; adding a gate is one line there.
