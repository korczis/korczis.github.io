---
id: project.dossiers-inferred
version: 1
kind: rule
title: Repository dossiers are inferred, carry their provenance and say so wherever shown
description: data/dossiers/<repo>.json holds, for each original public repository, a problem, a solution, a stack and a Mermaid architecture inferred from the repository's own files; each carries the commit and date it was read at and a confidence, is labelled inferred wherever it is shown, is re-mined when the repository's head moves, and passes the NDA gate.
statement: Write a repository dossier only as data/dossiers/<repo>.json in the shape of static/schemas/dossier.schema.json, for an original of data/index.json that is not hidden, inferred from that repository's own files with sources.commit, sources.read_at and a confidence; label it inferred wherever it is shown, never present it as measured fact, name no client, person or private source, and keep scripts/check-dossiers.mjs and scripts/check-nda.mjs passing.
status: active
class: blocking
depends_on: [project.data-measured@1, project.nda-never-named@1, project.i18n-everywhere@1]
tags: [data, honesty, inferred, content, nda]

x-majordomus:
  reviewed_because: the decision is the repository's own gate scripts/check-dossiers.mjs together with scripts/check-nda.mjs, which the gate manifest runs in npm run check, npm run verify, the pre-push hook and CI; no validator of the Majordomus doctrine dispatches them
---

# Rationale

Rule `project.data-measured` keeps every number measured. A project page also needs words a
repository's metadata does not hold: what problem the code solves, how, on which stack, and what
its parts are. Those words are read from the repository's own files by an agent, so they are an
inference, not a measurement. Stated as an inference, with where and when it was read and how sure
the reader was, it is honest; presented as fact it would be the hand-typed claim the site refuses.
Every public repository is the owner's own work (ADR 0003), but its history can still hold a
client's or a person's name, so the dossier passes the same NDA gate as every other file (ADR 0006).

# Required behaviour

- One file per repository, `data/dossiers/<repo>.json`, named after the repository's name in
  `data/index.json`, in the shape of `static/schemas/dossier.schema.json`
  (`korczis-hub-dossier/v1`), which the site publishes like its other schemas.
- Only originals of `data/index.json` get a dossier, never one on the `[index] hidden` list of
  `data/projects.toml`; `related` names only other originals. Its `sources.github` and
  `sources.gitlab` are the index's own URLs.
- Provenance is part of the dossier: `provenance: inferred`, `sources.commit` (the head the files
  were read at), `sources.read_at`, `sources.read` (the files read) and `confidence` (low, medium,
  high).
- Wherever a dossier is shown (a project page, llms.txt, JSON-LD, an OG card), it is labelled as
  inferred, with its commit, date and confidence, and links its sources; no page states it as a
  measured fact.
- Every text is in every language of the site (`en`, `cs`), none blank (rule `project.i18n-everywhere`).
- The architecture is a Mermaid `flowchart LR` or `flowchart TD` of 4 to 12 nodes, with no HTML
  and no `click`, `style`, `linkStyle`, `classDef`, `class` or `%%` init directive: the page
  generator styles and links diagrams itself, and a diagram cannot inject markup or links.
- A dossier names no client, person, private repository or path (rule `project.nda-never-named`):
  problems, solutions and stacks only. `scripts/check-nda.mjs` scans `data/dossiers/` as tracked
  files, and `scripts/check-dossiers.mjs` runs the denylist on each dossier as well.
- A dossier is re-mined when its repository's head moves past `sources.commit` (the index records
  each repository's push date). The re-mining job is not built yet; until it is, a stale dossier
  stays labelled with the commit it was read at, which keeps it honest.
- An original without a dossier is reported by the gate, not failed: a dossier waits until its
  repository has been read, and a repository may be left without one on purpose.

# Failure behaviour

`scripts/check-dossiers.mjs` exits 1 on a dossier that does not match the schema; a repository
that is not an original of `data/index.json`, or is hidden; a file not named after its repository;
source URLs that differ from the index; a `related` name that is not another original, or is
repeated; a Mermaid block that is not `flowchart LR`/`TD`, has fewer than 4 or more than 12 nodes,
or contains HTML or a `click`, `style` or init directive; a missing or blank `en` or `cs` text; or
a denylisted name. It lists the originals without a dossier and still exits 0 for them.

# Verification

```sh
node scripts/check-dossiers.mjs
node scripts/check-nda.mjs
```
