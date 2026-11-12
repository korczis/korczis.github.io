// Year spiral (D3): every day of the contribution calendar as a cell on a ring, week by week around
// the circle, Monday inside, Sunday outside; colour and glow grow with the day's contributions.
// The centre holds the year's total; hover a day for its date and count, click it for that day's
// activity on GitHub.
KorczisHub.viz('spiral', {
  lib: 'd3',
  mount(box, source, { palette, reducedMotion }) {
    const tip = KorczisHub.tooltip(box);
    const days = source.days.map(([date, count]) => ({ date, count, d: new Date(`${date}T00:00:00Z`) }));
    const first = days[0].d;
    const weekOf = (d) => Math.floor(((d - first) / 86400000 + ((first.getUTCDay() + 6) % 7)) / 7);
    const weeks = weekOf(days[days.length - 1].d) + 1;
    const draw = () => {
      const c = palette();
      const width = box.clientWidth;
      const height = box.clientHeight;
      const size = Math.min(width, height);
      const outer = size / 2 - 22;
      const inner = outer * 0.38;
      const ring = (outer - inner) / 7;
      const max = d3.quantile(days.map((x) => x.count).filter(Boolean).sort(d3.ascending), 0.95) || 1;
      const colour = d3.scaleSequential(d3.interpolateRgbBasis(c.art)).domain([0, max]).clamp(true);
      const angle = d3.scaleLinear().domain([0, weeks]).range([0, 2 * Math.PI]);
      d3.select(box).select('svg').remove();
      const svg = d3.select(box).append('svg').attr('width', width).attr('height', height).attr('aria-hidden', 'true');
      const defs = svg.append('defs');
      const glow = defs.append('filter').attr('id', 'spiral-glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
      glow.append('feGaussianBlur').attr('stdDeviation', 2.2).attr('result', 'blur');
      const merge = glow.append('feMerge');
      merge.append('feMergeNode').attr('in', 'blur');
      merge.append('feMergeNode').attr('in', 'SourceGraphic');
      const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`);
      const arc = d3.arc().padAngle(0.012).padRadius(outer).cornerRadius(1.5);
      const cells = g.selectAll('path').data(days).join('path')
        .attr('d', (x) => {
          const w = weekOf(x.d);
          const dow = (x.d.getUTCDay() + 6) % 7;
          return arc({ innerRadius: inner + dow * ring, outerRadius: inner + (dow + 1) * ring - 1, startAngle: angle(w), endAngle: angle(w + 1) });
        })
        .attr('fill', (x) => (x.count ? colour(x.count) : c.ramp[0]))
        .attr('filter', (x) => (x.count >= max * 0.6 ? 'url(#spiral-glow)' : null))
        .style('cursor', (x) => (x.count ? 'pointer' : 'default'))
        .on('click', (_e, x) => {
          if (x.count && KorczisHub.github) window.open(`https://github.com/${KorczisHub.github}?tab=overview&from=${x.date}&to=${x.date}`, '_blank', 'noopener');
        })
        .on('mousemove', (event, x) => tip.show(`${x.d.toLocaleDateString(KorczisHub.locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}<br><b>${KorczisHub.t('js_n_contributions', { n: x.count })}</b>${x.count ? `<br><span style="opacity:.7">${KorczisHub.t('js_click_to_open')}</span>` : ''}`, event))
        .on('mouseleave', () => tip.hide());
      if (!reducedMotion()) {
        cells.attr('opacity', 0).transition().duration(700).delay((x) => weekOf(x.d) * 12).attr('opacity', 1);
      }
      // Month labels around the outside.
      const months = d3.utcMonths(first, days[days.length - 1].d);
      g.selectAll('text.m').data(months).join('text').attr('class', 'm')
        .attr('transform', (m) => { const a = angle(weekOf(m)) - Math.PI / 2; return `translate(${Math.cos(a) * (outer + 12)},${Math.sin(a) * (outer + 12)})`; })
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('fill', c.muted).attr('font-size', 10).attr('font-family', c.font)
        .text((m) => m.toLocaleDateString(KorczisHub.locale, { month: 'short', timeZone: 'UTC' }));
      const total = d3.sum(days, (x) => x.count);
      g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.1em').attr('fill', c.strong)
        .attr('font-size', Math.max(18, inner * 0.42)).attr('font-weight', 800).attr('font-family', c.font)
        .text(total.toLocaleString(KorczisHub.locale));
      g.append('text').attr('text-anchor', 'middle').attr('dy', '1.6em').attr('fill', c.muted)
        .attr('font-size', 11).attr('font-family', c.font).text(KorczisHub.t('js_n_contributions', { n: '' }).trim());
    };
    draw();
    const resize = new ResizeObserver(() => draw());
    resize.observe(box);
    // The list twin: the busiest 40 days of the year, each opening that day's activity on GitHub.
    const items = () => (KorczisHub.github ? days.filter((x) => x.count).sort((a, b) => b.count - a.count || b.date.localeCompare(a.date)).slice(0, 40)
      .map((x) => ({ label: x.date, url: `https://github.com/${KorczisHub.github}?tab=overview&from=${x.date}&to=${x.date}`, note: KorczisHub.t('js_n_contributions', { n: x.count }) })) : []);
    return { update: draw, items, destroy() { resize.disconnect(); d3.select(box).select('svg').remove(); } };
  },
});
