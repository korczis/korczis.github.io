// Bubbles (D3 circle packing), lit by a radial gradient along the art palette. Hover lifts a bubble
// and shows its count; a click opens what it stands for. Three sources:
//   [{name, repos}]           languages of the original repositories -> the index filtered to one;
//   {items: [{name, value, url}], unit}            any counted set with its own links (all tags);
//   {focus, urls, pages: [[tag, ...], ...], unit}  the tags that share pages with the focus tag,
//                                                  counted here, each opening its own tag page.
KorczisHub.viz('pack', {
  lib: 'd3',
  mount(box, source, { palette, reducedMotion }) {
    const tip = KorczisHub.tooltip(box);
    const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    let items;
    let unit = 'js_n_repositories';
    if (Array.isArray(source)) {
      items = source.filter((l) => l.name !== 'Other').map((l) => ({ name: l.name, value: l.repos, url: `${KorczisHub.home}repositories/?language=${encodeURIComponent(l.name)}` }));
    } else if (source.items) {
      items = source.items;
      unit = source.unit;
    } else {
      const counts = new Map();
      for (const tags of source.pages) for (const t of new Set(tags)) if (t !== source.focus && source.urls[t]) counts.set(t, (counts.get(t) || 0) + 1);
      items = [...counts].map(([name, value]) => ({ name, value, url: source.urls[name] }));
      unit = source.unit;
    }
    // Largest first, so the palette walks from the biggest bubble outwards.
    items.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    const draw = () => {
      const c = palette();
      const width = box.clientWidth;
      const height = box.clientHeight;
      const root = d3.pack().size([width, height]).padding(4)(d3.hierarchy({ children: items }).sum((d) => d.value));
      const colour = d3.scaleSequential(d3.interpolateRgbBasis(c.art)).domain([0, Math.max(1, items.length - 1)]);
      d3.select(box).select('svg').remove();
      const svg = d3.select(box).append('svg').attr('width', width).attr('height', height).attr('aria-hidden', 'true');
      const defs = svg.append('defs');
      root.leaves().forEach((leaf, i) => {
        const g = defs.append('radialGradient').attr('id', `pack-g-${i}`).attr('cx', '35%').attr('cy', '30%').attr('r', '75%');
        g.append('stop').attr('offset', '0%').attr('stop-color', d3.color(colour(i)).brighter(c.dark ? 0.9 : 1.2));
        g.append('stop').attr('offset', '100%').attr('stop-color', colour(i));
      });
      const node = svg.selectAll('g').data(root.leaves()).join('g')
        .attr('transform', (d) => `translate(${d.x},${d.y})`)
        .style('cursor', 'pointer')
        .on('click', (_e, d) => { window.location.href = d.data.url; })
        .on('mousemove', (event, d) => tip.show(`<b>${escape(d.data.name)}</b><br>${KorczisHub.t(unit, { n: d.data.value })}<br><span style="opacity:.7">${KorczisHub.t('js_click_to_open')}</span>`, event))
        .on('mouseleave', () => tip.hide());
      const circle = node.append('circle').attr('fill', (_d, i) => `url(#pack-g-${i})`)
        .attr('stroke', c.surface).attr('stroke-width', 2)
        .on('mouseenter', function () { d3.select(this).transition().duration(150).attr('transform', 'scale(1.06)'); })
        .on('mouseleave', function () { d3.select(this).transition().duration(150).attr('transform', 'scale(1)'); });
      if (reducedMotion()) circle.attr('r', (d) => d.r);
      else circle.attr('r', 0).transition().duration(650).delay((_d, i) => i * 40).ease(d3.easeBackOut.overshoot(1.4)).attr('r', (d) => d.r);
      // A label fits its bubble: a long name breaks at the space nearest its middle, the font shrinks
      // with the longest line (about 0.6 em a character), and a bubble too small for 9 px keeps its
      // name for the tooltip.
      const lines = (name) => {
        const spaces = [...name.matchAll(/ /g)].map((m) => m.index);
        if (name.length < 12 || !spaces.length) return [name];
        const at = spaces.reduce((best, i) => (Math.abs(i - name.length / 2) < Math.abs(best - name.length / 2) ? i : best));
        return [name.slice(0, at), name.slice(at + 1)];
      };
      const fit = (d) => {
        const ls = lines(d.data.name);
        return Math.min(16, d.r / 3.2, (d.r * 1.7) / (Math.max(...ls.map((l) => l.length)) * 0.6));
      };
      const named = node.filter((d) => d.r > 22 && fit(d) >= 9);
      const label = named.append('text').attr('text-anchor', 'middle')
        .attr('fill', '#fff').attr('font-family', c.font).attr('font-weight', 700)
        .attr('font-size', fit).attr('pointer-events', 'none');
      label.selectAll('tspan').data((d) => lines(d.data.name).map((text, i, all) => ({ text, dy: i === 0 ? `${-0.1 - (all.length - 1) * 1.1}em` : '1.1em' })))
        .join('tspan').attr('x', 0).attr('dy', (t) => t.dy).text((t) => t.text);
      named.append('text').attr('text-anchor', 'middle').attr('dy', '1.2em')
        .attr('fill', '#fff').attr('opacity', 0.85).attr('font-family', c.font)
        .attr('font-size', (d) => Math.min(13, d.r / 4)).attr('pointer-events', 'none').text((d) => d.data.value);
    };
    draw();
    const resize = new ResizeObserver(() => draw());
    resize.observe(box);
    return { update: draw, destroy() { resize.disconnect(); d3.select(box).select('svg').remove(); } };
  },
});
