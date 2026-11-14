// Command palette (Alpine.js): ⌘K, Ctrl+K or "/" opens it anywhere (not while typing in a field),
// the input is an ARIA combobox over a listbox, arrows move, Enter opens, Escape or a click
// outside closes and focus returns where it was. The index is <home>/palette.json, derived at
// build (templates/palette.json) and fetched once, on first open; before it come this page's
// actions: the three themes (static/js/components/theme.js), the same page in the other language
// (the navbar's switch) and copying the page's address.
// The shortcut is written as the visitor's system names it: ⌘K on Apple devices, Ctrl K elsewhere.
const PALETTE_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.userAgentData?.platform || navigator.platform || '');
if (!PALETTE_MAC) {
  document.querySelectorAll('[data-shortcut]').forEach((el) => {
    el.textContent = 'Ctrl K';
    // The accessible name starts with what the button shows (WCAG 2.5.3, label in name).
    if (el.dataset.label) el.setAttribute('aria-label', `Ctrl K: ${el.dataset.label}`);
    if (el.hasAttribute('aria-keyshortcuts')) el.setAttribute('aria-keyshortcuts', 'Control+K');
  });
}

document.addEventListener('alpine:init', () => {
  Alpine.data('palette', () => ({
    open: false,
    query: '',
    active: 0,
    items: [],
    loading: null,
    returnTo: null,

    init() {
      window.addEventListener('keydown', (event) => {
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
        if ((event.key === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing && !this.open)) {
          event.preventDefault();
          this.show();
        }
      });
      document.addEventListener('palette:open', () => this.show());
      this.$watch('query', () => { this.active = 0; });
    },

    get results() {
      const words = this.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const scored = this.items
        .map((item) => {
          const name = item.name.toLowerCase();
          const hay = `${name} ${item.hint} ${item.terms ?? ''} ${item.kind}`.toLowerCase();
          if (!words.every((w) => hay.includes(w))) return null;
          const score = words.reduce((s, w) => s + (name.startsWith(w) ? 3 : name.includes(w) ? 2 : 1), 0);
          return { item, score };
        })
        .filter(Boolean);
      if (words.length) scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, 12).map((s) => s.item);
    },

    load() {
      this.loading ??= fetch(`${document.documentElement.dataset.home}palette.json`)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`palette.json: ${response.status}`))))
        .then((items) => { this.items = [...this.actions(), ...items]; })
        .catch((error) => { this.loading = null; console.warn(error.message); });
      return this.loading;
    },

    actions() {
      const t = KorczisHub.t;
      const kind = t('js_palette_action');
      const list = ['light', 'dark', 'system'].map((mode) => ({
        kind, name: t(`js_palette_theme_${mode}`), hint: t('js_palette_theme_hint'), url: `#theme-${mode}`,
        run: () => window.KorczisTheme?.set(mode),
      }));
      const other = document.querySelector('nav a[hreflang]');
      if (other) {
        const code = other.getAttribute('hreflang');
        list.push({ kind, name: t(`js_palette_language_${code}`), hint: other.href, url: other.href });
      }
      if (navigator.clipboard) {
        list.push({ kind, name: t('js_palette_copy'), hint: window.location.href, url: '#copy-link',
          run: () => navigator.clipboard.writeText(window.location.href).catch(() => {}) });
      }
      return list;
    },

    show() {
      this.load();
      if (this.open) return;
      this.returnTo = document.activeElement;
      this.query = '';
      this.active = 0;
      this.open = true;
      this.$nextTick(() => this.$refs.input.focus());
    },

    close() {
      if (!this.open) return;
      this.open = false;
      this.returnTo?.focus?.();
    },

    move(step) {
      const n = this.results.length;
      if (!n) return;
      this.active = (this.active + step + n) % n;
      document.getElementById(`palette-option-${this.active}`)?.scrollIntoView({ block: 'nearest' });
    },

    go(index = this.active) {
      const item = this.results[index];
      if (!item) return;
      if (item.run) {
        item.run();
        this.close();
      } else {
        window.location.href = item.url;
      }
    },
  }));
});
