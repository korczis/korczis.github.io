---
schema: adr/v1
id: adr-0002
kind: adr
title: Pages runs on a dedicated lundra runner when hosted runners are saturated
status: proposed
date: 2026-11-12
tags:
  - delivery
  - ci
provenance:
  origin: authored
---

# 2. Pages runs on a dedicated lundra runner when hosted runners are saturated

## Context

On 2026-11-12 between 01:26 and 01:50 UTC no job of this repository started: every CI and Pages
run stayed `queued`. githubstatus.com reported Actions operational. The account's hosted
concurrency was full: 19 to 20 `ubuntu-latest` jobs in progress, most of them
prismatic-majordomus shards, plus algoglyph and Kompendium. GitHub Pages with
`build_type: workflow` deploys only through an Actions run, so https://korczis.github.io/ stayed
404.

The owner wrote in Claude Code session `c345d42d-f403-4b60-a5d8-75d67c92d0a5`, verbatim:
"pokud nejde, tak suplementuj, reimplementuj, zdrojaky znas, duplikuj a implemetuj", then
"tohle stale nefunguje https://korczis.github.io/" and "pushni, deployni". algoglyph met the same
situation on 2026-11-11 and settled it with a dedicated runner on lundra (algoglyph ADR 0003,
chosen by the owner via AskUserQuestion: "Runner on lundra (Recommended)").

## Decision

- Duplicate algoglyph's arrangement. `scripts/lundra-runner.sh` registers `lundra-korczis-hub`
  (label `lundra-korczis-hub`, user `ghrunner`, install `/home/ghrunner/runner-korczis-hub`,
  `HOME=/home/ghrunner/home-korczis-hub`, systemd unit) to this repository only. Its binaries are
  hard links of algoglyph's runner. The script also sets the repository variable
  `PAGES_RUNNER=lundra-korczis-hub`.
- `pages.yml` and `monitor.yml` run every job on `vars.PAGES_RUNNER` when it is set, and on
  `ubuntu-latest` otherwise. They pass it to `ci.yml` as the `runner` input. Branch CI stays on
  `ubuntu-latest`, so no code that has not reached master runs on lundra.
- The owner runs the script. The agent's attempt to write on lundra was refused by the
  permission classifier (remote shell writes), which is correct for a shared machine.

## Alternatives rejected

- Waiting for hosted runners: the queue is filled by other sessions' work with no known end,
  and their runs are not this session's to cancel.
- A runner on the owner's Mac: the Mac's disk is the scarcer resource (algoglyph ADR 0003).

## Consequences

- lundra's capacity is shared with prismatic-majordomus and algoglyph. At 92% disk and 37 GB
  free on 2026-11-12, this repository adds Node, Zola and a headless shell (~1 GB) in
  `home-korczis-hub` and `runner-korczis-hub/_work`.
- Removal: `sudo ./svc.sh uninstall` and `./config.sh remove` in the runner directory, then
  `gh variable delete PAGES_RUNNER`. Pages falls back to hosted runners with no other change.
