---
id: project.skills-evidenced
version: 1
kind: rule
title: Every language and technology has its own page with derived evidence; every project page embeds its live README
description: Each language and technology the measured data names (repositories' languages, curated stacks, the mined engagements' technologies) has a glossary term whose page shows the evidence derived from the data (repositories, how each uses it, what it solves, years, categories, live sites, a reference graph) and the client use cases without names, dates or numbers; each work page renders its repository's README live from the forge instead of copying it.
statement: Give every language and technology the data names a term in data/glossary.toml; derive its evidence only through scripts/lib/skills.mjs into data/skills.json and the term page's article; show client work only as sector, role and capability; embed a project's README on its work page live from its forge, sanitised, never copied into this repository; and keep the glossary, derive and audit gates passing.
status: active
class: blocking
depends_on: [project.everything-interlinked@1, project.data-measured@1, project.nda-never-named@1, project.pages-are-articles@1]
tags: [content, evidence, glossary, links]

x-majordomus:
  reviewed_because: the decision is the repository's own gates (scripts/check-glossary.mjs, scripts/build-glossary.mjs --check through the derive gates, scripts/audit-ui.mjs), run by the gate manifest in npm run check, npm run verify, the pre-push hook and CI; no validator of the Majordomus doctrine dispatches them
---

# Rationale

The owner's order of 2026-11-18: every technology, stack and language has its own clickable page
that proves the skill (evidence, links, a reference graph, a detailed account of what it was used
for), client work appears as use cases with principle and intent and never a name or a number,
and each project's page shows the project's own README, always current, without copying it (DRY).
A skill named anywhere on the site without a page that proves it is a claim; a README copied into
this repository is stale the day its project moves.

# Required behaviour

- **Coverage.** Every name in `data/index.json` languages, in the languages of `data/recent.json`
  at or above `MIN_SHARE`, in a curated stack of `data/projects.toml` and in the technologies of
  `data/experience.json` resolves to a term of `data/glossary.toml` (by id, name or alias). A new
  language in the data is a new term (its definition and reference are the only hand-written
  words), never an exemption.
- **Evidence is derived.** `scripts/lib/skills.mjs` is the one place that decides which repository
  uses a term and how (`primary`, a measured `code` share, `stack`, `topic`), the years, the
  categories, the live sites and the engagements. `scripts/build-glossary.mjs` writes it to
  `data/skills.json` and derives each term page's article from it; `templates/term.html` and the
  reference graph (`term.evidence`, `static/js/viz/graph.js`) read only that file. No count, list or
  link of evidence is typed by hand.
- **Client work as use cases.** An engagement appears on a term page as its sector, its roles and
  the principle and intent of its capabilities (`data/experience-rules.toml`), linked to the
  landing's experience section. Never a client, a person, a date, a period or a number
  (ADR 0006, rule `project.nda-never-named`).
- **Everything links.** A repository leads to its work page (else its forge), and to its forge,
  site and category; a category leads to its page; a KPI leads to where it is shown; a graph node
  to its page (rule `project.everything-interlinked`).
- **The README is live.** A work page renders its repository's README in the browser from the
  forge (`static/js/components/readme.js`: marked, then DOMPurify; relative images and links
  rebased on the forge, headings moved under the card, in-page anchors kept). The measured excerpt
  stays as the fallback for readers and crawlers without JavaScript. The README is never copied
  into this repository.

# Failure behaviour

`scripts/check-glossary.mjs` fails on a measured name without a term and on a term no page names.
The derive gates fail on a stale `data/skills.json` or term page (`npm run derive` fixes both).
`scripts/check-front-matter.mjs` fails on a term page outside its schema. `scripts/audit-ui.mjs`
fails on a work or term page with a console error, a failed request to this site (a README image
rebased wrongly), an unresolved link or anchor, an axe violation or horizontal overflow.

# Verification

```sh
npm run derive && npm run check
npm run verify
```
