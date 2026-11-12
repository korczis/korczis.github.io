// Catalogue filter (Alpine.js). Every card is rendered by the template, so the page is complete
// without JavaScript; this component only hides, shows and reorders them. State is kept in the
// URL query (?q=…&category=…) so a filtered view can be linked.
document.addEventListener('alpine:init', () => {
  Alpine.data('projectFilter', () => ({
    q: '',
    category: 'all',
    liveOnly: false,
    supervisedOnly: false,
    sort: 'curated',
    total: 0,
    shown: 0,
    cards: [],

    init() {
      const params = new URLSearchParams(window.location.search);
      this.q = params.get('q') || '';
      this.category = params.get('category') || 'all';
      this.liveOnly = params.get('live') === '1';
      this.supervisedOnly = params.get('supervised') === '1';
      this.sort = params.get('sort') || 'curated';
      this.cards = [...this.$refs.grid.querySelectorAll('[data-card]')].map((el, position) => ({
        el,
        position,
        text: el.dataset.search.toLowerCase(),
        category: el.dataset.category,
        live: el.dataset.live === 'true',
        supervised: el.dataset.supervised === 'true',
        pushed: el.dataset.pushed,
        stars: Number(el.dataset.stars || 0),
        name: el.dataset.name.toLowerCase(),
      }));
      this.total = this.cards.length;
      this.$watch('q', () => this.apply());
      ['category', 'liveOnly', 'supervisedOnly', 'sort'].forEach((key) => this.$watch(key, () => this.apply()));
      this.apply();
    },

    apply() {
      const needle = this.q.trim().toLowerCase();
      const order = [...this.cards].sort((a, b) => {
        if (this.sort === 'stars') return b.stars - a.stars || a.name.localeCompare(b.name);
        if (this.sort === 'name') return a.name.localeCompare(b.name);
        if (this.sort === 'recent') return b.pushed.localeCompare(a.pushed);
        return a.position - b.position;
      });
      let shown = 0;
      order.forEach((card, index) => {
        const match =
          (!needle || card.text.includes(needle)) &&
          (this.category === 'all' || card.category === this.category) &&
          (!this.liveOnly || card.live) &&
          (!this.supervisedOnly || card.supervised);
        card.el.hidden = !match;
        card.el.style.order = String(index);
        if (match) shown += 1;
      });
      this.shown = shown;
      this.remember();
    },

    remember() {
      const params = new URLSearchParams();
      if (this.q) params.set('q', this.q);
      if (this.category !== 'all') params.set('category', this.category);
      if (this.liveOnly) params.set('live', '1');
      if (this.supervisedOnly) params.set('supervised', '1');
      if (this.sort !== 'curated') params.set('sort', this.sort);
      const query = params.toString();
      const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', url);
    },

    reset() {
      this.q = '';
      this.category = 'all';
      this.liveOnly = false;
      this.supervisedOnly = false;
      this.sort = 'curated';
    },
  }));
});
