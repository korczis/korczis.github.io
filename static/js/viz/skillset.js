// Skillset (Apache ECharts sunburst): the most recently active repositories (data/index.json,
// recent window) as categories, each split into the languages they are written in. Inner ring =
// category (click: its page), outer ring = language (click: the index filtered to both).
KorczisHub.viz('skillset', {
  lib: 'echarts',
  mount(box, source, { palette }) {
    const { mix, names } = source;
    const chart = echarts.init(box.querySelector('[data-canvas]') || box, null, { renderer: 'canvas' });
    const data = () => {
      const c = palette();
      const ramp = [c.ramp[4], c.ramp[3], c.primary, c.ramp[2], c.muted, c.ramp[1]];
      return Object.entries(mix)
        .map(([key, langs]) => ({
          name: names[key] ?? key,
          key,
          // The inner ring counts every repository; the outer ring shows only detected languages, so
          // repositories without one (mostly GitLab-only) do not drown the languages that exist.
          value: Object.values(langs).reduce((a, b) => a + b, 0),
          children: Object.entries(langs).filter(([lang]) => lang !== 'Unspecified').sort((a, b) => b[1] - a[1]).map(([lang, n]) => ({ name: lang, value: n, key, lang })),
        }))
        .sort((a, b) => b.value - a.value)
        .map((node, i) => ({ ...node, itemStyle: { color: ramp[i % ramp.length] } }));
    };
    const option = () => {
      const c = palette();
      return {
        textStyle: { fontFamily: c.font },
        tooltip: {
          backgroundColor: c.surface,
          borderColor: c.grid,
          textStyle: { color: c.strong, fontSize: 12 },
          formatter: (p) => `${p.treePathInfo.slice(1).map((t) => t.name).join(' › ')}<br><b>${KorczisHub.t('js_n_repositories', { n: p.value })}</b><br><span style="opacity:.7">${KorczisHub.t('js_click_to_open')}</span>`,
        },
        series: [{
          type: 'sunburst',
          data: data(),
          radius: ['14%', '96%'],
          sort: null,
          nodeClick: false,
          itemStyle: { borderColor: c.surface, borderWidth: 2, borderRadius: 4 },
          emphasis: { focus: 'ancestor' },
          levels: [
            {},
            { r0: '14%', r: '52%', label: { rotate: 'tangential', color: '#fff', fontSize: 11, fontWeight: 600, minAngle: 40 } },
            { r0: '52%', r: '96%', label: { rotate: 'radial', align: 'center', color: '#fff', fontSize: 10, minAngle: 8 }, itemStyle: { opacity: 0.88 } },
          ],
        }],
      };
    };
    chart.setOption(option());
    chart.on('click', (p) => {
      const d = p.data;
      if (!d) return;
      const base = KorczisHub.home;
      window.location.href = d.lang
        ? `${base}repositories/?category=${d.key}${d.lang !== 'Unspecified' ? `&language=${encodeURIComponent(d.lang)}` : ''}`
        : `${base}projects/${d.key}/`;
    });
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(box);
    return {
      update() { chart.setOption(option(), true); },
      destroy() { resize.disconnect(); chart.dispose(); },
    };
  },
});
