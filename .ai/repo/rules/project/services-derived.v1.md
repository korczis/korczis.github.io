---
id: project.services-derived
version: 1
kind: rule
title: Services, skills, knowledge and domains form one derived, interlinked model; only the words are written
description: Every service (data/services.toml) and every skill (a capability of data/experience-rules.toml) has its own page in every language; the owner writes only their words, while the skills a service draws on, the technologies, the public evidence, the client use cases (sector and role only) and the articles are derived by scripts/lib/services.mjs, and every skill links its concept (a glossary term), its domain, its services and its evidence.
statement: Write a service's words in data/services.toml and a skill's in data/experience-rules.toml only; derive everything else through scripts/lib/services.mjs into data/services.json and the generated pages; give every skill a glossary concept and a domain; name no client, person, date or number in any service, case or skill; link every service, skill, concept, technology and repository to its page; and keep the services, glossary and audit gates passing.
status: active
class: blocking
depends_on: [project.skills-evidenced@1, project.everything-interlinked@1, project.nda-never-named@1, project.pages-are-articles@1, project.data-measured@1]
tags: [content, evidence, services, skills, knowledge, links]

x-majordomus:
  reviewed_because: the decision is the repository's own gates (scripts/build-services.mjs --check, scripts/check-glossary.mjs, scripts/check-experience.mjs, scripts/check-nda.mjs, scripts/audit-ui.mjs), run by the gate manifest in npm run check, npm run verify, the pre-push hook and CI; no validator of the Majordomus doctrine dispatches them
---

# Rationale

The owner's order of 2026-11-18: a Services section (due diligence, M&A, digital forensics,
digital investigation, reputation management, and what the public work shows), a page per service
and per skill, every piece of knowledge, domain and problem integrated, detailed and evidenced,
abstract client references only, everything derived and interlinked, enforced for the future.
One vocabulary carries it: the capabilities that infer the experience section from the owner's
work are the skills the services draw on, so a skill named on the home page, on a service and on
its own page cannot drift apart.

# Required behaviour

- **The model.** Domain (`[domains]`) → skill (`[capabilities]`, with its glossary concept `term`
  and the keywords that infer it) → service (`data/services.toml`, `skills` in order of strength).
  Technologies and repositories hang off skills through measured data (rule
  `project.skills-evidenced`). A new skill is a capability with words, a domain, a concept term,
  categories and keywords; a new service is words and skills. Nothing else is typed.
- **Derived evidence.** `scripts/lib/services.mjs` alone decides a skill's public repositories
  (its own words matched through the experience inference, `public_work`, then the most recent of
  its catalogue categories), its client engagements and its technologies, and folds them into the
  services. `scripts/build-services.mjs` writes `data/services.json`, `content/services/` and
  `content/skills/` with derived articles; the templates and the graph (`services.graph`) read only
  those.
- **NDA.** A service's cases are abstract (problem, approach, outcome); an engagement appears as
  its sector and roles. No client, person, company, codename, private repository, domain, date or
  number anywhere in the section (ADR 0006, rule `project.nda-never-named`). Public sources and
  standards are proper nouns and may be named.
- **Interlinked.** Every service links its skills; every skill its concept, domain, services,
  technologies (to their evidence), repositories (work page, forge, category) and engagements (to
  the experience section); the graph links every node; navigation, the palette and the footer
  list both sections (`data/nav.toml`).

# Failure behaviour

`node scripts/build-services.mjs --check` fails on a stale page or `data/services.json`.
`scripts/check-glossary.mjs` fails on a concept term no page names or a measured name without a
term. `scripts/check-experience.mjs` fails on a key outside the vocabulary. `scripts/check-nda.mjs`
fails on a denylisted name. Zola fails on a broken `@/` link; `scripts/audit-ui.mjs` on a broken
rendered link, an axe violation, a console error or overflow on any service or skill page.

# Verification

```sh
npm run derive && npm run check
npm run verify
```
