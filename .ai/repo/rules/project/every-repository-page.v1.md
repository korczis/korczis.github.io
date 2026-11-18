---
id: project.every-repository-page
version: 1
kind: rule
title: Every original repository on GitHub and GitLab has its own complete page, derived and gated
description: The original repositories of data/index.json (both forges, merged) are the one set; each has a work page in every language with a title, description, SEO title, Open Graph card, canonical, hreflang and SoftwareSourceCode JSON-LD derived from measured facts, recent ones dated by period and the rest as honestly dated archive; the scheduled refresh re-derives them and a gate fails on any repository without a page or a page that is not complete.
statement: Never choose which repositories get a page and never type a page's metadata; the original repositories of data/index.json decide the set, data/recent.json measures each, scripts/build-work.mjs writes every page in every language from measured facts, and scripts/check-work-pages.mjs must pass on the built site.
status: active
class: blocking
depends_on: [project.data-measured@1, project.seo-derived@1, project.front-matter-contract@1, project.i18n-everywhere@1, project.everything-interlinked@1, project.nda-never-named@1]
tags: [content, seo, open-graph, derived, machine-readable, automation]

x-majordomus:
  reviewed_because: the decision is the repository's own gates, scripts/fetch-recent.mjs --derive --check, scripts/build-work.mjs --check and scripts/check-work-pages.mjs, which the gate manifest runs in npm run check, npm run verify, the pre-push hook, CI and the refresh; no validator of the Majordomus doctrine dispatches them
---

# Rationale

The owner's standing order (Claude Code, 2026-11-18, verbatim): "kazdy jeden projekt musi mit
svoji dokonalou (dokonala znamena seo optimezed, llm exploited, with all seo, all og/social
stuff/preview) enforced from now on", "nezapomen, ze mame gitlab.com/korczis i github.com/korczis"
and "importovat vsechny public github/gitlab projekty, pregenerovat veske pages, udelat tooling
ui/ux/dx vice dynamic, generic (zajistit aby vse bylo vzdy up-to-date)". Until then only the
repositories with a commit in the last 48 months had a page; the older original work was a row in
a table, invisible to search engines, social previews and language models. ADR 0003 already
decides which repositories are the owner's work; this rule gives each of them a page, and the
"exploited" part stays within ADR 0007: every word is visible, measured and true, nothing hidden.

# Required behaviour

- **One set.** The original repositories of `data/index.json` (ADR 0003: not a fork, not a mirror,
  not hidden; GitHub and GitLab merged by name, and a GitLab twin whose dots became dashes joins
  its GitHub repository by slug) are the set. Nothing else chooses.
- **Measured, incrementally.** `scripts/fetch-recent.mjs` (`npm run recent`) writes every one of
  them into `data/recent.json`: latest commits, languages, README excerpt, and `period` (the
  smallest window of `data/projects.toml [recent]` that holds the last commit) or `null` for the
  archive. A repository whose host saw no activity since the stored measurement keeps it; `--all`
  asks every one again. `--derive --check` fails when an original repository has no measurement.
- **One page each, in every language.** `scripts/build-work.mjs` writes `content/work/<slug>.md`
  and `<slug>.cs.md`, all from measured facts: `title` (the name), `description` (the
  repository's own words in that language, recognised by its letters, else a sentence derived
  from category, language, years and last commit), `seo_title` (name, what it is, years, author,
  the longest form within the limit), `og_title` and `og_description` (facts: category,
  languages, years, recent or archive, forges, stars, live site, supervision), its own
  `og_image`, `keywords` (name, category, languages, topics, years, forges, author), glossary
  `terms`, `updated` (the last commit), and an article that links the category, the languages'
  terms, the source on every forge and the related work of the same category (by shared
  languages, then time).
- **Honestly dated archive.** A repository with no commit in the recent window is labelled
  archive with its first and last year everywhere it appears: the page's badge and facts, its
  card pill, its JSON-LD `creativeWorkStatus`, `llms-full.txt`, `site.json` and the /work/ list,
  where the archive is grouped by the year of the last commit.
- **Machines.** The page's JSON-LD entity is a `SoftwareSourceCode` with a `codeRepository` (and
  `sameAs`) for every forge, languages, genre (category), topics, image, dates and state;
  `llms-full.txt` and `site.json` name every page; the sitemap lists every page with `lastmod`.
- **Interlinked.** The repositories table and the landing's recently-active list link each
  repository to its page through `get_page` (the build fails on a missing page); the link index
  carries every work page for the visuals.
- **Previews stay small.** `scripts/build-og.mjs` quantises every card to 32 colours with
  pngquant (deterministic; the encoder is recorded in `data/og.json`), draws the page's real
  address and a pill with a measured fact of the page.
- **Always current.** `npm run refresh` (and `.github/workflows/refresh.yml`) runs data, index,
  recent and derive, so a new repository on either forge gets its page, and a repository that
  leaves the set loses it, with no hand edit.

# Failure behaviour

`node scripts/fetch-recent.mjs --derive --check` exits 1 when an original repository has no
measurement; `node scripts/build-work.mjs --check` exits 1 on a missing, stale or orphaned page or
on two repositories sharing a slug; `node scripts/check-work-pages.mjs` exits 1 on the built site
when a repository has no page in some language, a work page has no repository, or a page lacks
its title, description, Open Graph tags or image (1200x630), canonical in the sitemap with a
lastmod, hreflang for every language and x-default, a SoftwareSourceCode with every forge, its
dates and its measured state, or its entry in `llms-full.txt` and `site.json`.

# Verification

```sh
node scripts/fetch-recent.mjs --derive --check
node scripts/build-work.mjs --check
npm run build && node scripts/check-work-pages.mjs
```
