#!/usr/bin/env bash
# majordomus-skill: fleet-flowbite-pro
# Behavioural case of the skill: its verifier judges this tree (Pro shell on every root layout,
# the flowbite dependency, the Tailwind 4 plugin and source, Flowbite JS behind every data-*
# behaviour, no other kit). Where the owner-level scanner is absent (a runner), it says so and
# majordomus doctor judges the licence instead, as CI does.
set -euo pipefail
cd "$(dirname "$0")/../.."
scanner="$HOME/.claude/skills/flowbite-pro/verify.mjs"
if [ ! -f "$scanner" ]; then
  echo "skipped: no scanner at $scanner; majordomus doctor judges the licence here"
  exit 0
fi
node "$scanner" .
