---
schema: knowledge/v1
id: tera2-templates
kind: knowledge
class: lesson
title: "Zola 0.23 renders Tera 2: components, bracket indexing, and filters that bind tighter than ~"
description: "When a template under templates/ is written or changed."
status: verified
epistemics: observed
date: 2026-11-12
tags:
  - templates
  - zola
provenance:
  origin: authored
---

# Zola 0.23 renders Tera 2: components, bracket indexing, and filters that bind tighter than ~

## What happened

The first build of the site failed with "Unknown tag import" on `{% import "macros.html" as m %}`:
Zola 0.23.4 ships Tera 2 (the owner's zola fork pins `tera = "2.0.0"`), and Tera 2 has no macros.

## What holds

- Shared markup is a component: `{% component name(arg: string, other = default) %}…{% endcomponent %}`
  in `templates/components.html`, called as `{{ <name arg="text" other={expr} /> }}`. Components are
  global, but they do not see the page context: no `config` inside one (use `get_url`).
- Arrays index as `x[1]`; `x.1` is a parse error.
- Not available: `trim_start_matches`, `trim_end_matches`, `filter`, `concat`. Count with
  `set_global` in a loop instead of building arrays.
- A filter binds to the last operand of `~`: `a ~ "/" | json_encode` encodes only `"/"`. Parenthesise:
  `(a ~ "/") | json_encode | safe`. The JSON-LD in `partials/seo.html` broke this way once.

## Evidence

Commits 3126c82 (macros to components), 885b886 (JSON-LD parenthesised); `scripts/check-seo.mjs`
parses every JSON-LD block of the build, so the last class of error cannot ship silently.
