// Bubbles (D3 circle packing), lit by a radial gradient along the art palette, as a simulator the
// visitor drives through the layer's controls (state in the address). Two shapes of source:
//   a hierarchy, index.repos { focus, categories: {key: name}, recent: [name], repos: [{ name,
//     category, language, stars, url }] }: category -> language -> repository, zoomable. Controls:
//     the metric that sizes the bubbles (repositories, stars, recently active), how many levels
//     below the focus are drawn, the focus itself (a click on a bubble with children zooms into
//     it, a smooth transition; the Flowbite breadcrumb, a click on the background or the "step
//     out" action zooms out). A category page starts on its own category (source.focus).
//   a flat counted set: [{ name, repos }] (languages of the index), { items: [{ name, value, url }],
//     unit } (every tag) or { focus, urls, pages: [[tag, ...]], unit } (the tags sharing pages with
//     a tag, counted here). Control: how many of the largest bubbles are drawn.
// Hover, or a first tap, reads a bubble; a click, or a second tap, opens it: a repository's work
// page (else the repository), a category's page, a language's glossary term (else the index
// filtered to it), a tag's page.
KorczisHub.viz('pack', {
  lib: 'd3',
  mount(box, source, { palette, motion, go, link, escape, hash, t, id, param, reflect: ctxReflect, colour: tone }) {
    const langUrl = (name) => link('language', name);
    const UNITS = { repos: 'js_d3_n_repositories', stars: 'js_d3_n_stars', recent: 'js_d3_n_recent' };
    const tree = build(source);
    if (!tree) return { empty: true, items: () => [], update() {}, destroy() {} };

    function build(src) {
      if (src && Array.isArray(src.repos)) {
        const names = src.categories ?? {};
        const recent = new Set(src.recent ?? []);
        const cats = new Map();
        for (const r of src.repos) {
          if (!r?.name) continue;
          const key = r.category || '';
          if (!cats.has(key)) cats.set(key, { id: `c:${key}`, kind: 'category', key, name: names[key] ?? key, langs: new Map() });
          const cat = cats.get(key);
          const lang = r.language || '';
          if (!cat.langs.has(lang)) {
            cat.langs.set(lang, { id: `${cat.id}/l:${lang}`, kind: 'language', key: lang, name: lang || t('js_d3_pack_no_language'), children: [] });
          }
          cat.langs.get(lang).children.push({
            id: `${cat.id}/l:${lang}/r:${r.name}`, kind: 'repo', key: r.name, name: r.name, url: r.url,
            values: { repos: 1, stars: Number(r.stars) || 0, recent: recent.has(r.name) ? 1 : 0 },
          });
        }
        const children = [...cats.values()].map(({ langs, ...cat }) => ({ ...cat, children: [...langs.values()] }));
        const metrics = ['repos', 'stars', 'recent'].filter((mt) => children.some((c) => c.children.some((l) => l.children.some((r) => r.values[mt] > 0))));
        if (!metrics.length) return null;
        return {
          data: { id: 'root', kind: 'root', name: t('js_d3_pack_all'), children },
          metrics, unit: (mt) => UNITS[mt], levels: 3, focus: src.focus && cats.has(src.focus) ? `c:${src.focus}` : '',
        };
      }
      let items = null;
      let unit = 'js_d3_n_repositories';
      if (Array.isArray(src)) {
        items = src.filter((l) => l?.name && l.name !== 'Other').map((l) => ({ name: l.name, value: Number(l.repos) || 0, url: langUrl(l.name) }));
      } else if (Array.isArray(src?.items)) {
        items = src.items.filter((i) => i?.name).map((i) => ({ name: i.name, value: Number(i.value) || 0, url: i.url }));
        unit = src.unit || unit;
      } else if (Array.isArray(src?.pages)) {
        const counts = new Map();
        for (const tags of src.pages) {
          for (const tag of new Set(tags)) if (tag !== src.focus && src.urls?.[tag]) counts.set(tag, (counts.get(tag) || 0) + 1);
        }
        items = [...counts].map(([name, value]) => ({ name, value, url: src.urls[name] }));
        unit = src.unit || unit;
      }
      items = (items ?? []).filter((i) => i.value > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
      if (!items.length) return null;
      return {
        data: {
          id: 'root', kind: 'root', name: '',
          children: items.map((it, rank) => ({ id: `i:${it.name}`, kind: 'item', key: it.name, name: it.name, url: it.url, rank, values: { value: it.value } })),
        },
        metrics: ['value'], unit: () => unit, levels: 1, focus: '', count: items.length,
      };
    }

    const urlOf = (d) => {
      if (d.kind === 'repo') return link('work', d.key) ?? d.url ?? null;
      if (d.kind === 'category') return link('category', d.key);
      if (d.kind === 'language') return d.key ? langUrl(d.key) : null;
      return d.url ?? null;
    };

    // Every node of the full tree, parents before children (so children paint above them), each
    // with one circle for the life of the visual; a node a setting leaves out shrinks to nothing.
    const full = d3.hierarchy(tree.data);
    const nodes = full.descendants();
    const byId = new Map(nodes.map((n) => [n.data.id, n]));
    const focusOptions = nodes.filter((n) => n.depth > 0 && n.children && n.depth < tree.levels);
    const pathName = (n) => n.ancestors().reverse().slice(1).map((a) => a.data.name).join(' › ');

    const defaults = { metric: tree.metrics[0], depth: Math.min(2, tree.levels), focus: tree.focus, top: tree.count ?? 0 };
    const state = {
      metric: param.oneOf('metric', tree.metrics, defaults.metric),
      depth: param.int('depth', 1, tree.levels, defaults.depth),
      focus: param.pick('focus', (v) => v === '' || byId.has(v), defaults.focus),
      top: tree.count ? param.int('top', 1, tree.count, defaults.top) : 0,
    };

    // The model: the tree sized by the metric (bubbles that count nothing leave the layout), packed
    // in a fixed square; the view is a square around the focus, scaled to the box when drawn.
    const SIZE = 1000;
    const leafValue = (d) => (d.kind === 'item' && d.rank >= state.top ? 0 : d.values?.[state.metric] ?? 0);
    const memo = new Map();
    const sumOf = (d) => {
      if (!d.children) return leafValue(d);
      if (!memo.has(d.id)) memo.set(d.id, d3.sum(d.children, sumOf));
      return memo.get(d.id);
    };
    function layout() {
      memo.clear();
      const root = d3.hierarchy(tree.data, (d) => d.children?.filter((c) => sumOf(c) > 0))
        .sum((d) => (d.children ? 0 : leafValue(d)))
        .sort((a, b) => b.value - a.value || a.data.name.localeCompare(b.data.name));
      d3.pack().size([SIZE, SIZE]).padding((n) => (n.depth === 0 ? 8 : 4))(root);
      return new Map(root.descendants().map((n) => [n.data.id, n]));
    }
    // The focus asked for may count nothing under this metric: the nearest ancestor that does is shown.
    const focusIn = (placed) => {
      for (let n = byId.get(state.focus) ?? full; n; n = n.parent) if (placed.has(n.data.id) && n.children) return placed.get(n.data.id);
      return placed.get('root');
    };

    // Text on a bubble sits on its radial gradient, from the lifted highlight to the base colour. The
    // ink (page or strong) is judged by its worst contrast across both stops, and where neither
    // reaches 4.5:1 the highlight is lifted less until one does (WCAG 1.4.3); the gradient and the
    // label read the same answer.
    const shade = (base, c) => {
      let best = null;
      for (const k of c.dark ? [0.9, 0.6, 0.3, 0] : [1.2, 0.8, 0.5, 0.25, 0]) {
        const hi = d3.color(base).brighter(k).formatRgb();
        const [ink, ratio] = [c.page, c.strong]
          .map((i) => [i, Math.min(tone.contrast(i, base), tone.contrast(i, hi))])
          .sort((a, b) => b[1] - a[1])[0];
        if (!best || ratio > best.ratio) best = { ink, ratio, hi };
        if (ratio >= 4.5) return { ink, ratio, hi };
      }
      return best;
    };
    const ink = (fill, c) => shade(fill, c).ink;

    const tip = KorczisHub.tooltip(box);
    const svg = d3.select(box).append('svg').attr('aria-hidden', 'true');
    const defs = svg.append('defs');
    const circles = svg.append('g').selectAll('circle').data(nodes.slice(1), (n) => n.data.id).join('circle').attr('r', 0).attr('opacity', 0);
    const labels = svg.append('g').attr('pointer-events', 'none');

    // Colour follows the top-level bubble (a category, or each item), so a zoom keeps its hue.
    const branch = (n) => n.ancestors().at(-2) ?? n;
    const tops = full.children ?? [];
    const gid = (n) => `${id}-pack-${hash(branch(n).data.id).toString(36)}`;

    const cur = new Map();
    let view = [SIZE / 2, SIZE / 2, SIZE];
    let target = null;
    let placed = null;
    let focus = null;
    let entered = false;
    let pointer = 'mouse';
    let armed = null;
    let colours = null;

    function targets() {
      placed = layout();
      focus = focusIn(placed);
      const out = new Map();
      for (const n of nodes.slice(1)) {
        const p = placed.get(n.data.id);
        const rel = p ? p.depth - focus.depth : -1;
        const inside = p && (p === focus || p.ancestors().includes(focus));
        const shown = Boolean(inside && rel >= 1 && rel <= state.depth && p.value > 0);
        const was = cur.get(n.data.id);
        out.set(n.data.id, p
          ? { x: p.x, y: p.y, r: p.r, o: shown ? 1 : 0, shown, filled: shown && (rel === state.depth || !p.children) }
          : { x: was?.x ?? SIZE / 2, y: was?.y ?? SIZE / 2, r: 0, o: 0, shown: false, filled: false });
      }
      target = { nodes: out, view: [focus.x, focus.y, focus.r * 2 + 8] };
    }

    function paint() {
      const c = palette();
      colours = d3.scaleSequential(d3.interpolateRgbBasis(c.art)).domain([0, Math.max(1, tops.length - 1)]);
      const colourOf = (n) => colours(Math.max(0, tops.indexOf(branch(n))));
      defs.selectAll('radialGradient').data(tops, (n) => n.data.id).join((enter) => {
        const g = enter.append('radialGradient').attr('cx', '35%').attr('cy', '30%').attr('r', '75%');
        g.append('stop').attr('offset', '0%');
        g.append('stop').attr('offset', '100%');
        return g;
      })
        .attr('id', gid)
        .each(function (n) {
          const stops = d3.select(this).selectAll('stop');
          stops.filter((_d, i) => i === 0).attr('stop-color', shade(colourOf(n), c).hi);
          stops.filter((_d, i) => i === 1).attr('stop-color', colourOf(n));
        });
      circles
        .attr('fill', (n) => (target.nodes.get(n.data.id).filled ? `url(#${gid(n)})` : c.alpha(colourOf(n), c.dark ? 0.16 : 0.1)))
        .attr('stroke', (n) => (target.nodes.get(n.data.id).filled ? c.surface : c.alpha(colourOf(n), 0.55)))
        .attr('stroke-width', (n) => (target.nodes.get(n.data.id).filled ? 2 : 1.25))
        .attr('pointer-events', (n) => (target.nodes.get(n.data.id).shown ? null : 'none'))
        .style('cursor', 'pointer');
      return { c, colourOf };
    }

    const scale = (v) => Math.min(box.clientWidth, box.clientHeight) / v[2];
    function place(v) {
      const k = scale(v);
      const w = box.clientWidth / 2;
      const h = box.clientHeight / 2;
      circles.each(function (n) {
        const s = cur.get(n.data.id);
        if (!s) return;
        this.setAttribute('cx', w + (s.x - v[0]) * k);
        this.setAttribute('cy', h + (s.y - v[1]) * k);
        this.setAttribute('r', Math.max(0, s.r * k));
        this.setAttribute('opacity', s.o);
      });
    }

    // A label fits its bubble: a long name breaks at the space nearest its middle, the font shrinks
    // with the longest line (about 0.6 em a character), and a bubble too small for 9 px keeps its
    // name for the tooltip. A ring (a bubble drawn with its children) is named along its top.
    const lines = (name) => {
      const spaces = [...name.matchAll(/ /g)].map((mt) => mt.index);
      if (name.length < 12 || !spaces.length) return [name];
      const at = spaces.reduce((best, i) => (Math.abs(i - name.length / 2) < Math.abs(best - name.length / 2) ? i : best));
      return [name.slice(0, at), name.slice(at + 1)];
    };
    function writeLabels(painted) {
      const { c, colourOf } = painted;
      const k = scale(view);
      const w = box.clientWidth / 2;
      const h = box.clientHeight / 2;
      const shown = nodes.slice(1).filter((n) => target.nodes.get(n.data.id).shown).map((n) => {
        const s = target.nodes.get(n.data.id);
        const r = s.r * k;
        const ls = lines(n.data.name);
        const size = Math.min(16, r / 3.2, (r * 1.7) / (Math.max(...ls.map((l) => l.length)) * 0.6));
        return { n, s, r, ls, size, x: w + (s.x - view[0]) * k, y: h + (s.y - view[1]) * k, value: placed.get(n.data.id)?.value ?? 0 };
      });
      const filled = shown.filter((l) => l.s.filled && l.r > 22 && l.size >= 9);
      const rings = shown.filter((l) => !l.s.filled && l.r > 44);
      labels.selectAll('g').data([...rings, ...filled], (l) => l.n.data.id).join((enter) => enter.append('g'))
        .attr('transform', (l) => `translate(${l.x},${l.y})`)
        .each(function (l) {
          const g = d3.select(this);
          g.selectAll('*').remove();
          if (!l.s.filled) {
            g.append('text').attr('text-anchor', 'middle').attr('y', -l.r + 15).attr('font-size', 11).attr('font-weight', 700)
              .attr('font-family', c.font).attr('fill', c.strong).attr('stroke', c.page).attr('stroke-width', 3)
              .attr('paint-order', 'stroke').text(l.n.data.name.length > 24 ? `${l.n.data.name.slice(0, 23)}…` : l.n.data.name);
            return;
          }
          const fill = ink(colourOf(l.n), c);
          // A label can reach past its bubble onto a neighbour; a halo in the other ink keeps it
          // readable on whatever it crosses.
          const halo = fill === c.page ? c.strong : c.page;
          const text = g.append('text').attr('text-anchor', 'middle').attr('fill', fill).attr('font-family', c.font)
            .attr('stroke', halo).attr('stroke-width', 3).attr('paint-order', 'stroke').attr('stroke-linejoin', 'round')
            .attr('font-weight', 700).attr('font-size', l.size);
          text.selectAll('tspan').data(l.ls.map((line, i, all) => ({ line, dy: i === 0 ? `${-0.1 - (all.length - 1) * 1.1}em` : '1.1em' })))
            .join('tspan').attr('x', 0).attr('dy', (d) => d.dy).text((d) => d.line);
          g.append('text').attr('text-anchor', 'middle').attr('dy', '1.2em').attr('fill', fill)
            .attr('stroke', halo).attr('stroke-width', 3).attr('paint-order', 'stroke').attr('stroke-linejoin', 'round')
            .attr('font-family', c.font).attr('font-size', Math.min(13, l.r / 4)).text(l.value.toLocaleString(KorczisHub.locale));
        });
    }

    // One transition moves every bubble from where it is to its target and the view to the focus
    // (d3.interpolateZoom, the smooth zoom of van Wijk and Nuij); the entrance grows the bubbles
    // once, staggered. Labels fade back in where the bubbles settle.
    function draw(kind) {
      if (!box.clientWidth || !box.clientHeight) return;
      svg.attr('width', box.clientWidth).attr('height', box.clientHeight);
      const m = motion();
      targets();
      const painted = paint();
      crumbs();
      const first = !entered;
      entered = true;
      const duration = first ? m.enter : kind === 'zoom' ? m.enter : m.update;
      svg.interrupt('pack');
      const from = new Map(nodes.slice(1).map((n) => {
        const s = cur.get(n.data.id);
        const to = target.nodes.get(n.data.id);
        return [n.data.id, first || !s ? { x: to.x, y: to.y, r: 0, o: to.o } : { ...s }];
      }));
      const v0 = first ? target.view : view;
      const zoom = d3.interpolateZoom(v0, target.view);
      const step = (tt) => {
        for (let i = 1; i < nodes.length; i += 1) {
          const n = nodes[i];
          const a = from.get(n.data.id);
          const b = target.nodes.get(n.data.id);
          let e = tt;
          // The staggered entrance exists only when there is time for it: with no duration (reduced
          // motion) its formula is 0/1 and every bubble stayed at r = 0, labels floating on nothing.
          if (first && duration) {
            const delay = Math.min(i * m.stagger, m.maxDelay);
            e = d3.easeBackOut.overshoot(1.4)(Math.min(1, Math.max(0, (tt * duration - delay) / Math.max(1, duration - m.maxDelay))));
          }
          cur.set(n.data.id, {
            x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, r: Math.max(0, a.r + (b.r - a.r) * e), o: a.o + (b.o - a.o) * Math.min(1, e),
          });
        }
        view = zoom(first ? 1 : tt);
        place(view);
      };
      labels.attr('opacity', 0);
      const settle = () => {
        writeLabels(painted);
        if (m.hover) labels.transition('labels').duration(m.hover).attr('opacity', 1);
        else labels.attr('opacity', 1);
      };
      if (!duration) {
        step(1);
        settle();
        return;
      }
      svg.transition('pack').duration(duration).ease(first ? d3.easeLinear : d3.easeCubicOut)
        .tween('pack', () => step).on('end', settle);
    }

    // Without moving anything: the box changed size, or the theme its colours.
    function redraw() {
      if (!box.clientWidth || !box.clientHeight) return;
      // The drawing surface is the box: without a size an <svg> is 300x150 and only overflow showed
      // the rest (it neither filled a maximized box nor took the pointer outside that area).
      svg.attr('width', box.clientWidth).attr('height', box.clientHeight);
      if (!entered) {
        draw('enter');
        return;
      }
      const painted = paint();
      place(view);
      writeLabels(painted);
      crumbs();
    }

    // The breadcrumb (Flowbite) of the zoom: every level above the focus steps out to it; the focus
    // itself links to its own page. It sits over the box's top-left corner, outside the box,
    // which is role="img" and may hold no controls; it shows only while zoomed in.
    const frame = box.closest('[data-viz-frame]');
    let nav = null;
    if (tree.levels > 1) {
      nav = document.createElement('nav');
      nav.className = 'absolute z-10 max-w-[calc(100%-11rem)] rounded-lg bg-white/90 px-3 py-1.5 shadow-sm ring-1 ring-gray-200 '
        + 'dark:bg-gray-800/90 dark:ring-gray-700';
      nav.setAttribute('aria-label', t('js_d3_pack_path'));
      nav.hidden = true;
      (frame ?? box.parentElement).insertBefore(nav, frame ? box.nextSibling : box);
      nav.addEventListener('click', (event) => {
        const step = event.target.closest('[data-pack-focus]');
        if (step) zoomTo(step.dataset.packFocus);
      });
    }
    const CHEVRON = '<svg class="h-5 w-5 text-gray-400" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" '
      + 'viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m9 5 7 7-7 7"/></svg>';
    const CURRENT_LINK = 'text-sm font-medium text-primary-700 hover:underline dark:text-primary-300';
    const CURRENT = 'text-sm font-medium text-gray-500 dark:text-gray-400';
    const CRUMB = 'text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white';
    function crumbs() {
      if (!nav) return;
      const path = focus ? focus.ancestors().reverse() : [];
      nav.hidden = path.length < 2;
      if (nav.hidden) return;
      nav.style.top = `${box.offsetTop + 8}px`;
      nav.style.left = `${box.offsetLeft + 8}px`;
      nav.innerHTML = `<ol class="inline-flex flex-wrap items-center gap-x-1 md:gap-x-2">${path.map((n, i) => {
        const last = i === path.length - 1;
        const url = last ? urlOf(n.data) : null;
        const name = escape(n.data.id === 'root' ? t('js_d3_pack_all') : n.data.name);
        const inner = last
          ? (url ? `<a href="${escape(url)}" aria-current="location" class="${CURRENT_LINK}">${name}</a>`
            : `<span aria-current="location" class="${CURRENT}">${name}</span>`)
          : `<button type="button" data-pack-focus="${escape(n.data.id === 'root' ? '' : n.data.id)}" class="${CRUMB}">${name}</button>`;
        return i === 0 ? `<li class="inline-flex items-center">${inner}</li>`
          : `<li><div class="flex items-center">${CHEVRON}<span class="ml-1 md:ml-2">${inner}</span></div></li>`;
      }).join('')}</ol>`;
    }

    // A choice made on the drawing (a zoom made on the drawing) goes back to the layer, so its control and the
    // address follow (ctx.reflect; absent before the layer has it, then only the drawing changes).
    const reflect = (key, value) => ctxReflect?.(key, value);

    function zoomTo(focusId) {
      state.focus = focusId === 'root' ? '' : focusId;
      reflect('focus', state.focus);
      armed = null;
      tip.hide();
      draw('zoom');
    }
    const stepOut = () => { if (focus?.parent) zoomTo(focus.parent.data.id); };

    function tipFor(n, event) {
      const p = placed.get(n.data.id);
      const parent = n.depth > 1 ? ` · ${escape(n.parent.data.name)}` : '';
      const zooms = Boolean(p?.children) && tree.levels > 1;
      const hint = zooms ? t('js_d3_pack_zoom') : urlOf(n.data) ? t(pointer === 'mouse' ? 'js_click_to_open' : 'js_d3_tap_again') : '';
      const count = escape(t(tree.unit(state.metric), { n: p?.value ?? 0 }));
      tip.show(`<b>${escape(n.data.name)}</b>${parent}<br>${count}${hint ? `<br><span class="opacity-75">${escape(hint)}</span>` : ''}`, event);
    }

    // A bubble with children zooms in (at once, on a tap too); any other opens on click, or on a
    // second tap after the first showed what a hover would. The middle button opens a new tab.
    function activate(event, n) {
      event.stopPropagation();
      const p = placed.get(n.data.id);
      if (p?.children && tree.levels > 1) {
        zoomTo(n.data.id);
        return;
      }
      if (pointer !== 'mouse' && armed !== n.data.id) {
        armed = n.data.id;
        tipFor(n, event);
        return;
      }
      armed = null;
      go(urlOf(n.data), event);
    }

    circles
      .on('pointerenter', (event) => { if (event.pointerType === 'mouse') d3.select(event.currentTarget).attr('stroke-width', 3.5); })
      .on('pointermove', (event, n) => { if (event.pointerType === 'mouse') tipFor(n, event); })
      .on('pointerleave', (event, n) => {
        if (event.pointerType !== 'mouse') return;
        d3.select(event.currentTarget).attr('stroke-width', target.nodes.get(n.data.id).filled ? 2 : 1.25);
        tip.hide();
      })
      .on('click', activate)
      .on('auxclick', (event, n) => { if (event.button === 1) go(urlOf(n.data), event); });
    svg.on('pointerdown', (event) => { pointer = event.pointerType || 'mouse'; })
      .on('click', () => {
        armed = null;
        tip.hide();
        stepOut();
      });

    const change = (key) => (v) => {
      if (state[key] === v) return;
      state[key] = v;
      draw(key === 'focus' ? 'zoom' : 'update');
    };

    draw('enter');

    // The list twin: what the bubbles show now, each level under the focus as a path.
    const items = () => {
      if (!target) return [];
      return nodes.slice(1).filter((n) => target.nodes.get(n.data.id).shown).map((n) => {
        const p = placed.get(n.data.id);
        const rel = n.ancestors().reverse().slice(focus.depth + 1).map((a) => a.data.name).join(' › ');
        return { label: rel || n.data.name, url: urlOf(n.data) ?? n.data.url ?? null, note: t(tree.unit(state.metric), { n: p.value }) };
      }).filter((item) => item.url);
    };

    const controls = () => {
      if (tree.levels === 1) {
        return tree.count > 1 ? [{
          key: 'top', type: 'range', label: t('js_d3_pack_top'), min: 1, max: tree.count, step: 1, value: defaults.top,
          format: (v) => String(v), set: change('top'),
        }] : [];
      }
      return [
        ...(tree.metrics.length > 1 ? [{
          key: 'metric', type: 'select', label: t('js_d3_pack_metric'), value: defaults.metric, set: change('metric'),
          options: tree.metrics.map((mt) => ({ value: mt, label: t(`js_d3_pack_metric_${mt}`) })),
        }] : []),
        {
          key: 'depth', type: 'range', label: t('js_d3_pack_depth'), min: 1, max: tree.levels, step: 1, value: defaults.depth,
          format: (v) => t('js_d3_n_levels', { n: v }), set: change('depth'),
        },
        {
          key: 'focus', type: 'select', label: t('js_d3_pack_focus'), value: defaults.focus, set: change('focus'),
          options: [{ value: '', label: t('js_d3_pack_all') }, ...focusOptions.map((n) => ({ value: n.data.id, label: pathName(n) }))],
        },
        { key: 'out', type: 'action', label: t('js_d3_pack_out'), icon: 'reset', set: stepOut },
      ];
    };

    return {
      update: redraw,
      resize: redraw,
      items,
      controls,
      destroy() {
        svg.interrupt('pack');
        svg.remove();
        nav?.remove();
        if (tip.remove) tip.remove();
        else box.querySelector(':scope > .viz-tip')?.remove();
      },
    };
  },
});
