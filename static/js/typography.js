// Typography rules per language, one file for both places that set text: scripts/build-i18n.mjs
// applies them to every interface string at build time (so the HTML is right without JavaScript),
// and the browser applies them once to the text that comes from data and Markdown (catalogue
// taglines, articles) in <main>. Only text is touched: never a tag, an attribute, code, a URL or a
// {placeholder}. Rules (cs, after Czech typesetting practice and ČSN 01 6910):
//  - a non-breaking space after a one-letter preposition or conjunction (k, s, v, z, o, u, a, i),
//    so no line ends with one;
//  - a non-breaking space after the abbreviations that bind to the next word (č., tj., tzv., např.,
//    resp., cca), inside a numeric date (17. 11. 2026) and between a currency code and its amount;
//  - a spaced hyphen becomes an en dash (also in English).
// usage (browser): <script src="/js/typography.js" defer>; KorczisTypography.apply(lang, text)
// usage (Node):    vm.runInNewContext(source, ctx); ctx.KorczisTypography.apply(lang, text)
(function (root) {
  'use strict';

  const NBSP = ' ';
  const rules = {
    common: [
      [/(\S) - (?=\S)/g, `$1 – `],
    ],
    cs: [
      // One-letter prepositions and conjunctions; applied twice so "a v Brně" binds both.
      [/(^|[\s(„"'–—/])([kKsSvVzZoOuUaAiI]) (?=\S)/g, `$1$2${NBSP}`],
      [/(^|[\s(„"'–—/])([kKsSvVzZoOuUaAiI]) (?=\S)/g, `$1$2${NBSP}`],
      [/(^|[\s(])(č\.|tj\.|tzv\.|např\.|resp\.|cca) (?=\S)/g, `$1$2${NBSP}`],
      [/(\d{1,2}\.) (?=\d{1,2}\.)/g, `$1${NBSP}`],
      [/(\d{1,2}\.) (?=\d{4}\b)/g, `$1${NBSP}`],
      [/\b(USD|EUR|CZK|Kč) (?=\d)/g, `$1${NBSP}`],
    ],
  };

  // The text runs of a string: the parts outside tags, Markdown link targets and {placeholders}.
  const SKIP = /(<[^>]*>|\]\([^)]*\)|\{[a-z_]+\}|`[^`]*`|https?:\/\/\S+)/g;

  function text(lang, s) {
    const list = [...rules.common, ...(rules[lang] ?? [])];
    return list.reduce((t, [re, to]) => t.replace(re, to), s);
  }

  function apply(lang, s) {
    if (typeof s !== 'string' || !s) return s;
    return s.split(SKIP).map((part, i) => (i % 2 ? part : text(lang, part))).join('');
  }

  // The browser pass: text nodes in <main> whose language has rules, skipping code and forms.
  function run(doc) {
    const lang = (doc.documentElement.lang || '').slice(0, 2);
    const main = doc.querySelector('main');
    if (!main || !rules[lang]) return;
    const walker = doc.createTreeWalker(main, 4, {
      acceptNode: (n) => (n.parentElement?.closest('code, pre, script, style, textarea, [contenteditable], [data-no-typography]') ? 2 : 1),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const next = text(lang, n.nodeValue);
      if (next !== n.nodeValue) n.nodeValue = next;
    }
  }

  root.KorczisTypography = { apply, run, NBSP };
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => run(root.document));
    else run(root.document);
  }
})(typeof window !== 'undefined' ? window : globalThis);
