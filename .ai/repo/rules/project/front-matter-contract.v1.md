---
id: project.front-matter-contract
version: 1
kind: rule
title: Pages are front matter plus data; nothing is maintained by hand
description: Every page is described by front matter that matches static/schemas/front-matter.schema.json, everything else is derived from data that the scheduled refresh re-measures, and the whole site is published as data (site.json, llms.txt).
statement: Describe a page only in its front matter (schema-checked), derive everything else from data/, and let the scheduled refresh keep the data current; never add a figure, a link list or a page that someone must remember to update.
status: active
class: blocking
depends_on: [project.data-measured@1, project.seo-derived@1]
tags: [content, derived, automation, machine-readable]

x-majordomus:
  reviewed_because: the decision is the repository's own gate, scripts/check-front-matter.mjs and every generator's --check, which the gate manifest runs in npm run check, npm run verify, the pre-push hook and CI; no validator of the Majordomus doctrine dispatches it
---

# Rationale

The owner asked for a showcase that needs no manual upkeep and that machines can read
("zadne rucni udrzovani, at se to da strojove zpracovat"). A site whose pages are front matter
over measured data stays true by itself; a site with typed figures goes stale on the first day.

# Required behaviour

- Hand-written: the front matter of the hand pages in `content/` (not the generated category,
  work and glossary pages), the words of `data/projects.toml` (catalogue, categories with their
  inference rules, mirrors and hidden lists), `data/glossary.toml`, `data/site.toml`, the interface
  texts in `i18n/*.toml`, and the owner's facts in `data/cv.toml` (ADR 0004). Nothing else.
- Front matter matches `static/schemas/front-matter.schema.json` (served at
  `/schemas/front-matter.schema.json`); `scripts/check-front-matter.mjs` validates it.
- Derived, each with a `--check`: the translation tables and the client key list in `zola.toml`
  (`build-i18n.mjs`), category pages, glossary pages (`build-glossary.mjs`), one page per project with a commit in the last
  48 months (`content/work/`, from `data/recent.json`, the last commit date decides, never the
  host's activity date), `llms.txt`, `llms-full.txt`, OG images,
  `site.json` (every page, category, project and repository as data), SEO and JSON-LD.
- `.github/workflows/refresh.yml` re-measures every `REFRESH_HOURS` (its cron fires hourly and
  a run measures only when due; `npm run refresh`: data, index, recent, derive), runs `npm run check`, and only when every gate passes commits to master and starts the
  deploy. A failing gate leaves the published site as it was.

# Failure behaviour

A page without valid front matter, a stale derived file or a figure outside the data fails
`npm run check` locally, the pre-push hook and CI.

# Verification

```sh
npm run check                                   # every offline gate
gh workflow run refresh.yml -R korczis/korczis.github.io   # the scheduled refresh, on demand
```
