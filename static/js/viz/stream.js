// Language stream (D3 streamgraph), a simulator of the index over time: original repositories per
// year of creation, stacked by language, with smooth curves and gradients along the art palette.
// The visitor drives the model through the layer's controls (handle.controls(), state in the
// address): a year window (from, to), play that grows the stream year by year, the stack's offset
// (wiggle around a centre line, shares of 100 %, or a zero baseline), how many languages keep their
// own stream (the rest fold into Other) and one language isolated; a legend chip isolates its
// language too. Hover, or a first tap, reads a stream; a click, or a second tap, opens the
// language's glossary term (else the index filtered to it).
// Source (viz-grid, index.years): { years: { "2016": { "Rust": 5, ... } }, languages: [{ name, repos }] }.
KorczisHub.viz('stream', {
  lib: 'd3',
  mount(box, source, { palette, motion, go, link, escape, hash, t, id, reflect: ctxReflect, colour: tone }) {
    const years = Object.keys(source?.years ?? {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const languages = (source?.languages ?? []).map((l) => l.name).filter((name) => name && name !== 'Other');
    if (!years.length || !languages.length) return { empty: true, items: () => [], update() {}, destroy() {} };

    const OTHER = '\u0000other';
    const FIRST = years[0];
    const LAST = years.at(-1);
    // One simulated year per beat while playing: the clock of the model, not an animation length.
    const BEAT = 900;
    const TOP_MIN = Math.min(3, languages.length);
    const TOP_MAX = Math.min(12, languages.length);
    const OFFSETS = ['wiggle', 'expand', 'zero'];
    const defaults = { from: FIRST, to: LAST, offset: 'wiggle', top: Math.min(8, TOP_MAX), isolate: '' };
    const choices = languages.slice(0, TOP_MAX);

    // The first frame already shows a configured simulation (?<id>.<key>=value): the address is
    // read here, so the entrance plays once with the restored state and the layer's set() finds
    // it set.
    const param = (key) => new URLSearchParams(location.search).get(`${id}.${key}`);
    const numberParam = (key, min, max) => {
      const raw = param(key);
      const n = Number(raw);
      return raw !== null && raw !== '' && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : defaults[key];
    };
    const state = {
      from: numberParam('from', FIRST, LAST),
      to: numberParam('to', FIRST, LAST),
      offset: OFFSETS.includes(param('offset')) ? param('offset') : defaults.offset,
      top: numberParam('top', TOP_MIN, TOP_MAX),
      isolate: choices.includes(param('isolate')) ? param('isolate') : defaults.isolate,
      cursor: null,
    };

    const label = (key) => (key === OTHER ? t('js_other') : key);
    const langUrl = (name) => link('language', name);
    const urlOf = (key) => (key === OTHER ? null : langUrl(key));

    // The model: the window's years (gaps filled with zeros), the streams it keeps, and per year
    // the repositories of each stream. While playing, years after the cursor count zero, so the
    // stream grows to the right without its curve changing the number of points.
    function model() {
      const lo = Math.min(state.from, state.to);
      const hi = Math.max(state.from, state.to);
      const end = state.cursor ?? hi;
      const top = languages.slice(0, state.top);
      const keys = state.isolate ? [state.isolate] : [...top];
      const folded = new Set();
      const rows = d3.range(lo, hi + 1).map((year) => {
        const row = { year };
        for (const k of keys) row[k] = 0;
        row[OTHER] = 0;
        if (year > end) return row;
        for (const [lang, n] of Object.entries(source.years[year] ?? {})) {
          if (state.isolate) {
            if (lang === state.isolate) row[lang] += n;
          } else if (top.includes(lang)) {
            row[lang] += n;
          } else {
            row[OTHER] += n;
            folded.add(lang);
          }
        }
        return row;
      });
      if (!state.isolate && rows.some((r) => r[OTHER] > 0)) keys.push(OTHER);
      // A single year has no width to draw: it is shown as a band half a year either side.
      const drawn = rows.length === 1 ? [{ ...rows[0], year: lo - 0.5 }, { ...rows[0], year: hi + 0.5 }] : rows;
      return { lo, hi, end, keys, rows, drawn, folded: [...folded] };
    }

    // Text on a coloured mark takes whichever theme ink (page or strong) stands out more on it.
    const ink = (fill, c) => tone.ink(fill, [c.page, c.strong]).ink;

    const tip = KorczisHub.tooltip(box);
    const svg = d3.select(box).append('svg').attr('aria-hidden', 'true');
    const defs = svg.append('defs');
    const layer = svg.append('g');
    const labels = svg.append('g').attr('pointer-events', 'none');
    const axis = svg.append('g');
    const legend = svg.append('g');
    let entered = false;
    let current = null;
    let scales = null;
    let pointer = 'mouse';
    let armed = null;
    let focused = null;

    // A choice made on the drawing (a legend chip) goes back to the layer, so its control and the
    // address follow (ctx.reflect; absent before the layer has it, then only the drawing changes).
    const reflect = (key, value) => ctxReflect?.(key, value);

    function isolate(key) {
      state.isolate = key && key !== OTHER && state.isolate !== key ? key : '';
      reflect('isolate', state.isolate);
      armed = null;
      focused = null;
      tip.hide();
      draw();
    }

    const opacityOf = (key) => (focused === null || key === focused ? 0.92 : 0.25);
    function highlight(key) {
      focused = key;
      layer.selectAll('path').interrupt('hover').transition('hover').duration(motion().hover).attr('opacity', (s) => opacityOf(s.key));
    }

    function tipFor(key, year, event) {
      const row = current.rows.find((r) => r.year === year);
      const n = row ? row[key] : 0;
      const total = row ? current.keys.reduce((sum, k) => sum + row[k], 0) : 0;
      const share = state.offset === 'expand' && total ? ` · ${Math.round((n / total) * 100)} %` : '';
      const folded = key === OTHER && current.folded.length
        ? `<br>${escape(current.folded.slice(0, 6).join(', '))}${current.folded.length > 6 ? ' …' : ''}` : '';
      const hint = key === OTHER ? '' : `<br><span class="opacity-75">${escape(t(pointer === 'mouse' ? 'js_click_to_open' : 'js_d3_tap_again'))}</span>`;
      tip.show(`<b>${escape(label(key))}</b> · ${escape(year)}<br>${escape(t('js_d3_n_repositories', { n }))}${escape(share)}${folded}${hint}`, event);
    }

    const yearAt = (event) => {
      const year = Math.round(scales.x.invert(d3.pointer(event, svg.node())[0]));
      return Math.min(current.hi, Math.max(current.lo, year));
    };

    // A mouse opens on click; a touch or pen first shows what a hover would, and opens on a second
    // tap of the same mark. The middle button (auxclick) opens a new tab, through go().
    function activate(event, key, show, open) {
      if (pointer !== 'mouse' && armed !== key) {
        armed = key;
        show(event);
        return;
      }
      armed = null;
      open(event);
    }

    svg.on('pointerdown', (event) => { pointer = event.pointerType || 'mouse'; })
      .on('click', (event) => {
        if (event.target !== svg.node()) return;
        armed = null;
        tip.hide();
        highlight(null);
      });

    function draw() {
      const c = palette();
      const m = motion();
      const width = box.clientWidth;
      const height = box.clientHeight;
      if (!width || !height) return;
      current = model();
      const { keys, drawn, lo, hi } = current;
      svg.attr('width', width).attr('height', height);

      // Legend chips along the bottom, above the year axis, wrapped to the width; an isolated
      // language keeps the others' chips, so another one is a click away.
      const chipWidth = (k) => label(k).length * 6.4 + 24;
      const shown = state.isolate ? choices.slice(0, Math.max(state.top, choices.indexOf(state.isolate) + 1)) : keys;
      let lx = 12;
      let line = 0;
      const chips = shown.map((k) => {
        const w = chipWidth(k);
        if (lx + w > width - 12 && lx > 12) { lx = 12; line += 1; }
        const chip = { key: k, x: lx, line };
        lx += w;
        return chip;
      });
      const margin = { top: 12, right: 12, bottom: 30 + (line + 1) * 20, left: 12 };

      const order = state.offset === 'wiggle' ? d3.stackOrderInsideOut : d3.stackOrderDescending;
      const offset = { wiggle: d3.stackOffsetWiggle, expand: d3.stackOffsetExpand, zero: d3.stackOffsetNone }[state.offset];
      const series = d3.stack().keys(keys).offset(offset).order(order)(drawn);
      const x = d3.scaleLinear().domain(d3.extent(drawn, (r) => r.year)).range([margin.left, width - margin.right]);
      const yMin = d3.min(series, (s) => d3.min(s, (d) => d[0])) ?? 0;
      const yMax = d3.max(series, (s) => d3.max(s, (d) => d[1])) ?? 1;
      const y = d3.scaleLinear().domain([yMin, yMax > yMin ? yMax : yMin + 1]).range([height - margin.bottom, margin.top]);
      scales = { x, y };
      const colour = d3.scaleSequential(d3.interpolateRgbBasis(c.art)).domain([0, Math.max(1, choices.length - 1)]);
      const colourOf = (k) => (k === OTHER ? c.muted : colour(Math.max(0, languages.indexOf(k))));
      const gid = (k) => `${id}-stream-${k === OTHER ? 'other' : hash(k).toString(36)}`;
      const area = d3.area().curve(d3.curveCatmullRom.alpha(0.5)).x((d) => x(d.data.year)).y0((d) => y(d[0])).y1((d) => y(d[1]));

      defs.selectAll('linearGradient').data(keys, (k) => k).join((enter) => {
        const g = enter.append('linearGradient').attr('x1', '0%').attr('x2', '100%');
        g.append('stop').attr('offset', '0%');
        g.append('stop').attr('offset', '100%');
        return g;
      })
        .attr('id', gid)
        .each(function (k) {
          const stops = d3.select(this).selectAll('stop');
          stops.filter((_d, i) => i === 0).attr('stop-color', d3.color(colourOf(k)).darker(0.4));
          stops.filter((_d, i) => i === 1).attr('stop-color', d3.color(colourOf(k)).brighter(0.5));
        });

      const first = !entered;
      entered = true;
      const paths = layer.selectAll('path').data(series, (s) => s.key).join(
        (enter) => enter.append('path').attr('d', area).attr('opacity', 0),
        (update) => update,
        (exit) => exit.transition('exit').duration(m.update).attr('opacity', 0).remove(),
      )
        .attr('fill', (s) => `url(#${gid(s.key)})`)
        .attr('stroke', c.surface).attr('stroke-width', 0.8)
        .style('cursor', (s) => (s.key === OTHER ? 'default' : 'pointer'))
        .on('pointerenter', (event, s) => {
          if (event.pointerType !== 'mouse') return;
          highlight(s.key);
          d3.select(event.currentTarget).raise();
        })
        .on('pointermove', (event, s) => { if (event.pointerType === 'mouse') tipFor(s.key, yearAt(event), event); })
        .on('pointerleave', (event) => {
          if (event.pointerType !== 'mouse') return;
          highlight(null);
          tip.hide();
        })
        .on('click', (event, s) => activate(event, s.key, (e) => { highlight(s.key); tipFor(s.key, yearAt(e), e); }, (e) => go(urlOf(s.key), e)))
        .on('auxclick', (event, s) => { if (event.button === 1) go(urlOf(s.key), event); });
      if (first && m.enter) {
        paths.transition('draw').duration(m.enter).delay((_s, i) => Math.min(i * m.stagger * 5, m.maxDelay))
          .ease(d3.easeCubicOut).attr('opacity', (s) => opacityOf(s.key));
      } else if (m.update) {
        paths.transition('draw').duration(m.update).ease(d3.easeCubicOut).attr('d', area).attr('opacity', (s) => opacityOf(s.key));
      } else {
        paths.interrupt('draw').attr('d', area).attr('opacity', (s) => opacityOf(s.key));
      }

      axis.attr('transform', `translate(0,${height - margin.bottom + 6})`)
        .call(d3.axisBottom(x).ticks(Math.min(hi - lo + 1, Math.floor(width / 70))).tickFormat(d3.format('d')).tickSize(0))
        .call((a) => a.select('.domain').remove())
        .call((a) => a.selectAll('text').attr('fill', c.muted).attr('font-size', 11).attr('font-family', c.font));
      // The cursor of a playing simulation: the year the stream has grown to.
      axis.selectAll('text.cursor').data(state.cursor === null ? [] : [state.cursor]).join('text').attr('class', 'cursor')
        .attr('x', (yr) => x(yr)).attr('y', -10).attr('text-anchor', 'middle').attr('fill', c.strong)
        .attr('font-size', 12).attr('font-weight', 700).attr('font-family', c.font).text((yr) => yr);

      // Labels inside the widest point of each stream thick enough, away from the edges.
      const placed = series.map((s) => {
        const peak = s.reduce((best, d) => (d[1] - d[0] > best[1] - best[0] ? d : best), s[0]);
        const px = x(peak.data.year);
        const fits = y(peak[0]) - y(peak[1]) >= 18 && px >= margin.left + 34 && px <= width - margin.right - 34;
        return fits ? { key: s.key, x: px, y: (y(peak[0]) + y(peak[1])) / 2 } : null;
      }).filter(Boolean);
      labels.selectAll('text').data(placed, (p) => p.key).join('text')
        .attr('dy', '0.35em').attr('text-anchor', 'middle').attr('font-size', 11).attr('font-weight', 700)
        .attr('font-family', c.font).attr('fill', (p) => ink(colourOf(p.key), c)).text((p) => label(p.key))
        .attr('x', (p) => p.x).attr('y', (p) => p.y);

      const chip = legend.attr('transform', `translate(0,${height - margin.bottom + 34})`)
        .selectAll('g.chip').data(chips, (d) => d.key).join((enter) => {
          const g = enter.append('g').attr('class', 'chip');
          g.append('rect').attr('rx', 5).attr('y', -9).attr('height', 18);
          g.append('circle').attr('r', 4).attr('cx', 9);
          g.append('text').attr('x', 18).attr('dy', '0.35em').attr('font-size', 11);
          return g;
        })
        .attr('transform', (d) => `translate(${d.x},${d.line * 20})`)
        .style('cursor', (d) => (d.key === OTHER ? 'default' : 'pointer'))
        .attr('opacity', (d) => (!state.isolate || d.key === state.isolate ? 1 : 0.5));
      chip.select('rect').attr('width', (d) => chipWidth(d.key) - 4).attr('fill', (d) => (d.key === state.isolate ? c.primarySoft : c.alpha(c.surface, 0)));
      chip.select('circle').attr('fill', (d) => colourOf(d.key));
      chip.select('text').attr('fill', c.text).attr('font-family', c.font).text((d) => label(d.key));
      chip.on('pointerenter', (event, d) => { if (event.pointerType === 'mouse' && !state.isolate) highlight(d.key); })
        .on('pointerleave', (event) => { if (event.pointerType === 'mouse' && !state.isolate) highlight(null); })
        .on('click', (_event, d) => isolate(d.key));
    }

    // Play: the cursor walks the window one year a beat (from its start when it stood at the end),
    // holds the full stream for two beats and starts again; pause freezes the year shown.
    let timer = null;
    let hold = 0;
    function play(on) {
      timer?.stop();
      timer = null;
      if (!on) return;
      const lo = Math.min(state.from, state.to);
      const hi = Math.max(state.from, state.to);
      if (state.cursor === null || state.cursor >= hi) state.cursor = lo;
      hold = 0;
      draw();
      timer = d3.interval(() => {
        if (state.cursor < hi) state.cursor += 1;
        else if ((hold += 1) > 2) {
          state.cursor = lo;
          hold = 0;
        }
        draw();
      }, BEAT);
    }

    const change = (key) => (v) => {
      if (state[key] === v) return;
      state[key] = v;
      if (key === 'isolate') focused = null;
      if (key === 'from' || key === 'to') state.cursor = null;
      if (timer && state.cursor === null) play(true);
      else draw();
    };

    draw();

    // The list twin: each stream in the window with its repositories and years; an isolated
    // language lists its years instead, each opening the language.
    const items = () => {
      const { rows, keys } = model();
      if (state.isolate) {
        return rows.filter((r) => r[state.isolate] > 0).map((r) => ({
          label: `${state.isolate} · ${r.year}`, url: langUrl(state.isolate), note: t('js_d3_n_repositories', { n: r[state.isolate] }),
        }));
      }
      return keys.filter((k) => k !== OTHER).map((lang) => {
        const active = rows.filter((r) => r[lang] > 0);
        const n = d3.sum(active, (r) => r[lang]);
        const span = active.length ? ` · ${active[0].year}–${active.at(-1).year}` : '';
        return { label: lang, url: langUrl(lang), note: `${t('js_d3_n_repositories', { n })}${span}` };
      });
    };

    const year = (v) => String(v);
    const controls = () => [
      { key: 'play', type: 'play', value: false, set: play },
      { key: 'from', type: 'range', label: t('js_d3_stream_from'), min: FIRST, max: LAST, step: 1, value: defaults.from, format: year, set: change('from') },
      { key: 'to', type: 'range', label: t('js_d3_stream_to'), min: FIRST, max: LAST, step: 1, value: defaults.to, format: year, set: change('to') },
      {
        key: 'offset', type: 'select', label: t('js_d3_stream_offset'), value: defaults.offset, set: change('offset'),
        options: OFFSETS.map((o) => ({ value: o, label: t(`js_d3_stream_offset_${o}`) })),
      },
      ...(TOP_MAX > TOP_MIN ? [{
        key: 'top', type: 'range', label: t('js_d3_stream_top'), min: TOP_MIN, max: TOP_MAX, step: 1, value: defaults.top,
        format: (v) => t('js_d3_n_languages', { n: v }), set: change('top'),
      }] : []),
      {
        key: 'isolate', type: 'select', label: t('js_d3_stream_isolate'), value: defaults.isolate, set: change('isolate'),
        options: [{ value: '', label: t('js_d3_stream_all') }, ...choices.map((l) => ({ value: l, label: l }))],
      },
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
