---
id: project.hire-surfaces
version: 1
kind: rule
title: One positioning from cv.hire.headline on every surface, every page links /hire/, nothing hidden
description: While data/cv.toml [hire] says the owner is available, the name and the headline lead the home h1, the titles, the profile OG cards, the JSON-LD jobTitle, llms.txt and resume.json, every page links /hire/ from its navigation, and every hire fact is visible text first; available = false removes every signal with no other edit.
statement: Take the owner's role only from cv.hire.headline (headline_cs in Czech) and availability only from cv.hire.available; put every hire fact in visible text, JSON-LD in parity, llms.txt and resume.json, never only in a comment and never in text hidden from people; link /hire/ from every page's navigation while available; and keep check-profile.mjs, build-llms.mjs --check, build-resume.mjs --check, check-front-matter.mjs and check-seo.mjs passing.
status: active
class: blocking
depends_on: [project.seo-derived@2, project.data-measured@1, project.i18n-everywhere@1]
tags: [hire, profile, seo, machine-readable, honesty]

x-majordomus:
  reviewed_because: the decision is the repository's own gates, scripts/check-profile.mjs, scripts/build-llms.mjs --check, scripts/build-resume.mjs --check, scripts/check-front-matter.mjs and scripts/check-seo.mjs, which the gate manifest runs in npm run check, npm run verify, the pre-push hook and CI, and the first-viewport assertions of scripts/audit-ui.mjs; no validator of the Majordomus doctrine dispatches them
---

# Rationale

ADR 0007 put the owner's availability on the site; ADR 0008 makes it the site's one positioning.
A hiring manager gives a landing page seconds, and the answer engines and sourcing tools that read
it for recruiters (`.ai/repo/knowledge/curated/ai-readers-and-sourcing-tools.md`) match a candidate
on title, availability and how consistently the person is described across surfaces. Before this
rule the home h1, the home title, /about/, the JSON-LD and the llms.txt summary each named a
different role, and `## Hire` was the eighth section of llms.txt: four surfaces, four people.
One source, rendered everywhere, cannot drift; a fact that only a comment carries is read by
almost no extractor; text hidden from people is deception (ADR 0007), whoever it is aimed at.

# Required behaviour

- **One source.** The role is `cv.hire.headline` (`headline_cs` in the Czech tree); availability
  is `cv.hire.available`. No template reads `gh.profile.hireable` or types a role or a seniority.
- **One positioning, while available:**
  - the home h1 (en and cs) is `config.extra.author` plus the headline; the former hero title is the
    sub-lead, and is the h1 again when `available = false`;
  - the /about/ role line equals the headline; /hire/'s h1 is the author and the headline;
  - the `seo_title` of home, about and hire carries the author and the headline's role noun;
  - the profile OG cards (home, about, hire) show the availability text `hero_hire`;
  - the JSON-LD Person's `jobTitle` is the headline;
  - `static/llms.txt` opens its blockquote with the name and the headline, then remote, the time
    zone and the /hire/ URL, and `## Hire` is its first H2;
  - `static/resume.json` and `static/cs/resume.json` (JSON Resume 1.0.0) are derived by
    `scripts/build-resume.mjs` from `data/cv.toml`, `data/github.json`, the skills of
    `data/index.json` and `data/projects.toml`, with the headline as `basics.label` and the
    anonymised organisation kept anonymised (rule `project.nda-never-named`).
- **Reachable from everywhere.** Every built page links `/hire/` (`/cs/hire/` in the Czech tree)
  inside `<nav>`: a Flowbite primary button from 375 px wide. On the home page the h1 and a /hire/
  link are in the first viewport at 375x667 and 1440x900, in both themes, and the button is at
  least 24x24 px (rule `project.ui-quality-gate`).
- **Visible first, then data.** A hire fact lives in the page's visible text and, in parity with it,
  in JSON-LD (rule `project.seo-derived`), llms.txt and resume.json. The head comment of ADR 0007
  mirrors /hire/ and adds nothing; it is not extended, because most extractors drop it.
- **Nothing hidden, nothing addressed to a screening model.** No text styled away, zero-sized,
  off-screen or in Unicode tag characters, and no machine-only text that the page does not also
  show; no instruction to rank, prefer, trust or ignore (ADR 0007).
- **Facts only the owner states.** A rate, work authorisation, notice period, start date or country
  is rendered only when `data/cv.toml` states it; none is inferred (ADR 0004).
- **One switch.** `available = false` removes the hire pill, the navigation button, the Offers, the
  FAQ, the llms.txt section, the availability in resume.json and the head comment, and returns the
  h1 to the hero title, with no other edit.

# Failure behaviour

`scripts/check-profile.mjs` exits 1, while available, on a home h1 (en or cs) without the author
and the headline, a built page without a /hire/ link in `<nav>` (or one leaving its language tree),
an /about/ role line that differs from the headline, or a template that reads `gh.profile.hireable`.
`scripts/build-llms.mjs --check` exits 1 on a stale llms.txt, a blockquote without the headline and
the /hire/ URL, or `## Hire` not first. `scripts/build-resume.mjs --check` exits 1 on a stale
resume.json or one the vendored schema `static/schemas/jsonresume.schema.json` refuses.
`scripts/check-front-matter.mjs` exits 1 on a profile `seo_title` without the author and the role
noun. `scripts/check-seo.mjs` exits 1 on a /hire/ h1 without the author. `scripts/audit-ui.mjs`
fails on an h1 or /hire/ link outside the first viewport. Until a check named here is in its script,
the gate manifest reports the script as not landed, or a reviewer owns the assertion.

# Verification

```sh
npm run derive && npm run build
node scripts/check-profile.mjs
node scripts/build-llms.mjs --check && node scripts/build-resume.mjs --check
node scripts/check-front-matter.mjs && node scripts/check-seo.mjs
npm run verify -- --audit-only --only home
```
