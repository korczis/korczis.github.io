// Three-state theme: light, dark, or the system's (the default). The navbar's Flowbite dropdown
// (templates/partials/navbar.html) and the command palette's actions call KorczisTheme.set(mode).
// The choice is stored as localStorage 'color-theme' = 'light' | 'dark'; "system" removes the key,
// which is what the inline head script and site.js already read as "follow the system" (site.js
// keeps following prefers-color-scheme while no key is stored). Every change of the class
// dispatches 'dark-mode', the Pro dashboard's event, so the visuals redraw in the new palette.
(() => {
  const KEY = 'color-theme';
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  function stored() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  function choice() {
    const value = stored();
    return value === 'light' || value === 'dark' ? value : 'system';
  }

  function apply(mode) {
    const dark = mode === 'dark' || (mode === 'system' && media.matches);
    if (root.classList.contains('dark') === dark) return;
    root.classList.toggle('dark', dark);
    document.dispatchEvent(new Event('dark-mode'));
  }

  function mark() {
    const current = choice();
    document.querySelectorAll('[data-theme-choice]').forEach((item) => {
      item.setAttribute('aria-checked', String(item.dataset.themeChoice === current));
    });
  }

  function set(mode) {
    if (!['light', 'dark', 'system'].includes(mode)) return;
    try {
      if (mode === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch {}
    apply(mode);
    mark();
  }

  document.addEventListener('click', (event) => {
    const item = event.target.closest?.('[data-theme-choice]');
    if (!item) return;
    set(item.dataset.themeChoice);
    window.FlowbiteInstances?.getInstance('Dropdown', 'theme-menu')?.hide();
    document.getElementById('theme-menu-button')?.focus();
  });

  // Paper is light: drop the dark class for the print and put it back after. No 'dark-mode' event,
  // because print hides the visuals and a redraw would only cost time.
  let printedDark = false;
  window.addEventListener('beforeprint', () => {
    printedDark = root.classList.contains('dark');
    root.classList.remove('dark');
  });
  window.addEventListener('afterprint', () => {
    if (printedDark) root.classList.add('dark');
  });

  document.addEventListener('DOMContentLoaded', mark);
  window.KorczisTheme = { set, choice };
})();
