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
---

# Rationale

A green `zola build` says nothing about contrast in the dark theme, a chart that never mounted,
or a hero that shifts the page. Only a browser shows those, and the owner asks for maximum
attention to UI, UX and consistency.

# Required behaviour

- `scripts/audit-ui.mjs` covers `/`, `/projects/`, `/stack/` and `/404.html`: axe-core
  WCAG 2.2 AA at 375 and 1440 px in light and dark; overflow and errors at 320, 768, 1024 and
  1920 px; CLS at most 0.1; each `[data-viz]` reaches `data-viz-state="ready"` and draws on a non-empty surface once scrolled
  into view; every rendered internal link resolves to a built file.
- CI (`.github/workflows/ci.yml`, job `validate`) runs it on every pull request and before every
  deployment, with screenshots as an artefact. Locally: `npm run verify` (one browser launch;
  mind the headless Chrome disk cost on the owner's Mac).
- A new page is added to `PAGES` in `scripts/audit-ui.mjs` in the same change.
- The public site is audited the same way after every deployment (`pages.yml` job `verify`) and
  daily (`monitor.yml`), with `scripts/check-live.mjs` asking every linked live project.

# Failure behaviour

Any finding exits 1 and blocks the merge and the deployment (`pages.yml` needs `ci`).

# Verification

```sh
npm run verify                       # all gates, browser audit last
npm run verify -- --audit-only       # the browser audit alone
```
