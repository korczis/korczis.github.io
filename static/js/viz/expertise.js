// Languages over the years (Apache ECharts): original repositories per year of creation, stacked by
// primary language, from data/index.json. The eight most used languages keep their own series; the
// rest are one "Other" series, so the chart stays readable. Colours step through the primary ramp.
KorczisHub.viz('expertise', {
  lib: 'echarts',
  mount(box, source, { palette }) {
    const TOP = 8;
    const top = source.languages.slice(0, TOP).map((l) => l.name);
    const years = Object.keys(source.years).sort();
    const series = [...top, 'Other'].map((name) => ({
      name,
      type: 'bar',
      stack: 'repos',
      barMaxWidth: 28,
      emphasis: { focus: 'series' },
      data: years.map((year) => {
        const row = source.years[year];
        if (name !== 'Other') return row[name] ?? 0;
        return Object.entries(row).filter(([lang]) => !top.includes(lang)).reduce((sum, [, n]) => sum + n, 0);
      }),
    }));
    const chart = echarts.init(box.querySelector('[data-canvas]') || box, null, { renderer: 'canvas' });

    const option = () => {
      const c = palette();
      // A sequential-to-distinct ramp: primary shades, then neutrals for the tail and "Other".
      const colours = [c.ramp[4], c.ramp[3], c.primary, c.ramp[2], c.ramp[1], c.muted, c.text, c.grid, c.ramp[0]];
      return {
        color: colours,
        textStyle: { fontFamily: c.font },
        grid: { left: 36, right: 12, top: 40, bottom: 28 },
        legend: { top: 0, type: 'scroll', textStyle: { color: c.text, fontSize: 11 }, itemWidth: 12, itemHeight: 10 },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          backgroundColor: c.surface,
          borderColor: c.grid,
          textStyle: { color: c.strong, fontSize: 12 },
        },
        xAxis: { type: 'category', data: years, axisLine: { lineStyle: { color: c.grid } }, axisLabel: { color: c.muted, fontSize: 11 } },
        yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: c.grid } }, axisLabel: { color: c.muted, fontSize: 11 } },
        series: series.map((x) => ({ ...x, cursor: x.name === 'Other' ? 'default' : 'pointer', itemStyle: { borderRadius: [2, 2, 0, 0] } })),
      };
    };

    chart.setOption(option());
    // A segment is a link: open every repository in that language.
    chart.on('click', (params) => {
      if (params.seriesName && params.seriesName !== 'Other') {
        window.location.href = `${KorczisHub.base}repositories/?language=${encodeURIComponent(params.seriesName)}`;
      }
    });
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(box);
    return {
      update() { chart.setOption(option(), true); },
      destroy() { resize.disconnect(); chart.dispose(); },
    };
  },
});
