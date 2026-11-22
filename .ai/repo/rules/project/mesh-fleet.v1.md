---
id: project.mesh-fleet
version: 1
kind: rule
title: The mesh declaration trusts the owner's fleet, names its hubs and loads in Majordomus
description: .ai/repo/mesh/mesh.yaml is enabled under deny_unknown, trusts the owner's machine keys (a key belongs to a machine, shared by every repository and worktree on it), names the fleet's rendezvous hubs, keeps the Tailscale provider on, and writes every key bare so Majordomus loads it; scripts/check-mesh.mjs refuses a declaration that would silently leave the mesh off.
statement: Keep .ai/repo/mesh/mesh.yaml enabled, deny_unknown, with the fleet's machine keys written bare (64 lower-case hex digits, no quotes) and its rendezvous endpoints, synced from prismatic-majordomus's declaration; and keep the mesh gate passing.
status: active
class: blocking
depends_on: []
tags: [mesh, security, operations]

x-majordomus:
  reviewed_because: the decision is the repository's own gate (scripts/check-mesh.mjs), run by the gate manifest in npm run check, npm run verify, the pre-push hook and CI; no validator of the Majordomus doctrine dispatches it
---

# Rationale

The owner's order of 2026-11-22: every machine on the tailnet links over the mesh out of the box,
sees and talks to the others, rock-solid and automatic (owner-decisions-2026-11-22). Majordomus
drops a declaration whose trusted key fails its schema (`^[0-9a-f]{64}$`) and the mesh goes off with
no failing check: on 2026-11-22 the keys were quoted with a trailing comment, Majordomus 1.1.0 read
the quotes as part of each key, and `mesh doctor` reported "declaration absent: the mesh is off".

# Required behaviour

- `enabled: true`, `trust.policy: deny_unknown`, and `trust.allow` lists the fleet's machine keys,
  one per line, each 64 lower-case hex digits written bare; a comment after a key may name its
  machine.
- `rendezvous.endpoints` lists the fleet's hubs (LAN addresses for segments multicast does not
  reach, tailnet addresses for a machine whose Tailscale CLI is not on PATH); `tailscale.enabled`
  stays on.
- Keys and hubs are synced from prismatic-majordomus's declaration, never invented here.

# Failure behaviour

`scripts/check-mesh.mjs` fails on a disabled declaration, a policy other than `deny_unknown`, a key
that is not bare hex, fewer than two trusted keys, or no rendezvous endpoint.
