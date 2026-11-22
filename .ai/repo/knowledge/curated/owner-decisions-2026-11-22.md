---
schema: knowledge/v1
id: owner-decisions-2026-11-22
kind: knowledge
class: fact
title: "The owner's answer of 2026-11-22: the fleet mesh is copied into every supervised repository now, and one fleet trust list is filed as a Majordomus issue"
description: "Before changing .ai/repo/mesh/mesh.yaml (trust.allow, rendezvous endpoints, the Tailscale provider) here or in another supervised repository of the owner's workspace."
status: verified
epistemics: observed
date: 2026-11-22
tags:
  - owner
  - mesh
provenance:
  origin: authored
---

# The owner's answer of 2026-11-22

Asked in Claude Code session 722683c2-2436-46ba-b4d9-131b406a2580 on 2026-11-22 with
AskUserQuestion, after the owner's order "propoj nejprve ten mesh poradne, at se vsichni na
tailscale automaticky propojuji pres mesh, vidi se, komunikuji out of box, auto se updatuji,
okmunikuji spolu"; the question and the answer are quoted verbatim.

## The fleet mesh in every supervised repository

- Question: "Only prismatic-majordomus and prismatic-majordomus-hub have the full fleet mesh (5
  owner keys + 6 tailnet/LAN hubs). The other 12 supervised repos in ~/dev (oscilla, OpenTTD,
  poppyhead, prismatic-platform, sonic-playground, vomaste.cz, algoglyph, kompendium,
  progresus-ark-orchest, atlas-trideni, catharsis-as-a-service, majordomus-reel) have 0–3 keys and
  no hubs, so their servers stay closed or only see the local segment. korczis.github.io is fixed
  in PR #46. How should I roll out the rest?"
- Answer: "Copy now + file issue (Recommended)" — "I copy the fleet block into each repo via that
  repo's own branch/commit flow now, and allocate a prismatic-majordomus issue for one fleet trust
  list that init/update seeds, so it never drifts again."
- Done here: `.ai/repo/mesh/mesh.yaml` trusts the five owner machines' keys (each verified
  against the key its hub serves at `/api/v1/mesh/identity`, except jetson, offline, taken from
  prismatic-majordomus's declaration), registers with the six fleet rendezvous endpoints and keeps
  the Tailscale provider on (PR #46).
