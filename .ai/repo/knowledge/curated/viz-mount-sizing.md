---
schema: knowledge/v1
id: viz-mount-sizing
kind: knowledge
class: lesson
title: "Chart and graph mount points take their size from width and height; grid items need min-w-0"
description: "When a visual (Cytoscape, ECharts, Chart.js, p5) is added or its card layout changes."
status: verified
epistemics: observed
date: 2026-11-12
tags:
  - visualisation
  - layout
provenance:
  origin: authored
---

# Chart and graph mount points take their size from width and height

## What happened

- The ecosystem graph drew nothing: its mount point was `position: absolute; inset: 0`, and
  Cytoscape sets its container's position inline (relative), so the box collapsed to 0 px high
  while the visual still reported ready.
- At 320 to 375 px the home page overflowed: a Chart.js canvas inside a grid item kept the item at
  the canvas's first width (grid items default to `min-width: auto`).

## What holds

- `.viz-box > [data-canvas]` is `width: 100%; height: 100%`, never an absolute inset.
- Every grid item that holds a chart or long text carries `min-w-0`.
- The audit counts a visual as ready only when it draws on a non-empty surface
  (`scripts/audit-ui.mjs`), so a 0 px chart fails the gate.
