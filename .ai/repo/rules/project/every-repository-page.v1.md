---
id: project.every-repository-page
version: 1
kind: rule
title: Every original repository on GitHub and GitLab has its own complete page, derived and gated
description: The original repositories of data/index.json (both forges, merged) are the one set; each has a work page in every language with a title, description, SEO title, Open Graph card, canonical, hreflang and SoftwareSourceCode JSON-LD derived from measured facts, recent ones dated by period and the rest as honestly dated archive; the scheduled refresh re-derives them and a gate fails on any repository without a page or a page that is not complete.
statement: Never choose which repositories get a page and never type a page's metadata; the original repositories of data/index.json decide the set, data/recent.json measures each, scripts/build-work.mjs writes every page in every language from measured facts, and scripts/check-work-pages.mjs must pass on the built site.
status: active
class: blocking
depends_on: [project.data-measured@1, project.seo-derived@2, project.front-matter-contract@2, project.i18n-everywhere@1, project.everything-interlinked@1, project.nda-never-named@1]
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
  repository's own words in that language, recognised by its letters: the curated tagline, else
  its description however short, else its README excerpt; whole when long enough, else within a
  sentence that adds its state and category; else a sentence derived from category, language,
  years and last commit), `seo_title` (name, what it is, years, author,
  the longest form within the limit), `og_title` and `og_description` (facts: category,
  languages, years, recent or archive, forges, stars, live site, supervision), its own
  `og_image`, `keywords` (name, category, languages, topics, years, forges, author), glossary
  `terms`, `updated` (the last commit), and an article that links the category, the languages'
  terms, the source on every forge and the related work of the same category (by shared
  languages, then time).
- **Own words only.** A README excerpt or description that several repositories carry verbatim is
  marked shared in `data/recent.json` (`readme_shared`, `description_shared`, measured over the
  whole set by `scripts/fetch-recent.mjs`). A shared README excerpt is a generator's or a
  template's paragraph: it is never a description, a title or the page's "what it is". A shared
  description is used with the repository's name. Every description and `og_description` (which
  starts with the name) is unique.
- **Languages.** A repository whose forge reported no breakdown by bytes keeps the index's
  primary language: in its tags, keywords, article, card and JSON-LD `programmingLanguage`; no
  page carries an empty `programmingLanguage` or says "shares by bytes" without a breakdown.
- **In the page's language.** Every date on a page is written with the language's month names
  (`derive_months`, `derive_date`), in the template as in the generator, and every derived value
  of a visual's title or lead (the window, the refresh cadence) comes from the data through the
  viz block's `vars`, never typed in a string.
- **Honestly dated archive.** A repository with no commit in the recent window is labelled
  archive with its first and last year everywhere it appears: the page's badge and facts, its
  card pill, its JSON-LD `creativeWorkStatus`, `llms-full.txt`, `site.json` and the /work/ list,
  where the archive is grouped by the year of the last commit.
- **Machines.** The page's JSON-LD entity is a `SoftwareSourceCode` with a `codeRepository` (and
  `sameAs`) for every forge, languages, genre (category), topics, image, dates and state;
  `llms-full.txt` names the page in every language, `site.json` too (`repositories[].pages`, and
  `pages[]` with the repository's category); the sitemap lists every page with `lastmod`.
- **Tag pages.** The page links each of its tags (its category and languages) to the tag's own
  page (`/tags/<tag>/`), not only the tag index.
- **Interlinked.** The repositories table and the landing's recently-active list link each
  repository to its page through `get_page` (the build fails on a missing page); the link index
  carries every work page for the visuals.
- **Previews stay small.** `scripts/build-og.mjs` quantises every card to 16 colours with
  pngquant, keeps only the PNG (never the SVG it was drawn from), and holds every card within
  the schema's `og_image` `x-max-bytes`; it draws the page's real address and a pill with a
  measured fact of the page. pngquant is deterministic for one version, not across versions
  (Ubuntu's 2.x in the refresh, Homebrew's 3.x): `data/og.json` records the version that wrote
  each card, and a card is rendered again only when its card changed, never for a version alone.
- **Dropped honestly.** A GitLab twin that joined its GitHub repository is `merged` (with
  `into`) in `data/index.json` `dropped`, matched by forge URL or slug, never `gone`.
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
dates and its measured state, a non-empty `programmingLanguage` when a language is known, a link
to one of its own tag pages, or its entry in every language in `llms-full.txt` and `site.json`
(with its category in `pages[]`). `node scripts/check-seo.mjs` exits 1 on a duplicate
description or `og:description`; `node scripts/build-og.mjs --check` on a card over its byte
budget or a renderer `.github/workflows/refresh.yml` does not install; `node scripts/check-data.mjs`
on a dropped repository called gone that is the twin of a listed one.

# Verification

```sh
node scripts/fetch-recent.mjs --derive --check
node scripts/build-work.mjs --check
node scripts/build-og.mjs --check
node scripts/check-data.mjs
npm run build && node scripts/check-work-pages.mjs && node scripts/check-seo.mjs
```
