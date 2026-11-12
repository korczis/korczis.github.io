// Site shell and the one component layer every visual goes through (rule project.viz-component-layer).
//
//   KorczisHub.viz(name, { lib, mount })   register a visual; lib names a vendor bundle
//   <div data-viz="name" data-source="id">  a box the layer mounts it into, when it scrolls near
//   KorczisHub.data(id)                    the JSON a template embedded in <script id=… type=json>
//   KorczisHub.palette()                   theme-aware colours, read from the compiled CSS tokens
//
// A visual's library is fetched only when its box comes near the viewport, so the home page does
// not download ~900 KB of chart code up front. On a theme change every mounted visual is asked to
// redraw (mount returns { update, destroy }); the Pro dashboard does the same with its 'dark-mode'
// event.
(() => {
  const root = document.documentElement;
  const base = root.dataset.base || '/';
  const registry = new Map();
  const mounted = new Map();
  const loading = new Map();

  const LIBS = {
    p5: 'js/vendor/p5.min.js',
    cytoscape: 'js/vendor/cytoscape.min.js',
    chartjs: 'js/vendor/chart.umd.min.js',
    echarts: 'js/vendor/echarts.min.js',
  };

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDark = () => root.classList.contains('dark');

  function lib(name) {
    if (!name) return Promise.resolve();
    if (!LIBS[name]) return Promise.reject(new Error(`unknown library ${name}`));
    if (!loading.has(name)) {
      loading.set(
        name,
        new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = base + LIBS[name];
          script.async = true;
          script.onload = resolve;
          script.onerror = () => reject(new Error(`failed to load ${LIBS[name]}`));
          document.head.appendChild(script);
        }),
      );
    }
    return loading.get(name);
  }

  function data(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error(`no embedded data #${id}`);
    return JSON.parse(node.textContent);
  }

  // Tailwind 4 declares its palette in oklch(), which Chart.js, ECharts and Cytoscape cannot
  // parse. One 1x1 canvas turns any CSS colour the browser understands into rgb().
  const rgbCache = new Map();
  let probe = null;

  function toRgb(css) {
    if (!css) return css;
    if (rgbCache.has(css)) return rgbCache.get(css);
    probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = '#000';
    probe.fillStyle = css;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    const rgb = `rgb(${r}, ${g}, ${b})`;
    rgbCache.set(css, rgb);
    return rgb;
  }

  function token(name) {
    return toRgb(getComputedStyle(root).getPropertyValue(name).trim());
  }

  function alpha(rgb, a) {
    return rgb.replace(/^rgb\(([^)]+)\)$/, `rgba($1, ${a})`);
  }

  // Colours come from the Tailwind theme tokens, so a chart and a card can never disagree.
  function palette() {
    return {
      dark: isDark(),
      text: token('--hub-text'),
      strong: token('--hub-strong'),
      muted: token('--hub-muted'),
      grid: token('--hub-grid'),
      surface: token('--hub-surface'),
      page: token('--hub-page'),
      primary: token('--hub-primary'),
      primarySoft: token('--hub-primary-soft'),
      // Sequential ramp for heatmaps: no activity first, then four steps of the primary.
      ramp: [0, 1, 2, 3, 4].map((step) => token(`--hub-ramp-${step}`)),
      font: getComputedStyle(root).getPropertyValue('--font-sans').trim() || 'system-ui, sans-serif',
      alpha,
    };
  }

  async function mount(box) {
    if (mounted.has(box)) return;
    const name = box.dataset.viz;
    const spec = registry.get(name);
    if (!spec) return;
    mounted.set(box, null);
    try {
      await lib(spec.lib);
      const source = box.dataset.source ? data(box.dataset.source) : null;
      const handle = (await spec.mount(box, source, { palette, reducedMotion, isDark })) || {};
      mounted.set(box, handle);
      box.dataset.vizState = 'ready';
    } catch (error) {
      box.dataset.vizState = 'error';
      console.error(`[hub] ${name}:`, error);
    }
  }

  function scan() {
    const boxes = document.querySelectorAll('[data-viz]');
    if (!('IntersectionObserver' in window)) {
      boxes.forEach(mount);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          mount(entry.target);
        }
      },
      { rootMargin: '300px 0px' },
    );
    boxes.forEach((box) => observer.observe(box));
  }

  function viz(name, spec) {
    registry.set(name, spec);
  }

  function setTheme(dark) {
    root.classList.toggle('dark', dark);
    try {
      localStorage.setItem('color-theme', dark ? 'dark' : 'light');
    } catch {}
    document.dispatchEvent(new Event('dark-mode'));
  }

  document.addEventListener('dark-mode', () => {
    for (const handle of mounted.values()) handle?.update?.();
  });

  // Follow the system theme only while the visitor has not chosen one.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    let chosen = null;
    try {
      chosen = localStorage.getItem('color-theme');
    } catch {}
    if (!chosen) {
      root.classList.toggle('dark', event.matches);
      document.dispatchEvent(new Event('dark-mode'));
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('theme-toggle');
    toggle?.addEventListener('click', () => setTheme(!isDark()));
    // Registrations run from deferred scripts after this one; scan once they are all in.
    queueMicrotask(scan);
  });

  // --- Sidebar: Flowbite Drawer owns open, close, Escape, backdrop and scroll lock below lg. --------
  // The Pro shell stacks navbar z-30 > sidebar z-20 > backdrop z-10; Flowbite's default backdrop
  // (z-30) would lie over the drawer and swallow every tap in it (Kompendium, measured). From lg
  // up the sidebar is always visible, so it must not stay aria-hidden; below lg a closed drawer is
  // inert, opening moves focus in and closing returns it to the toggle. Attributes are written
  // only when they change, because the observer below watches them.
  const DRAWER_BACKDROP = 'fixed inset-0 z-10 bg-gray-900/50 dark:bg-gray-900/90';
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('toggleSidebarMobile');
  const desktop = window.matchMedia('(min-width: 1024px)');
  let drawer = null;

  function setAttr(name, value) {
    if (value === null) {
      if (sidebar.hasAttribute(name)) sidebar.removeAttribute(name);
    } else if (sidebar.getAttribute(name) !== value) {
      sidebar.setAttribute(name, value);
    }
  }

  function syncSidebar() {
    if (!sidebar) return;
    if (desktop.matches) {
      if (drawer && drawer.isVisible()) drawer.hide();
      setAttr('aria-hidden', null);
      setAttr('inert', null);
      return;
    }
    const closed = sidebar.getAttribute('aria-hidden') === 'true' || sidebar.classList.contains('-translate-x-full');
    setAttr('inert', closed ? '' : null);
    if (closed) setAttr('aria-hidden', 'true');
  }

  if (sidebar) {
    // Registered after flowbite.min.js registered its own load handler, so it runs after initDrawers.
    window.addEventListener('load', () => {
      drawer = window.FlowbiteInstances?.getInstance('Drawer', 'sidebar') ?? null;
      if (drawer?._options) drawer._options.backdropClasses = DRAWER_BACKDROP;
      syncSidebar();
    });
    let wasOpen = false;
    new MutationObserver(() => {
      syncSidebar();
      if (desktop.matches) return;
      const open = !sidebar.hasAttribute('inert');
      sidebarToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && !wasOpen) sidebar.querySelector('a[href], input')?.focus();
      else if (!open && wasOpen && (sidebar.contains(document.activeElement) || document.activeElement === document.body)) {
        sidebarToggle?.focus();
      }
      wasOpen = open;
    }).observe(sidebar, { attributes: true, attributeFilter: ['aria-hidden', 'class'] });
    desktop.addEventListener('change', syncSidebar);
    syncSidebar();
  }

  window.KorczisHub = { viz, lib, data, palette, reducedMotion, isDark, base };
})();
