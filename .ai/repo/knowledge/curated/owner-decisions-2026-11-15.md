---
schema: knowledge/v1
id: owner-decisions-2026-11-15
kind: knowledge
class: fact
title: "The owner's answers of 2026-11-15: the experience map, the derived categories and unable.cz"
description: "Before changing data/projects.toml category rules, the private engagement map, or the unable.cz link."
status: verified
epistemics: observed
date: 2026-11-15
tags:
  - owner
  - data
provenance:
  origin: authored
---

# The owner's answers of 2026-11-15

Asked in Claude Code session 8ab4cca0-a58f-4aec-a06b-8c8a1a13b6c5 with AskUserQuestion; each
question and answer is quoted verbatim. The ADR acceptances of the same session are recorded in
each ADR's Acceptance section (adr-0001 to adr-0006).

## The private engagement map

- Question: "The private engagement map has values I inferred, marked 'owner to confirm': e1
  financial group (investigator, advisor) and e2 real estate (architect, lead engineer, AI
  engineer, data engineer). For e3 only the sector (insurance) is known, and e4 is empty. What
  should I do with them?"
- Answer: "e1 and e2 are correct"
- Done: the marks on e1 and e2 in `~/.config/korczis-hub/experience.toml` (owner-level, never
  committed, ADR 0006) read "owner confirmed 2026-11-15". The values were already live, so
  `data/experience.json` did not change. e3 and e4 remain the owner's to fill.

## The derived categories

- Question: "31 repositories changed category when the derivation rules were tightened (e.g. the
  crawlers moved from tools to data, the personal sites moved to web, gauc moved to libraries).
  This is already live. Keep it?"
- Answer: "Keep as derived"
- Done: nothing to change. The rules in `data/projects.toml` stand as reviewed; a later change
  to them is a new decision, not a reversal of a pending one.

## unable.cz

- Question: "unable.cz: the repository has GitHub Pages with the custom domain unable.cz
  (build_type legacy, status built), but https://unable.cz/ answers 404, so the hub shows no site
  link for it. What should happen?"
- Answer: "Fix its deploy"
- Found: DNS, the certificate, the CNAME and the last Pages build (2026-07-19, built) were all in
  order and gh-pages held index.html, yet every path answered 404: the published site was gone
  from Pages while its records said built.
- Done: a Pages rebuild from the unchanged gh-pages branch (requested 2026-11-15T16:56Z). After it,
  `/`, `/index.html` and `/robots.txt` answer 200. The hub links the site once the index
  is next derived (the six-hourly refresh), because its `site` comes from that probe, never by
  hand.
