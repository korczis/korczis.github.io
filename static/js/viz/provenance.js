// Provenance (Apache ECharts sankey): how the repositories on this site are counted. The listings
// of both forges (data/index.json counts.github and counts.gitlab) flow into one list merged by
// name (counts.merged; a repository listed on both is counted once), which splits into original
// work (counts.own), forks, mirrors, empty and hidden repositories; the original ones flow on to
// where they live (hosts: on both forges, GitHub only, GitLab only, derived from repos[].hosts by
// templates/partials/viz-grid.html, source index.counts). Every figure is the index's own.
//
// A simulator: the visitor picks the forge (both, GitHub, GitLab: the listings and the hosts of
// that forge), and shows or leaves out the hidden and empty repositories. Every node and flow
// leads to its page through ctx.link: a forge or a host to the repositories index filtered to it,
// original work to the index, a fork or a mirror to its glossary term.
KorczisHub.viz('provenance', {
  lib: 'echarts',
  mount(box, source, { palette, motion, go, link, escape, t, param }) {
    const counts = source?.counts ?? {};
    const hosts = source?.hosts ?? {};
    const empty = { empty: true, items: () => [], controls: () => [], update() {}, resize() {}, destroy() {} };
    if (!counts.merged) return empty;

    const FORGES = ['both', 'github', 'gitlab'];
    const state = {
      forge: param.oneOf('forge', FORGES, 'both'),
      hidden: param.raw('hidden') === '1',
    };

    const repositories = (query) => link('filter', { page: 'repositories', ...query });
    const NODES = {
      github: { label: () => t('js_provenance_github'), url: () => repositories({ host: 'github' }), value: () => counts.github, column: 0 },
      gitlab: { label: () => t('js_provenance_gitlab'), url: () => repositories({ host: 'gitlab' }), value: () => counts.gitlab, column: 0 },
      merged: { label: () => t('js_provenance_merged'), url: () => link('page', 'repositories'), value: () => counts.merged, column: 1 },
      folded: { label: () => t('js_provenance_folded'), url: () => link('page', 'repositories'), value: () => (counts.github ?? 0) + (counts.gitlab ?? 0) - counts.merged, column: 2 },
      own: { label: () => t('js_provenance_original'), url: () => link('page', 'repositories'), value: () => counts.own, column: 2 },
      forks: { label: () => t('js_provenance_fork'), url: () => link('term', 'fork'), value: () => counts.forks, column: 2 },
      mirrors: { label: () => t('js_provenance_mirror'), url: () => link('term', 'mirror'), value: () => counts.mirrors, column: 2 },
      empty: { label: () => t('js_provenance_empty'), url: () => link('page', 'repositories'), value: () => counts.empty, column: 2, optional: true },
      hidden: { label: () => t('js_provenance_hidden_node'), url: () => link('page', 'repositories'), value: () => counts.hidden, column: 2, optional: true },
      both: { label: () => t('js_provenance_on_both'), url: () => repositories({ host: 'both' }), value: () => hosts.both, column: 3 },
      ghonly: { label: () => t('js_provenance_github_only'), url: () => repositories({ host: 'github' }), value: () => hosts.github, column: 3, forge: 'github' },
      glonly: { label: () => t('js_provenance_gitlab_only'), url: () => repositories({ host: 'gitlab' }), value: () => hosts.gitlab, column: 3, forge: 'gitlab' },
    };

    // The flows of the chosen view: a forge's listings and the hosts that forge holds.
    function model() {
      const showForge = (key) => state.forge === 'both' || key === state.forge;
      const links = [];
      const add = (from, to, value) => { if (value > 0) links.push({ source: from, target: to, value }); };
      if (showForge('github')) add('github', 'merged', counts.github);
      if (showForge('gitlab')) add('gitlab', 'merged', counts.gitlab);
      if (state.forge === 'both') add('merged', 'folded', NODES.folded.value());
      for (const key of ['own', 'forks', 'mirrors', 'empty', 'hidden']) {
        if (NODES[key].optional && !state.hidden) continue;
        add('merged', key, NODES[key].value());
      }
      add('own', 'both', hosts.both);
      if (showForge('github')) add('own', 'ghonly', hosts.github);
      if (showForge('gitlab')) add('own', 'glonly', hosts.gitlab);
      return links;
    }

    const readout = document.createElement('p');
    readout.className = 'pointer-events-none absolute bottom-2 left-3 z-10 rounded bg-white/85 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800/85 dark:text-gray-200';
    readout.setAttribute('aria-live', 'polite');
    box.append(readout);

    const chart = echarts.init(box.querySelector('[data-canvas]') || box, null, { renderer: 'canvas' });
    let entered = false;
    function option() {
      const c = palette();
      const m = motion();
      const links = model();
      const used = new Set(links.flatMap((l) => [l.source, l.target]));
      const tone = { 0: c.muted, 1: c.primary, 2: c.art[2], 3: c.art[3] };
      const nodes = Object.entries(NODES).filter(([key]) => used.has(key)).map(([key, n]) => ({
        name: key,
        key,
        label: n.label(),
        depth: n.column,
        itemStyle: { color: key === 'own' ? c.primary : tone[n.column] },
      }));
      const listings = links.filter((l) => l.target === 'merged').reduce((s, l) => s + l.value, 0);
      readout.textContent = t('js_provenance_readout', { listings, merged: counts.merged, original: counts.own });
      const w = box.clientWidth || 600;
      return {
        textStyle: { fontFamily: c.font },
        animationDuration: entered ? 0 : m.enter,
        animationDurationUpdate: m.update,
        animationEasing: m.easing,
        animationEasingUpdate: m.easing,
        tooltip: {
          trigger: 'item',
          confine: true,
          backgroundColor: c.surface,
          borderColor: c.grid,
          textStyle: { color: c.strong, fontSize: 12 },
          formatter: (p) => {
            const open = `<br><span style="opacity:.7">${escape(t('js_click_to_open'))}</span>`;
            if (p.dataType === 'edge') return `${escape(NODES[p.data.source].label())} → ${escape(NODES[p.data.target].label())}<br><b>${escape(String(p.data.value))}</b>${open}`;
            return `<b>${escape(p.data.label)}</b><br>${escape(String(NODES[p.data.key].value()))}${open}`;
          },
        },
        series: [{
          type: 'sankey',
          id: 'provenance',
          left: 8,
          top: 12,
          bottom: 34,
          right: Math.min(150, Math.round(w * 0.22)),
          nodeGap: 12,
          nodeWidth: 14,
          nodeAlign: 'justify',
          layoutIterations: 32,
          draggable: false,
          emphasis: { focus: 'adjacency' },
          data: nodes,
          links,
          label: {
            color: c.strong,
            fontSize: 12,
            width: Math.max(80, Math.round(w * 0.2)),
            overflow: 'truncate',
            ellipsis: '…',
            formatter: (p) => `${p.data.label} · ${NODES[p.data.key].value()}`,
          },
          lineStyle: { color: 'gradient', opacity: 0.38, curveness: 0.5 },
          itemStyle: { borderWidth: 0, borderRadius: 3 },
        }],
      };
    }

    function render() {
      chart.setOption(option(), { replaceMerge: ['series'] });
      entered = true;
    }
    render();

    chart.on('click', (p) => {
      const d = p.data;
      if (!d) return;
      const event = p.event?.event;
      // A flow opens where it leads.
      go(NODES[p.dataType === 'edge' ? d.target : d.key].url(), event);
    });

    return {
      // The list twin: every node shown, with its figure, each leading to its page.
      items: () => {
        const used = new Set(model().flatMap((l) => [l.source, l.target]));
        return Object.entries(NODES).filter(([key]) => used.has(key))
          .map(([, n]) => ({ label: n.label(), url: n.url(), note: String(n.value()) }))
          .filter((x) => x.url);
      },
      controls: () => [
        { key: 'forge', type: 'select', label: t('js_provenance_forge'), value: state.forge, options: [
          { value: 'both', label: t('js_provenance_both') },
          { value: 'github', label: 'GitHub' },
          { value: 'gitlab', label: 'GitLab' },
        ], set(v) { state.forge = v; render(); } },
        { key: 'hidden', type: 'toggle', label: t('js_provenance_hidden'), value: state.hidden, set(on) { state.hidden = on; render(); } },
      ],
      update() { chart.setOption(option(), { replaceMerge: ['series'] }); },
      resize() { chart.resize(); render(); },
      destroy() { chart.dispose(); readout.remove(); },
    };
  },
});
