---
schema: knowledge/v1
id: landing-conversion
kind: knowledge
class: lesson
title: "The landing is read in ten seconds by a hiring team and in ten minutes by an engineer; its chapters, its CTA budget and what was dropped"
description: "Before adding, moving or removing anything on the home page (templates/index.html), or a call to action, a figure, a personalisation or a visual there."
status: verified
epistemics: inferred
date: 2026-11-18
tags:
  - landing
  - hire
  - ui
  - honesty
provenance:
  origin: authored
---

# What the landing is for, and what it refuses

## The two readers

- **Ten seconds, a hiring team.** It needs, in the first screen at 375x667 and 1440x900: the name and
  the role (the h1 from `cv.hire.headline`), availability and the rate (the pill), a way to write (a
  `mailto:`), a way to read more (`/hire/`), and proof that the role is real (the proof strip:
  employers the CV links and the Majordomus release). Just below the fold: the hiring facts as chips
  (start, work authorization, relocation, time zone, engagement), each a link to its `#terms-<key>`
  row, so a sourcing filter's question has a stable address.
- **Ten minutes, an engineer.** The chapters after the terms: the track record with computed tenure,
  a reading path with Zola's reading time, the roles with measured chips, the Majordomus case study,
  the anonymised client work, the skills table with evidence, how the repositories are counted, the
  live instruments, how the page is proven (`data/gates.json`), what is shipping now, the archive of
  visuals, the FAQ and the contact.

The order and the ids are the contract of `project.landing-contract`; `scripts/check-landing.mjs`
gates them.

## The CTA budget

At most four `mailto:` links in `<main>`: the hero's Email, the terms panel's Email and one in each
contact card. No role card asks for mail; the copy-email field lives only in Contact. More asks read
as pressure and dilute the one that matters; fewer leave a reader at the bottom with no way out.
Every Email carries `data-mail-role`, so `?role=<slug>` names the role in the subject.

## ?role= personalises without cloaking

An outreach link may carry `?role=<slug>` (slugs from the English heading, aliases kept in
`data/role-slugs.json` so a reworded role does not break a sent link). It adds one visible badge,
moves the role's card first with CSS order and rewrites the mail subjects. The server HTML is always
the default page and the canonical stays `/`: the same content for people and bots.

## Honest labels

- A span of public repositories is public evidence, never "years of experience".
- Forge figures are listings (`GitHub listings`), because a repository on both forges is one
  repository; the merged and original counts follow, and the provenance chart shows each step.
- The supervised count says "this site included"; Majordomus supervises, it is not "adopted".
- A library the owner does not claim (glossary `claimed = false`: Chart.js, Cytoscape.js) is never a
  skill, through the same flag that keeps it out of `knowsAbout`: not in `#skills`, `#roles` or the
  sidebar's skillset. The spec's separate `data/ui.toml [skills].exclude` list was not created, so
  there is one list, not two that can drift. A project's own stack in a data island (the ecosystem
  graph) still names such a library: that is a fact about the project, not a claimed skill.

## Small screens

- The FAQ is the Flowbite accordion under md (first question open, the others one tap away) and the
  grid from md up, from one list: a phone reader does not scroll six answers to reach Contact.
- Deep links (`#terms-*`, `#faq-*`, a chapter) land below the fixed topbar (`scroll-mt-24`,
  WCAG 2.2 SC 2.4.11); `scripts/audit-ui.mjs` navigates to them at both first viewports.

## What was tried and dropped, and why

- **A commit-hours overlap simulator** (when in the day commits land, as proof of US overlap): the
  sample is the agent-co-authored commits, so it is biased; it exposes night-hour patterns; its polar
  component was not registered; and it needs the owner's consent. The overlap is stated by the owner
  instead (`cv.hire.overlap`, ADR 0007 addendum).
- **A sticky mobile hire bar**: it covers content on hash navigation (WCAG 2.2 SC 2.4.11, focus not
  obscured) and reads as pushy; the navbar's Hire me already sits in every first screen.
- **Career eras and a derived arc** ("games, data, AI"): assigning eras is an interpretation, and its
  counts of roles and organisations inflated the record. The track record shows the CV's own roles.
- **A live clock, a second live GitHub poller, a scrollspy chapter nav, sortable skill columns and a
  linked-focus bus**: each cost viewport, motion or JavaScript for little reading value; the pulse is
  the page's one live poller, and the skills filter is radio buttons styled as Flowbite tabs (no JS).
- **A copy-email input in the hero** and **a mailto on every role card**: over the CTA budget.

## Evidence

The landing build spec of session `f877b790-5df2-4d41-990a-fddee785c35e` (three concepts judged by a
hiring-manager, a staff-engineer and a machine-reader judge; the evidence showcase as the spine with
grafts from the hiring-first concept). Rule `project.landing-contract`; gate `landing`.
