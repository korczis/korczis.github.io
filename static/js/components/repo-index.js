// Repository index (Alpine.js): search, category, host and language filters, sortable column
// headers and Flowbite Pro pagination over the rows the template rendered; the page is complete
// without JavaScript (every row shows, the headers are plain). The whole view lives in the URL
// query (?q=&category=&host=&language=&sort=&dir=&page=), so a sorted, filtered page can be linked.
document.addEventListener('alpine:init', () => {
  // The direction a column sorts in on its first click: names A-Z, numbers and dates newest first.
  const FIRST_DIR = { name: 'asc', category: 'asc', language: 'asc', stars: 'desc', created: 'desc', pushed: 'desc' };
  const FILTERS = ['q', 'category', 'host', 'language'];
  const PAGE_SIZE = 25;

  Alpine.data('repoIndex', () => ({
    q: '',
    category: '',
    host: '',
    language: '',
    sort: 'pushed',
    dir: 'desc',
    page: 1,
    size: PAGE_SIZE,
    rows: [],
    total: 0,
    shown: 0,

    init() {
      const params = new URLSearchParams(window.location.search);
      for (const key of FILTERS) if (params.get(key)) this[key] = params.get(key);
      if (FIRST_DIR[params.get('sort')]) this.sort = params.get('sort');
      this.dir = ['asc', 'desc'].includes(params.get('dir')) ? params.get('dir') : FIRST_DIR[this.sort];
      this.page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
      this.rows = [...this.$refs.rows.querySelectorAll('[data-repo]')].map((el) => ({ el, ...el.dataset, stars: Number(el.dataset.stars) }));
      this.total = this.rows.length;
      // A new filter starts again at the first page; paging alone keeps the filter.
      FILTERS.forEach((key) => this.$watch(key, () => { this.page = 1; this.apply(); }));
      this.apply();
    },

    sortBy(key) {
      if (this.sort === key) this.dir = this.dir === 'asc' ? 'desc' : 'asc';
      else [this.sort, this.dir] = [key, FIRST_DIR[key]];
      this.page = 1;
      this.apply();
    },

    ariaSort(key) {
      if (this.sort !== key) return 'none';
      return this.dir === 'asc' ? 'ascending' : 'descending';
    },

    compare(a, b) {
      // A category sorts by its name in the page's language, not by its key.
      const key = this.sort === 'category' ? 'categoryName' : this.sort;
      const by = key === 'stars' ? a.stars - b.stars : String(a[key] ?? '').localeCompare(String(b[key] ?? ''), KorczisHub.locale);
      // Ties fall back to the name, always A-Z, so the order is stable whatever the direction.
      return (this.dir === 'asc' ? by : -by) || a.name.localeCompare(b.name);
    },

    apply() {
      const needle = this.q.trim().toLowerCase();
      const matches = [];
      for (const row of [...this.rows].sort((a, b) => this.compare(a, b))) {
        const hosts = row.host.trim().split(/\s+/);
        const match = (!needle || row.text.includes(needle))
          && (!this.category || row.category === this.category)
          && (!this.language || row.language === this.language)
          && (!this.host || (this.host === 'both' ? hosts.length === 2 : hosts.includes(this.host)));
        this.$refs.rows.appendChild(row.el);
        row.el.hidden = true;
        if (match) matches.push(row);
      }
      this.shown = matches.length;
      this.page = Math.min(this.page, this.pages);
      matches.slice(this.from - 1, this.to).forEach((row) => { row.el.hidden = false; });
      this.remember();
    },

    go(page) {
      if (page < 1 || page > this.pages || page === this.page) return;
      this.page = page;
      this.apply();
      this.$refs.table?.scrollIntoView({ block: 'nearest' });
    },

    get pages() {
      return Math.max(1, Math.ceil(this.shown / this.size));
    },

    get from() {
      return this.shown ? (this.page - 1) * this.size + 1 : 0;
    },

    get to() {
      return Math.min(this.page * this.size, this.shown);
    },

    // At most five page buttons, centred on the current page.
    get pageList() {
      const start = Math.max(1, Math.min(this.page - 2, this.pages - 4));
      return Array.from({ length: Math.min(5, this.pages) }, (_, i) => start + i);
    },

    remember() {
      const params = new URLSearchParams(window.location.search);
      for (const key of FILTERS) this[key] ? params.set(key, this[key]) : params.delete(key);
      this.sort !== 'pushed' ? params.set('sort', this.sort) : params.delete('sort');
      this.dir !== FIRST_DIR[this.sort] ? params.set('dir', this.dir) : params.delete('dir');
      this.page > 1 ? params.set('page', String(this.page)) : params.delete('page');
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    },

    reset() {
      this.q = '';
      this.category = '';
      this.host = '';
      this.language = '';
      [this.sort, this.dir, this.page] = ['pushed', 'desc', 1];
      this.apply();
    },
  }));
});
