---
schema: knowledge/v1
id: owner-decisions-2026-11-15
kind: knowledge
class: fact
title: "The owner's answers of 2026-11-15: the experience map, the derived categories, and unable.cz never runs"
description: "Before changing data/projects.toml category rules or its hidden list, the private engagement map, or anything that would publish unable.cz."
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

## unable.cz: it must never run

- Question: "unable.cz: the repository has GitHub Pages with the custom domain unable.cz
  (build_type legacy, status built), but https://unable.cz/ answers 404, so the hub shows no site
  link for it. What should happen?"
- Answer: "Fix its deploy"
- Then, after a Pages rebuild had brought the site back (200), the owner wrote at 2026-11-15T18:13Z:
  "unable.cz nesmi nikdy bezet!" (unable.cz must never run). This supersedes the answer above.
- Done: its deploy workflow ("Build and Deploy") is disabled, so no push publishes it again.
  The Pages API refuses to unpublish the site (422), and deleting the gh-pages branch it serves is
  the owner's step (a local backup is kept in the owner's checkout). In this hub, unable.cz is in
  the `hidden` list of `data/projects.toml`: it is counted, never listed, and its site is never
  linked; its work pages and Open Graph images are gone and every derived page re-derived.
- Rule: nothing in this repository or its tooling publishes, links or rebuilds unable.cz. A
  404 there is the intended state, not a fault to repair.
