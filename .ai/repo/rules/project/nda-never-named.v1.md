---
id: project.nda-never-named
version: 1
kind: rule
title: No client, person or private source is ever named in this public repository
description: Work done under a non-disclosure agreement reaches the site only as anonymised, mined facts; no client or person name, private repository, path or copied text appears in any tracked file, built page or commit message, and the gate that checks it reads its list from outside the repository.
statement: Never write a client's or a person's name, a private repository or path, or text copied from a private source into any file, page, commit message or branch of this repository; publish experience only through scripts/mine-experience.mjs and its controlled vocabulary, keep the denylist outside the repository (~/.config/korczis-hub/, the CI secret NDA_DENYLIST), and keep scripts/check-nda.mjs passing.
status: active
class: blocking
depends_on: [project.data-measured@1]
tags: [legal, privacy, content, enforcement]

x-majordomus:
  reviewed_because: the decision is the repository's own gate scripts/check-nda.mjs (tracked files, the built site, the branch's commit messages), which the gate manifest runs in npm run check, npm run verify, the pre-push hook, CI and before every deployment; no validator of the Majordomus doctrine dispatches it
---

# Rationale

ADR 0006. The repository and the site are public, and a disclosure cannot be taken back: a name in
one commit message stays in the history of every clone. The protection therefore cannot depend on
anyone remembering, and the list it checks against cannot live where it would itself disclose.

# Required behaviour

- Experience from private work is mined (ADR 0006): neutral ids, sector and capability keys from
  `data/experience-rules.toml`, periods, rounded scale buckets and public technology names.
  Every sentence about it comes from generic templates in `i18n/experience.toml`.
- The names to avoid live only in `~/.config/korczis-hub/nda-denylist.txt` and the private
  engagement map; CI reads them from the secret `NDA_DENYLIST`, which holds the whole composed
  list (`node scripts/check-nda.mjs --secret | gh secret set NDA_DENYLIST …`, the list only ever
  into a pipe). In CI the gate also fails when it cannot scan the branch's commit messages.
- A gate's finding names the file and line, never the name it matched.
- An owner's quotation that contains a protected name is recorded with the name replaced by
  `[client]` (ADR 0006 is the example); the redaction is stated where it is made.

# Failure behaviour

`scripts/check-nda.mjs` exits 1 on any match in a tracked text file, the built site or a commit
message on the branch; under CI it exits 1 when no list is available, naming the secret to set.

# Verification

```sh
node scripts/check-nda.mjs
node scripts/check-nda.mjs --site public
```
