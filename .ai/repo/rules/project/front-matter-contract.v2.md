---
id: project.front-matter-contract
version: 2
kind: rule
title: Pages are front matter plus data; nothing is maintained by hand, and no SEO field types a count
description: Every page is described by front matter that matches static/schemas/front-matter.schema.json, everything else is derived from data that the scheduled refresh re-measures, the whole site is published as data (site.json, llms.txt), and the search and social fields of the front matter carry no typed count.
statement: Describe a page only in its front matter (schema-checked), derive everything else from data/, and let the scheduled refresh keep the data current; never add a figure, a link list or a page that someone must remember to update, and never type a count (a spelled-out cardinal, or "N years") into description, seo_title, og_title or og_description.
status: active
class: blocking
depends_on: [project.data-measured@1, project.seo-derived@2]
tags: [content, derived, automation, machine-readable]

x-majordomus:
  reviewed_because: the decision is the repository's own gate, scripts/check-front-matter.mjs and every generator's --check, which the gate manifest runs in npm run check, npm run verify, the pre-push hook and CI; no validator of the Majordomus doctrine dispatches it
---

# Rationale

The owner asked for a showcase that needs no manual upkeep and that machines can read
("zadne rucni udrzovani, at se to da strojove zpracovat"). A site whose pages are front matter
over measured data stays true by itself; a site with typed figures goes stale on the first day.

Version 2 closes the gap the hand-written SEO fields left: front matter is hand-written, so a
figure typed there ("Fifteen years" in the /about/ OG description, "Patnáct let" in its Czech twin)
went stale exactly like one typed into a template, and no gate read it. A search snippet or a
link preview is often the only text of the site a recruiter sees, so it is the last place for a
number nobody re-measures.

# Required behaviour

- Hand-written: the front matter of the hand pages in `content/` (not the generated category,
  work and glossary pages), the words of `data/projects.toml` (catalogue, categories with their
  inference rules, mirrors and hidden lists), `data/glossary.toml`, `data/site.toml`, the interface
  texts in `i18n/*.toml`, and the owner's facts in `data/cv.toml` (ADR 0004). Nothing else.
- Front matter matches `static/schemas/front-matter.schema.json` (served at
  `/schemas/front-matter.schema.json`); `scripts/check-front-matter.mjs` validates it.
- **No typed number in an SEO field.** `description`, `seo_title`, `og_title` and `og_description`
  contain no spelled-out cardinal number (the English and Czech lists live in
  `scripts/check-front-matter.mjs`) and no "N years" / "N let" pattern. A figure belongs in the
  page body, rendered from data with its date (rule `project.data-measured`); the snippet says
  what the page is in words that do not age.
- **Profile titles carry the person.** While `cv.hire.available`, the `seo_title` of the home,
  about and hire pages names the author and the headline's role noun (rule
  `project.hire-surfaces`).
- Derived, each with a `--check`: the translation tables and the client key list in `zola.toml`
  (`build-i18n.mjs`), category pages, glossary pages (`build-glossary.mjs`), one page per original repository on
  GitHub and GitLab in every language (`content/work/`, from `data/recent.json`; rule
  `project.every-repository-page`: the recent ones dated by the period of their last commit, never
  the host's activity date, the rest as dated archive), `llms.txt`, `llms-full.txt`, OG images,
  `site.json` (every page, category, project and repository as data), SEO and JSON-LD.
- `.github/workflows/refresh.yml` re-measures every `REFRESH_HOURS` (its cron fires hourly and
  a run measures only when due; `npm run refresh`: data, index, recent, derive), runs `npm run check`, and only when every gate passes commits to master and starts the
  deploy. A failing gate leaves the published site as it was.

# Failure behaviour

A page without valid front matter, a stale derived file or a figure outside the data fails
`npm run check` locally, the pre-push hook and CI. `scripts/check-front-matter.mjs` exits 1 on a
spelled-out cardinal or an "N years" pattern in a search or social field, and on a profile
`seo_title` without the author and the role noun while available; until those checks are in the
script, a reviewer owns them.

# Verification

```sh
npm run check                                   # every offline gate
gh workflow run refresh.yml -R korczis/korczis.github.io   # the scheduled refresh, on demand
```
