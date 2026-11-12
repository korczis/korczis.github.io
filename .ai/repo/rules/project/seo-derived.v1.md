---
id: project.seo-derived
version: 1
kind: rule
title: Search and social metadata are derived from front matter and data
description: Titles, descriptions, canonical URLs, Open Graph and Twitter tags, OG images and JSON-LD come from each page's front matter and data/, through templates/partials/seo.html and scripts/build-og.mjs, and are gated on the built site.
statement: Put a page's search and social metadata in its front matter (title, description, [extra] seo_title, og_title, og_description, og_image, keywords, schema), never in a template; regenerate OG images with npm run og; and keep scripts/check-seo.mjs and build-og.mjs --check passing.
status: active
class: blocking
depends_on: [project.data-measured@1]
tags: [seo, open-graph, derived]
---

# Rationale

A page is shared and found by its metadata. Typed per template it drifts from the page; derived
from the same front matter the page renders from, it cannot.

# Required behaviour

- `templates/partials/seo.html` derives `<title>`, description, keywords, robots, canonical, Open
  Graph (`profile` on the home page), Twitter `summary_large_image` and one JSON-LD `@graph`
  (Person, WebSite, and the page as ProfilePage, CollectionPage with an ItemList of
  SoftwareSourceCode from the catalogue, or AboutPage, with a BreadcrumbList).
- `scripts/build-og.mjs` renders `static/og/<name>.svg` deterministically from the front matter
  and the PNG (1200x630) with rsvg-convert; both are committed.
- 404 is `noindex`; every indexable page is in `sitemap.xml`.

# Failure behaviour

`scripts/check-seo.mjs` exits 1 on a duplicate or overlong title, a description outside 50-165
characters, a missing tag, an OG image that is not in the build at 1200x630, JSON-LD that does
not parse, a page with other than one `<h1>`, or a canonical URL missing from the sitemap.
`build-og.mjs --check` exits 1 on a stale SVG or a missing PNG.

# Verification

```sh
node scripts/build-og.mjs --check
npm run build && node scripts/check-seo.mjs
```
