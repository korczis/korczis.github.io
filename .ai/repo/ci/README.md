---
schema: context/v1
id: ai.repo.ci
kind: context
title: CI model
description: The CI model Majordomus reads (gates.yaml) — which job of ci.yml runs which gate, and which changed paths select them; here every change runs every job.
status: active
scope: subtree
providers: ["*"]
audience: [human, agent]
composition: extend
order: 100
---

# CI model

`gates.yaml` tells Majordomus what this repository's CI runs, so `doctor` and `skills verify`
can judge from the declaration instead of guessing: a skill counts as enforced only when a gate
selected by a change to it runs `majordomus skills verify`.

It describes `.github/workflows/ci.yml` and nothing else. Every push and pull request runs every
job there, so the single class matches every path and escalates to the full plan; a narrower
class is a claim the workflow would have to make true first. The site's own gates are listed
once, in `scripts/gates.mjs`, which the validate job runs; this model names that job, not a copy
of the list. A job added to or removed from `ci.yml` is changed here in the same commit.
