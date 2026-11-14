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
    echarts: 'js/vendor/echarts.min.js',
    d3: 'js/vendor/d3.min.js',
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

  // Tailwind 4 declares its palette in oklch(), which ECharts, D3 and canvas code cannot
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
      art: [0, 1, 2, 3, 4].map((step) => token(`--hub-art-${step}`)),
      glow: token('--hub-glow'),
      // The night sky behind a tone="night" visual is dark in both themes, so its inks are one set.
      night: {
        ink: token('--hub-night-ink'),
        text: token('--hub-night-text'),
        muted: token('--hub-night-muted'),
        dust: token('--hub-night-dust'),
        line: token('--hub-night-line'),
        shadow: token('--hub-night-shadow'),
      },
      live: token('--hub-live'),
      font: getComputedStyle(root).getPropertyValue('--font-sans').trim() || 'system-ui, sans-serif',
      alpha,
    };
  }

  // --- Shared helpers every visual uses instead of its own copy (rule project.viz-ergonomics). ----
  // One motion config (the owner's ECharts standard: 850 ms cubicOut in, 380 ms updates, a stagger
  // capped at 420 ms); all of it is zero under prefers-reduced-motion.
  const MOTION = { enter: 850, update: 380, hover: 150, stagger: 14, maxDelay: 420, easing: 'cubicOut' };
  const motion = () => (reducedMotion() ? { ...MOTION, enter: 0, update: 0, hover: 0, stagger: 0, maxDelay: 0 } : MOTION);

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

  // FNV-1a: a stable 32-bit hash, so a seeded layout or colour is the same on every visit.
  function hash(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return h >>> 0;
  }

  // The site's own pages, in this page's language (templates/partials/link-index.html):
  //   link('term', 'Rust')        a glossary term by id, title or alias
  //   link('work', 'algoglyph')   a work page by repository
  //   link('category', 'ai')      a category page by key
  //   link('page', 'repositories')  a listing page (projects, work, glossary, repositories)
  //   link('filter', { page: 'repositories', language: 'Rust' })   a listing filtered by its query
  //   link('language', 'Rust')    its term page, else the repositories filtered by it
  //   link('repo', 'name')        its work page, else the repositories searched for it
  // Matching ignores case. A mark with no page here falls back to its source, never to an address
  // assembled by hand.
  let linkIndex = null;
  function link(kind, key) {
    if (key === undefined || key === null || key === '') return null;
    linkIndex ??= (() => {
      try {
        return data('link-index');
      } catch {
        return {};
      }
    })();
    if (kind === 'filter') {
      const { page, ...query } = key;
      const base = link('page', page);
      if (!base) return null;
      const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
      return params.size ? `${base}?${params}` : base;
    }
    if (kind === 'language') return link('term', key) ?? link('filter', { page: 'repositories', language: key });
    if (kind === 'repo') return link('work', key) ?? link('filter', { page: 'repositories', q: String(key).toLowerCase() });
    return linkIndex[kind]?.[String(key).toLowerCase()] ?? null;
  }

  // Colour arithmetic for visuals, on the rgb() strings palette() returns, so no visual keeps a
  // copy (or a colour literal): parse, mix, alpha, WCAG contrast, the most legible ink on a fill,
  // and HSL for hue walks.
  const colour = {
    parse(css) {
      const m = String(toRgb(css)).match(/rgba?\(([^)]+)\)/);
      return m ? m[1].split(',').slice(0, 3).map((x) => Number(x.trim())) : [0, 0, 0];
    },
    css: ([r, g, b], a = 1) => (a >= 1 ? `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})` : `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`),
    mix(a, b, share) {
      const [p, q] = [colour.parse(a), colour.parse(b)];
      return colour.css(p.map((x, i) => x + (q[i] - x) * share));
    },
    alpha: (css, a) => colour.css(colour.parse(css), a),
    luminance(css) {
      const [r, g, b] = colour.parse(css).map((x) => {
        const c = x / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    },
    contrast(a, b) {
      const [p, q] = [colour.luminance(a), colour.luminance(b)].sort((x, y) => y - x);
      return (p + 0.05) / (q + 0.05);
    },
    // The ink of the given set (default: the theme's strongest dark and light) that stands out most
    // on the fill, and whether it reaches the floor (4.5:1 for text by default).
    ink(fill, inks, floor = 4.5) {
      const p = palette();
      const set = inks?.length ? inks : [p.strong, p.page, p.surface];
      const best = set.map((c) => [c, colour.contrast(c, fill)]).sort((x, y) => y[1] - x[1])[0];
      return { ink: best[0], ratio: best[1], ok: best[1] >= floor };
    },
    // A label on a gradient (or on anything with several colours under it): the ink of the set whose
    // worst contrast across every stop is best, and, where even that one stays under the floor, a
    // halo (stroke, paint-order: stroke) in the ink that stands out most against it.
    label(stops, inks, floor = 4.5) {
      const p = palette();
      const set = inks?.length ? inks : [p.strong, p.page];
      const [ink, ratio] = set.map((c) => [c, Math.min(...stops.map((s) => colour.contrast(c, s)))]).sort((a, b) => b[1] - a[1])[0];
      if (ratio >= floor) return { ink, halo: null, ratio };
      const halo = set.map((c) => [c, colour.contrast(c, ink)]).sort((a, b) => b[1] - a[1])[0][0];
      return { ink, halo, ratio };
    },
    toHsl(css) {
      const [r, g, b] = colour.parse(css).map((x) => x / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const d = max - min;
      if (!d) return [0, 0, l];
      const s = d / (1 - Math.abs(2 * l - 1));
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return [(h * 60 + 360) % 360, s, l];
    },
    fromHsl(h, s, l) {
      const k = (n) => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = (n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
      return colour.css([f(0), f(8), f(4)]);
    },
  };

  // Every visual navigates through here: internal links in the same tab, external ones in a new
  // tab, and Ctrl/Cmd/Shift or the middle button always in a new tab, as a link would.
  function go(url, event) {
    if (!url) return;
    const target = new URL(url, location.href);
    const external = target.origin !== location.origin;
    const newTab = external || (event && (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1));
    if (newTab) window.open(target.href, '_blank', 'noopener');
    else location.assign(target.href);
  }

  // --- The frame: maximize, simulator controls and URL state, once for every visual. -------------
  // A visual box is role="img", which may hold no controls, so the layer wraps it in a frame and
  // pins the toolbar over its top-right corner (absolute: nothing shifts). handle.controls()
  // declares the simulator's parameters; the layer renders them as Flowbite controls and keeps
  // their values in the query string (?<id>.<key>=value), so a configured simulation is a link;
  // ?viz=<id> opens the visual maximized.
  const ICON = {
    max: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    min: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    play: '<path d="M7 5v14l12-7z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    screen: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>',
    reset: '<path d="M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0 0 12 3M19 9A7 7 0 0 0 7 6"/>',
  };
  const icon = (name) => `<svg class="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">${ICON[name]}</svg>`;
  const TOOL_BUTTON = 'inline-flex items-center justify-center rounded-lg bg-white/90 p-2 text-gray-600 shadow-sm ring-1 ring-gray-200 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:bg-gray-800/90 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-700 dark:hover:text-white dark:focus:ring-gray-700';
  const RANGE = 'h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-primary-600 dark:bg-gray-600';
  const SELECT = 'block w-full rounded-lg border border-gray-300 bg-gray-50 p-2 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-500 dark:bg-gray-600 dark:text-white dark:focus:border-primary-500 dark:focus:ring-primary-500';
  const LABEL = 'mb-1 flex items-baseline justify-between gap-2 text-sm font-medium text-gray-900 dark:text-white';
  const ACTION = 'inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100 hover:text-primary-700 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:border-gray-500 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 dark:focus:ring-gray-600';

  const vizId = (box) => box.id || box.dataset.source?.replace(/-data$/, '') || box.dataset.viz;
  const frames = new Map();

  let writeTimer = 0;
  const pending = new Map();
  function writeParam(name, value) {
    pending.set(name, value);
    clearTimeout(writeTimer);
    // Browsers throttle replaceState; a dragged range writes once it rests.
    writeTimer = setTimeout(() => {
      const url = new URL(location.href);
      for (const [k, v] of pending) {
        if (v === null || v === undefined) url.searchParams.delete(k);
        else url.searchParams.set(k, String(v));
      }
      pending.clear();
      history.replaceState(history.state, '', url);
    }, 150);
  }
  const readParam = (name) => new URLSearchParams(location.search).get(name);

  function button(name, label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = TOOL_BUTTON;
    b.dataset.vizTool = name;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = icon(name);
    b.addEventListener('click', onClick);
    return b;
  }

  function frame(box) {
    if (frames.has(box)) return frames.get(box);
    const spec = registry.get(box.dataset.viz);
    if (!spec || spec.static) return null;
    const id = vizId(box);
    const wrap = document.createElement('div');
    wrap.className = 'viz-frame';
    wrap.dataset.vizFrame = id;
    box.before(wrap);
    // The card's own heading names the visual in the maximized view.
    const title = box.closest('section')?.querySelector('h2')?.textContent?.trim() || box.getAttribute('aria-label') || '';
    const cap = document.createElement('p');
    cap.className = 'viz-cap';
    cap.textContent = title;
    const bar = document.createElement('div');
    bar.className = 'viz-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', t('js_viz_tools', { title }));
    wrap.append(cap, box, bar);
    const state = { id, wrap, box, bar, cap, max: false, inerted: [], opener: null };
    const maxButton = button('max', t('js_viz_maximize'), () => setMax(state, !state.max));
    maxButton.setAttribute('aria-pressed', 'false');
    bar.append(maxButton);
    state.maxButton = maxButton;
    if (document.fullscreenEnabled) {
      const fs = button('screen', t('js_viz_fullscreen'), () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else (state.max ? Promise.resolve() : setMax(state, true)).then(() => wrap.requestFullscreen?.()).catch(() => {});
      });
      fs.classList.add('viz-only-max');
      bar.append(fs);
    }
    frames.set(box, state);
    return state;
  }

  function setInert(state, on) {
    if (!on) {
      state.inerted.forEach((el) => { el.inert = false; });
      state.inerted = [];
      return;
    }
    for (let node = state.wrap; node && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        // The sidebar's inert belongs to syncSidebar (the drawer's own state), which also keeps it
        // inert while a visual is maximized; writing it here too would let either undo the other.
        if (sibling === node || sibling.inert || sibling.tagName === 'SCRIPT' || sibling.id === 'sidebar') continue;
        sibling.inert = true;
        state.inerted.push(sibling);
      }
    }
  }

  async function setMax(state, on) {
    if (state.max === on) return;
    state.max = on;
    state.wrap.classList.toggle('is-max', on);
    if (on) {
      state.wrap.setAttribute('role', 'dialog');
      state.wrap.setAttribute('aria-modal', 'true');
      state.wrap.setAttribute('aria-label', state.cap.textContent);
    } else {
      state.wrap.removeAttribute('role');
      state.wrap.removeAttribute('aria-modal');
      state.wrap.removeAttribute('aria-label');
    }
    root.classList.toggle('viz-locked', on);
    setInert(state, on);
    syncSidebar();
    state.maxButton.innerHTML = icon(on ? 'min' : 'max');
    state.maxButton.setAttribute('aria-pressed', on ? 'true' : 'false');
    state.maxButton.title = t(on ? 'js_viz_restore' : 'js_viz_maximize');
    state.maxButton.setAttribute('aria-label', state.maxButton.title);
    writeParam('viz', on ? state.id : null);
    if (on) {
      state.opener = document.activeElement;
      state.maxButton.focus();
      await mount(state.box);
    } else {
      if (document.fullscreenElement === state.wrap) document.exitFullscreen().catch(() => {});
      (state.opener && state.opener.isConnected && state.opener !== document.body ? state.opener : state.maxButton).focus();
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // While a visual is maximized, Escape belongs to it: first its own panel, then the dialog.
    const open = [...frames.values()].find((f) => f.max);
    if (open) {
      if (open.panel && !open.panel.hidden) {
        open.panel.hidden = true;
        open.panelButton.setAttribute('aria-expanded', 'false');
        open.panelButton.focus();
      } else {
        setMax(open, false);
      }
      return;
    }
    for (const state of frames.values()) {
      if (state.panel && !state.panel.hidden) {
        state.panel.hidden = true;
        state.panelButton.setAttribute('aria-expanded', 'false');
        state.panelButton.focus();
        return;
      }
    }
  });

  const ON_OFF = { 1: true, true: true, 0: false, false: false };
  function fromUrl(def, raw) {
    if (raw === null) return undefined;
    if (def.type === 'toggle' || def.type === 'play') return ON_OFF[raw];
    if (def.type === 'range') {
      // Decimal numbers only (not '', ' ', '0x7E9'), clamped and snapped to the step.
      if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return undefined;
      const step = def.step ?? 1;
      const n = Math.min(def.max, Math.max(def.min, Number(raw)));
      return Number((Math.round((n - def.min) / step) * step + def.min).toFixed(10));
    }
    if (def.type === 'select') return def.options.some((o) => String(o.value) === raw) ? raw : undefined;
    return undefined;
  }

  // handle.controls() → [{ key, type: 'range'|'select'|'toggle'|'play'|'action', label, value,
  // min, max, step, options: [{ value, label }], format(v), icon, set(v) }]; labels arrive
  // translated (the visual calls t()). The panel opens from the sliders button; play sits in the bar.
  // A value the simulation changes by itself (play advancing the year, a drag changing the tilt)
  // goes back through ctx.reflect(key, value): the control and the address follow, set() is not
  // called again.
  function controls(state, handle) {
    const defs = typeof handle.controls === 'function' ? handle.controls() : [];
    state.reflectors = new Map();
    if (!defs.length) return;
    const params = defs.filter((d) => d.type === 'range' || d.type === 'select' || d.type === 'toggle');
    const actions = defs.filter((d) => d.type === 'action');
    for (const def of defs.filter((d) => d.type === 'play')) {
      const key = `${state.id}.${def.key}`;
      let playing = def.value !== false;
      const b = button(playing ? 'pause' : 'play', t(playing ? 'js_viz_pause' : 'js_viz_play'), () => setPlaying(!playing, true));
      b.dataset.vizControl = def.key;
      const setPlaying = (on, write) => {
        playing = on;
        b.innerHTML = icon(on ? 'pause' : 'play');
        b.title = t(on ? 'js_viz_pause' : 'js_viz_play');
        b.setAttribute('aria-label', b.title);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (write) writeParam(key, on === (def.value !== false) ? null : (on ? 1 : 0));
        def.set(on);
      };
      b.setAttribute('aria-pressed', playing ? 'true' : 'false');
      state.reflectors.set(def.key, (on) => {
        playing = Boolean(on);
        b.innerHTML = icon(playing ? 'pause' : 'play');
        b.title = t(playing ? 'js_viz_pause' : 'js_viz_play');
        b.setAttribute('aria-label', b.title);
        b.setAttribute('aria-pressed', playing ? 'true' : 'false');
        writeParam(key, playing === (def.value !== false) ? null : (playing ? 1 : 0));
      });
      state.bar.prepend(b);
      const on = fromUrl(def, readParam(key));
      if (on !== undefined && on !== playing) setPlaying(on, false);
    }
    if (!params.length && !actions.length) return;
    const panelId = `${state.id}-controls`;
    const panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'viz-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', t('js_viz_parameters'));
    const toggleButton = button('sliders', t('js_viz_parameters'), () => {
      panel.hidden = !panel.hidden;
      toggleButton.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
      if (!panel.hidden) panel.querySelector('input, select, button')?.focus();
    });
    toggleButton.setAttribute('aria-expanded', 'false');
    toggleButton.setAttribute('aria-controls', panelId);
    state.bar.insertBefore(toggleButton, state.maxButton);
    state.panel = panel;
    state.panelButton = toggleButton;
    for (const def of params) {
      const key = `${state.id}.${def.key}`;
      const inputId = `${state.id}-${def.key}`;
      const row = document.createElement('div');
      row.dataset.vizControl = def.key;
      const show = (v) => (def.format ? def.format(v) : String(v));
      if (def.type === 'range') {
        row.innerHTML = `<label for="${inputId}" class="${LABEL}"><span>${escape(def.label)}</span><output class="tabular text-xs font-normal text-gray-600 dark:text-gray-300"></output></label><input id="${inputId}" type="range" class="${RANGE}" min="${def.min}" max="${def.max}" step="${def.step ?? 1}">`;
        const input = row.querySelector('input');
        const out = row.querySelector('output');
        const apply = (v, write) => {
          input.value = v;
          out.textContent = show(v);
          def.set(v);
          if (write) writeParam(key, v === def.value ? null : v);
        };
        input.value = def.value;
        out.textContent = show(def.value);
        input.addEventListener('input', () => apply(Number(input.value), true));
        state.reflectors.set(def.key, (v) => {
          input.value = v;
          out.textContent = show(v);
          writeParam(key, v === def.value ? null : v);
        });
        const v = fromUrl(def, readParam(key));
        if (v !== undefined && v !== def.value) apply(v, false);
      } else if (def.type === 'select') {
        row.innerHTML = `<label for="${inputId}" class="${LABEL}">${escape(def.label)}</label><select id="${inputId}" class="${SELECT}">${def.options.map((o) => `<option value="${escape(o.value)}">${escape(o.label)}</option>`).join('')}</select>`;
        const input = row.querySelector('select');
        input.value = String(def.value);
        input.addEventListener('change', () => {
          def.set(input.value);
          writeParam(key, input.value === String(def.value) ? null : input.value);
        });
        state.reflectors.set(def.key, (v) => {
          input.value = String(v);
          writeParam(key, input.value === String(def.value) ? null : input.value);
        });
        const v = fromUrl(def, readParam(key));
        if (v !== undefined && v !== String(def.value)) {
          input.value = v;
          def.set(v);
        }
      } else {
        row.innerHTML = `<label class="inline-flex cursor-pointer items-center"><input id="${inputId}" type="checkbox" class="peer sr-only"><span class="relative h-5 w-9 shrink-0 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-4 peer-focus:ring-primary-300 dark:bg-gray-600 dark:peer-focus:ring-primary-800" aria-hidden="true"></span><span class="ms-3 text-sm font-medium text-gray-900 dark:text-white">${escape(def.label)}</span></label>`;
        const input = row.querySelector('input');
        input.checked = Boolean(def.value);
        input.addEventListener('change', () => {
          def.set(input.checked);
          writeParam(key, input.checked === Boolean(def.value) ? null : (input.checked ? 1 : 0));
        });
        state.reflectors.set(def.key, (v) => {
          input.checked = Boolean(v);
          writeParam(key, input.checked === Boolean(def.value) ? null : (input.checked ? 1 : 0));
        });
        const v = fromUrl(def, readParam(key));
        if (v !== undefined && v !== Boolean(def.value)) {
          input.checked = v;
          def.set(v);
        }
      }
      panel.append(row);
    }
    if (actions.length) {
      const row = document.createElement('div');
      row.className = 'flex flex-wrap gap-2 pt-1';
      for (const def of actions) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = ACTION;
        b.dataset.vizControl = def.key;
        b.innerHTML = `${icon(def.icon || 'reset')}<span>${escape(def.label)}</span>`;
        b.addEventListener('click', () => def.set());
        row.append(b);
      }
      panel.append(row);
    }
    state.wrap.append(panel);
  }

  // The layer owns resizing: one observer per box, debounced, skipping the initial callback; a
  // visual answers with resize(), or redraws with update() when it has none.
  function observeSize(box, handle) {
    if (!('ResizeObserver' in window)) return;
    let first = true;
    let timer = 0;
    let last = `${box.clientWidth}x${box.clientHeight}`;
    new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        const size = `${box.clientWidth}x${box.clientHeight}`;
        if (size === last || !box.clientWidth || !box.clientHeight) return;
        last = size;
        (handle.resize || handle.update)?.call(handle);
      }, 120);
    }).observe(box);
  }

  function message(box, key) {
    let note = box.querySelector(':scope > .viz-note');
    if (!note) {
      note = document.createElement('p');
      note.className = 'viz-note';
      box.append(note);
    }
    note.textContent = t(key);
  }

  async function mount(box) {
    if (mounted.has(box)) return;
    const name = box.dataset.viz;
    const spec = registry.get(name);
    if (!spec) return;
    mounted.set(box, null);
    const state = frame(box);
    box.dataset.vizState = 'loading';
    box.setAttribute('aria-busy', 'true');
    try {
      await lib(spec.lib);
      const source = box.dataset.source ? data(box.dataset.source) : null;
      const reflect = (key, value) => frames.get(box)?.reflectors?.get(key)?.(value);
      // A night-toned box (data-tone="night") is dark in both themes: its palette is the night inks,
      // so text and lines a visual takes from page/strong/text read on it in a light theme too.
      const night = box.dataset.tone === 'night';
      const tonePalette = () => {
        const p = palette();
        if (!night) return p;
        return { ...p, dark: true, page: p.night.shadow, surface: p.night.shadow, strong: p.night.ink, text: p.night.text, muted: p.night.muted, grid: p.night.line };
      };
      const ctx = { palette: tonePalette, colour, reducedMotion, isDark, motion, go, link, escape, hash, t, reflect, id: vizId(box) };
      const handle = (await spec.mount(box, source, ctx)) || {};
      mounted.set(box, handle);
      list(box, handle);
      if (state) {
        try {
          controls(state, handle);
        } catch (error) {
          console.error(`[hub] ${name}: controls():`, error);
        }
      }
      observeSize(box, handle);
      if (handle.empty) message(box, 'js_viz_empty');
      box.dataset.vizState = 'ready';
    } catch (error) {
      box.dataset.vizState = 'error';
      message(box, 'js_viz_error');
      console.error(`[hub] ${name}:`, error);
    } finally {
      box.removeAttribute('aria-busy');
    }
  }

  // The keyboard and screen-reader twin of a visual (WCAG 2.1.1): every item the visual makes
  // clickable, as a list of real links. The page renders an empty <details data-viz-list> right
  // after the box (so nothing shifts); the visual's handle.items() fills it when it is opened, and
  // again on every opening, so a live visual lists what it shows now.
  function list(box, handle) {
    const details = (frames.get(box)?.wrap ?? box).nextElementSibling;
    if (!details || !details.matches('details[data-viz-list]') || typeof handle.items !== 'function') return;
    const ul = details.querySelector('ul');
    const fill = () => {
      ul.replaceChildren();
      for (const item of handle.items().slice(0, 250)) {
        const li = document.createElement('li');
        li.className = 'flex items-baseline justify-between gap-3 border-b border-gray-200 py-1.5 dark:border-gray-700';
        const a = document.createElement('a');
        a.href = item.url;
        a.textContent = item.label;
        a.className = 'min-w-0 truncate font-medium text-primary-700 hover:underline dark:text-primary-300';
        if (/^https?:/.test(item.url) && !item.url.startsWith(location.origin)) a.rel = 'noopener';
        li.append(a);
        if (item.note) {
          const note = document.createElement('span');
          note.className = 'tabular shrink-0 text-xs text-gray-600 dark:text-gray-400';
          note.textContent = item.note;
          li.append(note);
        }
        ul.append(li);
      }
    };
    details.addEventListener('toggle', () => { if (details.open) fill(); });
    if (details.open) fill();
  }

  const idle = (fn) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 1));

  function scan() {
    const boxes = document.querySelectorAll('[data-viz]');
    // Frames first, before any library loads: the toolbar is there from the first paint, and a
    // deep link (?viz=<id>) opens its visual maximized at once.
    boxes.forEach(frame);
    const wanted = readParam('viz');
    for (const state of frames.values()) if (state.id === wanted) setMax(state, true);
    if (!('IntersectionObserver' in window)) {
      boxes.forEach(mount);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          // Mount when the main thread is idle: a visual in the first screen (the p5 hero, the
          // skills) then loads its library after the page has painted, not in its way.
          idle(() => mount(entry.target));
        }
      },
      { rootMargin: '300px 0px' },
    );
    boxes.forEach((box) => observer.observe(box));
  }

  function viz(name, spec) {
    registry.set(name, spec);
  }
  // Registrations made before this script ran (templates/base.html queues them).
  for (const [name, spec] of window.KorczisHub?.queue ?? []) viz(name, spec);


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

  // GitHub Pages serves one 404.html for every language: under /cs/ show its Czech twin.
  function localise404() {
    const twins = document.querySelectorAll('[data-404-lang]');
    if (!twins.length || !location.pathname.startsWith(`${new URL(base, location.href).pathname}cs/`)) return;
    twins.forEach((twin) => {
      twin.hidden = twin.getAttribute('data-404-lang') !== 'cs';
      if (!twin.hidden) document.title = twin.getAttribute('data-404-title');
    });
    root.lang = 'cs';
  }

  document.addEventListener('DOMContentLoaded', () => {
    localise404();
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
    // A maximized visual is a modal dialog: behind it the sidebar is inert at any width.
    const locked = root.classList.contains('viz-locked');
    if (desktop.matches) {
      if (drawer && drawer.isVisible()) drawer.hide();
      setAttr('aria-hidden', null);
      setAttr('inert', locked ? '' : null);
      return;
    }
    const closed = sidebar.getAttribute('aria-hidden') === 'true' || sidebar.classList.contains('-translate-x-full');
    setAttr('inert', closed || locked ? '' : null);
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

  // Texts the scripts render, in the page's language: KorczisHub.t('js_n_repositories', { n: 3 }).
  let i18n = { locale: 'en-GB', strings: {} };
  try {
    i18n = JSON.parse(document.getElementById('i18n-data')?.textContent || '{}');
  } catch {}
  // A text with a count picks its plural form by the language's own rule (Intl.PluralRules, CLDR):
  // key__one, key__few, key__many, key__other, falling back to the key itself.
  const plural = new Intl.PluralRules(i18n.locale || 'en-GB');
  const t = (key, vars = {}) => {
    const strings = i18n.strings || {};
    const form = typeof vars.n === 'number' ? strings[`${key}__${plural.select(vars.n)}`] ?? strings[`${key}__other`] : undefined;
    const text = form ?? strings[key] ?? key;
    return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), text);
  };
  // Links go to the page's language (data-home); vendor bundles load from the site root (base).
  const home = root.dataset.home || base;

  // One tooltip per visual box, positioned near the pointer and kept inside the box.
  function tooltip(box) {
    const tip = document.createElement('div');
    tip.className = 'viz-tip';
    // A pointer-only echo of what the visual's aria-label already states: hidden from assistive tech.
    tip.setAttribute('aria-hidden', 'true');
    box.appendChild(tip);
    return {
      show(html, event) {
        tip.innerHTML = html;
        tip.classList.add('is-on');
        const rect = box.getBoundingClientRect();
        const x = Math.min(Math.max(event.clientX - rect.left + 12, 4), rect.width - tip.offsetWidth - 4);
        const y = Math.max(event.clientY - rect.top - tip.offsetHeight - 12, 4);
        tip.style.left = `${x}px`;
        tip.style.top = `${y}px`;
      },
      hide() {
        tip.classList.remove('is-on');
      },
      // destroy() of a visual removes its tip with it.
      remove() {
        tip.remove();
      },
    };
  }

  window.KorczisHub = { viz, lib, data, palette, colour, reducedMotion, isDark, motion, go, link, escape, hash, base, home, t, tooltip, github: document.documentElement.dataset.github || '', locale: i18n.locale || 'en-GB' };
})();
