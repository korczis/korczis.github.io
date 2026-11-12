// Language bubbles (D3 circle packing): every primary language of the original repositories as a
// bubble sized by its repository count, lit by a radial gradient along the art palette. Hover
// lifts a bubble and shows its count; a click opens the index filtered to that language.
KorczisHub.viz('pack', {
  lib: 'd3',
  mount(box, source, { palette, reducedMotion }) {
    const tip = KorczisHub.tooltip(box);
    const items = source.filter((l) => l.name !== 'Other');
    const draw = () => {
      const c = palette();
      const width = box.clientWidth;
      const height = box.clientHeight;
      const root = d3.pack().size([width, height]).padding(4)(d3.hierarchy({ children: items }).sum((d) => d.repos));
      const colour = d3.scaleSequential(d3.interpolateRgbBasis(c.art)).domain([0, items.length - 1]);
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
        .on('click', (_e, d) => { window.location.href = `${KorczisHub.home}repositories/?language=${encodeURIComponent(d.data.name)}`; })
        .on('mousemove', (event, d) => tip.show(`<b>${d.data.name}</b><br>${KorczisHub.t('js_n_repositories', { n: d.data.repos })}<br><span style="opacity:.7">${KorczisHub.t('js_click_to_open')}</span>`, event))
        .on('mouseleave', () => tip.hide());
      const circle = node.append('circle').attr('fill', (_d, i) => `url(#pack-g-${i})`)
        .attr('stroke', c.surface).attr('stroke-width', 2)
        .on('mouseenter', function () { d3.select(this).transition().duration(150).attr('transform', 'scale(1.06)'); })
        .on('mouseleave', function () { d3.select(this).transition().duration(150).attr('transform', 'scale(1)'); });
      if (reducedMotion()) circle.attr('r', (d) => d.r);
      else circle.attr('r', 0).transition().duration(650).delay((_d, i) => i * 40).ease(d3.easeBackOut.overshoot(1.4)).attr('r', (d) => d.r);
      node.filter((d) => d.r > 22).append('text').attr('text-anchor', 'middle').attr('dy', '-0.1em')
        .attr('fill', '#fff').attr('font-family', c.font).attr('font-weight', 700)
        .attr('font-size', (d) => Math.min(16, d.r / 3.2)).attr('pointer-events', 'none').text((d) => d.data.name);
      node.filter((d) => d.r > 22).append('text').attr('text-anchor', 'middle').attr('dy', '1.2em')
        .attr('fill', '#fff').attr('opacity', 0.85).attr('font-family', c.font)
        .attr('font-size', (d) => Math.min(13, d.r / 4)).attr('pointer-events', 'none').text((d) => d.data.repos);
    };
    draw();
    const resize = new ResizeObserver(() => draw());
    resize.observe(box);
    return { update: draw, destroy() { resize.disconnect(); d3.select(box).select('svg').remove(); } };
  },
});
