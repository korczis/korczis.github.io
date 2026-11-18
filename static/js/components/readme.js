// The project's README, live (Alpine.js): a work page embeds the README of its repository as the
// forge serves it now, so the page is as current as the repository and nothing is copied into this
// one. Markdown goes through marked (GFM), the HTML through DOMPurify, then relative images resolve
// against the raw files and relative links against the forge's file view, headings move under the
// card's own h2 and get ids of their own (README anchors keep working), tables and code scroll in
// place. GitHub first by raw.githubusercontent.com (no API quota; the live pulse spends that),
// then the API's /readme for a README under another name; GitLab by its files API at HEAD. One
// answer per repository is kept for the session. Offline, blocked or without a README the card
// says so and links the repository; the README excerpt the build measured stays on the page.
//
//   <section x-data="readme({ github: 'https://github.com/o/r', gitlab: '…' })">
//     <div x-ref="body"></div> … state: 'loading' | 'ready' | 'missing' | 'failed'
document.addEventListener('alpine:init', () => {
  const TTL = 10 * 60 * 1000;
  const cacheKey = (url) => `readme:${url}`;
  const cached = (url) => {
    try {
      const hit = JSON.parse(sessionStorage.getItem(cacheKey(url)) || 'null');
      return hit && Date.now() - hit.at < TTL ? hit : null;
    } catch { return null; }
  };
  const remember = (url, value) => {
    try { sessionStorage.setItem(cacheKey(url), JSON.stringify({ ...value, at: Date.now() })); } catch { /* storage off */ }
  };
  const text = async (url, init) => {
    const response = await fetch(url, init);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.text();
  };
  // UTF-8 from the API's base64 (atob alone yields Latin-1).
  const decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
  const dirOf = (url) => url.slice(0, url.lastIndexOf('/') + 1);

  // The README of one forge: its Markdown, the directories its relative paths resolve against
  // (raw files for images, the file view for links) and the repository roots for "/x" paths.
  const FORGES = {
    async github(home) {
      const path = new URL(home).pathname.replace(/^\/|\/$/g, '');
      const raw = `https://raw.githubusercontent.com/${path}/HEAD/`;
      const md = await text(`${raw}README.md`);
      const blob = `${home}/blob/HEAD/`;
      if (md !== null) return { md, raw, blob, roots: { raw, blob } };
      const meta = await text(`https://api.github.com/repos/${path}/readme`, { headers: { Accept: 'application/vnd.github+json' } });
      if (meta === null) return null;
      const d = JSON.parse(meta);
      return { md: decode(d.content), raw: dirOf(d.download_url), blob: dirOf(d.html_url), roots: { raw, blob } };
    },
    async gitlab(home) {
      const url = new URL(home);
      const path = url.pathname.replace(/^\/|\/$/g, '');
      // The forge's API, not a page of this site (the viz-layer gate reads "projects/" as one).
      const api = new URL('/api/v4/projects/', url.origin);
      const md = await text(`${api}${encodeURIComponent(path)}/repository/files/README.md/raw?ref=HEAD`);
      const raw = `${home}/-/raw/HEAD/`;
      const blob = `${home}/-/blob/HEAD/`;
      return md === null ? null : { md, raw, blob, roots: { raw, blob } };
    },
  };

  const slug = (s) => s.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');
  // A path relative to the README; "/x" is relative to the repository root on both forges.
  const resolve = (href, base, root) => {
    if (/^[a-z][a-z0-9+.-]*:|^\/\/|^#/i.test(href)) return href;
    return new URL(href.replace(/^\//, ''), href.startsWith('/') ? root : base).href;
  };

  // Markdown to a sanitised, rebased fragment ready for the card.
  function render({ md, raw, blob, roots }) {
    const html = window.DOMPurify.sanitize(window.marked.parse(md, { gfm: true, async: false }), { USE_PROFILES: { html: true } });
    const box = document.createElement('div');
    box.innerHTML = html;
    const ids = new Map();
    for (const h of box.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      const level = Math.min(6, Number(h.tagName[1]) + 2);
      const next = document.createElement(`h${level}`);
      next.innerHTML = h.innerHTML;
      const base = `readme-${slug(h.textContent) || 'section'}`;
      const n = ids.get(base) ?? 0;
      ids.set(base, n + 1);
      next.id = n ? `${base}-${n}` : base;
      h.replaceWith(next);
    }
    // Every candidate of a srcset (<img>, or <source> in a <picture> that switches on the theme).
    const rebaseSet = (set) => set.split(',').map((c) => c.trim()).filter(Boolean)
      .map((c) => { const [u, ...w] = c.split(/\s+/); return [resolve(u, raw, roots.raw), ...w].join(' '); }).join(', ');
    for (const el of box.querySelectorAll('img[srcset], source[srcset]')) el.setAttribute('srcset', rebaseSet(el.getAttribute('srcset')));
    for (const img of box.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      if (src) img.src = resolve(src, raw, roots.raw);
      if (!img.hasAttribute('alt')) img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
    }
    for (const a of box.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (href.startsWith('#')) {
        a.setAttribute('href', `#readme-${slug(decodeURIComponent(href.slice(1)))}`);
        continue;
      }
      a.href = resolve(href, blob, roots.blob);
      a.target = '_blank';
      a.rel = 'noopener';
      // A badge or an image link whose image says nothing still needs a name (axe link-name).
      if (!a.textContent.trim() && ![...a.querySelectorAll('img')].some((i) => i.alt.trim())) {
        a.setAttribute('aria-label', new URL(a.href).hostname + new URL(a.href).pathname);
      }
    }
    // A wide table scrolls in a focusable wrapper; a code block scrolls itself, so it takes the
    // focus (axe scrollable-region-focusable: a keyboard must reach what scrolls).
    for (const el of box.querySelectorAll('table')) {
      const wrap = document.createElement('div');
      wrap.className = 'overflow-x-auto';
      wrap.tabIndex = 0;
      el.replaceWith(wrap);
      wrap.append(el);
    }
    for (const el of box.querySelectorAll('pre')) el.tabIndex = 0;
    return box;
  }

  Alpine.data('readme', (hosts) => ({
    state: 'loading',
    source: hosts.github || hosts.gitlab,

    async init() {
      const forge = hosts.github ? 'github' : 'gitlab';
      try {
        const got = cached(this.source)?.value ?? await FORGES[forge](this.source);
        remember(this.source, { value: got });
        if (!got || !got.md.trim()) { this.state = 'missing'; return; }
        this.$refs.body.replaceChildren(...render(got).childNodes);
        this.state = 'ready';
      } catch {
        this.state = 'failed';
      }
    },
  }));
});
