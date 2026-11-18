---
id: project.cases-derived
version: 1
kind: rule
title: Every client engagement with measurable sources has its own anonymised, derived case study; every figure says how it is known
description: scripts/build-cases.mjs writes one page per engagement of data/experience.json that has a sector and inferred capabilities, in every language, linked to its skills, services, technologies and public twins; the sector and roles are declared, the period and scale measured and rounded, the capabilities inferred and labelled so; no client, person, system or repository of an engagement is named.
statement: Derive the case studies only through scripts/build-cases.mjs from data/experience.json, data/experience-rules.toml and data/services.toml; label every block as declared, measured or inferred; publish the scale only as bucket floors; list a service only with its skill overlap (at least half of its skills, or the two best); link every skill, service, technology and public repository to its page; name no client, person, system or repository of an engagement; and keep the cases, front-matter, glossary, nda and audit gates passing.
status: active
class: blocking
depends_on: [project.services-derived@1, project.nda-never-named@1, project.everything-interlinked@1, project.pages-are-articles@1, project.data-measured@1]
tags: [content, evidence, cases, nda, links]

x-majordomus:
  reviewed_because: the decision is the repository's own gates (scripts/build-cases.mjs --check, scripts/check-front-matter.mjs, scripts/check-glossary.mjs, scripts/check-nda.mjs, scripts/audit-ui.mjs), run by the gate manifest in npm run check, npm run verify, the pre-push hook and CI; no validator of the Majordomus doctrine dispatches them
---

# Rationale

The owner's brief of 2026-11-18 (ADR 0010) asks for at most three strong, truthful case studies with
context, role, delivered system, provable scope, evidence and its origin, and the limits of
publication, and for stable, indexable URLs for them; the owner's order of the same day asks for
"concrete anonymised case studies, connected to every tech, stack and language, enforced via .ai".
The landing's client-work section already measures the engagements; a page per engagement gives each
one a URL, a share preview and the room to link everything it touches, without a word more than the
data holds.

# Required behaviour

- **Which engagements.** One page per engagement with a sector and at least one inferred capability
  (`content/cases/<sector>.md` and its language twins); the others are counted on the section page
  and on the landing, never given a page with nothing to show.
- **Labelled knowledge.** Roles are declared by the owner; the period and the scale are measured, the
  scale published as bucket floors (`+`); the capabilities are an inference from commits, paths and
  headings, said to be a signal of scope and never a business outcome.
- **Honest links.** A service is listed only with its overlap ("4 of its 8 skills"): those covering at
  least half of the service's skills, or the two best when none does. Every capability links its skill
  page, every technology its glossary term, every public twin its `/work/` page.
- **NDA.** No client, person, system or repository of an engagement; only the vocabulary of
  `data/experience-rules.toml`, rounded numbers and months (ADR 0006).

# Failure behaviour

`node scripts/build-cases.mjs --check` exits 1 when a case page is missing, stale or orphaned;
`scripts/check-front-matter.mjs` refuses a case page outside the schema; `scripts/check-nda.mjs`
refuses a denylisted name anywhere.
