---
schema: adr/v1
id: adr-0008
kind: adr
title: One positioning derived from the hire headline; due diligence and M&A move to the fourth role and the client-work proof
status: proposed
date: 2026-11-18
tags:
  - content
  - profile
  - seo
provenance:
  origin: authored
---

# 8. One positioning derived from the hire headline; due diligence and M&A move to the fourth role and the client-work proof

## Context

ADR 0007 put the owner's availability on the site and recorded, with the owner's consent, the
headline in `data/cv.toml [hire]`: "Staff engineer for AI agent infrastructure, Elixir and Rust". In the
same Claude Code session, `f877b790-5df2-4d41-990a-fddee785c35e` on 2026-11-18, the owner set the
goal for the whole site, in their words (verbatim, Czech and English as written):

- "Jak si najit nejlepe placeny, pro mne vhodny remote job, za usd."
- "Potrebuji asap"
- "Best fit"
- "chcu se co nejpee prodat, trosku to exploitnipres hidden comments, pres meta tags at me najde
  ta nejlepsi cilovka"
- "musim byt videt vsude"
- "uvedom si, ze jsem ai/llm engineer,takze i pouziti shady/grey/podprahovych technik je
  legitimni demonostrace schopnosti, nic ilegal, ale vyzdimej to na dren"
- "skryte tagu nemaji byt klamave ci lzive, jen zvysit atraktivitu a nalak a bots / crawlers"
- "udelej to superlakave jak pro ctenare, navstevnika, hr, bot, crawler, ai, llm, vse enforce via
  .ai/ at se veskere know how reuse a rozsiruje from now on"

A pool of five reviewers (SEO and previews, LLM and sourcing tools, landing and conversion,
visualisation, the p5 identity) audited the build of `feature/hire-profile` at `bfb9c73` and
production. They found the site describing the owner as four different people:

- the home h1 is the hero title "Due diligence, M&A and AI engineering, on evidence." and the home
  `seo_title` is "Software that proves its work", neither naming a role or availability;
- /about/ says "Software engineer · Brno" and reads availability from `gh.profile.hireable`, a
  second source next to `cv.hire.available`;
- /hire/ and the JSON-LD `jobTitle` carry the headline;
- the `llms.txt` blockquote is the site's tagline and `## Hire` is its eighth H2, after every
  project category.

The answer engines and sourcing tools that read pages for recruiters match on title, seniority,
availability and the agreement of a person's surfaces
(`.ai/repo/knowledge/curated/ai-readers-and-sourcing-tools.md`); a hiring manager gives the landing
page seconds. Four positionings dilute every one of them.

## Decision

1. **One positioning, from the headline.** `cv.hire.headline` (`headline_cs` in Czech) is the only
   source of the owner's role. While `cv.hire.available`, it leads the home h1 after the author's
   name, the /about/ role line, the /hire/ h1, the `seo_title` of home, about and hire, the profile
   OG cards, the JSON-LD `jobTitle`, the `llms.txt` blockquote (with `## Hire` its first section)
   and `basics.label` of a derived `resume.json`. Availability is read only from
   `cv.hire.available`. Rule `project.hire-surfaces` carries the contract and names its gates.
2. **Due diligence and M&A stay, one layer down.** The former hero title becomes the home sub-lead.
   Due diligence and M&A are the fourth of the owner's hire roles ("Fractional CTO and technical due
   diligence: data, OSINT, M&A") and the subject of the anonymised client-work proof (ADR 0006); they
   are no longer the site's first sentence.
3. **Hiring first, on the visible page.** The hero pill states availability and links /hire/; the
   calls to action are Hire, Email and LinkedIn in that order; every page's navigation carries a
   Hire button; the home page closes on a hiring section. The proof next to the hero is derived:
   the `cv.roles` entries that have a URL and the measured Majordomus release, never typed.
4. **The signal travels where machines read.** Visible main text first, then JSON-LD that states
   only what the page shows (rule `project.seo-derived` v2), `llms.txt`, `resume.json` and, later,
   a markdown twin per page. The head comment of ADR 0007 stays as it is and is not extended:
   most HTML-to-text extractors drop comments.
5. **Within the owner's own boundary.** "Nic ilegal" and "nemaji byt klamave ci lzive" bound the
   request: no hidden or styled-away text and no instruction aimed at a screening model (ADR 0007).
   What demonstrates the owner's skill as an AI engineer is a profile every machine reader parses
   correctly and that agrees with itself everywhere, proven by gates.

## Alternatives rejected

- Keeping the M&A hero title as the h1: the owner asked for the best-paid remote role that fits,
  and the hire headline recorded under ADR 0007 names AI agent infrastructure, Elixir and Rust; a
  first sentence about due diligence sends a sourcing tool to a different search.
- A positioning per surface, tuned to each reader: it is the inconsistency entity resolution and
  sourcing tools penalise, and every copy drifts.
- Hidden or styled-away text, Unicode tag characters, or instructions addressed to HR screening
  models: rejected in ADR 0007 for deception and cloaking, and outside the owner's own boundary.
- Spending more on the head comment: extractors drop it, so it reaches almost no reader.
- A typed career length ("Fifteen years"): rule `project.data-measured`; the span is computed
  from `cv.roles` where it is shown, and SEO fields carry no typed count (rule
  `project.front-matter-contract` v2).
- Recording evidence per role in `data/cv.toml`: the file holds facts the owner states (ADR 0004,
  ADR 0007); the evidence of each role is inferred from the role's own words against the glossary
  and the measured languages.

## Consequences

- `available = false` returns the h1 to the hero title and removes every hire signal with no other
  edit; a new headline in `data/cv.toml` reaches every surface at the next derive.
- New gates `profile` (`scripts/check-profile.mjs`) and `resume` (`scripts/build-resume.mjs
  --check`) join the manifest; `check-seo.mjs`, `build-og.mjs --check`, `build-llms.mjs --check`
  and `check-front-matter.mjs` grow the assertions rules `project.seo-derived` v2,
  `project.front-matter-contract` v2 and `project.hire-surfaces` describe.
- The hourly rate chip ADR 0007 chose stays. Whether the hero should show only availability, so the
  rate does not anchor a full-time offer, is the owner's question, not decided here.
- The owner's other surfaces (GitHub bio, GitLab profile, LinkedIn) are not written from this
  repository; agreeing with them is a sync kit the owner applies, after consent.

## Acceptance

Proposed on 2026-11-18 from the owner's request quoted above; it awaits the owner's acceptance,
which is recorded here verbatim when given.
