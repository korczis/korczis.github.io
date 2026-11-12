---
schema: knowledge/v1
id: alpine-scope-collisions
kind: knowledge
class: lesson
title: "Nested Alpine components share property names: the inner one silently writes the outer one's state"
description: "When an Alpine component is placed inside another (the catalogue filter wraps the detail drawer)."
status: verified
epistemics: observed
date: 2026-11-12
tags:
  - alpine
  - ui
provenance:
  origin: authored
---

# Nested Alpine components share property names

## What happened

The project detail drawer (`projectDetail`) sits inside the catalogue filter's scope
(`projectFilter`). Opening a project set `this.category` to its category's name, and Alpine resolved
`category` to the filter's property: the filter switched to "AI engineering", every card hid, and
the URL gained `?category=AI+engineering`. The same happened to `remember()`, which rewrote the URL
without `?project=`.

## What holds

Name a component's state and methods for that component (`categoryName`, `rememberProject`), and
add an interaction test before believing a nested component works: `scripts/audit-ui.mjs`
(`checkDetail`) found both collisions on its first run.
