---
schema: adr/v1
id: adr-0003
kind: adr
title: Every public repository, original work only, derived through gh and glab
status: proposed
date: 2026-11-12
tags:
  - data
  - content
provenance:
  origin: authored
---

# 3. Every public repository, original work only, derived through gh and glab

## Context

The owner asked in Claude Code session `c345d42d-f403-4b60-a5d8-75d67c92d0a5` on 2026-11-12, verbatim
(excerpts): "vse rozvin na zaklade vsech mych public github.com/korczis a gitlab.com/korczis
projects, vse prolinkuj", "for github/gitlab use cli apps", "udelej to self promo / cv / like page",
"decent, but my style, deployed, professional, sourced, linked, sleek", "nic hard-coded, vse
infered" and "pridej skills sekci ... vse doloz, referencuj, derive / infere".

Measured that day: 447 public GitHub and 417 public GitLab repositories, 516 distinct by name.
250 are forks; dozens are mirrors of other people's code, some imported with their history squashed
(UPX, UCL, foremost, libnids, osmocom-bb) and some third-party security material (Social-Engineer
Toolkit, a leaked Zeus source). A professional showcase that listed them would claim work that is
not the owner's.

## Decision

- `scripts/fetch-index.mjs` reads both hosts through their CLIs (`gh api`, `glab api`) and writes
  `data/index.json`. A repository is listed as original when it is not a fork, the owner wrote at
  least half of its listed commits, its description does not say it is someone else's code, and
  it is not on the owner-curated `[index] mirrors` or `[index] hidden` lists in `data/projects.toml`.
  Forks, mirrors, hidden and empty repositories are counted and the counts are published.
- Categories are inferred from declarative rules (`keywords`, `languages`) per category in
  `data/projects.toml`; curated projects keep their curated category. Eleven categories, each a
  generated page.
- New pages: `/repositories/` (the full index, filterable) and `/about/` (profile and CV: skills,
  languages over the years, domains, selected work, sources), every figure linked to its evidence.
- The hidden list starts with five of the owner's repositories whose names or content do not suit
  a professional page (`atp`, `microcrawler-crawler-youjizz-com`, `the-shit`, `chujovinky`,
  `empty-repo`). This is the agent's proposal; the owner may change it with one line.

## Alternatives rejected

- Listing every public repository: claims other people's code as the owner's.
- A hand-written list: goes stale and contradicts "nic hard-coded, vse infered".

## Consequences

- `npm run index` needs authenticated `gh` and `glab`. It takes several minutes because GitLab's
  rate limit is respected. `npm run index -- --derive` re-applies rules and lists offline.
- `scripts/check-data.mjs` fails when a curated project falls out of the index, so a rule change
  that would hide featured work is caught before it ships.
