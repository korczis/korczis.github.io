#!/usr/bin/env bash
# Runs locally every gate of the one manifest (scripts/gates.mjs: the list CI runs, plus the
# commit range, the Flowbite scanner and majordomus doctor), in order, and stops at the first
# failure; then the browser audit. The audit builds the site into a temporary directory, serves
# it on a free port (never one another session uses), launches the browser once and always stops
# its server (trap), also when the audit fails or is interrupted.
#
# usage: npm run verify                          every gate, then the browser audit
#        npm run verify -- --fast                every gate except the browser audit
#        npm run verify -- --from <id> | --only <id,...> | --skip <id,...>
#                                                passed to node scripts/gates.mjs run (ids:
#                                                node scripts/gates.mjs list); no browser audit
#        npm run verify -- --audit-only [args]   only the browser audit (args go to audit-ui.mjs,
#                                                e.g. --shots <dir>; CI runs it this way)
#        npm run verify -- --help                this text; any other flag exits 2
set -euo pipefail
cd "$(dirname "$0")/.."

fast=0
audit_only=0
gate_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'; exit 0 ;;
    --fast) fast=1; shift ;;
    --audit-only) audit_only=1; shift; break ;;
    --from|--only|--skip)
      [ $# -ge 2 ] || { echo "verify-all.sh: $1 needs a gate id; run with --help" >&2; exit 2; }
      gate_args+=("$1" "$2"); shift 2 ;;
    *) echo "verify-all.sh: unknown flag $1; run with --help" >&2; exit 2 ;;
  esac
done

if [ "$audit_only" = 0 ]; then
  node scripts/gates.mjs run ${gate_args[@]+"${gate_args[@]}"}
  if [ "$fast" = 1 ] || [ ${#gate_args[@]} -gt 0 ]; then
    printf '\nverify: the gates passed; no browser audit (%s)\n' "$([ "$fast" = 1 ] && echo --fast || echo 'a gate selection')"
    exit 0
  fi
else
  node scripts/gates.mjs run --only deps
fi

printf '\n== %s\n' "Accessibility, layout, visuals and links (axe-core WCAG 2.2 AA, CLS, overflow)"
port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')
root=$(mktemp -d "${TMPDIR:-/tmp}/korczis-hub-verify.XXXXXX")
server=""
cleanup() { if [ -n "$server" ]; then kill "$server" 2>/dev/null || true; fi; rm -rf "$root"; }
trap cleanup EXIT
trap 'exit 130' INT TERM
npm run --silent assets
zola build --base-url "http://127.0.0.1:$port" --output-dir "$root/site" >/dev/null
# The NDA gate also reads the build the audit serves (once the experience lane's script exists).
if [ -f scripts/check-nda.mjs ]; then node scripts/check-nda.mjs --site "$root/site"; fi
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$root/site" >/dev/null 2>&1 &
server=$!
for _ in $(seq 1 50); do curl -fs -o /dev/null "http://127.0.0.1:$port/" && break; sleep 0.2; done
BASE_URL="http://127.0.0.1:$port/" SITE_DIR="$root/site" node scripts/audit-ui.mjs "$@"

printf '\nverify: every gate passed\n'
