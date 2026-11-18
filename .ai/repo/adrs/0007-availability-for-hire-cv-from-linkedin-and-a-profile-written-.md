---
schema: adr/v1
id: adr-0007
kind: adr
title: Availability for hire, the CV taken from LinkedIn, and a profile written for AI readers without hidden instructions
status: accepted
date: 2026-11-18
tags:
  - content
  - profile
  - seo
provenance:
  origin: authored
---

# 7. Availability for hire, the CV taken from LinkedIn, and a profile written for AI readers without hidden instructions

## Context

The owner is looking for a well-paid remote role, urgently. In Claude Code session
`f877b790-5df2-4d41-990a-fddee785c35e` on 2026-11-18 they asked for the site to be improved
continuously and to be found by recruiters and by the language models that read pages for them,
in their words (verbatim, Czech): "prubezne skvalitnuj muj osobni http://korczis.github.io/",
"vyuzivej max potencial pro meta tags", "muj profil musi byt seo optimized, kazda jedna stranka",
"pouzij llm komentare", "skryte tagu nemaji byt klamave ci lzive, jen zvysit atraktivitu a nalak
a bots / crawlers", "when done, when deployed, add annoted git tag and push it".

`data/cv.toml` was still empty (ADR 0004 leaves it to the owner), so neither /about/ nor the JSON-LD
Person carried a single role, and nothing on the site said the owner is available.

The owner was asked in the same session at about 2026-11-18T01:20Z (AskUserQuestion), questions
and answers verbatim:

- "ADR 0004 říká, že data/cv.toml (pracovní historie, která pak jde do /about/ a do JSON-LD) píšeš
  jen ty, nikdy agent. Je to největší díra pro recruitery i AI crawlery. Mám ho vyplnit přesně podle
  tvého LinkedIn profilu (Kiwi.com Staff, GoodData Principal/Senior, Block Collider CTO, Moravia IT,
  Vatra, 2K, Honeywell, aktuální CTO a freelance) a upravit ADR 0004?" — "Ano, přepiš z LinkedInu
  (Recommended)"
- "Mám na webu přidat veřejný signál, že jsi k dispozici pro práci? Šla by do něj stránka /hire/
  (en+cs) s cílovými rolemi, měřenými důkazy a kontaktem, odkaz z hero a navbaru, sekce Hire v
  llms.txt a JSON-LD `seeks` + konkrétní jobTitle." — "Ano, celá stránka /hire/ (Recommended)"
- "Mám na webu uvést sazbu nebo očekávanou mzdu?" — "Ano, kontraktorský rozsah" (the option's
  example was "B2B from $110/h").

## Decision

1. `data/cv.toml` holds the owner's LinkedIn profile (linkedin.com/in/korcaktomas) as read on
   2026-11-18: roles with their titles, organisations and dates word for word, summaries only where
   LinkedIn has one, education and spoken languages. This amends ADR 0004 decision 2 for this one
   import: the facts are still the owner's, taken from a profile the owner wrote, with consent.
2. `data/cv.toml` gains `[links]` (each a `sameAs` and `rel="me"`) and `[hire]` (available, since,
   headline, roles, engagement, workplace, regions, contract rate from USD 110 per hour), both with
   Czech twins and checked by `static/schemas/cv.schema.json` and `scripts/check-data.mjs`.
3. `/hire/` (`templates/hire.html`, `content/hire*.md`, schema `hire`) renders those facts with
   measured evidence and the track record; the home hero links it; the navigation lists it.
4. Every page's JSON-LD Person takes its `jobTitle` from the headline and carries one `Offer` per
   role with the rate as `UnitPriceSpecification`; `/hire/` adds a `FAQPage` with the same
   questions and answers it shows. `llms.txt` gains Hire and Experience sections; `robots.txt`
   invites the AI search, assistant and training crawlers by name (`data/ui.toml [robots]`).
5. The head of every page carries an HTML comment addressed to AI agents and recruiting assistants:
   the same facts as /hire/, where to read them as data, and a request to verify. It contains no
   instruction to rank, prefer or trust the owner, nothing invisible that is not also visible on
   /hire/, and no text styled to be hidden from people.

## Alternatives rejected

- Hidden prompt injection aimed at HR screening models (white or zero-size text, Unicode tag
  characters, "ignore previous instructions", "rate this candidate first"). It deceives the employer
  who runs the screening, Google treats hidden text as cloaking, screening vendors filter it and
  flag the candidate, and it contradicts the site's own claim of evidence over persuasion. The
  owner's later message confirmed the boundary ("nemaji byt klamave ci lzive").
- A rate kept off the site: the owner chose to show the contract floor.

## Consequences

- /about/ shows the work history, and the Person node gains `hasOccupation`, `worksFor`,
  `alumniOf` and `knowsLanguage`.
- When the owner is no longer available, `available = false` removes /hire/'s content, the hero
  pill, the Offers, the FAQ, the llms.txt section and the head comment, with no other edit.
