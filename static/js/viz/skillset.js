// Skillset (Apache ECharts sunburst): repositories by category, each split into the languages they
// are written in and, when the source lists the repositories (index.skillset), into the
// repositories themselves. The default window is the one data/index.json measures (the N most
// recently active); with the repositories at hand the visitor picks another (the last 12, 24 or
// 48 months, or all of them) and how many rings to draw.
//
// Drill-down is the visual's own (the owner's standard: nodeClick false, no ECharts breadcrumb):
// a segment with parts re-roots the chart on it, and a Flowbite breadcrumb over the box steps
// back; its last crumb opens the page of what is shown. A leaf opens its page through ctx.link:
// a category its page, a language its glossary term, a repository its work page, each falling
// back to the index filtered to it. Label ink is chosen per segment from its fill (WCAG AA 4.5:1,
// with a halo where no ink reaches it).
KorczisHub.viz('skillset', {
  lib: 'echarts',
  mount(box, source, { palette, colour, motion, go, link, escape, t }) {
    const names = source.names || {};
    const UNSPECIFIED = 'Unspecified';
    const repos = Array.isArray(source.repos)
      ? source.repos.map(([name, category, language, pushed]) => ({ name, category, language: language || UNSPECIFIED, pushed }))
        .sort((a, b) => b.pushed.localeCompare(a.pushed) || a.name.localeCompare(b.name))
      : null;
    const size = source.size || repos?.length || 0;
    const end = new Date(source.to || repos?.[0]?.pushed || Date.now());

    // The label ink of a segment (ctx.colour.ink over the theme's inks, one dark and one light in
    // either theme): the one that stands out most on the fill, and a halo of the ink that stands out
    // most on that one when even it stays under 4.5:1.
    const ink = (c, fill) => {
      const inks = [c.strong, c.surface, c.page];
      const best = colour.ink(fill, inks);
      if (best.ok) return { color: best.ink, textBorderWidth: 0 };
      return { color: best.ink, textBorderColor: colour.ink(best.ink, inks).ink, textBorderWidth: 3 };
    };

    // --- The model: a tree for the chosen window. -------------------------------------------------
    const WINDOWS = repos ? ['recent', '12', '24', '48', 'all'] : ['recent'];
    const maxDepth = repos ? 3 : 2;
    const state = { window: 'recent', depth: 2, path: [] };

    function counted() {
      if (!repos) return null;
      if (state.window === 'recent') return repos.slice(0, size);
      if (state.window === 'all') return repos;
      const from = new Date(end);
      from.setMonth(from.getMonth() - Number(state.window));
      const day = from.toISOString().slice(0, 10);
      return repos.filter((r) => r.pushed >= day);
    }

    function tree() {
      const list = counted();
      const counts = {};
      const members = {};
      if (list) {
        for (const r of list) {
          counts[r.category] ??= {};
          counts[r.category][r.language] = (counts[r.category][r.language] || 0) + 1;
          (members[`${r.category}\u0000${r.language}`] ??= []).push(r.name);
        }
      } else {
        Object.assign(counts, source.mix || {});
      }
      return Object.entries(counts)
        .map(([key, langs]) => ({
          kind: 'category',
          key,
          name: names[key] ?? key,
          // A category counts every repository; its parts are only the detected languages, so the
          // repositories without one (mostly GitLab-only) do not drown the languages that exist.
          value: Object.values(langs).reduce((a, b) => a + b, 0),
          unspecified: langs[UNSPECIFIED] || 0,
          children: Object.entries(langs).filter(([lang]) => lang !== UNSPECIFIED)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([lang, n]) => ({
              kind: 'language',
              key,
              lang,
              name: lang,
              value: n,
              children: (members[`${key}\u0000${lang}`] || []).map((repo) => ({ kind: 'repo', key, lang, repo, name: repo, value: 1, children: [] })),
            })),
        }))
        .filter((c) => c.value > 0)
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    }

    const pageOf = (n) => {
      if (n.kind === 'category') return link('category', n.key) ?? link('filter', { page: 'repositories', category: n.key });
      if (n.kind === 'language') return link('term', n.lang) ?? link('filter', { page: 'repositories', category: n.key, language: n.lang });
      return link('repo', n.repo);
    };

    const idOf = (n) => (n.kind === 'category' ? n.key : n.kind === 'language' ? n.lang : n.repo);
    let full = tree();
    // The node the chart is rooted at, or null at the top; a path that no longer exists in a new
    // window is cut back to the part that does.
    function rooted() {
      let nodes = full;
      let node = null;
      const kept = [];
      for (const step of state.path) {
        node = nodes.find((n) => idOf(n) === step);
        if (!node || !node.children.length) break;
        kept.push(step);
        nodes = node.children;
      }
      if (kept.length !== state.path.length) state.path = kept;
      return state.path.length ? node : null;
    }

    // --- The breadcrumb (Flowbite), over the box's top-left corner, outside its role="img". -------
    const nav = document.createElement('nav');
    nav.className = 'absolute z-20 hidden max-w-[calc(100%-10rem)] overflow-x-auto rounded-lg bg-white/90 px-3 py-1.5 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800/90 dark:ring-gray-700';
    nav.setAttribute('aria-label', t('js_skillset_path'));
    const frame = box.parentElement?.matches?.('.viz-frame') ? box.parentElement : null;
    if (frame) frame.append(nav);
    else box.before(nav);
    const CHEVRON = '<svg class="mx-1 h-3 w-3 text-gray-400 rtl:rotate-180" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 6 10"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 9 4-4-4-4"/></svg>';
    const STEP = 'inline-flex items-center whitespace-nowrap text-sm font-medium text-gray-700 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-300 rounded dark:text-gray-300 dark:hover:text-white dark:focus:ring-primary-800';
    function crumbs(root) {
      if (!root) {
        nav.classList.add('hidden');
        nav.innerHTML = '';
        return;
      }
      const chain = [];
      let nodes = full;
      for (const step of state.path) {
        const n = nodes.find((x) => idOf(x) === step);
        chain.push(n);
        nodes = n.children;
      }
      const items = [`<li class="inline-flex items-center"><button type="button" class="${STEP}" data-depth="0">${escape(t('js_skillset_all'))}</button></li>`];
      chain.forEach((n, i) => {
        const last = i === chain.length - 1;
        const inner = last
          ? `<a class="${STEP} underline decoration-dotted underline-offset-2" href="${escape(pageOf(n))}" aria-current="page">${escape(n.name)}</a>`
          : `<button type="button" class="${STEP}" data-depth="${i + 1}">${escape(n.name)}</button>`;
        items.push(`<li><div class="flex items-center">${CHEVRON}${inner}</div></li>`);
      });
      nav.innerHTML = `<ol class="inline-flex items-center space-x-1 rtl:space-x-reverse">${items.join('')}</ol>`;
      nav.classList.remove('hidden');
      place();
    }
    // Pinned to the box wherever the frame puts it (in the maximized view a caption sits above it).
    function place() {
      nav.style.top = `${box.offsetTop + 8}px`;
      nav.style.left = `${box.offsetLeft + 8}px`;
    }
    nav.addEventListener('click', (event) => {
      const step = event.target.closest?.('button[data-depth]');
      if (!step) return;
      state.path = state.path.slice(0, Number(step.dataset.depth));
      render();
      // Focus stays in the breadcrumb, or returns to the toolbar when the chart is back at the top.
      (state.path.length ? nav.querySelector('[aria-current]') : frame?.querySelector('button'))?.focus();
    });

    const chart = echarts.init(box.querySelector('[data-canvas]') || box, null, { renderer: 'canvas' });
    let first = true;
    function render({ recount = false } = {}) {
      if (recount) full = tree();
      const root = rooted();
      chart.setOption(option(root));
      crumbs(root);
      first = false;
    }

    chart.on('click', (p) => {
      const n = p.data?.node;
      if (!n) return;
      // A segment with parts re-roots the chart on it; a leaf opens its page.
      if (n.children.length) {
        state.path = [...state.path, idOf(n)];
        render();
        return;
      }
      go(pageOf(n), p.event?.event);
    });

    const handle = {
      empty: !full.length,
      // The list twin: each category (its page), then its languages (their glossary terms).
      items: () => full.flatMap((cat) => [
        { label: cat.name, url: pageOf(cat), note: t('js_n_repositories', { n: cat.value }) },
        ...cat.children.map((l) => ({ label: `${cat.name} · ${l.name}`, url: pageOf(l), note: t('js_n_repositories', { n: l.value }) })),
      ]),
      controls: () => [
        ...(WINDOWS.length > 1 ? [{
          key: 'window',
          type: 'select',
          label: t('js_skillset_window'),
          options: WINDOWS.map((w) => ({
            value: w,
            label: w === 'recent' ? t('js_skillset_window_recent', { n: size }) : w === 'all' ? t('js_skillset_window_all') : t('js_skillset_window_months', { n: Number(w) }),
          })),
          value: state.window,
          set(v) {
            if (!WINDOWS.includes(v)) return;
            state.window = v;
            render({ recount: true });
          },
        }] : []),
        {
          key: 'depth', type: 'range', label: t('js_skillset_depth'), min: 1, max: maxDepth, step: 1,
          value: state.depth, format: String, set(v) { state.depth = v; render(); },
        },
        { key: 'top', type: 'action', label: t('js_skillset_all'), icon: 'reset', set() { state.path = []; render(); } },
      ],
      resize() {
        chart.resize();
        if (state.path.length) place();
      },
      update() { render(); },
      destroy() {
        nav.remove();
        chart.dispose();
      },
    };

    function option(root) {
      const c = palette();
      const m = motion();
      const ramp = [c.ramp[4], c.ramp[3], c.primary, c.ramp[2], c.muted, c.ramp[1]];
      const top = root ? root.children : full;
      // Rings below the root, at most the depth chosen; each a slice of the radius.
      const rings = (nodes, left) => (left <= 1 || !nodes.some((n) => n.children.length) ? 1 : 1 + rings(nodes.flatMap((n) => n.children), left - 1));
      const shown = rings(top, state.depth);
      const inner = 14;
      const outer = 96;
      const width = (outer - inner) / shown;
      const paint = (nodes, depth, parent) => nodes.map((n, i) => {
        const fill = depth === 0 ? ramp[i % ramp.length] : colour.mix(parent, c.surface, Math.min(0.6, 0.16 + 0.1 * depth + 0.08 * (i % 3)));
        return {
          name: n.name,
          value: n.value,
          node: n,
          itemStyle: { color: fill },
          label: ink(c, fill),
          children: depth + 1 < shown ? paint(n.children, depth + 1, fill) : [],
        };
      });
      const LABELS = [
        { rotate: 'tangential', fontSize: 11, fontWeight: 600, minAngle: 24 },
        { rotate: 'radial', align: 'center', fontSize: 10, minAngle: 8 },
        { rotate: 'radial', align: 'center', fontSize: 9, minAngle: 6 },
      ];
      const lead = state.path.length ? `${state.path.map((s, i) => {
        let nodes = full;
        let n = null;
        for (const step of state.path.slice(0, i + 1)) {
          n = nodes.find((x) => idOf(x) === step);
          nodes = n?.children || [];
        }
        return n?.name ?? s;
      }).join(' › ')} › ` : '';
      return {
        animation: m.enter > 0,
        // The entrance plays once; a drill, a window or a depth glides by the update duration.
        animationDuration: first ? m.enter : 0,
        animationEasing: m.easing,
        animationDurationUpdate: m.update,
        animationEasingUpdate: 'cubicInOut',
        aria: { enabled: true, label: { description: box.getAttribute('aria-label') || '' } },
        textStyle: { fontFamily: c.font },
        tooltip: {
          confine: true,
          backgroundColor: c.surface,
          borderColor: c.grid,
          textStyle: { color: c.strong, fontSize: 12 },
          formatter: (p) => {
            const n = p.data?.node;
            if (!n) return '';
            const trail = `${lead}${p.treePathInfo.slice(1).map((x) => x.name).join(' › ')}`;
            const facts = [t('js_n_repositories', { n: n.value })];
            if (n.unspecified) facts.push(t('js_skillset_unspecified', { n: n.unspecified }));
            const action = n.children.length ? t('js_skillset_drill') : t('js_click_to_open');
            return `${escape(trail)}<br><b>${facts.map(escape).join(' · ')}</b><br><span class="opacity-75">${escape(action)}</span>`;
          },
        },
        series: [{
          id: 'skillset',
          type: 'sunburst',
          data: paint(top, 0, c.primary),
          radius: [`${inner}%`, `${outer}%`],
          sort: null,
          // The drill is this file's (the click handler above), never ECharts' own.
          nodeClick: false,
          itemStyle: { borderColor: c.surface, borderWidth: 2, borderRadius: 4 },
          emphasis: { focus: 'ancestor' },
          levels: [
            {},
            ...Array.from({ length: shown }, (_, i) => ({
              r0: `${inner + width * i}%`,
              r: `${inner + width * (i + 1)}%`,
              label: LABELS[Math.min(i + (root ? state.path.length : 0), LABELS.length - 1)],
            })),
          ],
        }],
      };
    }

    render();
    return handle;
  },
});
