---
schema: knowledge/v1
id: authorship-derivation
kind: knowledge
class: lesson
title: "A public repository is the owner's work only when the owner wrote most of its commits, and its description does not say it is a copy"
description: "When scripts/fetch-index.mjs or the rule for listing repositories changes."
status: verified
epistemics: observed
date: 2026-11-12
tags:
  - data
  - honesty
provenance:
  origin: authored
---

# Authorship is derived, and descriptions can overrule a squashed history

## What happened

Of 516 public repositories (GitHub and GitLab merged by name), many are forks or mirrors of other
people's code: UPX, UCL, xsv, the Social-Engineer Toolkit, a leaked Zeus source. Listing them on a
personal showcase would claim work that is not the owner's. `osmocom-bb` passed a contributor test
(the owner wrote 4 of 5 commits) because the mirror's history had been squashed into one import,
but its description reads "Mirror of git://git.osmocom.org/osmocom-bb.git".

## What holds

`scripts/fetch-index.mjs` lists a repository only when it is not a fork, the owner (login or author
name) wrote at least half of the listed commits, and the description does not say "mirror of",
"cloned from", "leaked", "repository from" or "fork of". Forks, mirrors and empty repositories are
counted and the counts are shown; they are never listed.
