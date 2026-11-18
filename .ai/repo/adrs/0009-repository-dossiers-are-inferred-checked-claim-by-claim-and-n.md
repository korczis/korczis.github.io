---
schema: adr/v1
id: adr-0009
kind: adr
title: Repository dossiers are inferred, checked claim by claim, and never written where a safety check refuses
status: accepted
date: 2026-11-18
tags:
  - content
  - data
  - nda
provenance:
  origin: authored
---

# 9. Repository dossiers are inferred, checked claim by claim, and never written where a safety check refuses

## Context

The owner asked in Claude Code session `f877b790-5df2-4d41-990a-fddee785c35e` on 2026-11-18 for a very
detailed page per project, NDA compliant (verbatim: "kazdy projekt by mel mit svoji page velice detailni,
ale byt NDA compliant - nezminovat zadna jmena, ale zminovat probelmmy, reseni, stack, byt prolinkovane,
mit mermaid grafy, zadna jmena, ale detailni popis").

Ten readers wrote one dossier per original repository through the forge APIs (README, tree, manifests;
no clone, nothing run). An independent sample of 12 found unsupported claims in 2, so every one of the 210
dossiers was then checked against its repository at the recorded commit by skeptical readers: 148 were
corrected or trimmed, 50 statements were marked unverifiable and lowered in confidence.

One original, `ratnet` (2014, a README only, described as an educational botnet), got no dossier: the
writer's safety check stopped it. The owner was asked at about 2026-11-18T03:50Z (AskUserQuestion),
question and answer verbatim:

- "Veřejný repozitář 'ratnet' obsahuje jen README s návrhem botnetu (bez kódu). Na webu, který teď slouží
  k náboru, by dostal vlastní stránku, OG náhled a záznam v llms.txt, a recruiter nebo HR LLM by ho mohl
  číst bez kontextu. Co s ním?" — "Vypsat jako bezpečnostní výzkum"

## Decision

1. `data/dossiers/<repo>.json` (schema `static/schemas/dossier.schema.json`) holds the inferred dossier of
   each original: summary, problem, solution, highlights, stack, a Mermaid flow and related originals, in
   English and Czech, with `sources.commit`, `read_at` and `confidence`. Rule `project.dossiers-inferred`
   and the gate `scripts/check-dossiers.mjs` keep them valid, NDA-clean and labelled as inferred.
2. A claim stays only when the repository shows it; the check is repeated when a repository's head moves.
3. Where the writer's safety check refuses a dossier, none is written by hand around it. `ratnet` stays
   listed, as the owner chose, on the generic page every original gets from its own metadata (its own
   description, language, year and links), with no dossier text.

## Consequences

- The per-repository pages render a dossier where one exists and the generic page otherwise.
- `check-dossiers` reports originals without a dossier (today: `ratnet`) without failing.
