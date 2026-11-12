// Project detail drawer (Alpine.js + Flowbite Drawer): one drawer per catalogue page, filled from
// the JSON the template embedded (#catalogue-data), opened from a card's Details button or from
// ?project=<repo>. Closed it is inert, so its controls leave the tab order (aria-hidden alone
// would leave focusable content hidden: axe aria-hidden-focus). Focus moves to the close button
// on open and returns to the trigger on close.
document.addEventListener('alpine:init', () => {
  Alpine.data('projectDetail', () => ({
    p: null,
    f: null,
    categoryName: '',
    returnTo: null,
    drawer: null,
    source: null,

    init() {
      this.source = KorczisHub.data('catalogue-data');
      const el = this.$refs.drawer;
      this.drawer = new window.Drawer(el, {
        placement: 'right',
        backdrop: true,
        bodyScrolling: false,
        backdropClasses: 'fixed inset-0 z-40 bg-gray-900/50 dark:bg-gray-900/80',
        onShow: () => {
          el.removeAttribute('inert');
          this.$nextTick(() => this.$refs.close?.focus());
        },
        onHide: () => {
          el.setAttribute('inert', '');
          this.rememberProject(null);
          this.returnTo?.focus();
        },
      }, { id: 'project-drawer', override: true });
      const wanted = new URLSearchParams(window.location.search).get('project');
      if (wanted && this.source.measured[wanted]) this.open(wanted, null);
    },

    open(repo, trigger) {
      this.p = this.source.projects.find((x) => x.repo === repo) || null;
      this.f = this.source.measured[repo] || null;
      // Not `category`: the catalogue filter, an enclosing Alpine scope, owns that name.
      this.categoryName = this.p ? this.source.categories[this.p.category]?.name ?? '' : '';
      this.returnTo = trigger;
      this.rememberProject(repo);
      this.drawer.show();
    },

    close() {
      this.drawer.hide();
    },

    // Not `remember`: the enclosing catalogue filter owns that name too.
    rememberProject(repo) {
      const params = new URLSearchParams(window.location.search);
      if (repo) params.set('project', repo);
      else params.delete('project');
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    },

    date(value) {
      return value ? new Date(value).toLocaleDateString(KorczisHub.locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    },

    get activityLabel() {
      return { active: KorczisHub.t('active'), maintained: KorczisHub.t('maintained'), dormant: KorczisHub.t('archive') }[this.f?.activity] ?? '';
    },
  }));
});
