// The landing's #faq (templates/partials/hire-faq.html, faq_as = "grid"): one list of questions
// that is the Flowbite Pro accordion under md (data-accordion="collapse", which flowbite.min.js
// opens and closes, the first item open, Enter and Space through the native button) and the static
// grid from md up, where every answer shows ("hidden md:block"). From md up this script keeps the
// triggers inert: a click or key never reaches Flowbite, aria-expanded says true (the answer is on
// screen) and the button leaves the tab order. Back under md, aria-expanded follows what Flowbite
// shows again. A hash naming a question (#faq-<key>) opens it under md.
(() => {
  const box = document.querySelector('[data-faq-accordion]');
  if (!box) return;
  const grid = window.matchMedia('(min-width: 768px)');
  const triggers = () => [...box.querySelectorAll('[data-accordion-target]')];
  const bodyOf = (btn) => document.querySelector(btn.getAttribute('data-accordion-target'));

  // Capture phase on the container: it runs before Flowbite's listener on the button itself.
  box.addEventListener('click', (event) => {
    if (grid.matches && event.target.closest('[data-accordion-target]')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  function sync() {
    for (const btn of triggers()) {
      if (grid.matches) {
        btn.setAttribute('aria-expanded', 'true');
        btn.setAttribute('tabindex', '-1');
      } else {
        const open = !bodyOf(btn)?.classList.contains('hidden');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.removeAttribute('tabindex');
      }
    }
  }

  function openHash() {
    if (grid.matches || !location.hash.startsWith('#faq-')) return;
    const btn = document.getElementById(location.hash.slice(1))?.querySelector('[data-accordion-target]');
    if (btn && btn.getAttribute('aria-expanded') !== 'true') btn.click();
  }

  grid.addEventListener('change', sync);
  window.addEventListener('hashchange', openHash);
  // Only after flowbite.min.js has initialised the accordion on load (it registered its handler
  // first): Flowbite reads aria-expanded as the open state, so writing true earlier would open all.
  window.addEventListener('load', () => {
    sync();
    openHash();
  });
})();
