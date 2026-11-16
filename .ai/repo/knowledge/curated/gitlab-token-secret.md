---
schema: knowledge/v1
id: gitlab-token-secret
kind: knowledge
class: lesson
title: "glab 1.115 `auth token` prints its help text: store the GITLAB_TOKEN secret from the token itself"
description: "When setting or rotating the GITLAB_TOKEN Actions secret, or when a refresh reads GitLab anonymously or spends its GitLab budget."
status: verified
epistemics: observed
date: 2026-11-16
tags:
  - ci
  - gitlab
  - secrets
provenance:
  origin: authored
---

# glab 1.115 `auth token` prints its help text

On glab 1.115.0, `glab auth token` exits 0 and prints 25 lines of help (1481 characters), so
`glab auth token | gh secret set GITLAB_TOKEN` stores the help text, not a token. On
2026-11-16 the secret held it twice (00:00Z and earlier), and two sessions found it apart.

What it costs: without a usable token the refresh reads GitLab anonymously. Anonymous REST still
lists all 417 projects, but the contributor and language calls hit the rate limit, both 900 s
GitLab budgets are spent, and every GitLab project falls back to its last stored record (refresh
run 43786378573: "448 GitHub + 195 GitLab", 20 recent rows kept). With the token (run
43789941152): "GitLab: over REST with GITLAB_TOKEN", 417 projects, 0 kept.

Since f05c8ac the client (`scripts/lib/gitlab.mjs`) refuses to send a token that is not one line
of printable characters, and drops one GitLab answers 401 to, each with a log line, so a bad
secret degrades the refresh instead of failing every call.

Store it from the token itself (one line, `glpat-...`), never from a command's output you have
not looked at:

```sh
printf '%s' "$GITLAB_TOKEN" | gh secret set GITLAB_TOKEN -R korczis/korczis.github.io
# or: glab config get token --host gitlab.com | gh secret set GITLAB_TOKEN -R korczis/korczis.github.io
```

Check it by the refresh log, not by the secret's timestamp: the GitLab line must read
`GitLab: over REST with GITLAB_TOKEN` and no "budget spent" line may follow.
