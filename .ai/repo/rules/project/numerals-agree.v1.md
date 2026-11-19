---
id: project.numerals-agree
version: 1
kind: rule
title: Every count in running text agrees with its word, in every language and at every number the data can give
description: A text with a count either takes the plural form its number needs (key__one, key__few, key__other, chosen by scripts/lib/derive.mjs t() in generators and by the count component in templates) or is phrased so that no form depends on the number ("Pages: {n}", "in commits ({n})"); scripts/check-numerals.mjs refuses a disagreeing count anywhere in the built site.
statement: Write a text with a count as plural keys (key__one, key__few, key__other, each with {n}) rendered by t() in scripts or the count component in templates, or phrase it as a label and its value; use caption style (a capitalised nominative) for the label under a KPI figure; and keep the numerals gate passing.
status: active
class: blocking
depends_on: [project.i18n-everywhere@1, project.data-measured@1]
tags: [content, i18n, typography]

x-majordomus:
  reviewed_because: the decision is the repository's own gate (scripts/check-numerals.mjs over the build), run by the gate manifest in npm run check, npm run verify, the pre-push hook and CI; no validator of the Majordomus doctrine dispatches it
---

# Rationale

Every figure on the site is measured and changes with the data, so a sentence written for the number
it had on the day ("{n} pages of this site build on this term") reads wrong the day the number becomes
1 ("1 pages"). Czech has three forms (1 měsíc, 2 měsíce, 5 měsíců) and a case after a preposition
("v 1 repozitáři", "ve 3 repozitářích"); the owner's order of 2026-11-18 asks for the typographic
rules to be kept and enforced, not advised.

# Required behaviour

- **Plural keys.** A text whose word depends on the count has `key__one`, `key__few` and `key__other`,
  each with `{n}`, in every language (English gives `few` the text of `other`). Generators render it
  with `t(key, lang, { n })`, which picks the form by `Intl.PluralRules`; templates with
  `{{ <count n={n} key="key" lang={lang} /> }}` from `templates/components.html`.
- **Or no dependency.** A label and its value ("Pages: {n}", "Odvozeno ze shody v commitech ({n})")
  needs no form and is preferred where it reads as well.
- **KPI captions.** The label under a figure is a caption in the nominative ("Months with measured
  commits", "Měsíce s naměřenými commity"), never the continuation of a sentence the figure begins.

# Failure behaviour

`node scripts/check-numerals.mjs` (after the build) exits 1 and names the text and the pages where a
count disagrees with its word: in English a 1 followed by a plural noun; in Czech a 1 followed by a
genitive or locative plural, or 2 to 4 followed by a genitive plural that no preposition governs.
Bucket floors (`2+`), decimals, dates and versions are not counts of the next word and are skipped.
