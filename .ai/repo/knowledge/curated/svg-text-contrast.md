---
schema: knowledge/v1
id: svg-text-contrast
kind: knowledge
class: lesson
title: "axe judges SVG text by its CSS colour and the box background, never by the fill it is drawn on"
description: "When a visual draws text into an SVG over shapes, gradients or a night-toned box."
status: verified
epistemics: observed
date: 2026-11-14
tags:
  - accessibility
  - visualisation
  - testing
provenance:
  origin: authored
---

# axe judges SVG text by its CSS colour and the box background

## What happened

The browser audit failed the pack's labels on the tag pages, and every attempt to fix the colours
left the verdict unchanged. A probe of axe's own data showed why: for every label it reported the
body's CSS `color` (#101828) against the box's `background-color` (#030712), 1.13:1. axe reads
neither the text's `fill` nor the circle, gradient or halo under it. Its verdicts on SVG text inside
a visual were noise, and white labels forced onto every bubble also passed it.

The replacement instrument (`scripts/audit-ui.mjs`, svg text contrast) measures each visible
`<text>` against the topmost shape whose fill holds its centre, every stop of a gradient, translucent
fills composited over the box, or its own halo stroke. On its first runs it found two defects of its
own and one of the product:

- `elementsFromPoint` skips shapes with `pointer-events: none`; geometry (`isPointInFill` through
  `getScreenCTM().inverse()`) finds them.
- Chrome reports a paint server as an absolute address, `url("http://host/page/#id")`.
- Under reduced motion the pack's entrance formula was 0/1, so every bubble stayed at r = 0 and the
  labels floated on nothing. No other gate saw it, because the audit always runs reduced.

## What holds

- Inside a visual, judge SVG text with the svg text check, not with axe's color-contrast; outside
  visuals axe's verdicts stand.
- A night-toned box (`data-tone="night"`) is dark in both themes: its visual gets the night inks
  from the layer's palette.
- A new contrast instrument is proven by a negative control that forces a failing ink; a control
  that still passes means the instrument reads the wrong ground.
