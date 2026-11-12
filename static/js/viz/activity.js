// Contribution calendar (Apache ECharts): the last twelve months of public GitHub contributions,
// from the snapshot in data/github.json. Bins are the quartiles of the active days, so the scale
// says something about this year rather than about an arbitrary fixed threshold.
KorczisHub.viz('activity', {
  lib: 'echarts',
  mount(box, source, { palette }) {
    const { days, from, to } = source;
    const active = days.map(([, count]) => count).filter((count) => count > 0).sort((a, b) => a - b);
    const quantile = (q) => active[Math.min(active.length - 1, Math.floor(q * active.length))] || 1;
    const q1 = quantile(0.25);
    const q2 = Math.max(q1 + 1, quantile(0.5));
    const q3 = Math.max(q2 + 1, quantile(0.75));
    const chart = echarts.init(box.querySelector('[data-canvas]') || box, null, { renderer: 'canvas' });

    const option = () => {
      const c = palette();
      return {
        textStyle: { fontFamily: c.font },
        tooltip: {
          backgroundColor: c.surface,
          borderColor: c.grid,
          textStyle: { color: c.strong, fontSize: 12 },
          formatter: ({ value: [date, count] }) => `${new Date(date).toLocaleDateString(KorczisHub.locale, { day: 'numeric', month: 'long', year: 'numeric' })}<br><b>${KorczisHub.t('js_n_contributions', { n: count })}</b>`,
        },
        visualMap: {
          type: 'piecewise',
          orient: 'horizontal',
          left: 'right',
          bottom: 0,
          itemWidth: 12,
          itemHeight: 12,
          itemGap: 6,
          textStyle: { color: c.muted, fontSize: 11 },
          pieces: [
            { value: 0, label: '0', color: c.ramp[0] },
            { min: 1, max: q1, label: `1–${q1}`, color: c.ramp[1] },
            { min: q1 + 1, max: q2, label: `${q1 + 1}–${q2}`, color: c.ramp[2] },
            { min: q2 + 1, max: q3, label: `${q2 + 1}–${q3}`, color: c.ramp[3] },
            { min: q3 + 1, label: `${q3 + 1}+`, color: c.ramp[4] },
          ],
        },
        calendar: {
          top: 22,
          left: 36,
          right: 6,
          bottom: 36,
          range: [from, to],
          cellSize: ['auto', 'auto'],
          splitLine: { show: false },
          itemStyle: { color: c.ramp[0], borderColor: c.surface, borderWidth: 2 },
          dayLabel: { firstDay: 1, nameMap: ['', 'Mon', '', 'Wed', '', 'Fri', ''], color: c.muted, fontSize: 10 },
          monthLabel: { color: c.muted, fontSize: 10 },
          yearLabel: { show: false },
        },
        series: [{
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: days,
          itemStyle: { borderRadius: 2, borderColor: c.surface, borderWidth: 2 },
          emphasis: { itemStyle: { borderColor: c.strong, borderWidth: 1 } },
        }],
      };
    };

    chart.setOption(option());
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(box);
    return {
      update() {
        chart.setOption(option(), true);
      },
      destroy() {
        resize.disconnect();
        chart.dispose();
      },
    };
  },
});
