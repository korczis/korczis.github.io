// Repositories by language (Apache ECharts bars), a simulator over time. Sources:
//   index.languages   [{name, repos, years: {"2012": n, ...}}]  the original repositories by primary
//                     language, with how many of them were created in each year;
//   github.languages  [{name, repos, color}]  GitHub's own count, with a pre-grouped "Other".
// The visitor picks the metric (repositories or share), the years counted (an end year and a span,
// scrubbed by play when the source has years) and how many languages stand on their own; the rest
// fold into "Other", which names what it holds in its tooltip and in the list, and opens them all
// when clicked. A bar opens the language's glossary term, or the index filtered to it when the
// glossary has none. One series, one colour: bars compare counts, they need no legend or rainbow.
KorczisHub.viz('languages', {
  lib: 'echarts',
  mount(box, source, { palette, motion, go, link, escape, t }) {
    const entries = (Array.isArray(source) ? source : []).filter((e) => e && e.name);
    const OTHER = 'Other';
    const home = KorczisHub.home;
    const url = (name) => link('term', name) || `${home}repositories/?language=${encodeURIComponent(name)}`;
    const years = [...new Set(entries.flatMap((e) => Object.keys(e.years || {})))].sort();
    const timed = years.length > 1;
    const named = entries.filter((e) => e.name !== OTHER);
    const preGrouped = entries.find((e) => e.name === OTHER);
    const state = {
      metric: 'repos',
      to: timed ? Number(years.at(-1)) : null,
      span: years.length,
      top: Math.min(12, named.length),
    };
    const number = new Intl.NumberFormat(KorczisHub.locale, { maximumFractionDigits: 0 });
    const percent = new Intl.NumberFormat(KorczisHub.locale, { maximumFractionDigits: 1 });

    // The model at the chosen years: counts per language, the top N on their own, the rest folded.
    function model() {
      const from = timed ? Math.max(Number(years[0]), state.to - state.span + 1) : null;
      const count = (e) => (timed && e.years
        ? Object.entries(e.years).reduce((sum, [y, n]) => sum + (Number(y) >= from && Number(y) <= state.to ? n : 0), 0)
        : e.repos);
      const counted = named.map((e) => ({ name: e.name, n: count(e) })).filter((e) => e.n > 0)
        .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
      const shown = counted.slice(0, state.top);
      const folded = counted.slice(state.top);
      const rest = folded.reduce((sum, e) => sum + e.n, 0) + (preGrouped && !timed ? preGrouped.repos : 0);
      const total = counted.reduce((sum, e) => sum + e.n, 0) + (preGrouped && !timed ? preGrouped.repos : 0);
      const bars = [...shown, ...(rest ? [{ name: OTHER, n: rest, members: folded }] : [])]
        .map((b) => ({ ...b, share: total ? (b.n / total) * 100 : 0 }));
      return { from, bars, total, folded };
    }

    const chart = echarts.init(box.querySelector('[data-canvas]') || box, null, { renderer: 'canvas' });
    let first = true;
    let current = model();
    const render = () => {
      current = model();
      chart.setOption(option());
      first = false;
    };

    chart.on('click', (p) => {
      const bar = current.bars[p.dataIndex];
      if (!bar) return;
      if (bar.name === OTHER) {
        // "Other" opens what it holds: every language stands on its own.
        if (bar.members?.length) {
          state.top = named.length;
          render();
        } else {
          go(`${home}repositories/`, p.event?.event);
        }
        return;
      }
      go(url(bar.name), p.event?.event);
    });

    let timer = 0;
    const play = (on) => {
      clearInterval(timer);
      if (!on || !timed) return;
      const last = Number(years.at(-1));
      const firstYear = Number(years[0]);
      if (state.to >= last) {
        state.to = firstYear;
        render();
      }
      // One year a second: a pace to read by, not an animation (the bars glide by motion().update).
      timer = setInterval(() => {
        state.to = state.to >= last ? firstYear : state.to + 1;
        render();
      }, 1000);
    };

    const handle = {
      empty: !entries.length,
      // The list twin: every language standing on its own, then each one "Other" holds.
      items: () => current.bars.flatMap((b) => (b.name === OTHER
        ? (b.members || []).map((m) => ({ label: `${t('js_other')} · ${m.name}`, url: url(m.name), note: t('js_n_repositories', { n: m.n }) }))
          .concat(b.members?.length ? [] : [{ label: t('js_other'), url: `${home}repositories/`, note: t('js_n_repositories', { n: b.n }) }])
        : [{ label: b.name, url: url(b.name), note: t('js_n_repositories', { n: b.n }) }])),
      controls: () => [
        {
          key: 'metric',
          type: 'select',
          label: t('js_languages_metric'),
          options: [{ value: 'repos', label: t('js_languages_metric_repos') }, { value: 'share', label: t('js_languages_metric_share') }],
          value: state.metric,
          set(v) { state.metric = v === 'share' ? 'share' : 'repos'; render(); },
        },
        ...(timed ? [
          { key: 'play', type: 'play', value: false, set: play },
          {
            key: 'year', type: 'range', label: t('js_languages_year'), min: Number(years[0]), max: Number(years.at(-1)), step: 1,
            value: state.to, format: String, set(v) { state.to = v; render(); },
          },
          {
            key: 'span', type: 'range', label: t('js_languages_span'), min: 1, max: years.length, step: 1,
            value: state.span, format: (v) => t('js_languages_years', { n: v }), set(v) { state.span = v; render(); },
          },
        ] : []),
        {
          key: 'top', type: 'range', label: t('js_languages_top'), min: 3, max: Math.max(3, named.length), step: 1,
          value: state.top, format: String, set(v) { state.top = v; render(); },
        },
      ],
      resize() { chart.resize(); },
      update() { render(); },
      destroy() {
        clearInterval(timer);
        chart.dispose();
      },
    };

    // The option comes last: scripts/check-viz-layer.mjs reads every `type:` after `series:` as a
    // series type, so the controls (type: 'range', ...) must stand above it.
    function option() {
      const c = palette();
      const m = motion();
      const share = state.metric === 'share';
      const value = (b) => (share ? Math.round(b.share * 10) / 10 : b.n);
      const show = (v) => (share ? `${percent.format(v)} %` : number.format(v));
      const label = (name) => (name === OTHER ? t('js_other') : name);
      const shownYears = timed ? (current.from === state.to ? String(state.to) : `${current.from}–${state.to}`) : '';
      return {
        animation: m.enter > 0,
        // The entrance plays once; a scrub or a new metric glides by the update duration.
        animationDuration: first ? m.enter : 0,
        animationEasing: m.easing,
        animationDelay: first ? (i) => Math.min(i * m.stagger, m.maxDelay) : 0,
        animationDurationUpdate: m.update,
        animationEasingUpdate: 'cubicInOut',
        aria: { enabled: true, label: { description: box.getAttribute('aria-label') || '' } },
        textStyle: { fontFamily: c.font },
        ...(timed ? { title: {
          text: shownYears,
          subtext: t('js_languages_total', { n: current.total }),
          left: 0,
          top: 0,
          textStyle: { color: c.strong, fontSize: 14, fontWeight: 600 },
          subtextStyle: { color: c.text, fontSize: 12 },
        } } : {}),
        tooltip: {
          trigger: 'item',
          confine: true,
          backgroundColor: c.surface,
          borderColor: c.grid,
          textStyle: { color: c.strong, fontSize: 12 },
          formatter: (p) => {
            const b = current.bars[p.dataIndex];
            if (!b) return '';
            const held = b.members?.length
              ? `<br>${escape(b.members.slice(0, 10).map((x) => x.name).join(', '))}${b.members.length > 10 ? ', …' : ''}`
              : '';
            const action = b.name === OTHER && b.members?.length ? t('js_languages_expand') : t('js_click_to_open');
            return `<b>${escape(label(b.name))}</b><br>${escape(t('js_n_repositories', { n: b.n }))} · ${escape(`${percent.format(b.share)} %`)}${held}<br><span class="opacity-75">${escape(action)}</span>`;
          },
        },
        // The top stays clear for the title and the layer's toolbar over the top-right corner.
        grid: { left: 4, right: 48, top: timed ? 56 : 44, bottom: 4, containLabel: true },
        xAxis: {
          type: 'value',
          max: share ? 'dataMax' : null,
          minInterval: 1,
          splitLine: { lineStyle: { color: c.grid } },
          axisLabel: { color: c.muted, fontSize: 11, formatter: (v) => show(v) },
        },
        yAxis: {
          type: 'category',
          inverse: true,
          data: current.bars.map((b) => label(b.name)),
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { color: c.text, fontSize: 12 },
        },
        series: [{
          id: 'languages',
          type: 'bar',
          data: current.bars.map((b) => ({
            value: value(b),
            itemStyle: { color: b.name === OTHER ? c.muted : c.primary, borderRadius: [0, 4, 4, 0] },
          })),
          barMaxWidth: 18,
          cursor: 'pointer',
          label: { show: true, position: 'right', color: c.text, fontSize: 11, formatter: (p) => show(p.value) },
          emphasis: { itemStyle: { color: c.ramp[3] } },
        }],
      };
    }

    render();
    return handle;
  },
});
