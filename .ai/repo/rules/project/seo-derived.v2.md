---
id: project.seo-derived
version: 2
kind: rule
title: Search and social metadata are derived from front matter and data, and state only what the page shows
description: Titles, descriptions, canonical URLs, Open Graph and Twitter tags, OG images and JSON-LD come from each page's front matter and data/, through templates/partials/seo.html and scripts/build-og.mjs; structured data states only what the page visibly shows, OG cards caption the page's own permalink, and all of it is gated on the built site.
statement: Put a page's search and social metadata in its front matter (title, description, [extra] seo_title, og_title, og_description, og_image, keywords, schema), never in a template; let JSON-LD state only what the page shows (one list rendered twice, never two lists); derive knowsAbout from measured skills, sameAs from profile URLs and roles from data/cv.toml; regenerate OG images with npm run og; and keep scripts/check-seo.mjs and build-og.mjs --check passing.
status: active
class: blocking
depends_on: [project.data-measured@1, project.viz-ergonomics@1, project.nda-never-named@1]
tags: [seo, open-graph, derived, structured-data]

x-majordomus:
  reviewed_because: the decision is the repository's own gate, scripts/check-seo.mjs and build-og.mjs --check, which the gate manifest runs in npm run check, npm run verify, the pre-push hook and CI; no validator of the Majordomus doctrine dispatches it
---

# Rationale

A page is shared and found by its metadata. Typed per template it drifts from the page; derived
from the same front matter the page renders from, it cannot.

Version 2 adds what the build of /hire/ showed (ADR 0008): a FAQPage of five questions over an
accordion of four, because the questions were listed in two templates; a `knowsAbout` that named
two libraries the owner forbids; a product among the person's `sameAs`; roles with no organisation
or dates; and Czech OG cards that captioned an address that does not exist and an English badge.
Structured data a page does not show is the hidden text of rule `project.hire-surfaces` by another
route, and search engines treat it so.

# Required behaviour

- `templates/partials/seo.html` derives `<title>`, description, keywords, robots, canonical, Open
  Graph (`profile` on the home page), Twitter `summary_large_image` and one JSON-LD `@graph`
  (Person, WebSite, and the page as ProfilePage, CollectionPage with an ItemList of
  SoftwareSourceCode from the catalogue, or AboutPage, with a BreadcrumbList).
- `scripts/build-og.mjs` draws each card as an SVG deterministically from the front matter and
  renders the PNG (1200x630) from it with rsvg-convert, quantised with pngquant; only the PNG is
  committed and deployed (no page references the SVG), and `data/og.json` records the hash of the
  SVG and of the PNG and the encoder version that wrote it. Each PNG stays within `og_image`
  `x-max-bytes` of the front-matter schema. `.github/workflows/refresh.yml` installs every
  renderer the script uses, because the scheduled refresh renders the cards a new or moved
  repository needs.
- Every indexable page has its own description and its own `og:description`: text another page
  has too (a template's README paragraph, a sentence of facts that fits several repositories)
  is not a description.
- 404 is `noindex`; every indexable page is in `sitemap.xml`.
- **Structured data states only what the page shows.** A list that appears both visibly and in
  JSON-LD is built once and rendered twice: the /hire/ questions and answers come from
  `templates/partials/hire-faq.html`, which renders the visible accordion and the `FAQPage`, so
  every `Question.name` is a visible `<summary>` and every answer is in the page text, both ways.
- **knowsAbout is measured.** `Person.knowsAbout` is the skills of `data/index.json` together with
  the technologies of `data/experience.json`, without the libraries rule `project.viz-ergonomics`
  keeps out of the bundle (Chart.js, Cytoscape), each a `DefinedTerm` whose `url` is a built
  /glossary/ page.
- **sameAs names the person's profiles only**: the GitHub and GitLab accounts and the URLs of
  `cv.links`. A product the person made (Majordomus) is its own `SoftwareApplication` node with
  `author` `{"@id": "/#person"}`, never a `sameAs`.
- **Roles are dated.** Every `cv.roles` entry is a `worksFor` (current) or `alumniOf` (ended)
  `OrganizationRole` with `roleName`, `startDate`, `endDate` when it ended, and a nested
  `Organization`; an anonymised organisation gets no `url` (rule `project.nda-never-named`).
- **Dates and places are stated, not guessed.** `ProfilePage.dateModified` is `generated_at` of
  `data/index.json`; `homeLocation.address.addressCountry` is set only when `data/cv.toml` names the
  country.
- **An OG card captions its own page.** The URL drawn on a card is the permalink of the page that
  uses it, derived from its content path and language (`/work/<x>/`, `/cs/hire/`); the badge is a
  measured fact of the page in the card's language from the i18n keys `og_pill_*` (on a work page
  the repository's state from `data/recent.json`: supervised by Majordomus, active within its
  period, or archive with its years; on every other page the site's own supervision), and profile
  cards (home, about, hire) also show `hero_hire`. Text is clipped at word boundaries by the shared `clip()` of `scripts/lib/derive.mjs`,
  and the layout reserves the pill's area, computed and asserted.

# Failure behaviour

`scripts/check-seo.mjs` exits 1 on a duplicate or overlong title, a duplicate description or
`og:description`, a description outside 50-165 characters, a missing tag, an OG image that is not in the build at 1200x630, JSON-LD that does
not parse, a page with other than one `<h1>`, or a canonical URL missing from the sitemap; and on
a `FAQPage` question or answer the page does not show (or a visible one it lacks), a `knowsAbout`
entry that is not a measured skill or technology, has no built /glossary/ page or is a library the
bundle keeps out, a `sameAs` host that is not a profile host, a `cv.roles` entry without its dated
role, or a /hire/ h1 without the author.
`build-og.mjs --check` exits 1 on a missing PNG, one stale against its card, not the recorded
render, without its encoder version, over its byte budget, a file of `static/og` no page names,
or a renderer the refresh workflow does not install; on a drawn URL that differs from the
canonical of the built page using the card, an English literal on a Czech card, text clipped
mid-word, or text overlapping the pill. Until a check named here is in its script, a reviewer owns
the assertion.

# Verification

```sh
node scripts/build-og.mjs --check
npm run build && node scripts/check-seo.mjs
```
