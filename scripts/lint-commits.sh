#!/usr/bin/env bash
# Conventional Commits gate, shared by the commit-msg hook and CI.
# usage: lint-commits.sh <rev-range>     check every commit subject on the first-parent line of the range
#        (histories merged in from other repositories keep their original messages)
#        lint-commits.sh --branch        the commits of this branch: merge-base with origin/master
#                                        (the root commit when there is none) up to HEAD
#        lint-commits.sh --file <path>   check one commit message file (commit-msg hook)
#        lint-commits.sh --help          this text; any other flag exits 2
set -euo pipefail

PATTERN='^(feat|fix|perf|refactor|docs|style|test|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?: .{1,100}$'
EXEMPT='^(Merge |Revert ")'

valid() {
  [[ "$1" =~ $EXEMPT ]] || [[ "$1" =~ $PATTERN ]]
}

explain() {
  echo "expected: type(scope): description" >&2
  echo "types:    feat fix perf refactor docs style test build ci chore revert (add ! for breaking)" >&2
}

case "${1:-}" in
  --help|-h) sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'; exit 0 ;;
  --branch) set -- "$(git merge-base HEAD origin/master 2>/dev/null || git rev-list --max-parents=0 HEAD | tail -1)..HEAD" ;;
  --file) ;;
  -*) echo "lint-commits.sh: unknown flag $1; run with --help" >&2; exit 2 ;;
esac

if [[ "${1:-}" == "--file" ]]; then
  subject="$(head -n1 "${2:?--file needs a path}")"
  if valid "$subject"; then
    exit 0
  fi
  echo "commit-msg: not a conventional commit: $subject" >&2
  explain
  exit 1
fi

RANGE="${1:?usage: lint-commits.sh <rev-range> | --branch | --file <path> (see --help)}"
bad=0
count=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  count=$((count + 1))
  if ! valid "${line#* }"; then
    echo "✗ $line" >&2
    bad=1
  fi
done < <(git log --first-parent --format='%h %s' "$RANGE")

if [[ "$bad" == 1 ]]; then
  explain
  exit 1
fi
echo "conventional commits: $count checked, PASS"
