---
schema: adr/v1
id: adr-0006
kind: adr
title: Experience on the landing page is mined from private sources into anonymised facts, guarded by an NDA gate
status: proposed
date: 2026-11-14
tags:
  - content
  - profile
  - legal
provenance:
  origin: authored
---

# 6. Experience on the landing page is mined from private sources into anonymised facts, guarded by an NDA gate

## Context

The owner wrote in Claude Code session `8ab4cca0-a58f-4aec-a06b-8c8a1a13b6c5` on 2026-11-14 (about
20:50 UTC), verbatim except for the client names, which are replaced by `[client]` because this
repository is public and the work is under a legal NDA:

> mnohem vic rozsir self-promo landing page - zamer se na zkusenosti s dd/m&a/ai - nezminuj zadna
> jmena, ale zmin co korcak resil pro firmy jako [client]/[client]/[client]/[client] - nezminuj
> zadna jmena, je to pod legal NDA, ale detailne dynamicky / infered / derived / generic /dynamic
> integruj

The experience in question (due diligence, M&A analysis, AI engineering for large clients) lives in
private repositories on the owner's machine, not in any public source the hub measures. Writing it
by hand would contradict rule `project.data-measured`; copying from the private sources would breach
the NDA. Even a list of the names to avoid, committed here, would disclose the client relationships.

## Decision

1. **The private half stays private.** The engagement map (neutral id, the client's name, the local
   sources, the owner's declared roles) and the NDA denylist live in `~/.config/korczis-hub/`, owner-
   level files that are never committed. CI reads the denylist from the secret `NDA_DENYLIST`.
2. **Mined, not written.** `scripts/mine-experience.mjs`, generic code, measures each engagement's
   sources through git and writes `data/experience.json` with published facts only: a neutral id, a
   sector key and capability keys from the public controlled vocabulary in
   `data/experience-rules.toml` (capabilities inferred by keyword rules, the matched text never
   kept), the period, rounded scale buckets, and public technology names. Every visible sentence
   comes from generic templates in `i18n/experience.toml`. A fact no source shows is declared by the
   owner in the private map (ADR 0004's principle).
3. **Gated.** `scripts/check-nda.mjs` refuses any denylisted name, private source name or client
   name in a tracked file, the built site or a commit message of the branch, printing the location
   and never the name; under CI without the list it fails closed. `scripts/check-experience.mjs`
   holds the data to its schema and vocabulary.
4. **Interlinked and simulated.** The landing page shows the experience as capability cards linked
   to their glossary terms and to the work that shares them, and as a simulator (engagements by
   capability over time) under rule `project.viz-ergonomics`.

## Alternatives rejected

- Hand-written case studies: unmeasured claims (rule `project.data-measured`) and one careless
  sentence from an NDA breach.
- A denylist committed to the repository: it would publish the very names it protects.
- Leaving the experience off the site: the owner asked for it explicitly and in detail.

## Consequences

- The owner sets the secret once: `gh secret set NDA_DENYLIST -R korczis/korczis.github.io <
  ~/.config/korczis-hub/nda-denylist.txt`; until then CI's NDA gate fails closed.
- Mining runs only on the owner's machine (the sources are there); CI checks the committed result.
- Engagements without a local source show only what the owner declares in the private map.
