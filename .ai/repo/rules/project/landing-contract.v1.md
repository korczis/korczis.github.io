---
id: project.landing-contract
version: 1
kind: rule
title: The landing's chapters, their ids and order are a contract; every element links, every figure is measured, nothing is hidden
description: The home page answers a hiring team in ten seconds and an engineer in ten minutes in fixed chapters with stable ids; every element in its main region leads to its page, every figure comes from data/ or Zola, owner facts only from data/cv.toml, ?role= only reorders and labels, at most four mail links, nothing hidden, and no inflated label.
statement: Keep the landing's sections hero-title, terms, track, path, roles, case-majordomus, experience, skills, body-of-work, instruments, proven, now, archive, faq and contact in that order and identical in every language; give every element in <main> a link that resolves; take every figure from data/ or Zola and type no digit in a home_*, case_*, body_*, skills_*, proven_* or instruments_* text; take owner facts only from data/cv.toml; let ?role= reorder and label, never add or remove content; keep at most four mailto links in <main>; hide nothing (ADR 0007); never label public evidence "years of experience" or "adopted"; never list a library the owner does not claim as a skill; and keep scripts/check-landing.mjs and node scripts/gates.mjs json --check passing.
status: active
class: blocking
depends_on: [project.hire-surfaces@1, project.data-measured@1, project.everything-interlinked@1, project.i18n-everywhere@1, project.ui-uses-flowbite-pro@1, project.viz-ergonomics@1, project.nda-never-named@1, project.ui-quality-gate@1]
tags: [landing, hire, content, links, honesty]

x-majordomus:
  reviewed_because: the decision is the repository's own gates, scripts/check-landing.mjs (gate landing) and node scripts/gates.mjs json --check (gate gates-json), which the gate manifest runs in npm run check, npm run verify, the pre-push hook and CI, and the first-viewport and ?role= assertions of scripts/audit-ui.mjs under project.ui-quality-gate; no validator of the Majordomus doctrine dispatches them
---

# Rationale

The landing is read twice. A hiring team gives it seconds: name, role, availability, rate, a way to
write, and proof that the role is real. An engineer gives it minutes: the flagship, the client work,
the skills with their evidence, how the numbers are made and how the page is checked. The chapters
serve both in one order, and the order is what a reader, a deep link (`/#terms-start`), an outreach
link (`/?role=<slug>`) and a sourcing tool rely on. A chapter that moves, a figure typed by hand, an
anchor that leads nowhere or a label that inflates the evidence ("years of experience" for a span of
public repositories) costs the page the trust it is built to earn. The reasoning behind the chapters,
and what was tried and dropped, is in `.ai/repo/knowledge/curated/landing-conversion.md`.

# Required behaviour

- **The chapters.** `templates/index.html` renders, in this order and with these ids, in every
  language: `hero-title` (the h1), `terms`, `track`, `path`, `roles`, `case-majordomus` (its h2 keeps
  `majordomus-title`), `experience`, `skills`, `body-of-work`, `instruments`, `proven`, `now`,
  `archive`, `faq`, `contact` (its heading keeps `cta-title`), then the article. A new chapter or a
  new order changes this rule and its gate together.
- **Everything links.** Every `<a>` in `<main>` has an href that resolves to a built file or is an
  external URL; every in-page and cross-page fragment the page uses (`#terms-*`, `#role-*`,
  `/hire/#role-*`, `/about/#cv-*`, `#faq-*`) names an element of its target (rule
  `project.everything-interlinked`).
- **Measured, never typed.** Every figure comes from `data/` or from Zola (reading time, counts);
  no value of a `home_*`, `case_*`, `body_*`, `skills_*`, `proven_*` or `instruments_*` key in
  `i18n/` holds a digit outside a `{placeholder}` (rule `project.data-measured`). The employer cards
  are exactly the `data/cv.toml` roles that carry a `url`, grouped by organisation, so an anonymised
  organisation is left out by structure (rule `project.nda-never-named`).
- **Owner facts from one file.** Availability, roles, rate, start, work authorization, relocation,
  time zone and overlap come only from `data/cv.toml [hire]` (ADR 0004, ADR 0007 and its addendum);
  a fact it does not state is not rendered.
- **Personalised, never cloaked.** `?role=<slug>` (slugs in `data/role-slugs.json`, where a reworded
  role keeps its old slug as an alias) adds one visible badge, reorders the role cards with CSS
  order and names the role in the mail subjects; the server HTML is the default page, the canonical
  stays `/`, and the text minus the badge is the default text.
- **A budget for asking.** At most four `mailto:` links in `<main>`; the copy-email field is the
  only one on the page.
- **Nothing hidden (ADR 0007).** No text in an `aria-hidden` element, styled `display:none`,
  `visibility:hidden` or zero-sized, and no Unicode tag characters; a disclosure the visitor opens
  and a responsive variant are not hidden text.
- **Honest labels.** A span of public repositories is "public evidence", never "years of
  experience"; Majordomus supervises repositories, it is not "adopted"; a forge figure is a
  "listing"; a library the owner does not claim (glossary `claimed = false`, the one list
  `Person.knowsAbout` uses too) is never a skill in `#skills`, `#roles` or the sidebar's skillset
  (`[data-skillset]`).
- **One FAQ.** The landing's questions are `/hire/`'s (one partial, `templates/partials/hire-faq.html`),
  and the FAQPage structured data stays on `/hire/`. Under md they are the Flowbite accordion
  (`data-accordion="collapse"`, each question a button with `aria-expanded` and `aria-controls`, the
  first open); from md up every answer shows as the grid.
- **Client work links its public twins.** Every public repository `data/experience.json`
  `public_work` names for a capability is a link to its `/work/<slug>/` page (or its catalogue entry).
- **Deep links land in view.** A hash target (`#terms-*`, `#faq-*`, a chapter) clears the fixed
  topbar (WCAG 2.2 SC 2.4.11).

# Failure behaviour

`scripts/check-landing.mjs` exits 1 on the built `public/index.html` and `public/cs/index.html` when
a chapter id is missing, out of order or differs between languages; a fragment or a link in `<main>`
resolves to nothing; there are more than four mail links; a landing question differs from `/hire/`'s;
a role slug is not in `data/role-slugs.json`; the FAQ is not an accordion with the first question
open; a public-work name in `#experience` is not a link to its page; an unclaimed library shows in
`#skills`, `#roles` or the sidebar's skillset; a
forbidden label or a hidden-text pattern appears; an employer card is not a `data/cv.toml` role with
a url; or an i18n value of the landing's keys types a digit. `--write` regenerates
`data/role-slugs.json`. `node scripts/gates.mjs json --check` exits 1 on a stale `data/gates.json`.
`scripts/audit-ui.mjs` (rule `project.ui-quality-gate`) fails when the h1, a `/hire/` link, a mail
link or the rate is outside the first viewport at 375x667 or 1440x900, in either theme or language,
or when the `?role=` probe finds no badge, a different first role card, another canonical or other
text; when a hash navigation to `#terms-start`, `#terms-rate`, `#faq-available`, `#track`, `#skills`
or `#contact` leaves its target under the topbar (SC 2.4.11); or when `#faq` is not an accordion
under md (first open, a click opens another and closes it) or hides an answer from md up.

# Verification

```sh
npm run derive && npm run build
node scripts/check-landing.mjs && node scripts/gates.mjs json --check
BASE_URL=http://127.0.0.1:<port>/ SITE_DIR=public node scripts/audit-ui.mjs --only '^(cs-)?(index$|home)'
```
