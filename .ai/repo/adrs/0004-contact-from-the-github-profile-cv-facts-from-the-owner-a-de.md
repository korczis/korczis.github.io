---
schema: adr/v1
id: adr-0004
kind: adr
title: Contact from the GitHub profile, CV facts from the owner, a derived GitHub profile
status: accepted
date: 2026-11-14
tags:
  - content
  - profile
provenance:
  origin: authored
---

# 4. Contact from the GitHub profile, CV facts from the owner, a derived GitHub profile

## Context

An independent audit of production on 2026-11-14 (revision 32894f9) found that the site, meant as
"self promo / cv / like page" (ADR 0003), offers no way to contact the owner (no `mailto:`
anywhere, although the GitHub profile is `hireable: true` with a public email), and that /about/
has no roles, employers, education or spoken languages: none of that can be derived from
repositories. The owner's GitHub profile has no bio, its blog link is `http://`, and there is no
profile README (`korczis/korczis` returns 404).

The owner was asked in Claude Code session `c345d42d-f403-4b60-a5d8-75d67c92d0a5` on
2026-11-14T17:10Z (AskUserQuestion), questions and answers verbatim:

- "Audit zjistil, že na webu nejde nikoho kontaktovat: nikde není mailto, i když GitHub uvádí
  hireable: true a veřejný e-mail. Jak to mám vyřešit?" — "Veřejný e-mail z GitHubu"
- "/about/ je CV odvozené jen z repozitářů (ADR 0003), bez rolí, zaměstnavatelů a vzdělání. Mám
  přidat pracovní historii?" — "Ano, vyplním fakta"
- "GitHub profil korczis nemá bio, odkaz na web vede na http:// a neexistuje profilový README
  (repo korczis/korczis). Mám to upravit? Jde o veřejný obsah na tvém účtu." — "Odkaz na https,
  Bio z popisu webu, Profilový README"

## Decision

1. Contact is the public email of the GitHub profile, measured by `scripts/fetch-github.mjs` into
   `data/github.json` at every refresh: shown as `mailto:` on /about/ and in the footer, and as
   `email` of the JSON-LD Person. When the profile has no public email, nothing is shown.
2. Work history, education and spoken languages live in `data/cv.toml`, written by the owner and
   never by an agent; its shape is `static/schemas/cv.schema.json`, checked by `check-data.mjs`.
   /about/ and the JSON-LD (`hasOccupation`, `worksFor`, `alumniOf`, `knowsLanguage`) render what
   it holds and nothing when it is empty.
3. The GitHub profile's blog link becomes `https://korczis.github.io/` and its bio the site's
   description; the profile README lives in the public repository `korczis/korczis`, generated
   from `https://korczis.github.io/site.json` by that repository's own scheduled workflow, so it
   needs no token from this one.

## Alternatives rejected

- Typing CV facts into templates or inferring them: ADR 0003 forbids hand-typed numbers, and
  facts no source holds must come from the owner.
- Pushing the profile README from this repository's refresh: it would need a write token for
  another repository as a secret here; reading the public site.json needs none.

## Consequences

- /about/ shows a work-history section only once the owner fills `data/cv.toml`.
- The email shown follows the GitHub profile: hiding it there hides it here at the next refresh.
- `korczis/korczis` is a second public surface derived from this site; site.json is its contract.

## Acceptance

Accepted by the owner on 2026-11-15, answering in Claude Code session
8ab4cca0-a58f-4aec-a06b-8c8a1a13b6c5 at 2026-11-15T16:09Z.

- Question: "Which of the five proposed ADRs in korczis.github.io should I mark accepted? (0006, the NDA-mined experience section, is already active.)"
- Answer: "0001 Zola + Flowbite Pro, 0002 lundra runner, 0003 all public repos, 0004 + 0005"
