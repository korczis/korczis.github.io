// Concept atlas (D3 force): every glossary term as a glowing node, linked to the terms that appear
// beside it on the same pages (extra.related, derived by build-glossary). A node's size grows with
// the pages that name it, its colour is its kind (language, technology, concept) along the art
// palette. On a term's own page the atlas centres that term and lights its neighbourhood. Hover a
// node to read its definition and light its links, drag to rearrange, click to open its page.
KorczisHub.viz('atlas', {
  lib: 'd3',
  mount(box, source, { palette, reducedMotion }) {
    const tip = KorczisHub.tooltip(box);
    const kinds = Object.keys(source.kinds);
    const ids = new Set(source.terms.map((t) => t.id));
    const nodes = source.terms.map((t) => ({ ...t }));
    const seen = new Set();
    const links = [];
    for (const t of source.terms) {
      for (const r of t.related) {
        const key = [t.id, r].sort().join('|');
        if (!ids.has(r) || seen.has(key)) continue;
        seen.add(key);
        links.push({ source: t.id, target: r });
      }
    }
    const neighbours = new Map(nodes.map((n) => [n.id, new Set([n.id])]));
    for (const l of links) {
      neighbours.get(l.source).add(l.target);
      neighbours.get(l.target).add(l.source);
    }
    const focus = source.focus && ids.has(source.focus) ? source.focus : null;
    const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    let simulation = null;

    const draw = () => {
      const c = palette();
      const width = box.clientWidth;
      const height = box.clientHeight;
      const ramp = d3.interpolateRgbBasis(c.art);
      const colour = (kind) => ramp(kinds.length === 1 ? 0.5 : kinds.indexOf(kind) / (kinds.length - 1));
      const radius = d3.scaleSqrt().domain([0, d3.max(nodes, (n) => n.n) || 1]).range([3, Math.min(width, height) / 22]);
      simulation?.stop();
      d3.select(box).select('svg').remove();

      const svg = d3.select(box).append('svg').attr('width', width).attr('height', height).attr('aria-hidden', 'true');
      const defs = svg.append('defs');
      const glow = defs.append('filter').attr('id', 'atlas-glow').attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%');
      glow.append('feGaussianBlur').attr('stdDeviation', 3).attr('result', 'blur');
      const merge = glow.append('feMerge');
      merge.append('feMergeNode').attr('in', 'blur');
      merge.append('feMergeNode').attr('in', 'SourceGraphic');

      const link = svg.append('g').attr('fill', 'none').selectAll('path').data(links).join('path')
        .attr('stroke', 'rgba(203, 213, 225, 0.16)').attr('stroke-width', 1);
      const node = svg.append('g').selectAll('g').data(nodes).join('g')
        .style('cursor', 'pointer');
      node.append('circle')
        .attr('r', (d) => radius(d.n) + (d.id === focus ? 4 : 0))
        .attr('fill', (d) => colour(d.kind))
        .attr('fill-opacity', 0.9)
        .attr('stroke', (d) => (d.id === focus ? '#fff' : 'none'))
        .attr('stroke-width', 2)
        .attr('filter', 'url(#atlas-glow)');
      // Labels: the bigger terms, and the focus with its neighbours.
      const labelled = (d) => (focus ? neighbours.get(focus).has(d.id) : radius(d.n) > Math.min(width, height) / 60);
      node.append('text')
        .text((d) => d.title)
        .attr('dy', (d) => -radius(d.n) - 5)
        .attr('text-anchor', 'middle')
        .attr('font-size', (d) => (d.id === focus ? 14 : 11))
        .attr('font-weight', (d) => (d.id === focus ? 700 : 500))
        .attr('fill', 'rgba(241, 245, 249, 0.92)')
        .attr('paint-order', 'stroke')
        .attr('stroke', 'rgba(3, 7, 18, 0.85)')
        .attr('stroke-width', 3)
        .attr('opacity', (d) => (labelled(d) ? 1 : 0));

      // Light one term's neighbourhood (hover), or the page's own term (focus) when nothing is hovered.
      const light = (id) => {
        const near = id ? neighbours.get(id) : null;
        node.attr('opacity', (d) => (!near || near.has(d.id) ? 1 : 0.18));
        node.select('text').attr('opacity', (d) => (near ? (near.has(d.id) ? 1 : 0) : labelled(d) ? 1 : 0));
        link.attr('stroke', (l) => (near && (l.source.id === id || l.target.id === id) ? colour(nodes.find((n) => n.id === id).kind) : 'rgba(203, 213, 225, 0.16)'))
          .attr('stroke-width', (l) => (near && (l.source.id === id || l.target.id === id) ? 1.6 : 1))
          .attr('stroke-opacity', (l) => (!near || l.source.id === id || l.target.id === id ? 1 : 0.3));
      };
      light(focus);

      node
        .on('pointerenter', (event, d) => {
          light(d.id);
          tip.show(`<b>${escape(d.title)}</b> · ${escape(source.kinds[d.kind])}<br>${escape(d.definition)}<br><span style="opacity:.7">${escape(KorczisHub.t('js_n_pages', { n: d.n }))} · ${escape(KorczisHub.t('js_click_to_open'))}</span>`, event);
        })
        .on('pointermove', (event, d) => tip.show(`<b>${escape(d.title)}</b> · ${escape(source.kinds[d.kind])}<br>${escape(d.definition)}<br><span style="opacity:.7">${escape(KorczisHub.t('js_n_pages', { n: d.n }))} · ${escape(KorczisHub.t('js_click_to_open'))}</span>`, event))
        .on('pointerleave', () => {
          light(focus);
          tip.hide();
        })
        .on('click', (_event, d) => {
          window.location.href = d.url;
        });

      // Spread to the card's shape: a wide card pulls less sideways than up and down. Hubs (terms on
      // almost every page) would collapse the map, so links pull weakly and nodes push hard.
      const span = Math.min(width, height);
      simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id((d) => d.id).distance(span / 4).strength(0.08))
        .force('charge', d3.forceManyBody().strength(-span * 0.9).distanceMax(span * 1.2))
        .force('collide', d3.forceCollide((d) => radius(d.n) + 10))
        .force('x', d3.forceX(width / 2).strength(0.04 * (height / width)))
        .force('y', d3.forceY(height / 2).strength(0.08));
      if (focus) {
        const f = nodes.find((n) => n.id === focus);
        f.fx = width / 2;
        f.fy = height / 2;
      }
      const clamp = (d) => {
        const r = radius(d.n) + 4;
        d.x = Math.max(r, Math.min(width - r, d.x));
        d.y = Math.max(r + 16, Math.min(height - r, d.y));
      };
      const ticked = () => {
        nodes.forEach(clamp);
        link.attr('d', (l) => {
          // A gentle arc instead of a straight line: the map reads as threads, not wiring.
          const dx = l.target.x - l.source.x;
          const dy = l.target.y - l.source.y;
          const dr = Math.hypot(dx, dy) * 1.6;
          return `M${l.source.x},${l.source.y}A${dr},${dr} 0 0,1 ${l.target.x},${l.target.y}`;
        });
        node.attr('transform', (d) => `translate(${d.x},${d.y})`);
      };
      simulation.on('tick', ticked);
      if (reducedMotion()) {
        simulation.stop();
        for (let i = 0; i < 300; i += 1) simulation.tick();
        ticked();
      }

      node.call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active && !reducedMotion()) simulation.alphaTarget(0.2).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
          if (reducedMotion()) ticked();
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          if (d.id !== focus) {
            d.fx = null;
            d.fy = null;
          }
        }));
    };

    draw();
    // The list twin: every term, the most used first.
    const items = () => [...nodes].sort((a, b) => b.n - a.n || a.title.localeCompare(b.title))
      .map((d) => ({ label: d.title, url: d.url, note: `${source.kinds[d.kind]} · ${KorczisHub.t('js_n_pages', { n: d.n })}` }));
    return { update: draw, items, destroy: () => simulation?.stop() };
  },
});
