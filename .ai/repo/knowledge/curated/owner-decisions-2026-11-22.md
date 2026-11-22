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
  [redacted: a repository name under NDA], atlas-trideni, catharsis-as-a-service, majordomus-reel) have 0–3 keys and
  no hubs, so their servers stay closed or only see the local segment. korczis.github.io is fixed
  in PR #46. How should I roll out the rest?"
- Answer: "Copy now + file issue (Recommended)" — "I copy the fleet block into each repo via that
  repo's own branch/commit flow now, and allocate a prismatic-majordomus issue for one fleet trust
  list that init/update seeds, so it never drifts again."
- Done here: `.ai/repo/mesh/mesh.yaml` trusts the five owner machines' keys (each verified
  against the key its hub serves at `/api/v1/mesh/identity`, except jetson, offline, taken from
  prismatic-majordomus's declaration), registers with the six fleet rendezvous endpoints and keeps
  the Tailscale provider on (PR #46).

## Auto-update until I2722

Asked later in the same session, after the owner's order "propoj nejprve ten mesh poradne, at se
vsichni na tailscale automaticky propojuji pres mesh, vidi se, komunikuji out of box, auto se
updatuji, okmunikuji spolu, at to funguje from now on rocksolid, automagicky".

- Question: "Auto-update of Majordomus on every machine: v1.1.0 has no self-update; the real one is
  I2722 (prismatic-majordomus, not built yet; ADR 0161 still proposed). Every hub runs 1.0.2 and
  v1.2.0 is about to be cut. What do you want now?"
- Answer: "Interim timer via I2722 (Recommended)" — "Landing seat records it as a declared interim
  step of I2722; then a daily launchd/systemd user timer per machine runs the verified installer
  and restarts the hub only when no session is attached. I2722 replaces it later."

## The fleet upgrade to v1.2.0

- Question: "When v1.2.0 is cut, may I upgrade Majordomus on the other machines too and restart
  their hubs (the restart also starts Tailscale discovery, which needs it)? lundra works over ssh;
  the second MacBook and imac-4 refuse ssh with 'Host key verification failed' until their host
  keys are accepted."
- Answer: "This Mac + lundra (Recommended)" — "Upgrade and restart the hub here and on lundra over
  ssh; the second MacBook and imac-4 after you accept their ssh host keys (or run the installer
  there)."
- Found on the way: the hub's Tailscale provider was `stopped` on this MacBook because the macOS
  app keeps its CLI inside the bundle (a symlink to it aborts on its bundle-identifier check); a
  wrapper at `/opt/homebrew/bin/tailscale` now answers `tailscale status --json`, and the hub picks
  it up at its next start.

## Merging the fleet-mesh pull requests in the other repositories

The other repositories' sessions declined to land a trust grant on a peer's citation of this
record, so the owner was asked directly, later in the same session.

- Question: "The fleet-mesh PRs (5 owner machine keys + 6 hubs + Tailscale, one file
  .ai/repo/mesh/*.yaml) are green in algoglyph #5 and sonic-playground #1; oscilla #632 and
  kompendium #1 are still running CI. Their own sessions won't merge a trust grant on my say-so.
  May I merge them myself, each in its repo's usual style (merge commit; kompendium via its train
  owner dev-31)?"
- Answer: "Yes, merge all green (Recommended)" — "I merge each green mesh PR in its repo's style
  now and the rest as their CI passes; for kompendium I tell dev-31 that you approved it."
- Done: algoglyph #5 and sonic-playground #1 merged; kompendium #1 rides dev-31's train, which
  also asked the owner directly. A review there found the keys unquoted: a 64-digit hex digest of
  digits only would load as a number, so every key is now written quoted, and the comment above
  the endpoints says why the tailnet hub addresses stay (a Mac whose Tailscale CLI is not on PATH).
