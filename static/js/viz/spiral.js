// Year spiral (D3), a simulator of a year of contributions: every day of the calendar is a cell on
// a ring, week by week around the circle, Monday inside, Sunday outside; colour and glow grow with
// the day's contributions and the centre holds the total. The visitor drives it through the
// layer's controls (state in the address): which year (the last twelve months or a calendar year
// in the data), play that fills the year day by day, and a threshold that lights the days with at
// least N contributions. Hover, or a first tap, reads a day; a click, or a second tap, opens the
// work page of the project committed to that day, else that day's activity on GitHub.
// Source (viz-grid, github.contributions): { calendar: { total, from, to, days: [[date, n]] },
// day_url: "...{date}..." | null, work: [{ repo, at: [date, ...] }] } (the bare calendar is read too).
KorczisHub.viz('spiral', {
  lib: 'd3',
  mount(box, source, { palette, motion, go, link, escape, t, id, param }) {
    const calendar = source?.calendar ?? source ?? {};
    const all = (calendar.days ?? [])
      .filter((d) => Array.isArray(d) && /^\d{4}-\d{2}-\d{2}$/.test(d[0]))
      .map(([date, count]) => ({ date, count: Number(count) || 0, d: new Date(`${date}T00:00:00Z`) }));
    if (!all.length) return { empty: true, items: () => [], update() {}, destroy() {} };

    // Which projects were committed to on a day, busiest first (the snapshot keeps each project's
    // latest commits, so older days may know none and fall back to GitHub's day view).
    const byDay = new Map();
    for (const { repo, at } of source?.work ?? []) {
      for (const date of at ?? []) {
        const day = byDay.get(date) ?? new Map();
        day.set(repo, (day.get(repo) ?? 0) + 1);
        byDay.set(date, day);
      }
    }
    const reposOn = (date) => [...(byDay.get(date) ?? new Map())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const dayUrl = (date) => {
      for (const [repo] of reposOn(date)) {
        const page = link('work', repo);
        if (page) return page;
      }
      const github = source?.day_url ?? (KorczisHub.github ? `https://github.com/${KorczisHub.github}?tab=overview&from={date}&to={date}` : null);
      return github ? github.replaceAll('{date}', date) : null;
    };
    for (const day of all) {
      day.repos = reposOn(day.date);
      day.url = day.count || day.repos.length ? dayUrl(day.date) : null;
    }

    // Windows: the last twelve months (the whole calendar) and every calendar year it touches.
    const calendarYears = [...new Set(all.map((x) => x.date.slice(0, 4)))].sort().reverse();
    const WINDOWS = ['last', ...(calendarYears.length > 1 ? calendarYears : [])];
    const MAX = d3.max(all, (x) => x.count) || 0;
    // The clock of a playing year: one day every DAY ms, then a hold before it starts again.
    const DAY = 30;
    const HOLD = 1500;
    const defaults = { window: 'last', threshold: 0 };
    const state = {
      window: param.oneOf('window', WINDOWS, defaults.window),
      threshold: param.int('threshold', 0, MAX, defaults.threshold),
      cursor: null,
    };

    function model() {
      const days = state.window === 'last' ? all : all.filter((x) => x.date.startsWith(state.window));
      const start = state.window === 'last' ? days[0].d : new Date(Date.UTC(Number(state.window), 0, 1));
      const end = state.window === 'last' ? days.at(-1).d : new Date(Date.UTC(Number(state.window), 11, 31));
      const weekOf = (d) => Math.floor(((d - start) / 86400000 + ((start.getUTCDay() + 6) % 7)) / 7);
      const counts = days.map((x) => x.count).filter(Boolean).sort(d3.ascending);
      return { days, start, end, weekOf, weeks: weekOf(end) + 1, peak: d3.quantile(counts, 0.95) || 1 };
    }

    const tip = KorczisHub.tooltip(box);
    const svg = d3.select(box).append('svg').attr('aria-hidden', 'true');
    const glowId = `${id}-glow`;
    const glow = svg.append('defs').append('filter').attr('id', glowId)
      .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    glow.append('feGaussianBlur').attr('stdDeviation', 2.2).attr('result', 'blur');
    const merge = glow.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');
    const g = svg.append('g');
    const ring = g.append('g');
    const months = g.append('g').attr('pointer-events', 'none');
    const centre = g.append('g').attr('pointer-events', 'none');
    const total = centre.append('text').attr('text-anchor', 'middle').attr('dy', '-0.1em').attr('font-weight', 800);
    const unit = centre.append('text').attr('text-anchor', 'middle').attr('dy', '1.6em').attr('font-size', 11);
    const over = centre.append('text').attr('text-anchor', 'middle').attr('dy', '3.1em').attr('font-size', 11).attr('font-weight', 600);
    let entered = false;
    let current = null;
    let pointer = 'mouse';
    let armed = null;

    const dateText = (x) => x.d.toLocaleDateString(KorczisHub.locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    function tipFor(x, event) {
      const repos = x.repos.slice(0, 3).map(([repo, n]) => `${escape(repo)} · ${escape(t('js_d3_n_commits', { n }))}`).join('<br>');
      const more = x.repos.length > 3 ? `<br>${escape(t('js_d3_n_more', { n: x.repos.length - 3 }))}` : '';
      const hint = x.url ? `<br><span class="opacity-75">${escape(t(pointer === 'mouse' ? 'js_click_to_open' : 'js_d3_tap_again'))}</span>` : '';
      tip.show(`${escape(dateText(x))}<br><b>${escape(t('js_d3_n_contributions', { n: x.count }))}</b>${repos ? `<br>${repos}${more}` : ''}${hint}`, event);
    }

    const lit = (x) => state.threshold > 0 && x.count >= state.threshold;
    const opacityOf = (x, i) => {
      if (state.cursor !== null && i > state.cursor) return 0;
      return state.threshold > 0 && !lit(x) ? 0.18 : 1;
    };

    // The centre counts what is shown: the window, or the days a playing year has reached.
    function writeCentre(c, inner) {
      const { days } = current;
      const shown = state.cursor === null ? days : days.slice(0, state.cursor + 1);
      const sum = d3.sum(shown, (x) => x.count);
      total.attr('fill', c.strong).attr('font-size', Math.max(18, inner * 0.42)).attr('font-family', c.font).text(sum.toLocaleString(KorczisHub.locale));
      unit.attr('fill', c.muted).attr('font-family', c.font).text(t('js_d3_spiral_unit', { n: sum }));
      const n = state.threshold > 0 ? shown.filter(lit).length : 0;
      over.attr('fill', c.primary).attr('font-family', c.font)
        .text(state.threshold > 0 ? t('js_d3_spiral_days_over', { n, min: state.threshold.toLocaleString(KorczisHub.locale) }) : '');
    }

    function activate(event, x) {
      if (!x.url) return;
      if (pointer !== 'mouse' && armed !== x.date) {
        armed = x.date;
        tipFor(x, event);
        return;
      }
      armed = null;
      go(x.url, event);
    }

    svg.on('pointerdown', (event) => { pointer = event.pointerType || 'mouse'; })
      .on('click', (event) => {
        if (event.target.tagName === 'path') return;
        armed = null;
        tip.hide();
      });

    let geometry = null;
    function draw() {
      const c = palette();
      const m = motion();
      const width = box.clientWidth;
      const height = box.clientHeight;
      if (!width || !height) return;
      current = model();
      const { days, weekOf, weeks, peak, start, end } = current;
      const size = Math.min(width, height);
      const outer = size / 2 - 22;
      const inner = outer * 0.38;
      const band = (outer - inner) / 7;
      geometry = { inner, c };
      svg.attr('width', width).attr('height', height);
      g.attr('transform', `translate(${width / 2},${height / 2})`);
      const colour = d3.scaleSequential(d3.interpolateRgbBasis(c.art)).domain([0, peak]).clamp(true);
      const angle = d3.scaleLinear().domain([0, weeks]).range([0, 2 * Math.PI]);
      const arc = d3.arc().padAngle(0.012).padRadius(outer).cornerRadius(1.5);
      const glowing = (x) => (state.threshold > 0 ? lit(x) : x.count >= peak * 0.6);

      const first = !entered;
      entered = true;
      const cells = ring.selectAll('path').data(days, (x) => x.date).join(
        (enter) => enter.append('path').attr('opacity', 0),
        (update) => update,
        (exit) => exit.remove(),
      )
        .attr('d', (x) => {
          const w = weekOf(x.d);
          const dow = (x.d.getUTCDay() + 6) % 7;
          return arc({ innerRadius: inner + dow * band, outerRadius: inner + (dow + 1) * band - 1, startAngle: angle(w), endAngle: angle(w + 1) });
        })
        .attr('fill', (x) => (x.count ? colour(x.count) : c.ramp[0]))
        .attr('filter', (x) => (glowing(x) ? `url(#${glowId})` : null))
        .style('cursor', (x) => (x.url ? 'pointer' : 'default'))
        .on('pointermove', (event, x) => { if (event.pointerType === 'mouse') tipFor(x, event); })
        .on('pointerleave', (event) => { if (event.pointerType === 'mouse') tip.hide(); })
        .on('click', activate)
        .on('auxclick', (event, x) => { if (event.button === 1 && x.url) go(x.url, event); });
      if (first && m.enter) {
        cells.transition('draw').duration(m.enter).delay((x) => Math.min(weekOf(x.d) * m.stagger, m.maxDelay))
          .ease(d3.easeCubicOut).attr('opacity', opacityOf);
      } else if (m.update && state.cursor === null) {
        cells.transition('draw').duration(m.update).ease(d3.easeCubicOut).attr('opacity', opacityOf);
      } else {
        cells.interrupt('draw').attr('opacity', opacityOf);
      }

      // Month labels around the outside.
      months.selectAll('text').data(d3.utcMonths(new Date(start.getTime() - 1), end), (mo) => mo.getTime()).join('text')
        .attr('transform', (mo) => {
          const a = angle(weekOf(mo)) - Math.PI / 2;
          return `translate(${Math.cos(a) * (outer + 12)},${Math.sin(a) * (outer + 12)})`;
        })
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('fill', c.muted).attr('font-size', 10).attr('font-family', c.font)
        .text((mo) => mo.toLocaleDateString(KorczisHub.locale, { month: 'short', timeZone: 'UTC' }));
      writeCentre(c, inner);
    }

    // Play fills the year day by day: cells appear up to the cursor and the centre counts along.
    let timer = null;
    function tick() {
      ring.selectAll('path').attr('opacity', opacityOf);
      writeCentre(geometry.c, geometry.inner);
    }
    function play(on) {
      timer?.stop();
      timer = null;
      if (!on) return;
      const n = current.days.length;
      const from = state.cursor === null || state.cursor >= n - 1 ? 0 : state.cursor;
      state.cursor = from;
      ring.selectAll('path').interrupt('draw');
      tick();
      timer = d3.timer((elapsed) => {
        const step = from + Math.floor(elapsed / DAY);
        if (step < n) {
          if (step !== state.cursor) {
            state.cursor = step;
            tick();
          }
        } else if (elapsed > (n - from) * DAY + HOLD) {
          play(true);
        } else if (state.cursor !== n - 1) {
          state.cursor = n - 1;
          tick();
        }
      });
    }

    const change = (key) => (v) => {
      if (state[key] === v) return;
      state[key] = v;
      if (key === 'window') state.cursor = null;
      draw();
      if (timer && key === 'window') play(true);
    };

    draw();

    // The list twin: the busiest days of the window (at least the threshold), each opening the
    // project committed to that day or that day on GitHub; never empty while any day counts.
    const items = () => {
      const { days } = model();
      const min = Math.max(1, state.threshold);
      return days.filter((x) => x.count >= min || (!state.threshold && x.repos.length))
        .sort((a, b) => b.count - a.count || b.date.localeCompare(a.date)).slice(0, 40)
        .map((x) => ({
          label: x.repos.length ? `${dateText(x)} · ${x.repos[0][0]}` : dateText(x),
          url: x.url ?? KorczisHub.home,
          note: t('js_d3_n_contributions', { n: x.count }),
        }));
    };

    const controls = () => [
      { key: 'play', type: 'play', value: false, set: play },
      ...(WINDOWS.length > 1 ? [{
        key: 'window', type: 'select', label: t('js_d3_spiral_window'), value: defaults.window, set: change('window'),
        options: WINDOWS.map((w) => ({ value: w, label: w === 'last' ? t('js_d3_spiral_last') : w })),
      }] : []),
      ...(MAX > 0 ? [{
        key: 'threshold', type: 'range', label: t('js_d3_spiral_threshold'), min: 0, max: MAX, step: 1, value: defaults.threshold,
        format: (v) => (v ? t('js_d3_spiral_at_least', { n: v }) : t('js_d3_spiral_off')), set: change('threshold'),
      }] : []),
    ];

    return {
      update: draw,
      resize: draw,
      items,
      controls,
      destroy() {
        timer?.stop();
        svg.remove();
        if (tip.remove) tip.remove();
        else box.querySelector(':scope > .viz-tip')?.remove();
      },
    };
  },
});
