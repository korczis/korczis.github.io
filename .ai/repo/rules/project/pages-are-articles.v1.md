---
id: project.pages-are-articles
version: 1
kind: rule
title: Every page is also an educational, linked article, described in front matter
description: Every content page carries a Markdown article body and names the glossary terms it builds on (extra.terms); the glossary (data/glossary.toml) defines each term in both languages with a source; term pages and back-links are derived; a gate refuses a page without an article or terms, an unknown term, an unused term or an unchecked link.
statement: Give every page a body that explains, in plain words, what the page shows and how to read it, with links to glossary terms as @/ links (Zola checks them), and list those terms in extra.terms. Generated pages get their article and terms from their generator, derived from the data (scripts/lib/terms.mjs), never typed per page. Add a new concept to data/glossary.toml, never inline in a template. Keep scripts/check-glossary.mjs and build-glossary --check passing.
status: active
class: blocking
depends_on: [project.front-matter-contract@1, project.i18n-everywhere@1, project.data-measured@1]
tags: [content, education, front-matter, seo]
---

# Rationale

The owner asked that every page also be an academic, popular-science, educational article,
linked for didactic purposes, and that everything be described in front matter so it can be
linked, inferred and projected later ("kazda stranka zaroven musi byt akademicky / popularne
naucny / vzdelavaci prolinkovany clanek"; "vse musi byt maximalne popsano ve frontmatter").

# How it works

- `data/glossary.toml`: the terms (language, technology, concept), definitions in English and
  Czech, a reference to read further, and for concepts the categories they explain.
- `scripts/lib/terms.mjs`: convention over configuration. Languages and stack names resolve to
  terms by name or alias; a category brings its concepts; every repository brings repository,
  commit and open source; a site on GitHub Pages brings that term.
- Generators (`build-work`, `build-categories`, `build-glossary`) write the article body and
  `extra.terms` of every derived page; hand pages (home, about, stack, projects, repositories)
  write theirs in `content/`, with `extra.article_title`.
- `templates/partials/article.html` (included by the base layout) renders the body as Flowbite
  Publisher prose (`format`) and "Concepts on this page"; term pages list every page that names
  them (`extra.pages`) and related terms (`extra.related`, co-occurrence), both derived.
- JSON-LD: `about` lists the page's terms as DefinedTerm; term pages are DefinedTerm in the
  glossary's DefinedTermSet.

# Verification

`node scripts/check-glossary.mjs` and `node scripts/build-glossary.mjs --check` (in
`npm run check` and `scripts/verify-all.sh`); Zola fails the build on a broken `@/` link.
