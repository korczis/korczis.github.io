---
id: project.ui-uses-flowbite-pro
version: 1
kind: rule
title: Every page is built on Flowbite Pro
description: The site's templates adapt the owner's licensed Flowbite Pro marketing blocks on Tailwind 4 and the flowbite 4 plugin; no other kit, no Pro source file committed.
statement: Build every template from the matching Flowbite Pro block (marketing header, hero, feature, project portfolio, footer, 404), keep the Pro tokens (gray neutral, one primary, rounded-lg, the Pro type scale), load Flowbite JS for every data-* behaviour, and never commit a Pro source file.
status: active
class: blocking
depends_on: []
tags: [ui, flowbite, design-system, licence]
---

# Rationale

The owner holds a Flowbite Pro licence and requires it for every UI (ADR 0001). One design
system across the owner's sites (majordomus.dev, Kompendium, algoglyph, this hub) makes them read
as one body of work. The repository is public, so the licence also forbids publishing a Pro
source file as such.

# Required behaviour

- Sources: `~/dev/poppyhead/assets/vendor/flowbite/` (`flowbite-react-blocks-main/app/marketing-ui`)
  and the `flowbite-pro` skill. A template names the block it adapts in a `{#- … #}` comment.
- `templates/base.html` keeps the Pro marketing header (brand, collapse menu via
  `data-collapse-toggle`, theme toggle, actions) and the Pro footer. It is a public marketing
  layout, so the admin sidebar does not apply; the exemption is recorded owner-level in
  `~/.claude/skills/flowbite-pro/exempt.d/korczis.github.io.yaml`.
- Tokens live in `styles/app.css` `@theme`; charts read them through `--hub-*` (rule
  project.viz-component-layer), so a chart and a card cannot disagree.
- Flowbite JS is self-hosted (`static/js/vendor/flowbite.min.js`, copied by `scripts/vendor.mjs`).
- Follow the Flowbite LLM guidance (`https://flowbite.com/docs/getting-started/llm/`, the
  `llms.txt` of themesberg/flowbite): standard Flowbite markup and data attributes, not
  re-implementations.

# Failure behaviour

A template that does not follow Flowbite Pro is a review finding and is reworked before it lands;
`majordomus doctor` refuses a public tree carrying a licensed Pro file.

# Verification

```sh
node ~/.claude/skills/flowbite-pro/verify.mjs .   # S0-S5, exit 0
majordomus doctor                                 # licence flowbite-pro judged
```
