---
id: project.site-zola-pages
version: 1
kind: rule
title: The site is Zola, self-hosted, and deployed only by the Pages workflow
description: Zola 0.23 (Tera 2) builds the site from templates and data; every asset is self-hosted; master deploys through pages.yml after CI, and production is verified to serve the commit.
statement: Build with the Zola version in .zola-version, load nothing from another origin, and deploy only by pushing master, where pages.yml runs CI, deploys and checks that production serves this commit.
status: active
class: blocking
depends_on: [project.ui-quality-gate@1, project.data-measured@1]
tags: [site, delivery, zola]
---

# Rationale

ADR 0001. One engine and one delivery path: the site that was reviewed is the site that ships,
and a deployment that did not take is detected, not assumed.

# Required behaviour

- Zola is pinned by `.zola-version` and installed in CI against a SHA-256 digest
  (`.github/actions/setup/action.yml`). Templates are Tera 2: shared markup is a `{% component %}`
  in `templates/components.html`, called as `{{ <name arg={expr} /> }}`; arrays index as `x[1]`.
- Libraries are pinned exactly in `package.json` and copied to `static/js/vendor/` by
  `scripts/vendor.mjs` (ignored by git); styles compile to `static/css/app.css` (ignored).
- `pages.yml` on master: `ci` (the same workflow as pull requests) -> `deploy` (base URL equals
  `zola.toml`) -> `verify` (`revision.txt` equals the commit, smoke test of every page and asset).
- Work lands through a branch in `korczis.github.io-wt/<branch>` (Majordomus worktree
  convention) and a pull request; master is the trunk.

# Failure behaviour

A red stage stops the pipeline; a production that does not serve the commit within ten minutes
fails `verify`.

# Verification

```sh
npm run verify
gh run list -R korczis/korczis.github.io --workflow pages.yml -L 1
```
