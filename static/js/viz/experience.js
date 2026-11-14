// Experience (Apache ECharts sankey): the owner's client engagements (data/experience.json, measured
// and anonymised under NDA) flowing into the capabilities inferred from their sources, and on into
// the three domains those capabilities form. A simulator: the visitor picks the time window
// (from, to) and plays it month by month, filters one capability, and chooses what a flow
// measures (the owner's commits, the months of work, or plain breadth). Every node and flow
// leads to its page: an engagement to its card in the section, a capability to its glossary term,
// a domain to its catalogue category (ctx.link).
KorczisHub.viz('experience', {
  lib: 'echarts',
  mount(box, source, { palette, motion, go, link, escape, t }) {
    // templates/partials/experience-data.html: [suffix, label, engagements, links, sectors,
    // capabilities, domains]; the rules' words come in every language, the suffix picks one.
    const [sfx, label, rows, cards, sectors, capRules, domainRules] = source;
    const word = (o, k) => o[`${k}${sfx}`] ?? o[k];
    const caps = Object.fromEntries(Object.entries(capRules).map(([k, c]) => [k, { name: word(c, 'name'), description: word(c, 'description'), domain: c.domain, term: c.term }]));
    const domains = Object.fromEntries(Object.entries(domainRules).map(([k, d]) => [k, { name: word(d, 'name'), category: d.category, term: d.term }]));
    const order = Object.keys(caps);
    const engagements = rows.map((e, i) => ({ ...e, label: label.replace('{id}', e.id), url: cards[i], sector: e.sector ? word(sectors[e.sector], 'name') : null }))
      .filter((e) => e.capabilities.length);
    const tip = (html) => `<div style="max-width:18rem;white-space:normal">${html}</div>`;
    const empty = { empty: true, items: () => [], controls: () => [], update() {}, resize() {}, destroy() {} };
    if (!engagements.length) return empty;

    // The model's time: every month from the first engagement's start to the last one's end.
    const dated = engagements.filter((e) => e.period);
    const months = [];
    if (dated.length) {
      const first = dated.map((e) => e.period.from).sort()[0];
      const last = dated.map((e) => e.period.to).sort().pop();
      let [y, m] = first.split('-').map(Number);
      const key = () => `${y}-${String(m).padStart(2, '0')}`;
      while (key() <= last) {
        months.push(key());
        m += 1;
        if (m > 12) { y += 1; m = 1; }
      }
    }
    const lastIndex = Math.max(0, months.length - 1);
    const monthLabel = (i) => (months[i] ? new Date(`${months[i]}-01T00:00:00Z`).toLocaleDateString(KorczisHub.locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
    const state = { from: 0, to: lastIndex, cursor: lastIndex, capability: 'all', metric: 'commits', playing: false };

    // What each engagement weighs inside the window [from, cursor]; undated ones (capabilities the
    // owner declared, no commits) count only for breadth.
    function weight(e) {
      if (state.metric === 'breadth') return 1;
      if (!e.period) return 0;
      const window = months.slice(state.from, state.cursor + 1);
      if (state.metric === 'span') return window.filter((m) => m >= e.period.from && m <= e.period.to).length;
      return window.reduce((sum, m) => sum + (e.months[m] ?? 0), 0);
    }
    function model() {
      const links = [];
      const byCap = new Map();
      const live = [];
      for (const e of engagements) {
        const w = weight(e);
        const list = e.capabilities.filter((c) => caps[c.key] && (state.capability === 'all' || c.key === state.capability));
        if (!w || !list.length) continue;
        live.push({ e, w });
        const total = list.reduce((s, c) => s + (c.score || 1), 0);
        for (const c of list) {
          const value = state.metric === 'breadth' ? 1 : (w * (c.score || 1)) / total;
          links.push({ source: `e:${e.id}`, target: `c:${c.key}`, value, kind: 'ec', e, cap: c });
          byCap.set(c.key, (byCap.get(c.key) ?? 0) + value);
        }
      }
      for (const [key, value] of byCap) links.push({ source: `c:${key}`, target: `d:${caps[key].domain}`, value, kind: 'cd', key });
      return { links, live, byCap };
    }

    const urlOf = {
      e: (e) => e.url,
      c: (key) => link('term', caps[key].term),
      d: (key) => link('category', domains[key].category) ?? link('term', domains[key].term),
    };
    const fmt = (v) => (state.metric === 'commits' ? t('js_experience_n_commits', { n: Math.round(v) }) : state.metric === 'span' ? t('js_experience_n_months', { n: Math.round(v) }) : t('js_experience_n_links', { n: Math.round(v) }));

    // The readout under the flows: the window and what it holds, in words a screen reader gets too.
    const readout = document.createElement('p');
    readout.className = 'pointer-events-none absolute bottom-2 left-3 z-10 rounded bg-white/85 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800/85 dark:text-gray-200';
    readout.setAttribute('aria-live', 'polite');
    box.append(readout);

    // The simulator's parameters (above the option: the series must be the file's last types).
    const capOptions = [{ value: 'all', label: t('js_experience_all_capabilities') },
      ...order.filter((k) => engagements.some((e) => e.capabilities.some((c) => c.key === k))).map((k) => ({ value: k, label: caps[k].name }))];
    const controlDefs = () => [
      ...(months.length > 1 ? [
        { key: 'play', type: 'play', value: false, set(on) { play(on); } },
        { key: 'from', type: 'range', label: t('js_experience_from'), min: 0, max: lastIndex, step: 1, value: 0, format: monthLabel, set(v) { state.from = Math.min(v, state.to); state.cursor = state.to; render(); } },
        { key: 'to', type: 'range', label: t('js_experience_to'), min: 0, max: lastIndex, step: 1, value: lastIndex, format: monthLabel, set(v) { state.to = Math.max(v, state.from); state.cursor = state.to; render(); } },
      ] : []),
      { key: 'capability', type: 'select', label: t('js_experience_capability'), options: capOptions, value: 'all', set(v) { state.capability = v; render(); } },
      { key: 'metric', type: 'select', label: t('js_experience_metric'), value: 'commits', options: [
        { value: 'commits', label: t('js_experience_metric_commits') },
        { value: 'span', label: t('js_experience_metric_span') },
        { value: 'breadth', label: t('js_experience_metric_breadth') },
      ], set(v) { state.metric = v; render(); } },
    ];

    let timer = 0;
    function play(on) {
      state.playing = on;
      clearInterval(timer);
      if (!on) { state.cursor = state.to; render(); return; }
      state.cursor = state.from;
      render();
      timer = setInterval(() => {
        state.cursor = state.cursor >= state.to ? state.from : state.cursor + 1;
        render();
      }, Math.max(700, motion().update + 420));
    }

    const chart = echarts.init(box.querySelector('[data-canvas]') || box, null, { renderer: 'canvas' });
    let entered = false;
    function option() {
      const c = palette();
      const m = motion();
      const tone = { dd: c.art[0], ai: c.art[3], data: c.art[2] };
      const { links, live } = model();
      const used = new Set(links.flatMap((l) => [l.source, l.target]));
      const nodes = [
        ...engagements.filter((e) => used.has(`e:${e.id}`)).map((e) => ({ name: `e:${e.id}`, label: e.label, kind: 'e', e, itemStyle: { color: c.muted } })),
        ...order.filter((k) => used.has(`c:${k}`)).map((k) => ({ name: `c:${k}`, label: caps[k].name, kind: 'c', key: k, itemStyle: { color: tone[caps[k].domain] ?? c.primary } })),
        ...Object.keys(domains).filter((k) => used.has(`d:${k}`)).map((k) => ({ name: `d:${k}`, label: domains[k].name, kind: 'd', key: k, itemStyle: { color: tone[k] ?? c.primary } })),
      ];
      const w = box.clientWidth || 600;
      const sum = live.reduce((s, x) => s + x.w, 0);
      const span = months.length ? (state.cursor === state.from ? monthLabel(state.from) : `${monthLabel(state.from)} – ${monthLabel(state.cursor)}`) : '';
      readout.textContent = `${span ? `${span} · ` : ''}${t('js_experience_n_engagements', { n: live.length })}${state.metric === 'breadth' ? '' : ` · ${fmt(sum)}`}`;
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
            const d = p.data;
            const open = `<br><span style="opacity:.7">${escape(t('js_click_to_open'))}</span>`;
            if (p.dataType === 'edge') {
              const from = d.kind === 'ec' ? d.e.label : caps[d.key].name;
              const to = d.kind === 'ec' ? caps[d.cap.key].name : domains[caps[d.key].domain].name;
              return tip(`${escape(from)} → ${escape(to)}<br><b>${escape(fmt(d.value))}</b>${open}`);
            }
            if (d.kind === 'e') {
              const note = [d.e.sector, d.e.period ? `${monthLabel(months.indexOf(d.e.period.from))} – ${monthLabel(months.indexOf(d.e.period.to))}` : null].filter(Boolean).join(' · ');
              return tip(`<b>${escape(d.label)}</b>${note ? `<br>${escape(note)}` : ''}<br>${escape(fmt(p.value))}${open}`);
            }
            if (d.kind === 'c') return tip(`<b>${escape(d.label)}</b><br>${escape(caps[d.key].description)}<br>${escape(fmt(p.value))}${open}`);
            return tip(`<b>${escape(d.label)}</b><br>${escape(fmt(p.value))}${open}`);
          },
        },
        series: [{
          type: 'sankey',
          id: 'experience',
          left: 8,
          top: 12,
          bottom: 34,
          right: Math.min(170, Math.round(w * 0.24)),
          nodeGap: 10,
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
            formatter: (p) => p.data.label,
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
      if (p.dataType === 'edge') go(d.kind === 'ec' ? urlOf.c(d.cap.key) : urlOf.d(caps[d.key].domain), event);
      else if (d.kind === 'e') go(urlOf.e(d.e), event);
      else go(urlOf[d.kind](d.key), event);
    });

    return {
      // The list twin: each engagement (its card), each capability (its term), each domain (its category).
      items: () => {
        const { byCap } = model();
        return [
          ...engagements.map((e) => ({ label: e.label, url: urlOf.e(e), note: e.sector ?? '' })),
          ...order.filter((k) => byCap.has(k)).map((k) => ({ label: caps[k].name, url: urlOf.c(k), note: fmt(byCap.get(k)) })),
          ...Object.keys(domains).map((k) => ({ label: domains[k].name, url: urlOf.d(k), note: '' })),
        ].filter((x) => x.url);
      },
      controls: controlDefs,
      update() { chart.setOption(option(), { replaceMerge: ['series'] }); },
      resize() { chart.resize(); render(); },
      destroy() { clearInterval(timer); chart.dispose(); readout.remove(); },
    };
  },
});
