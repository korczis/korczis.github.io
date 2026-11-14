// Ecosystem graph (Apache ECharts graph series, a live force simulation): the curated projects
// (data/projects.toml), the technologies in their stacks, and which of them Majordomus supervises.
// "Supervised" is measured (a .ai/manifest.yaml on the default branch, scripts/fetch-github.mjs),
// never typed by hand, and so is the hub: the repository Majordomus releases from (source.hub).
//
// The visitor drives the model: repulsion, edge length and gravity of the simulation; a grouping
// (category or primary language) that adds a node per group pulling its members together; every
// label or only the best connected; zoom; a reheat that lays the graph out again from its seed.
// Starting positions are seeded from each node's id (ctx.hash), so the same data settles the same
// way on every visit. A project opens its catalogue entry (?project=), a language or technology its
// glossary term, a category its page; the list twin holds every node with the same link.
KorczisHub.viz('graph', {
  lib: 'echarts',
  mount(box, source, { palette, colour, motion, go, link, escape, hash, t, reflect = () => {} }) {
    const { projects, measured = {} } = source;
    const hub = source.hub || null;
    const names = source.categories || null;
    // Every address through ctx.link: the catalogue entry, a term (else the index searched for it),
    // a category page (else the catalogue filtered to it).
    const catalogue = (repo) => link('filter', { page: 'projects', project: repo });
    const termUrl = (name) => link('term', name) ?? link('filter', { page: 'repositories', q: name.toLowerCase() });
    const categoryUrl = (key) => link('category', key) ?? link('filter', { page: 'projects', category: key });

    // --- Colour (ctx.colour): group hues derived from the theme's primary (its weight, a golden
    // angle apart), each moved toward the page's ink until it keeps 3:1 on the card (WCAG 1.4.11).
    const legible = (fill, ground, ink, floor = 3) => {
      let out = fill;
      for (let step = 1; step <= 10 && colour.contrast(out, ground) < floor; step += 1) out = colour.mix(fill, ink, step / 10);
      return out;
    };
    const groupColours = (c, n) => {
      const [h, s, l] = colour.toHsl(c.primary);
      return Array.from({ length: n }, (_, i) => legible(colour.fromHsl((h + i * 137.508) % 360, Math.max(s, 0.55), l), c.surface, c.strong));
    };

    // --- The model: nodes and links for one grouping. A language group is the language's own node
    // (the same id as the technology in a stack), so a project written in Rust that also lists Rust
    // is linked to one Rust, not two.
    // Category groups need their names (the catalogue's source carries them); without, the
    // grouping starts at none and offers no category option.
    const GROUPS = names && Object.keys(names).length ? ['category', 'language', 'none'] : ['language', 'none'];
    const state = { group: GROUPS[0] === 'category' ? 'category' : 'none', repulsion: 150, edgeLength: 55, gravity: 0.2, labels: false, zoom: 1 };
    // The physics is written for a 420 px drawing; a larger box (maximized) scales every length
    // with it, so the same parameters give the same picture at any size: lengths by k, repulsion
    // by k squared (it acts as repulsion / distance), gravity unchanged (it acts as gravity * distance).
    const scale = () => Math.max(0.5, Math.min(box.clientWidth || 600, (box.clientHeight || 420) - 48) / 420);
    let model = null;

    function build(group) {
      const nodes = new Map();
      const links = [];
      const groupOf = (p) => (group === 'category' ? p.category : group === 'language' ? measured[p.repo]?.language || null : null);
      const node = (id, props) => {
        if (!nodes.has(id)) nodes.set(id, { id, degree: 0, uses: 0, ...props });
        return nodes.get(id);
      };
      const edge = (from, to, kind) => {
        if (links.some((l) => l.source === from && l.target === to)) return;
        links.push({ source: from, target: to, kind });
        nodes.get(from).degree += 1;
        nodes.get(to).degree += 1;
        if (kind === 'uses') nodes.get(to).uses += 1;
      };
      for (const p of projects) {
        node(`p:${p.repo}`, { kind: 'project', label: p.name, repo: p.repo, group: groupOf(p), facts: measured[p.repo] || {}, url: catalogue(p.repo) });
      }
      for (const p of projects) {
        for (const tech of p.stack) {
          node(`t:${tech}`, { kind: 'tech', label: tech, group: null, url: termUrl(tech) });
          edge(`p:${p.repo}`, `t:${tech}`, 'uses');
        }
        const g = groupOf(p);
        if (group === 'category' && g) {
          node(`g:${g}`, { kind: 'category', label: names?.[g] || g, group: g, url: categoryUrl(g) });
          edge(`g:${g}`, `p:${p.repo}`, 'member');
        } else if (group === 'language' && g) {
          node(`t:${g}`, { kind: 'tech', label: g, group: null, url: termUrl(g) }).group = g;
          edge(`t:${g}`, `p:${p.repo}`, 'member');
        }
        if (hub && measured[p.repo]?.supervised && p.repo !== hub && nodes.has(`p:${hub}`)) edge(`p:${hub}`, `p:${p.repo}`, 'supervises');
      }
      // Groups by size, largest first, so the first hues go to the groups that hold the most.
      const counts = new Map();
      for (const n of nodes.values()) if (n.kind === 'project' && n.group) counts.set(n.group, (counts.get(n.group) || 0) + 1);
      const groups = [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).map(([g]) => g);
      const loose = [...nodes.values()].some((n) => n.kind === 'project' && !n.group);
      return { nodes: [...nodes.values()], links, groups, loose };
    }

    const chart = echarts.init(box.querySelector('[data-canvas]') || box, null, { renderer: 'canvas' });
    let first = true;

    // A new grouping or a reheat starts the simulation over from the seed: clear() drops the
    // positions ECharts keeps between updates (preservedPoints). A physics change keeps them, so
    // the graph moves from where it is to where the new forces put it.
    function render({ fresh = false } = {}) {
      if (fresh) {
        if (!first) chart.clear();
        model = build(state.group);
      }
      chart.setOption(option({ fresh }));
      first = false;
    }

    // A click that ends a drag is not a click.
    let down = null;
    chart.getZr().on('mousedown', (e) => { down = [e.offsetX, e.offsetY]; });
    chart.on('click', (p) => {
      if (p.dataType !== 'node' || !p.data?.url) return;
      const e = p.event;
      if (down && e && Math.hypot(e.offsetX - down[0], e.offsetY - down[1]) > 4) return;
      go(p.data.url, e?.event);
    });

    // Ctrl + wheel (a trackpad pinch sends ctrlKey too) zooms around the pointer; a plain wheel is
    // left to the page, which keeps scrolling.
    const zoomBy = (factor, originX, originY) => {
      const next = Math.min(4, Math.max(0.3, state.zoom * factor));
      if (next === state.zoom) return;
      chart.dispatchAction({ type: 'graphRoam', seriesId: 'graph', zoom: next / state.zoom, originX, originY });
      state.zoom = next;
    };
    const onWheel = (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      zoomBy(Math.exp(-event.deltaY / 300), event.clientX - rect.left, event.clientY - rect.top);
      // The zoom control and the address follow (ctx.reflect; a no-op where the layer predates it).
      reflect('zoom', Math.round(state.zoom * 10) / 10);
    };
    box.addEventListener('wheel', onWheel, { passive: false });

    // The list twin: the projects, then every technology, language and group by connections.
    const list = () => [
      ...model.nodes.filter((n) => n.kind === 'project')
        .map((n) => ({ label: n.label, url: n.url, note: projects.find((p) => p.repo === n.repo)?.stack.join(', ') })),
      ...model.nodes.filter((n) => n.kind !== 'project')
        .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
        .map((n) => ({ label: n.label, url: n.url, note: n.uses ? t('js_graph_used_by', { n: n.uses }) : t('js_graph_links', { n: n.degree }) })),
    ];

    const fmt = (v) => new Intl.NumberFormat(KorczisHub.locale, { maximumFractionDigits: 2 }).format(v);
    const handle = {
      items: list,
      controls: () => [
        { key: 'repulsion', type: 'range', label: t('js_graph_repulsion'), min: 40, max: 800, step: 10, value: state.repulsion, format: fmt, set(v) { state.repulsion = v; render(); } },
        { key: 'edge', type: 'range', label: t('js_graph_edge_length'), min: 20, max: 220, step: 5, value: state.edgeLength, format: fmt, set(v) { state.edgeLength = v; render(); } },
        { key: 'gravity', type: 'range', label: t('js_graph_gravity'), min: 0, max: 0.6, step: 0.02, value: state.gravity, format: fmt, set(v) { state.gravity = v; render(); } },
        {
          key: 'group',
          type: 'select',
          label: t('js_graph_group'),
          options: GROUPS.map((g) => ({ value: g, label: t(`js_graph_group_${g}`) })),
          value: state.group,
          set(v) {
            if (!GROUPS.includes(v) || v === state.group) return;
            state.group = v;
            render({ fresh: true });
          },
        },
        { key: 'labels', type: 'toggle', label: t('js_graph_labels'), value: state.labels, set(v) { state.labels = Boolean(v); render(); } },
        { key: 'zoom', type: 'range', label: t('js_graph_zoom'), min: 0.3, max: 4, step: 0.1, value: 1, format: (v) => `${fmt(v)}×`, set(v) { zoomBy(v / state.zoom, box.clientWidth / 2, box.clientHeight / 2); } },
        { key: 'reheat', type: 'action', label: t('js_graph_reheat'), icon: 'reset', set() { state.zoom = 1; reflect('zoom', 1); render({ fresh: true }); } },
      ],
      // A new size rescales the physics; the simulation moves the graph from where it is.
      resize() {
        chart.resize();
        render();
      },
      update() { render(); },
      destroy() {
        box.removeEventListener('wheel', onWheel);
        chart.dispose();
      },
    };

    function option({ fresh = false } = {}) {
      const c = palette();
      const m = motion();
      const groupName = (g) => (state.group === 'category' ? names?.[g] || g : g);
      // Legend order: the groups, then ungrouped projects (if any), then the technologies.
      const legend = [...model.groups.map(groupName), ...(model.loose ? [t('js_graph_projects')] : []), t('js_graph_technologies')];
      const colours = [...groupColours(c, model.groups.length), ...(model.loose ? [c.primary] : []), c.muted];
      const category = (n) => {
        if (n.group && model.groups.includes(n.group)) return model.groups.indexOf(n.group);
        return n.kind === 'project' ? model.groups.length : legend.length - 1;
      };
      // Labels for the best connected nodes only (a hairball of names reads as nothing); the toggle
      // shows every one, and hideOverlap drops those that collide either way.
      const ranked = [...model.nodes].sort((a, b) => b.degree - a.degree);
      const shown = new Set(ranked.slice(0, Math.max(6, Math.ceil(ranked.length / 3))).map((n) => n.id));
      const k = scale();
      const width = box.clientWidth || 600;
      const height = box.clientHeight || 400;
      const data = model.nodes.map((n) => {
        const h = hash(n.id);
        const plain = n.kind === 'tech' && !n.group;
        return {
          id: n.id,
          name: n.label,
          category: category(n),
          value: n.degree,
          // A seeded start, the same on every visit; the simulation takes it from there.
          x: ((h % 1000) / 1000) * width,
          y: (((h >>> 10) % 1000) / 1000) * height,
          symbol: n.kind === 'category' ? 'roundRect' : 'circle',
          symbolSize: Math.round((plain ? 6 : 10) + 6 * Math.sqrt(n.degree)),
          itemStyle: plain ? { color: c.surface, borderColor: c.muted, borderWidth: 2 } : { borderColor: c.surface, borderWidth: 1 },
          label: { show: state.labels || shown.has(n.id), fontWeight: plain ? 400 : 600 },
          url: n.url,
        };
      });
      const links = model.links.map((l) => ({
        source: l.source,
        target: l.target,
        kind: l.kind,
        lineStyle: l.kind === 'supervises'
          ? { color: c.primary, width: 1.5, type: 'dashed', opacity: 0.9 }
          : l.kind === 'member' ? { color: c.muted, width: 1, type: 'dotted', opacity: 0.5 } : { color: c.muted, width: 1, opacity: 0.55 },
        symbol: l.kind === 'supervises' ? ['none', 'arrow'] : ['none', 'none'],
        symbolSize: 7,
      }));
      const label = (id) => model.nodes.find((n) => n.id === id)?.label ?? '';
      return {
        animation: m.enter > 0,
        // The entrance plays once; a later update glides (or, under reduced motion, does not move).
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
            if (p.dataType === 'edge') {
              const key = p.data.kind === 'supervises' ? 'js_graph_supervises' : p.data.kind === 'member' ? 'js_graph_member' : 'js_graph_uses';
              return escape(t(key, { a: label(p.data.source), b: label(p.data.target) }));
            }
            const n = model.nodes.find((x) => x.id === p.data.id);
            if (!n) return '';
            const facts = [];
            if (n.kind === 'project') {
              facts.push(names?.[projects.find((x) => x.repo === n.repo)?.category], n.facts.language);
              if (n.facts.supervised) facts.push(t('js_graph_supervised'));
              if (n.facts.live) facts.push(t('js_live'));
            } else if (n.uses) {
              facts.push(t('js_graph_used_by', { n: n.uses }));
            }
            facts.push(t('js_graph_links', { n: n.degree }));
            return `<b>${escape(n.label)}</b><br>${facts.filter(Boolean).map(escape).join(' · ')}<br><span class="opacity-75">${escape(t('js_click_to_open'))}</span>`;
          },
        },
        legend: {
          type: 'scroll',
          data: legend,
          top: 4,
          left: 4,
          // The layer's toolbar sits over the top-right corner.
          right: 132,
          icon: 'circle',
          itemWidth: 10,
          itemHeight: 10,
          textStyle: { color: c.text, fontSize: 12 },
          inactiveColor: c.grid,
          pageIconColor: c.primary,
          pageIconInactiveColor: c.grid,
          pageTextStyle: { color: c.text },
        },
        series: [{
          id: 'graph',
          type: 'graph',
          layout: 'force',
          // A drag pans and the page keeps its wheel; Ctrl + wheel (or a pinch) zooms, see onWheel.
          roam: 'move',
          draggable: true,
          top: 40,
          bottom: 8,
          left: 8,
          right: 8,
          ...(fresh ? { zoom: state.zoom } : {}),
          scaleLimit: { min: 0.3, max: 4 },
          force: {
            repulsion: state.repulsion * k * k,
            edgeLength: state.edgeLength * k,
            gravity: state.gravity,
            friction: 0.12,
            // Under reduced motion the simulation still runs, to its end, in one step.
            layoutAnimation: m.enter > 0,
          },
          categories: legend.map((name, i) => ({ name, itemStyle: { color: colours[i] } })),
          data,
          links,
          label: {
            position: 'bottom',
            distance: 4,
            color: c.strong,
            fontSize: 12,
            backgroundColor: c.alpha(c.surface, 0.85),
            padding: [1, 3],
            borderRadius: 3,
          },
          labelLayout: { hideOverlap: true },
          emphasis: { focus: 'adjacency', label: { show: true }, lineStyle: { width: 2, opacity: 1 } },
          blur: { itemStyle: { opacity: 0.15 }, lineStyle: { opacity: 0.06 }, label: { opacity: 0.25 } },
        }],
      };
    }

    render({ fresh: true });
    return handle;
  },
});
