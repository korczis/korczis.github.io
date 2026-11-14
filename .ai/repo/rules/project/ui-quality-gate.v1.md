---
id: project.ui-quality-gate
version: 1
kind: rule
title: A UI change passes the browser gate before it lands
description: Every page, at phone and desktop width in both themes, has no WCAG 2.2 AA violation, no console or network error, no horizontal overflow, CLS at most 0.1, every visual mounted, and every internal link resolving.
statement: Before merging a change under templates/, styles/, static/ or data/, run the browser audit (scripts/audit-ui.mjs, in CI or npm run verify) and fix every finding until it exits 0.
status: active
class: blocking
depends_on: [project.ui-uses-flowbite-pro@1, project.viz-component-layer@1]
tags: [ui, accessibility, performance, testing]

x-majordomus:
  reviewed_because: the decision is the repository's own gate, scripts/audit-ui.mjs (axe-core, layout, CLS, visuals, interactions, links), which the gate manifest runs in npm run check, npm run verify, the pre-push hook and CI; no validator of the Majordomus doctrine dispatches it
---

# Rationale

A green `zola build` says nothing about contrast in the dark theme, a chart that never mounted,
or a hero that shifts the page. Only a browser shows those, and the owner asks for maximum
attention to UI, UX and consistency.

# Required behaviour

- `scripts/audit-ui.mjs` covers one page of every template in every language, derived from the
  built sitemap and the content front matter (it fails when a template or a language has no page):
  axe-core WCAG 2.2 AA at 375 and 1440 px in light and dark; overflow and errors at 320, 768, 1024 and
  1920 px; CLS at most 0.1; each `[data-viz]` reaches `data-viz-state="ready"` and draws on a non-empty surface once scrolled
  into view; every rendered internal link resolves to a built file.
- CI (`.github/workflows/ci.yml`, job `validate`) runs it on every pull request and before every
  deployment, with screenshots as an artefact. Locally: `npm run verify` (one browser launch;
  mind the headless Chrome disk cost on the owner's Mac).
- Interactions are driven like a person would: the mobile sidebar drawer (open, focus inside,
  links above the backdrop, Escape, desktop exposed) and the catalogue's detail drawer and table
  view (Details opens with focus and `?project=`, Escape closes and returns focus, the table
  follows the filter), and the command palette (Ctrl+K opens with focus, Escape closes, search
  ranks, Enter opens the project).
- Every framed visual is maximized, redrawn, restored and deep-linked, and every simulator
  parameter round-trips through its address (`checkFrames`, rule project.viz-ergonomics); every
  list twin's link resolves; a Czech page links only into the Czech tree.
- The public site is audited the same way after every deployment (`pages.yml` job `verify`) and
  daily (`monitor.yml`), with `scripts/check-live.mjs` asking every linked live project.

# Failure behaviour

Any finding exits 1 and blocks the merge and the deployment (`pages.yml` needs `ci`).

# Verification

```sh
npm run verify                       # all gates, browser audit last
npm run verify -- --audit-only       # the browser audit alone
```
