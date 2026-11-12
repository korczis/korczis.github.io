# korczis.github.io

The personal hub of Tomas Korcak (korczis): <https://korczis.github.io/>. It covers who I am,
the projects I build with their live sites, the stack behind them, and
[Majordomus](https://majordomus.dev), which supervises the work.

The site uses Zola (Tera 2) with Flowbite Pro on Tailwind 4, Alpine.js, Cytoscape.js, Apache
ECharts, Chart.js and p5.js. It is supervised by Majordomus and deployed to GitHub Pages from
`master`. The decision is recorded in
[ADR 0001](.ai/repo/adrs/0001-personal-hub-on-zola-with-flowbite-pro-deployed-to-github-pa.md).

## Quick start

```sh
npm install          # also points git at .githooks (doctor on commit, finish --check on push)
npm run dev          # vendor bundles + CSS, then zola serve on http://127.0.0.1:1111
npm run verify       # every gate CI runs, browser audit last (-- --fast skips the browser)
```

You need Node 22 and Zola `0.23.4` (`.zola-version`). For the hooks and the `doctor` gate you
also need [majordomus](https://majordomus.dev).

## Layout

| Path | What it is |
| --- | --- |
| `data/projects.toml` | The curated catalogue: words only, hand-written |
| `data/github.json` | Measured snapshot written by `npm run data`; never edit it by hand |
| `templates/` | Tera 2 templates: `base.html` (Pro header and footer), pages, `components.html` |
| `styles/app.css` | Tailwind 4 + flowbite plugin: the Pro theme and the `--hub-*` chart palette |
| `static/js/site.js` | Theme handling and the component layer every visual goes through |
| `static/js/viz/` | One visual per file: `glyphs` (p5), `graph` (Cytoscape), `activity` (ECharts), `languages` (Chart.js) |
| `static/js/components/` | Alpine.js components: catalogue filter, live Majordomus card |
| `static/llms.txt` | Derived from the catalogue (`npm run llms`) |
| `scripts/` | Data, vendoring and every gate (`verify-all.sh`, `check-*.mjs`, `audit-ui.mjs`) |
| `.ai/` | The Majordomus layer: policy, ADRs, rules under `.ai/repo/rules/project/` |

## Common tasks

- **Add a project.** Add an entry to `data/projects.toml`, run `npm run data` and then `npm run llms`.
  `check-data.mjs` refuses forks, private repositories, dead live URLs and a hand-typed
  "Majordomus" in `stack`.
- **Refresh the numbers.** Run `npm run data` (it needs an authenticated `gh`), then commit
  `data/github.json`. Every page shows the date of the snapshot.
- **Add a visual.** Create `static/js/viz/<name>.js` registering `KorczisHub.viz('<name>', …)`,
  put `data-viz="<name>"` on a box that reserves its size, and load the script from the
  template. `check-viz-layer.mjs` enforces the layer.
- **Add a page.** Add the template and a `content/` entry, and add the page to `PAGES` in
  `scripts/audit-ui.mjs`.

## Gates

| Gate | Command | Rule |
| --- | --- | --- |
| Conventional commits | `scripts/lint-commits.sh <range>` (also the commit-msg hook) | |
| Catalogue and snapshot | `node scripts/check-data.mjs` | `project.data-measured` |
| llms.txt current | `node scripts/build-llms.mjs --check` | `project.data-measured` |
| Component layer, self-hosting | `node scripts/check-viz-layer.mjs` | `project.viz-component-layer` |
| Build, internal links | `npm run build` | `project.site-zola-pages` |
| Flowbite Pro fidelity | `node ~/.claude/skills/flowbite-pro/verify.mjs .` (local) | `project.ui-uses-flowbite-pro` |
| Browser audit | `scripts/audit-ui.mjs`: axe WCAG 2.2 AA, CLS, overflow, visuals, links | `project.ui-quality-gate` |
| Supervision | `majordomus doctor` (pre-commit hook and CI) | the Majordomus baseline |

## Deploy

A push to `master` runs `.github/workflows/pages.yml` in three stages:

1. `ci`: the same workflow pull requests run.
2. `deploy`: deploys the validated artefact to Pages.
3. `verify`: checks that production serves `revision.txt` equal to the commit, then smoke-tests
   every page and asset.

The repository is public and declares `ui.kit: flowbite-pro`. Because of that, CI's
`majordomus doctor` fails closed until the owner stores the licence evidence. Do it once:

```sh
~/.claude/skills/flowbite-pro/evidence.sh secret | \
  gh secret set MAJORDOMUS_KIT_EVIDENCE_FLOWBITE_PRO -R korczis/korczis.github.io
```

## Working on this repository

The repository is supervised by Majordomus. AI workers start from [`AGENTS.md`](AGENTS.md)
(Claude Code: `CLAUDE.md`, Gemini: `GEMINI.md`, all generated from `.ai/repo/policy.yaml`). They
run `majordomus context` and work in a branch under `korczis.github.io-wt/<branch>`
(`majordomus worktree create <branch>`). A task closes with `majordomus finish` once
`npm run verify` has passed.

## Licence

Code is MIT. The Flowbite Pro markup is adapted under the owner's licence; no Pro source file is
part of this repository.
