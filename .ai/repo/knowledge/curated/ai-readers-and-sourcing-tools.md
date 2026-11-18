---
schema: knowledge/v1
id: ai-readers-and-sourcing-tools
kind: knowledge
class: fact
title: "Answer engines and sourcing tools read visible text, JSON-LD and machine files; head comments reach almost none of them"
description: "Before adding a hire, profile or SEO signal to any page or machine file, or deciding where a fact about the owner should live."
status: verified
epistemics: inferred
date: 2026-11-18
tags:
  - seo
  - hire
  - machine-readable
  - profile
provenance:
  origin: authored
---

# Where machine readers of a profile actually look

Two kinds of software read this site on a recruiter's behalf. **Answer engines and assistants**
(ChatGPT search, Perplexity, Claude, Gemini, Copilot) fetch a page, turn it into text or markdown
and quote it. **Sourcing and screening tools** (LinkedIn Hiring Assistant, the AI layers of
Greenhouse, Ashby and Lever, Gem, SeekOut, hireEZ, Juicebox) build a candidate record from public
profiles and filter it. What follows is how they behave as their vendors and the extractor
libraries document it; it was not measured from this repository, hence `inferred`. What was
observed on this site is marked so.

## The channels that carry a signal, in order of reach

1. **Visible main text.** Every fetcher keeps it. The h1, the first paragraph and the headings are
   what a summary quotes; a fact that is only in markup or a comment is, for most readers, absent.
2. **JSON-LD.** Search engines and knowledge graphs parse it, and some assistants do. A node that
   states what the page does not show is treated as spam by Google's structured-data policy, so it
   is only worth having in parity with the visible text.
3. **`llms.txt` / `llms-full.txt`.** Read by some agents and answer engines when present, and read
   first-to-last under a token budget: what is not near the top may not be read. Observed here on
   2026-11-18: `## Hire` was the eighth H2, after every category.
4. **A markdown twin per page.** What a fetcher would have produced, minus its extraction errors.
5. **`resume.json` (JSON Resume 1.0.0).** The one open CV format CV tools and registries read
   directly; applicant tracking systems take a file at application time and score its parsed text.

## What is dropped

HTML comments are not text nodes. Readability (Mozilla, used by reader modes and many fetchers),
Trafilatura, Jina Reader and Firecrawl emit the extracted text or markdown and leave comments out,
so a comment in `<head>` reaches almost no reader that matters. ADR 0007's head comment is kept
only because it mirrors /hire/ and costs nothing; investing more there buys nothing.

Hidden or styled-away text (white on white, zero size, off-screen, Unicode tag characters) and
instructions addressed to a model are what screening vendors filter and flag, and what search
engines penalise as cloaking. It is also outside ADR 0007.

## FAQPage

Since August 2023 Google shows FAQ rich results only for well-known government and health sites,
so a FAQPage here earns no search feature. Its remaining value is to LLM readers, and only while it
matches the visible accordion question for question (observed here: five questions in JSON-LD over
four visible ones, because the list was kept in two templates).

## What sourcing tools filter on

Title and seniority, skills (and the span of evidence for each), location and **time zone**, work
**eligibility** (authorisation, visa), **availability** and start date, and the engagement type.
A field missing from every public surface is a filter the candidate silently fails. Only the owner
can state eligibility, notice and start date (ADR 0004); a page must never guess them.

## Consistency across profiles

Sourcing tools index LinkedIn and GitHub more than a personal site, and entity resolution, in
search engines and in LLMs alike, trusts what agrees across sources. One headline, one name
spelling, one location and the same links on the site, GitHub, GitLab and LinkedIn make one
person; four descriptions make four weak candidates. `sameAs` should name only the person's own
profiles: a product among them confuses the resolution. Observed here on 2026-11-18: the home h1,
/about/, /hire/ and the llms.txt summary each named a different role (ADR 0008).

## Where this is enforced

Rule `project.hire-surfaces` (one positioning, every page links /hire/, nothing hidden) and rule
`project.seo-derived` (structured data in parity with the page) turn the above into gates.
