---
schema: knowledge/v1
id: p5-async-setup
kind: knowledge
class: lesson
title: "p5 2.x sets up asynchronously and then sets touch-action: none on every canvas of the page"
description: "When a p5 sketch is resized, recoloured or shares a page with other canvases."
status: verified
epistemics: observed
date: 2026-11-14
tags:
  - p5
  - visualisation
provenance:
  origin: authored
---

# p5 2.x sets up asynchronously, and touches every canvas when it is done

## What happened

The frames audit logged `Cannot read properties of undefined (reading 'clear')` once per page with
the hero. p5 2.3.4 awaits its presetup hooks before `setup()` creates a renderer, so a resize or a
theme change that arrived first called `p.clear()` on no renderer. After setup p5 also sets
`style.touchAction = 'none'` on every `<canvas>` in the document (`#_setup`), so a simulator canvas
that already existed, for example from a `?viz=` deep link, stopped scrolling the page under a
finger.

## What holds

- A sketch keeps a `ready` flag set at the end of `setup()`; redraws and resizes before it do nothing
  (setup draws the current state anyway). The layer, not the sketch, observes the box.
- Right after `setup()`, the sketch restores the `touch-action` of every canvas outside its own box
  (`static/js/viz/glyphs.js`).
