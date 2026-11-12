// Command palette (Alpine.js): ⌘K, Ctrl+K or "/" opens it anywhere (not while typing in a field),
// the input is an ARIA combobox over a listbox, arrows move, Enter opens, Escape or a click
// outside closes and focus returns where it was. The index is #palette-data, derived at build.
document.addEventListener('alpine:init', () => {
  Alpine.data('palette', () => ({
    open: false,
    query: '',
    active: 0,
    items: [],
    returnTo: null,

    init() {
      this.items = KorczisHub.data('palette-data');
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

    show() {
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
      if (item) window.location.href = item.url;
    },
  }));
});
