// Language stream (D3 streamgraph): original repositories per year of creation, stacked by
// language around a wiggling centre line with smooth curves and gradients along the art palette.
// Hover a stream to bring it forward and read it; a click opens the index for that language.
KorczisHub.viz('stream', {
  lib: 'd3',
  mount(box, source, { palette, reducedMotion }) {
    const tip = KorczisHub.tooltip(box);
    const TOP = 8;
    const top = source.languages.slice(0, TOP).map((l) => l.name);
    const keys = [...top, 'Other'];
    const years = Object.keys(source.years).sort();
    const rows = years.map((year) => {
      const row = { year: +year };
      for (const k of keys) row[k] = 0;
      for (const [lang, n] of Object.entries(source.years[year])) row[top.includes(lang) ? lang : 'Other'] += n;
      return row;
    });
    const label = (k) => (k === 'Other' ? KorczisHub.t('js_other') : k);
    const draw = () => {
      const c = palette();
      const width = box.clientWidth;
      const height = box.clientHeight;
      const margin = { top: 12, right: 12, bottom: 26, left: 12 };
      const series = d3.stack().keys(keys).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut)(rows);
      const x = d3.scaleLinear().domain(d3.extent(rows, (r) => r.year)).range([margin.left, width - margin.right]);
      const y = d3.scaleLinear()
        .domain([d3.min(series, (s) => d3.min(s, (d) => d[0])), d3.max(series, (s) => d3.max(s, (d) => d[1]))])
        .range([height - margin.bottom, margin.top]);
      const colour = d3.scaleSequential(d3.interpolateRgbBasis(c.art)).domain([0, keys.length - 1]);
      const area = d3.area().curve(d3.curveCatmullRom.alpha(0.5)).x((d) => x(d.data.year)).y0((d) => y(d[0])).y1((d) => y(d[1]));
      d3.select(box).select('svg').remove();
      const svg = d3.select(box).append('svg').attr('width', width).attr('height', height).attr('aria-hidden', 'true');
      const defs = svg.append('defs');
      keys.forEach((k, i) => {
        const g = defs.append('linearGradient').attr('id', `stream-g-${i}`).attr('x1', '0%').attr('x2', '100%');
        g.append('stop').attr('offset', '0%').attr('stop-color', d3.color(colour(i)).darker(0.4));
        g.append('stop').attr('offset', '100%').attr('stop-color', d3.color(colour(i)).brighter(0.5));
      });
      const paths = svg.append('g').selectAll('path').data(series).join('path')
        .attr('d', area).attr('fill', (_s, i) => `url(#stream-g-${i})`)
        .attr('stroke', c.surface).attr('stroke-width', 0.8).attr('opacity', 0.92)
        .style('cursor', (s) => (s.key === 'Other' ? 'default' : 'pointer'))
        .on('mouseenter', function (_e, s) {
          paths.transition().duration(150).attr('opacity', (o) => (o === s ? 1 : 0.25));
          d3.select(this).raise();
        })
        .on('mousemove', (event, s) => {
          const year = Math.round(x.invert(d3.pointer(event, svg.node())[0]));
          const row = rows.find((r) => r.year === year);
          tip.show(`<b>${label(s.key)}</b> · ${year}<br>${KorczisHub.t('js_n_repositories', { n: row ? row[s.key] : 0 })}`, event);
        })
        .on('mouseleave', () => { paths.transition().duration(200).attr('opacity', 0.92); tip.hide(); })
        .on('click', (_e, s) => { if (s.key !== 'Other') window.location.href = `${KorczisHub.home}repositories/?language=${encodeURIComponent(s.key)}`; });
      if (!reducedMotion()) {
        paths.attr('opacity', 0).transition().duration(800).delay((_s, i) => i * 70).attr('opacity', 0.92);
      }
      svg.append('g').attr('transform', `translate(0,${height - margin.bottom + 6})`)
        .call(d3.axisBottom(x).ticks(Math.min(years.length, Math.floor(width / 70))).tickFormat(d3.format('d')).tickSize(0))
        .call((a) => a.select('.domain').remove())
        .call((a) => a.selectAll('text').attr('fill', c.muted).attr('font-size', 11).attr('font-family', c.font));
      // Labels inside the widest point of each large stream.
      series.forEach((s, i) => {
        const peak = s.reduce((best, d) => (d[1] - d[0] > best[1] - best[0] ? d : best), s[0]);
        // Only where the stream is thick enough and away from the edges, so no label is clipped.
        const px = x(peak.data.year);
        if (y(peak[0]) - y(peak[1]) < 18 || px < margin.left + 34 || px > width - margin.right - 34) return;
        svg.append('text').attr('x', x(peak.data.year)).attr('y', (y(peak[0]) + y(peak[1])) / 2).attr('dy', '0.35em')
          .attr('text-anchor', 'middle').attr('fill', '#fff').attr('font-size', 11).attr('font-weight', 700)
          .attr('font-family', c.font).attr('pointer-events', 'none').text(label(keys[i]));
      });
    };
    draw();
    const resize = new ResizeObserver(() => draw());
    resize.observe(box);
    return { update: draw, destroy() { resize.disconnect(); d3.select(box).select('svg').remove(); } };
  },
});
