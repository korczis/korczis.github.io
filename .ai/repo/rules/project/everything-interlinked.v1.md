---
id: project.everything-interlinked
version: 1
kind: rule
title: Everything links to everything it names, through derived links that are proven
description: Every mark a visual draws, every term, language, technology, project, category and repository a page names leads to its page on this site (and to its source where there is none), in the page's language; links come from one derived index, never from addresses built by hand, and every link is resolved at build time and in the browser audit.
statement: Link every thing a page or a visual names to its own page through KorczisHub.link() in scripts and the sections, get_page and the glossary in templates; never build a site address by hand in a script; keep every page in its language's tree; and keep the link gates passing.
status: active
class: blocking
depends_on: [project.viz-ergonomics@1, project.pages-are-articles@1, project.i18n-everywhere@1]
tags: [content, navigation, links, education]

x-majordomus:
  reviewed_because: the decision is the repository's own gates (Zola's internal-link check in the build, scripts/check-viz-layer.mjs, scripts/audit-ui.mjs link and list checks), run by the gate manifest in npm run check, npm run verify, the pre-push hook and CI; no validator of the Majordomus doctrine dispatches them
---

# Rationale

ADR 0005, the owner's words "vse vzdy propopojuj" (always interlink everything). A site whose
every page also teaches (rule project.pages-are-articles) teaches through its links: a language
in a chart that does not lead to what the language is, or a repository in a graph that does not
lead to its work page, is a dead end on a page meant to be read onward.

# Required behaviour

- **One index.** `templates/partials/link-index.html` embeds the site's own pages in the page's
  language: glossary terms by id, title and alias, work pages by repository, category pages by
  key, derived from the sections. Scripts resolve a mark with `KorczisHub.link(kind, key)`;
  a mark with no page of its own falls back to its source (the repository, the GitHub day), never
  to an address assembled from a template string.
- **Every mark leads somewhere.** Every node, bar, arc, star, beat and label a visual draws answers
  a click or tap with its page, and its list twin (`items()`) holds the same links.
- **Templates link through the content tree**: `@/` links in Markdown (Zola checks them),
  `get_page`/`get_section` with `lang=` in templates (a lookup without the language silently falls
  back to the default language), and the glossary for every term.
- **One language per tree.** Every internal link on a `/cs/` page stays under `/cs/`, except
  shared assets (scripts, styles, images, schemas, `llms*.txt`, the sitemap).

# Failure behaviour

`zola build` fails on a broken `@/` link. `scripts/check-viz-layer.mjs` fails on a script that
builds a site path by hand. `scripts/audit-ui.mjs` fails on any rendered internal link that does
not resolve to a built file, on a list twin's link that does not resolve, and on a `/cs/` page that
links into the English tree.

# Verification

```sh
npm run check
npm run verify -- --audit-only
```
