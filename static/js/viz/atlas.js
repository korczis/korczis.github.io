// Concept atlas (D3 force): every glossary term as a glowing node, linked to the terms that appear
// beside it on the same pages (extra.related, derived by build-glossary), a physical model the
// visitor drives. A node's size grows with the pages that name it, its colour is its kind
// (language, technology, concept) along the art palette. On a term's own page the atlas centres
// that term and lights its neighbourhood.
// Parameters (handle.controls()): link distance, repulsion and collision padding of the forces, a
// kind filter, on a term page the depth of the neighbourhood shown, and actions to reheat the
// simulation and to reset the view. The initial layout is seeded by each term's hash, so the map
// is the same on every visit. Ctrl + wheel (or a pinch) zooms, dragging the background pans,
// dragging a node moves it; hover a node to read its definition and the work pages that name it,
// click to open its page. The list twin also leads from a term to those work pages.
KorczisHub.viz('atlas', {
  lib: 'd3',
  mount(box, source, { palette, reducedMotion, motion, go, link, escape, hash, t, id }) {
    if (!source || !Array.isArray(source.terms) || !source.terms.length) return { empty: true, items: () => [] };
    const tip = KorczisHub.tooltip(box);
    const kinds = Object.keys(source.kinds);
    const works = source.works || {};
    const nodes = source.terms.map((term) => ({
      ...term,
      url: link('term', term.id) ?? term.url,
      // The work pages that name this term, as site links (the reverse of a work page's terms).
      works: (term.pages || []).filter((p) => works[p]).map((p) => ({ name: works[p], url: link('work', works[p]) })).filter((w) => w.url),
    }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const seen = new Set();
    const edges = [];
    for (const n of nodes) {
      for (const r of n.related || []) {
        const key = [n.id, r].sort().join('|');
        if (!byId.has(r) || seen.has(key) || r === n.id) continue;
        seen.add(key);
        // Node objects, not ids: forceLink keeps them and every subset of the edges shares them.
        edges.push({ source: n, target: byId.get(r) });
      }
    }
    const neighbours = new Map(nodes.map((n) => [n.id, new Set([n.id])]));
    for (const e of edges) {
      neighbours.get(e.source.id).add(e.target.id);
      neighbours.get(e.target.id).add(e.source.id);
    }
    const focus = source.focus && byId.has(source.focus) ? source.focus : null;
    // Hops from the page's own term (breadth first); the deepest reachable ring is "everything".
    const hops = new Map();
    if (focus) {
      hops.set(focus, 0);
      const queue = [focus];
      while (queue.length) {
        const at = queue.shift();
        for (const next of neighbours.get(at)) if (!hops.has(next)) { hops.set(next, hops.get(at) + 1); queue.push(next); }
      }
    }
    const reach = Math.max(1, ...hops.values());
    const DEPTH_ALL = hops.size < nodes.length ? reach + 1 : reach;

    // The model the visitor drives.
    const DEFAULTS = { distance: 0.25, repulsion: 0.9, padding: 10, kind: 'all', depth: DEPTH_ALL };
    const model = { ...DEFAULTS };

    const unit = (text) => (hash(text) % 10000) / 10000;
    let width = Math.max(1, box.clientWidth);
    let height = Math.max(1, box.clientHeight);
    // A seeded start: every term at a place its name decides, the page's own term in the middle.
    for (const n of nodes) {
      const angle = unit(`a:${n.id}`) * Math.PI * 2;
      const r = Math.sqrt(unit(`r:${n.id}`)) * 0.42;
      n.x = width / 2 + Math.cos(angle) * r * width;
      n.y = height / 2 + Math.sin(angle) * r * height;
      if (n.id === focus) {
        n.x = width / 2;
        n.y = height / 2;
        n.fx = n.x;
        n.fy = n.y;
      }
    }

    const svg = d3.select(box).append('svg').attr('aria-hidden', 'true').style('touch-action', 'pan-y');
    const glowId = `${id}-glow`;
    const glow = svg.append('defs').append('filter').attr('id', glowId).attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%');
    glow.append('feGaussianBlur').attr('stdDeviation', 3).attr('result', 'blur');
    const merge = glow.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');
    // Pan and zoom move this group; the forces keep working in box coordinates.
    const view = svg.append('g');
    const linkLayer = view.append('g').attr('fill', 'none');
    const nodeLayer = view.append('g');
    let linkSel = linkLayer.selectAll('path');
    let nodeSel = nodeLayer.selectAll('g');
    let shown = [];
    let shownEdges = [];
    let ink = null;
    let radius = null;
    let hoveredId = null;

    const visible = (n) => n.id === focus || ((model.kind === 'all' || n.kind === model.kind)
      && (!focus || model.depth >= DEPTH_ALL || (hops.get(n.id) ?? Infinity) <= model.depth));
    const span = () => Math.min(width, height);
    const labelled = (d) => (focus ? neighbours.get(focus).has(d.id) : radius(d.n) > span() / 60);
    const colourOf = (d) => ink.ramp(kinds.length === 1 ? 0.5 : kinds.indexOf(d.kind) / (kinds.length - 1));
    const touches = (l, nid) => l.source.id === nid || l.target.id === nid;

    const describe = (d) => {
      const names = d.works.map((w) => w.name);
      const used = names.length ? `<br>${escape(t('js_atlas_used_in', { list: names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4}` : '') }))}` : '';
      return `<b>${escape(d.title)}</b> · ${escape(source.kinds[d.kind] ?? d.kind)}<br>${escape(d.definition)}${used}<br><span class="opacity-75">${escape(t('js_n_pages', { n: d.n }))} · ${escape(t('js_click_to_open'))}</span>`;
    };

    // Light one term's neighbourhood (hover), or the page's own term (focus) when nothing is hovered.
    const light = (nid) => {
      if (!ink) return;
      const near = nid ? neighbours.get(nid) : null;
      const lineColour = ink.alpha(ink.line, 0.16);
      const hub = nid ? colourOf(byId.get(nid)) : null;
      nodeSel.attr('opacity', (d) => (!near || near.has(d.id) ? 1 : 0.18));
      nodeSel.select('text').attr('opacity', (d) => (near ? (near.has(d.id) ? 1 : 0) : labelled(d) ? 1 : 0));
      linkSel.attr('stroke', (l) => (near && touches(l, nid) ? hub : lineColour))
        .attr('stroke-width', (l) => (near && touches(l, nid) ? 1.6 : 1))
        .attr('stroke-opacity', (l) => (!near || touches(l, nid) ? 1 : 0.3));
    };

    // Colours and sizes: on mount, on a theme change, on a resize; never a new layout.
    const paint = () => {
      const c = palette();
      // The night sky is dark in both themes: its inks are the --hub-night-* tokens.
      ink = { ...c.night, ramp: d3.interpolateRgbBasis(c.art), font: c.font, alpha: c.alpha };
      radius = d3.scaleSqrt().domain([0, d3.max(nodes, (n) => n.n) || 1]).range([3, Math.max(6, span() / 22)]);
      nodeSel.select('circle')
        .attr('r', (d) => radius(d.n) + (d.id === focus ? 4 : 0))
        .attr('fill', colourOf)
        .attr('stroke', (d) => (d.id === focus ? ink.ink : 'none'));
      nodeSel.select('text')
        .attr('dy', (d) => -radius(d.n) - 5)
        .attr('font-family', ink.font)
        .attr('fill', ink.alpha(ink.text, 0.92))
        .attr('stroke', ink.alpha(ink.shadow, 0.85));
      light(hoveredId ?? focus);
    };

    const clamp = (d) => {
      const r = radius(d.n) + 4;
      d.x = Math.max(r, Math.min(width - r, d.x));
      d.y = Math.max(r + 16, Math.min(height - r, d.y));
    };
    const ticked = () => {
      shown.forEach(clamp);
      linkSel.attr('d', (l) => {
        // A gentle arc instead of a straight line: the map reads as threads, not wiring.
        const dx = l.target.x - l.source.x;
        const dy = l.target.y - l.source.y;
        const dr = Math.hypot(dx, dy) * 1.6;
        return `M${l.source.x},${l.source.y}A${dr},${dr} 0 0,1 ${l.target.x},${l.target.y}`;
      });
      nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`);
    };

    // Spread to the card's shape: a wide card pulls less sideways than up and down. Hubs (terms on
    // almost every page) would collapse the map, so links pull weakly and nodes push hard.
    const simulation = d3.forceSimulation().stop().on('tick', ticked);
    const forces = () => {
      const s = span();
      simulation
        .force('link', d3.forceLink(shownEdges).distance(s * model.distance).strength(0.08))
        .force('charge', d3.forceManyBody().strength(-s * model.repulsion).distanceMax(s * 1.2))
        .force('collide', d3.forceCollide((d) => radius(d.n) + model.padding))
        .force('x', d3.forceX(width / 2).strength(0.04 * (height / width)))
        .force('y', d3.forceY(height / 2).strength(0.08));
    };
    // The physics answers a change: live, or computed at once under reduced motion.
    const settle = (alpha) => {
      if (reducedMotion()) {
        simulation.alpha(alpha).stop();
        const steps = Math.ceil(Math.log(simulation.alphaMin() / alpha) / Math.log(1 - simulation.alphaDecay()));
        for (let i = 0; i < steps; i += 1) simulation.tick();
        ticked();
      } else simulation.alpha(alpha).restart();
    };

    const drag = d3.drag()
      .on('start', (event, d) => {
        if (!event.active && !reducedMotion()) simulation.alphaTarget(0.2).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
        if (reducedMotion()) {
          d.x = d.fx;
          d.y = d.fy;
          ticked();
        }
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        if (d.id !== focus) {
          d.fx = null;
          d.fy = null;
        }
      });

    // The terms the model shows now (kind and depth), joined by id so a node keeps its place.
    const render = () => {
      shown = nodes.filter(visible);
      const on = new Set(shown.map((n) => n.id));
      shownEdges = edges.filter((e) => on.has(e.source.id) && on.has(e.target.id));
      linkSel = linkLayer.selectAll('path').data(shownEdges, (l) => `${l.source.id}|${l.target.id}`).join('path').attr('stroke-width', 1);
      nodeSel = nodeLayer.selectAll('g').data(shown, (d) => d.id).join((enter) => {
        const gEl = enter.append('g').style('cursor', 'pointer');
        gEl.append('circle').attr('fill-opacity', 0.9).attr('stroke-width', 2).attr('filter', `url(#${glowId})`);
        gEl.append('text')
          .text((d) => d.title)
          .attr('text-anchor', 'middle')
          .attr('font-size', (d) => (d.id === focus ? 14 : 11))
          .attr('font-weight', (d) => (d.id === focus ? 700 : 500))
          .attr('paint-order', 'stroke')
          .attr('stroke-width', 3);
        gEl
          .on('pointerenter', (event, d) => {
            hoveredId = d.id;
            light(d.id);
            tip.show(describe(d), event);
          })
          .on('pointermove', (event, d) => tip.show(describe(d), event))
          .on('pointerleave', () => {
            hoveredId = null;
            light(focus);
            tip.hide();
          })
          .on('click', (event, d) => go(d.url, event))
          .on('auxclick', (event, d) => { if (event.button === 1) go(d.url, event); })
          .call(drag);
        return gEl;
      });
      // Sizes first: the collision force reads the radius scale paint() sets.
      paint();
      simulation.nodes(shown);
      forces();
      ticked();
    };

    // Ctrl + wheel zooms (the owner's standard: a plain wheel still scrolls the page), two fingers
    // pinch, a drag on the background pans; one finger keeps scrolling the page.
    const zoom = d3.zoom()
      .scaleExtent([0.4, 6])
      .filter((event) => {
        if (event.type === 'wheel') return event.ctrlKey || event.metaKey;
        if (event.type.startsWith('touch')) return event.touches.length > 1;
        return !event.button;
      })
      .on('zoom', (event) => view.attr('transform', event.transform));
    svg.call(zoom).on('dblclick.zoom', null);

    const size = () => {
      width = Math.max(1, box.clientWidth);
      height = Math.max(1, box.clientHeight);
      svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
    };

    size();
    render();
    // The entrance, once: the seeded map settles from its start.
    settle(1);

    const kindOptions = [{ value: 'all', label: t('js_atlas_kind_all') }].concat(kinds.map((k) => ({ value: k, label: source.kinds[k] })));
    const physics = (v, key) => {
      model[key] = Number(v);
      forces();
      settle(0.5);
    };
    const refilter = () => {
      hoveredId = null;
      tip.hide();
      render();
      settle(0.6);
    };
    const controls = () => [
      {
        key: 'distance', type: 'range', label: t('js_atlas_distance'), min: 0.05, max: 0.6, step: 0.01, value: DEFAULTS.distance,
        format: (v) => `${Math.round(Number(v) * span())} px`,
        set: (v) => physics(v, 'distance'),
      },
      {
        key: 'repulsion', type: 'range', label: t('js_atlas_repulsion'), min: 0, max: 3, step: 0.1, value: DEFAULTS.repulsion,
        format: (v) => Number(v).toLocaleString(KorczisHub.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        set: (v) => physics(v, 'repulsion'),
      },
      {
        key: 'padding', type: 'range', label: t('js_atlas_padding'), min: 0, max: 30, step: 1, value: DEFAULTS.padding,
        format: (v) => `${v} px`,
        set: (v) => physics(v, 'padding'),
      },
      {
        key: 'kind', type: 'select', label: t('js_atlas_kind'), options: kindOptions, value: DEFAULTS.kind,
        set(v) {
          model.kind = kindOptions.some((o) => o.value === v) ? v : 'all';
          refilter();
        },
      },
      ...(focus && DEPTH_ALL > 1 ? [{
        key: 'depth', type: 'range', label: t('js_atlas_depth'), min: 1, max: DEPTH_ALL, step: 1, value: DEFAULTS.depth,
        format: (v) => (Number(v) >= DEPTH_ALL ? t('js_atlas_depth_all') : t('js_atlas_depth_n', { n: Number(v) })),
        set(v) {
          model.depth = Math.min(DEPTH_ALL, Math.max(1, Math.round(Number(v))));
          refilter();
        },
      }] : []),
      { key: 'reheat', type: 'action', label: t('js_atlas_reheat'), set: () => settle(1) },
      {
        key: 'fit', type: 'action', label: t('js_atlas_fit'),
        set: () => svg.transition().duration(motion().update).call(zoom.transform, d3.zoomIdentity),
      },
    ];

    const focusNode = focus ? byId.get(focus) : null;
    // The list twin: on a term page first the work pages that name it, then the terms the map
    // shows, the most used first.
    const items = () => [
      ...(focusNode ? focusNode.works.map((w) => ({ label: w.name, url: w.url, note: t('js_atlas_uses', { term: focusNode.title }) })) : []),
      ...[...shown].sort((a, b) => b.n - a.n || a.title.localeCompare(b.title))
        .map((d) => ({ label: d.title, url: d.url, note: `${source.kinds[d.kind] ?? d.kind} · ${t('js_n_pages', { n: d.n })}` })),
    ];

    return {
      items,
      controls,
      // A new box size keeps the map: positions scale with the box, the forces re-centre, and
      // nothing replays.
      resize() {
        const [w0, h0] = [width, height];
        size();
        for (const n of nodes) {
          n.x = (n.x / w0) * width;
          n.y = (n.y / h0) * height;
          if (n.fx != null) { n.fx = (n.fx / w0) * width; n.fy = (n.fy / h0) * height; }
        }
        paint();
        forces();
        ticked();
      },
      update: paint,
      destroy() {
        simulation.stop();
        svg.on('.zoom', null);
        tip.remove();
        svg.remove();
      },
    };
  },
});
