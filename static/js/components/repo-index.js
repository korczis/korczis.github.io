// Repository index filter (Alpine.js): search, category, host, language and sort over the rows the
// template rendered; the page is complete without JavaScript. State lives in the URL query.
document.addEventListener('alpine:init', () => {
  Alpine.data('repoIndex', () => ({
    q: '',
    category: '',
    host: '',
    language: '',
    sort: 'pushed',
    rows: [],
    total: 0,
    shown: 0,

    init() {
      const params = new URLSearchParams(window.location.search);
      for (const key of ['q', 'category', 'host', 'language', 'sort']) if (params.get(key)) this[key] = params.get(key);
      this.rows = [...this.$refs.rows.querySelectorAll('[data-repo]')].map((el) => ({ el, ...el.dataset, stars: Number(el.dataset.stars) }));
      this.total = this.rows.length;
      ['q', 'category', 'host', 'language', 'sort'].forEach((key) => this.$watch(key, () => this.apply()));
      this.apply();
    },

    apply() {
      const needle = this.q.trim().toLowerCase();
      const order = [...this.rows].sort((a, b) => {
        if (this.sort === 'stars') return b.stars - a.stars || a.name.localeCompare(b.name);
        if (this.sort === 'name') return a.name.localeCompare(b.name);
        if (this.sort === 'created') return b.created.localeCompare(a.created);
        return b.pushed.localeCompare(a.pushed);
      });
      let shown = 0;
      for (const row of order) {
        const hosts = row.host.trim().split(/\s+/);
        const match = (!needle || row.text.includes(needle))
          && (!this.category || row.category === this.category)
          && (!this.language || row.language === this.language)
          && (!this.host || (this.host === 'both' ? hosts.length === 2 : hosts.includes(this.host)));
        row.el.hidden = !match;
        this.$refs.rows.appendChild(row.el);
        if (match) shown += 1;
      }
      this.shown = shown;
      const params = new URLSearchParams(window.location.search);
      for (const key of ['q', 'category', 'host', 'language']) this[key] ? params.set(key, this[key]) : params.delete(key);
      this.sort !== 'pushed' ? params.set('sort', this.sort) : params.delete('sort');
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    },

    reset() {
      this.q = '';
      this.category = '';
      this.host = '';
      this.language = '';
      this.sort = 'pushed';
    },
  }));
});
