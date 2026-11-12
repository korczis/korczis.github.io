#!/usr/bin/env bash
# Runs locally the same gates CI runs (.github/workflows/ci.yml), in the same order, and stops at
# the first failure. The UI audit builds the site into a temporary directory, serves it on a free
# port (never one another session uses) and launches the browser once.
#
# usage: npm run verify                          every gate
#        npm run verify -- --fast                every gate except the browser audit
#        npm run verify -- --audit-only [args]   only the browser audit (args go to audit-ui.mjs,
#                                                e.g. --shots <dir>)
set -euo pipefail
cd "$(dirname "$0")/.."

fast=0
audit_only=0
case "${1:-}" in
  --fast) fast=1; shift ;;
  --audit-only) audit_only=1; shift ;;
esac

step() { printf '\n== %s\n' "$1"; }
run() { step "$1"; shift; "$@"; }

if [ "$audit_only" = 0 ]; then
run "Conventional commits on this branch" scripts/lint-commits.sh "$(git merge-base HEAD origin/master 2>/dev/null || git rev-list --max-parents=0 HEAD | tail -1)..HEAD"
run "Translations are generated and complete" node scripts/build-i18n.mjs --check
run "Every text in every language" node scripts/check-i18n.mjs
run "Front matter matches its schema" node scripts/check-front-matter.mjs
run "Catalogue, snapshot and index are well-formed" node scripts/check-data.mjs
run "Category pages are current" node scripts/build-categories.mjs --check
run "Work pages are current" node scripts/build-work.mjs --check
run "Glossary pages are current" node scripts/build-glossary.mjs --check
run "Every page is an article with glossary terms; every term is used" node scripts/check-glossary.mjs
run "llms.txt is current" node scripts/build-llms.mjs --check
run "Open Graph images are current" node scripts/build-og.mjs --check
run "site.json is current" node scripts/build-site-json.mjs --check
run "Every visual goes through the component layer" node scripts/check-viz-layer.mjs
run "Build (internal links are errors)" npm run --silent build
run "SEO derived from front matter (titles, descriptions, OG, JSON-LD, sitemap)" node scripts/check-seo.mjs
run "Flowbite Pro" node "$HOME/.claude/skills/flowbite-pro/verify.mjs" .
run "Majordomus supervision" majordomus doctor
fi

if [ "$fast" = 1 ]; then
  printf '\nverify: every gate except the browser audit passed (--fast)\n'
  exit 0
fi

step "Accessibility, layout, visuals and links (axe-core WCAG 2.2 AA, CLS, overflow)"
port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')
root=$(mktemp -d "${TMPDIR:-/tmp}/korczis-hub-verify.XXXXXX")
server=""
cleanup() { [ -n "$server" ] && kill "$server" 2>/dev/null || true; rm -rf "$root"; }
trap cleanup EXIT
npm run --silent assets
zola build --base-url "http://127.0.0.1:$port" --output-dir "$root/site" >/dev/null
(cd "$root/site" && exec python3 -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1) &
server=$!
for _ in $(seq 1 50); do curl -fs -o /dev/null "http://127.0.0.1:$port/" && break; sleep 0.2; done
BASE_URL="http://127.0.0.1:$port/" SITE_DIR="$root/site" node scripts/audit-ui.mjs "$@"

printf '\nverify: every gate passed\n'
