---
schema: adr/v1
id: adr-0001
kind: adr
title: Personal hub on Zola with Flowbite Pro, deployed to GitHub Pages
status: proposed
date: 2026-11-12
tags:
  - delivery
  - stack
provenance:
  origin: authored
---

# 1. Personal hub on Zola with Flowbite Pro, deployed to GitHub Pages

## Context

On 2026-11-12 `https://korczis.github.io/` answered 404. The Pages API reported
`status: errored`, `build_type: workflow`; `.github/workflows/static.yml` (added 2025-10-21)
had never run. `master` held a Zola export of Sonic Playground whose every URL was absolute to
`https://sonic-playground.fly.dev`, so it could not render on github.io even if deployed.

The owner was asked in Claude Code session `c345d42d-f403-4b60-a5d8-75d67c92d0a5` on
2026-11-12 (about 00:55 UTC), via AskUserQuestion. Questions and answers, verbatim:

> What should korczis.github.io be? (Right now it holds a broken copy of the Sonic
> Playground blog.)
> Options: "Personal hub (Recommended)", "Hub + blog", "Blog only", "Redirect".

Answer: "Personal hub (Recommended)".

> Which stack should the site use? (Flowbite Pro is mandatory, and a public repo must not
> contain Pro sources, so CI needs the licence secret, the same as algoglyph.)
> Options: "Vite + Flowbite Pro (Recommended)", "Zola + Flowbite Pro", "Prebuilt locally".

Answer: "Vite + Flowbite Pro (Recommended)" — superseded in the same session by the owner's
message, verbatim: "integruj majordomus.dev / bude zola + gh pages -> priprav se na to".

> What should happen to the current content (the Sonic Playground export)?
> Options: "Replace it (Recommended)", "Move to /archive".

Answer: "Replace it (Recommended)".

> Should the new repo (cloned to ~/dev/korczis.github.io) be supervised by Majordomus
> (`majordomus init`)?
> Options: "Yes (Recommended)", "No".

Answer: "Yes (Recommended)".

## Decision

- The site is a personal hub: landing, project showcase, links and contact. A blog section
  is not part of the first version.
- It is built with Zola. Styling is Tailwind 4 with the `flowbite` ^4 plugin, adapted from
  the owner's licensed Flowbite Pro marketing blocks; the CSS is compiled in CI from the
  Zola templates. No Pro source file is committed (the repository is public).
- GitHub Actions builds (`zola build` into `public/`) and deploys to GitHub Pages from
  `master`; the old `static.yml`, which uploaded the repository root, is replaced.
- The Sonic Playground export is removed from `master`; it stays in git history and in its
  own repository (`korczis/sonic-playground`).
- The repository is supervised by Majordomus (`ui.kit: flowbite-pro`, `visibility: public`).

## Alternatives rejected

- Vite + Flowbite Pro (as in algoglyph): first answer, replaced by the owner with Zola.
- Keeping the Sonic Playground export: it is another site's build output with absolute
  URLs; Sonic Playground already has its own repository.
- Prebuilt CSS committed from a local build: deploys would depend on one machine.

## Consequences

- CI's `majordomus doctor` fails closed on a public tree declaring `flowbite-pro` until the
  owner sets the repository secret `MAJORDOMUS_KIT_EVIDENCE_FLOWBITE_PRO`
  (`~/.claude/skills/flowbite-pro/evidence.sh secret | gh secret set
  MAJORDOMUS_KIT_EVIDENCE_FLOWBITE_PRO -R korczis/korczis.github.io`). Agents may not write it.
- A push to `master` is a production deploy.
- The build needs Zola and Node (Tailwind CLI) in CI; both are pinned in the workflow.
