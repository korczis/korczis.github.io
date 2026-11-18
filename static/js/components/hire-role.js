// The landing's ?role=<slug> (Alpine.js, x-data="hireRole"): an outreach link names one of the
// roles data/cv.toml [hire] lists, and the page says so without changing what it says. The server
// HTML is always the default page; on a known slug (data/role-slugs.json keeps a reworded role's
// old slug as an alias) this component
//   - shows the Flowbite badge "For: <role>" under the h1, linking the role's card, with a close
//     button that clears the parameter (history through KorczisHub.setQuery);
//   - names the role in the subject of every mail link marked [data-mail-role];
//   - puts the role's card (#role-<slug>) first with CSS order, rings it and sets aria-current.
// The DOM order and the content stay the same, so bots and people read one page (no cloaking).
// An unknown slug is ignored. It reads the address only through KorczisHub.query, never
// location.search, and the roles from the page's #home-roles-data island ({roles: [{slug, title,
// subject}], aliases: {old: current}}), in the page's language.
document.addEventListener('alpine:init', () => {
  const RING = ['ring-4', 'ring-primary-300', 'dark:ring-primary-800'];

  Alpine.data('hireRole', () => ({
    roleSlug: null,
    roleTitle: '',

    init() {
      let island = null;
      try {
        island = JSON.parse(document.getElementById('home-roles-data')?.textContent || 'null');
      } catch {
        island = null;
      }
      const wanted = KorczisHub.query('role');
      if (!island || !wanted) return;
      const slug = island.aliases?.[wanted] ?? wanted;
      const role = (island.roles || []).find((r) => r.slug === slug);
      if (!role) return;
      this.roleSlug = role.slug;
      this.roleTitle = role.title;
      for (const a of document.querySelectorAll('a[data-mail-role]')) {
        if (!a.dataset.mailDefault) a.dataset.mailDefault = a.getAttribute('href');
        const address = a.dataset.mailDefault.split('?')[0];
        a.setAttribute('href', `${address}?subject=${encodeURIComponent(role.subject)}`);
      }
      const card = document.getElementById(`role-${role.slug}`);
      if (card) {
        card.style.order = '-1';
        card.classList.add(...RING);
        card.setAttribute('aria-current', 'true');
      }
    },

    clearRole() {
      for (const a of document.querySelectorAll('a[data-mail-role]')) {
        if (a.dataset.mailDefault) a.setAttribute('href', a.dataset.mailDefault);
      }
      const card = this.roleSlug ? document.getElementById(`role-${this.roleSlug}`) : null;
      if (card) {
        card.style.order = '';
        card.classList.remove(...RING);
        card.removeAttribute('aria-current');
      }
      this.roleSlug = null;
      this.roleTitle = '';
      KorczisHub.setQuery('role', null);
    },
  }));
});
