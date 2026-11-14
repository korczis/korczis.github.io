// Constellation (canvas, d3 for colour): every original repository as a star in a spiral galaxy, a
// simulator of the body of work through time. Each category is an arm (colour along the art
// palette), the oldest work sits in the core and the newest at the rim, a star's size grows with
// its stars on GitHub, and work of the last 48 months twinkles. The galaxy turns in 3D with its own
// projection (no WebGL: two hundred points need none).
// Parameters (handle.controls()): the year the sky shows (play grows the galaxy year by year, each
// star appearing in the year it was created), rotation speed, tilt, and a filter by category or
// language. Drag (or the arrow keys when the box is focused) turns and tilts it; hover or tap a
// star to read it and light its category as a constellation; a click opens its work page, else
// its repository; an arm's name opens its category page.
// A category page passes its key as source.focus: that arm is the default filter.
KorczisHub.viz('constellation', {
  lib: 'd3',
  mount(box, source, { palette, reducedMotion, motion, go, link, escape, hash, t, id }) {
    if (!source || !Array.isArray(source.repos) || !source.repos.length) return { empty: true };
    const tip = KorczisHub.tooltip(box);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    // pan-y: a vertical swipe still scrolls the page on touch; a horizontal one turns the galaxy.
    canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab';
    box.appendChild(canvas);
    const g = canvas.getContext('2d');
    const keys = Object.keys(source.categories);
    const recent = new Set(source.recent || []);
    const focusArm = source.focus && keys.includes(source.focus) ? keys.indexOf(source.focus) : null;
    // Deterministic jitter per repository (FNV-1a from the layer): the same sky on every visit.
    const rand = (name, salt) => (hash(`${salt}:${name}`) % 10000) / 10000;
    // Radius by rank of creation (oldest first), so the decades spread evenly from core to rim.
    const order = [...source.repos].sort((a, b) => a.year - b.year || a.name.localeCompare(b.name)).map((r) => r.name);
    const rank = new Map(order.map((name, i) => [name, order.length === 1 ? 1 : i / (order.length - 1)]));
    const armAngle = (arm, radius) => (arm / keys.length) * Math.PI * 2 + radius * 3.2;
    const stars = source.repos.map((r) => {
      const arm = Math.max(0, keys.indexOf(r.category));
      const at = rank.get(r.name);
      const radius = 0.12 + 0.88 * at + (rand(r.name, 1) - 0.5) * 0.06;
      const angle = armAngle(arm, radius) + (rand(r.name, 2) - 0.5) * 0.22;
      return {
        ...r,
        arm,
        rank: at,
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        y: (rand(r.name, 3) - 0.5) * 0.22 * (1.2 - radius),
        size: 2 + Math.log2(1 + r.stars) * 0.9 + (recent.has(r.name) ? 1.6 : 0),
        phase: rand(r.name, 4) * Math.PI * 2,
        // A site page first (rule project.everything-interlinked), the repository otherwise.
        url: link('work', r.name) ?? r.url,
      };
    });
    const years = stars.map((s) => s.year).filter(Number.isFinite);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const perArm = keys.map((key) => stars.filter((s) => s.category === key).length);
    const languages = [...d3.rollup(stars, (v) => v.length, (s) => s.language || '')]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    // Background dust: fixed, faint, for depth.
    const dust = Array.from({ length: 260 }, (_v, i) => ({ x: rand(`d${i}`, 5) * 2 - 1, y: rand(`d${i}`, 6) * 2 - 1 }));

    // The model the visitor drives.
    const DEFAULT_TILT = 32;
    const DEFAULT_SPEED = reducedMotion() ? 0 : 1;
    const DEFAULT_FILTER = focusArm !== null ? `category:${keys[focusArm]}` : 'all';
    const MAX_TILT = Math.PI * 0.47;
    let year = maxYear;
    let speed = DEFAULT_SPEED;
    let tilt = (DEFAULT_TILT * Math.PI) / 180;
    let filter = DEFAULT_FILTER;
    let playing = false;
    let rotation = 0.6;

    let width = 0;
    let height = 0;
    let dragging = null;
    let hovered = null;
    let hoveredArm = null;
    let visible = true;
    let frame = 0;
    let colours = [];
    let ink = null;
    let projected = [];
    let labels = [];
    let last = 0;
    let lastStep = 0;
    let destroyed = false;

    // A star fades in when it appears: at mount from the core outwards (the one entrance), and
    // when a later year brings it. Never on resize or a theme change.
    const born = new Map();
    const start = performance.now();
    for (const s of stars) born.set(s.name, start + s.rank * motion().maxDelay);
    let fadeUntil = start + motion().maxDelay + motion().enter;

    const matches = (s) => {
      if (filter === 'all') return true;
      const cut = filter.indexOf(':');
      const value = filter.slice(cut + 1);
      return filter.slice(0, cut) === 'category' ? s.category === value : (s.language || '') === value;
    };
    const filterArm = () => (filter.startsWith('category:') ? keys.indexOf(filter.slice(9)) : -1);

    // Night-sky ink: palette().night (the --hub-night-* tokens) once the layer exposes it; until
    // then the theme tokens that stay light on the night sky in both themes.
    const nightOf = (c) => c.night ?? {
      ink: c.dark ? c.strong : c.surface,
      text: c.dark ? c.text : c.grid,
      dust: c.dark ? c.text : c.ramp[0],
    };

    const paint = () => {
      const c = palette();
      const ramp = d3.interpolateRgbBasis(c.art);
      colours = keys.map((_k, i) => d3.color(ramp(keys.length === 1 ? 0.5 : i / (keys.length - 1))));
      ink = { ...nightOf(c), glow: c.glow, font: c.font, alpha: c.alpha };
    };

    // The drawing surface follows the box (the layer calls resize(), also when it is maximized),
    // in device pixels so the stars stay sharp.
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = box.clientWidth;
      height = box.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // Turn about the vertical axis, tilt towards the viewer, then a gentle perspective.
    const project = (s, time) => {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const x = s.x * cos - s.z * sin;
      const z0 = s.x * sin + s.z * cos;
      const y = s.y * Math.cos(tilt) - z0 * Math.sin(tilt);
      const z = s.y * Math.sin(tilt) + z0 * Math.cos(tilt);
      const scale = Math.min(width * 0.44, height * 0.8);
      const perspective = 2.6 / (2.6 + z);
      const twinkle = recent.has(s.name) && !reducedMotion() ? 0.75 + 0.25 * Math.sin(time / 420 + s.phase) : 1;
      return { s, px: width / 2 + x * scale * perspective, py: height / 2 + y * scale * perspective, depth: z, r: s.size * perspective, glow: twinkle * (0.55 + 0.45 * perspective) };
    };

    const opacityOf = (s, time) => {
      const { enter } = motion();
      const since = born.get(s.name) ?? 0;
      if (!enter) return time >= since ? 1 : 0;
      return Math.min(1, Math.max(0, (time - since) / enter));
    };

    const draw = (time = performance.now()) => {
      if (!width || !height || !ink) return;
      g.clearRect(0, 0, width, height);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = ink.alpha(ink.dust, 0.3);
      for (const d of dust) g.fillRect((d.x * 0.5 + 0.5) * width, (d.y * 0.5 + 0.5) * height, 1, 1);
      projected = stars.filter((s) => s.year <= year).map((s) => project(s, time)).sort((a, b) => b.depth - a.depth);
      g.globalCompositeOperation = 'lighter';
      // The core glow.
      const core = g.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.min(width, height) * 0.35);
      core.addColorStop(0, ink.alpha(ink.glow, 0.22));
      core.addColorStop(1, ink.alpha(ink.glow, 0));
      g.fillStyle = core;
      g.fillRect(0, 0, width, height);
      // The hovered category (a star or an arm's name), else the filtered or the page's own, drawn
      // as a constellation: its stars joined in order of creation.
      const chosen = filterArm();
      const lit = hovered ? hovered.s.arm : hoveredArm ?? (chosen >= 0 ? chosen : focusArm);
      if (lit !== null) {
        const line = projected.filter((p) => p.s.arm === lit && matches(p.s)).sort((a, b) => a.s.year - b.s.year || a.s.name.localeCompare(b.s.name));
        g.strokeStyle = colours[lit].copy({ opacity: 0.45 }).formatRgb();
        g.lineWidth = 1;
        g.beginPath();
        line.forEach((p, i) => (i ? g.lineTo(p.px, p.py) : g.moveTo(p.px, p.py)));
        g.stroke();
      }
      for (const p of projected) {
        const shown = opacityOf(p.s, time);
        if (!shown) continue;
        const dim = (!matches(p.s) ? 0.1 : lit !== null && p.s.arm !== lit ? 0.25 : 1) * shown;
        const colour = colours[p.s.arm];
        const halo = p.r * (p === hovered ? 7 : 4.5);
        const glow = g.createRadialGradient(p.px, p.py, 0, p.px, p.py, halo);
        glow.addColorStop(0, colour.copy({ opacity: 0.9 * p.glow * dim }).formatRgb());
        glow.addColorStop(0.25, colour.copy({ opacity: 0.35 * p.glow * dim }).formatRgb());
        glow.addColorStop(1, colour.copy({ opacity: 0 }).formatRgb());
        g.fillStyle = glow;
        g.beginPath();
        g.arc(p.px, p.py, halo, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = ink.alpha(ink.ink, 0.85 * p.glow * dim);
        g.beginPath();
        g.arc(p.px, p.py, Math.max(0.6, p.r * 0.45), 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      // Each arm named at its rim, in the arm's colour; the names are links to the category pages.
      g.font = `600 11px ${ink.font}`;
      g.textAlign = 'center';
      labels = keys.map((key, arm) => {
        const rim = project({ x: Math.cos(armAngle(arm, 1.06)) * 1.06, z: Math.sin(armAngle(arm, 1.06)) * 1.06, y: 0, size: 0, name: '' }, time);
        const text = source.categories[key];
        const on = lit === null || lit === arm;
        g.fillStyle = colours[arm].copy({ opacity: hoveredArm === arm ? 1 : on ? 0.8 : 0.25 }).formatRgb();
        g.fillText(text, rim.px, rim.py);
        const w = g.measureText(text).width;
        if (hoveredArm === arm) g.fillRect(rim.px - w / 2, rim.py + 2, w, 1);
        return { arm, x: rim.px - w / 2 - 4, y: rim.py - 13, w: w + 8, h: 18 };
      });
      // The year the sky shows, while it is not the present.
      if (year < maxYear) {
        g.textAlign = 'left';
        g.font = `700 13px ${ink.font}`;
        g.fillStyle = ink.alpha(ink.text, 0.9);
        g.fillText(String(year), 16, 24);
      }
      if (hovered) {
        g.textAlign = 'center';
        g.fillStyle = ink.ink;
        g.font = `700 12px ${ink.font}`;
        g.fillText(hovered.s.name, hovered.px, hovered.py - hovered.r * 3 - 6);
      }
    };

    // Let the panel show (and the address keep) a value the simulation changed itself, through the
    // layer's own input listener: the layer renders control <key> as #<id>-<key>.
    const reflect = (key, value) => {
      const input = document.getElementById(`${id}-${key}`);
      if (!input || String(input.value) === String(value)) return;
      input.value = value;
      input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    };

    const setYear = (next, time = performance.now()) => {
      const to = Math.min(maxYear, Math.max(minYear, Math.round(next)));
      if (to === year) return;
      const from = year;
      year = to;
      if (to > from) {
        for (const s of stars) if (s.year > from && s.year <= to) born.set(s.name, time);
        fadeUntil = time + motion().enter;
      }
    };

    // Play's clock: a year a second. It is a pace, not an animation, so it runs under reduced
    // motion too (the visitor asked for it); only the fade of a new star follows motion().
    const YEAR_MS = 1000;
    const busy = (time) => visible && !destroyed && (playing || (speed > 0 && !dragging) || !reducedMotion() || time < fadeUntil);

    const loop = (time) => {
      frame = 0;
      const dt = last ? Math.min(64, time - last) : 16;
      last = time;
      if (speed > 0 && !dragging) rotation += 0.0012 * speed * (dt / 16);
      if (playing && time - lastStep >= YEAR_MS) {
        lastStep = time;
        // Hold the present for one beat, then grow the galaxy again from its first year.
        setYear(year >= maxYear ? minYear : year + 1, time);
        reflect('year', year);
      }
      draw(time);
      if (busy(time)) frame = requestAnimationFrame(loop);
      else last = 0;
    };
    const kick = () => {
      if (!frame && !destroyed && visible) frame = requestAnimationFrame(loop);
    };
    // A change the visitor made: draw it now, and let the loop carry on if anything still moves.
    const redraw = () => {
      if (frame) return;
      draw();
      kick();
    };

    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    const nearest = (event) => {
      const [x, y] = point(event);
      let best = null;
      let distance = 14;
      for (const p of projected) {
        if (!matches(p.s)) continue;
        const d = Math.hypot(p.px - x, p.py - y);
        if (d < distance + p.r) { best = p; distance = d; }
      }
      return best;
    };
    const armAt = (event) => {
      const [x, y] = point(event);
      return labels.find((l) => x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h)?.arm ?? null;
    };
    const opens = `<span class="opacity-75">${escape(t('js_click_to_open'))}</span>`;
    const describe = (s) => `<b>${escape(s.name)}</b><br>${escape(source.categories[s.category] ?? '')}${s.language ? ` · ${escape(s.language)}` : ''} · ${escape(s.year)}${s.stars ? ` · ★ ${escape(s.stars)}` : ''}<br>${opens}`;
    const describeArm = (arm) => `<b>${escape(source.categories[keys[arm]])}</b><br>${escape(t('js_constellation_repos', { n: perArm[arm] }))}<br>${opens}`;

    const hover = (event) => {
      hovered = nearest(event);
      hoveredArm = hovered ? null : armAt(event);
      canvas.style.cursor = hovered || hoveredArm !== null ? 'pointer' : 'grab';
      if (hovered) tip.show(describe(hovered.s), event);
      else if (hoveredArm !== null) tip.show(describeArm(hoveredArm), event);
      else tip.hide();
    };
    const open = (event) => {
      if (hovered) go(hovered.s.url, event);
      else if (hoveredArm !== null) {
        const page = link('category', keys[hoveredArm]);
        if (page) go(page, event);
        else {
          // No category page in this language: the arm's name filters the sky instead.
          filter = `category:${keys[hoveredArm]}`;
          reflect('filter', filter);
          redraw();
        }
      }
    };

    // Pointer events with capture: a mouse, a pen and a finger behave alike, and a tap with no
    // movement finds the star under it before it opens it (pointermove never fires on a tap).
    const onDown = (event) => {
      if (event.button !== 0 && event.button !== 1) return;
      hover(event);
      dragging = { x: event.clientX, y: event.clientY, rotation, tilt, moved: false, id: event.pointerId };
      canvas.setPointerCapture?.(event.pointerId);
      if (!hovered && hoveredArm === null) canvas.style.cursor = 'grabbing';
      redraw();
    };
    const onMove = (event) => {
      if (dragging && dragging.id === event.pointerId) {
        const dx = event.clientX - dragging.x;
        const dy = event.clientY - dragging.y;
        if (Math.hypot(dx, dy) > 4) dragging.moved = true;
        if (dragging.moved) {
          tip.hide();
          hovered = null;
          hoveredArm = null;
          rotation = dragging.rotation + dx / 180;
          // On touch a vertical swipe scrolls the page (pan-y); a mouse or a pen also tilts.
          if (event.pointerType !== 'touch') tilt = Math.min(MAX_TILT, Math.max(0, dragging.tilt + dy / 240));
          redraw();
        }
        return;
      }
      hover(event);
      redraw();
    };
    const onUp = (event) => {
      if (!dragging || dragging.id !== event.pointerId) return;
      const { moved } = dragging;
      dragging = null;
      canvas.releasePointerCapture?.(event.pointerId);
      if (moved) {
        reflect('tilt', Math.round((tilt * 180) / Math.PI));
        canvas.style.cursor = 'grab';
        kick();
        return;
      }
      hover(event);
      open(event);
    };
    const onCancel = () => {
      dragging = null;
      canvas.style.cursor = 'grab';
      kick();
    };
    const onLeave = () => {
      if (dragging) return;
      hovered = null;
      hoveredArm = null;
      tip.hide();
      redraw();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('pointerleave', onLeave);

    // The keyboard turns the galaxy too: the arrows rotate and tilt once the box has focus (Shift
    // for bigger steps); every star is also a link in the list twin under the card.
    const hadTabIndex = box.hasAttribute('tabindex');
    if (!hadTabIndex) box.tabIndex = 0;
    const FOCUS = ['focus:outline-none', 'focus-visible:ring-4', 'focus-visible:ring-primary-300'];
    box.classList.add(...FOCUS);
    const onKey = (event) => {
      const step = event.shiftKey ? 0.3 : 0.08;
      if (event.key === 'ArrowLeft') rotation -= step;
      else if (event.key === 'ArrowRight') rotation += step;
      else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        tilt = Math.min(MAX_TILT, Math.max(0, tilt + (event.key === 'ArrowUp' ? -step : step)));
        reflect('tilt', Math.round((tilt * 180) / Math.PI));
      } else return;
      event.preventDefault();
      redraw();
    };
    box.addEventListener('keydown', onKey);

    const sight = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      kick();
    });
    sight.observe(box);
    paint();
    resize();
    draw();
    kick();

    const filterOptions = [
      { value: 'all', label: t('js_constellation_all') },
      ...keys.map((key, arm) => ({ value: `category:${key}`, label: t('js_constellation_category', { name: source.categories[key], n: perArm[arm] }) })),
      ...languages.map(([name, n]) => ({ value: `language:${name}`, label: t('js_constellation_language', { name: name || t('js_unspecified'), n }) })),
    ];

    return {
      // The list twin: the stars the sky shows now (year and filter), newest first.
      items: () => stars.filter((s) => s.year <= year && matches(s))
        .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name))
        .map((s) => ({ label: s.name, url: s.url, note: `${source.categories[s.category] ?? ''}${s.language ? ` · ${s.language}` : ''} · ${s.year}` })),
      controls: () => [
        {
          key: 'play',
          type: 'play',
          value: false,
          set(on) {
            playing = Boolean(on);
            // Play from the present starts the growth over from the first year.
            if (playing && year >= maxYear) {
              setYear(minYear);
              reflect('year', year);
            }
            lastStep = performance.now();
            redraw();
          },
        },
        {
          key: 'year', type: 'range', label: t('js_constellation_year'), min: minYear, max: maxYear, step: 1, value: maxYear,
          format: (v) => (Number(v) >= maxYear ? t('js_constellation_now', { year: v }) : String(v)),
          set(v) { setYear(Number(v)); redraw(); },
        },
        {
          key: 'speed', type: 'range', label: t('js_constellation_speed'), min: 0, max: 4, step: 0.25, value: DEFAULT_SPEED,
          format: (v) => (Number(v) === 0 ? t('js_constellation_still') : `${Number(v).toLocaleString(KorczisHub.locale)}×`),
          set(v) { speed = Number(v); redraw(); },
        },
        {
          key: 'tilt', type: 'range', label: t('js_constellation_tilt'), min: 0, max: 85, step: 1, value: DEFAULT_TILT,
          format: (v) => `${v}°`,
          set(v) { tilt = Math.min(MAX_TILT, (Number(v) * Math.PI) / 180); redraw(); },
        },
        {
          key: 'filter', type: 'select', label: t('js_constellation_filter'), options: filterOptions, value: DEFAULT_FILTER,
          set(v) {
            filter = filterOptions.some((o) => o.value === v) ? v : 'all';
            hovered = null;
            redraw();
          },
        },
      ],
      resize() { resize(); draw(); },
      update() { paint(); draw(); },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(frame);
        sight.disconnect();
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onCancel);
        canvas.removeEventListener('pointerleave', onLeave);
        box.removeEventListener('keydown', onKey);
        box.classList.remove(...FOCUS);
        if (!hadTabIndex) box.removeAttribute('tabindex');
        tip.hide();
        canvas.remove();
      },
    };
  },
});
