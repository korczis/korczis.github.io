// Constellation (canvas, d3 for colour): every original repository as a star in a spiral galaxy.
// Each category is an arm (colour along the art palette), the oldest work sits in the core and the
// newest at the rim, a star's size grows with its stars on GitHub, and work of the last 48 months
// twinkles. The galaxy turns slowly in 3D; drag to turn it, hover a star to read it and to light its
// category as a constellation, click to open its page (work page when recent, else its repository).
// A category page passes its key as source.focus: that arm stays lit as a constellation.
KorczisHub.viz('constellation', {
  lib: 'd3',
  mount(box, source, { palette, reducedMotion }) {
    const tip = KorczisHub.tooltip(box);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab';
    box.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const recent = new Set(source.recent);
    const keys = Object.keys(source.categories);
    const focusArm = source.focus && keys.includes(source.focus) ? keys.indexOf(source.focus) : null;
            // Deterministic jitter per repository: the same sky on every visit.
    const hash = (text, salt) => {
      let h = 2166136261 ^ salt;
      for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
      return ((h >>> 0) % 10000) / 10000;
    };
    // Radius by rank of creation (oldest first), so the decades spread evenly from core to rim.
    const order = [...source.repos].sort((a, b) => a.year - b.year || a.name.localeCompare(b.name)).map((r) => r.name);
    const rank = new Map(order.map((name, i) => [name, order.length === 1 ? 1 : i / (order.length - 1)]));
    const stars = source.repos.map((r) => {
      const arm = keys.indexOf(r.category);
      const t = rank.get(r.name);
      const radius = 0.12 + 0.88 * t + (hash(r.name, 1) - 0.5) * 0.06;
      const angle = (arm / keys.length) * Math.PI * 2 + radius * 3.2 + (hash(r.name, 2) - 0.5) * 0.22;
      return {
        ...r,
        arm,
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        y: (hash(r.name, 3) - 0.5) * 0.22 * (1.2 - radius),
        size: 2 + Math.log2(1 + r.stars) * 0.9 + (recent.has(r.name) ? 1.6 : 0),
        phase: hash(r.name, 4) * Math.PI * 2,
        url: recent.has(r.name) ? `${KorczisHub.home}work/${slug(r.name)}/` : r.url,
      };
    });
    // Background dust: fixed, faint, for depth.
    const dust = Array.from({ length: 260 }, (_v, i) => ({ x: hash(`d${i}`, 5) * 2 - 1, y: hash(`d${i}`, 6) * 2 - 1, a: 0.15 + hash(`d${i}`, 7) * 0.35 }));

    let width = 0;
    let height = 0;
    let rotation = 0.6;
    const tilt = 0.55;
    let dragging = null;
    let hovered = null;
    let running = !reducedMotion();
    let visible = true;
    let frame = 0;
    let colours = [];
    let projected = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = box.clientWidth;
      height = box.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = palette();
      const ramp = d3.interpolateRgbBasis(c.art);
      colours = keys.map((_k, i) => d3.color(ramp(keys.length === 1 ? 0.5 : i / (keys.length - 1))));
    };

    const project = (s, time) => {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const x = s.x * cos - s.z * sin;
      const z0 = s.x * sin + s.z * cos;
      const y = s.y * Math.cos(tilt) - z0 * Math.sin(tilt);
      const z = s.y * Math.sin(tilt) + z0 * Math.cos(tilt);
      const scale = Math.min(width * 0.44, height * 0.8);
      const perspective = 2.6 / (2.6 + z);
      const twinkle = recent.has(s.name) && running ? 0.75 + 0.25 * Math.sin(time / 420 + s.phase) : 1;
      return { s, px: width / 2 + x * scale * perspective, py: height / 2 + y * scale * perspective, depth: z, r: s.size * perspective, glow: twinkle * (0.55 + 0.45 * perspective) };
    };

    const draw = (time = 0) => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      for (const d of dust) {
        ctx.fillStyle = `rgba(226,232,240,${d.a * 0.6})`;
        ctx.fillRect((d.x * 0.5 + 0.5) * width, (d.y * 0.5 + 0.5) * height, 1, 1);
      }
      projected = stars.map((s) => project(s, time)).sort((a, b) => b.depth - a.depth);
      ctx.globalCompositeOperation = 'lighter';
      // The core glow.
      const core = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.min(width, height) * 0.35);
      core.addColorStop(0, 'rgba(147,197,253,0.22)');
      core.addColorStop(1, 'rgba(147,197,253,0)');
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, width, height);
      // The hovered (or the page's own) category, drawn as a constellation: its stars joined in
      // order of creation.
      const lit = hovered ? hovered.s.arm : focusArm;
      if (lit !== null) {
        const line = projected.filter((p) => p.s.arm === lit).sort((a, b) => a.s.year - b.s.year || a.s.name.localeCompare(b.s.name));
        ctx.strokeStyle = colours[lit].copy({ opacity: 0.45 }).formatRgb();
        ctx.lineWidth = 1;
        ctx.beginPath();
        line.forEach((p, i) => (i ? ctx.lineTo(p.px, p.py) : ctx.moveTo(p.px, p.py)));
        ctx.stroke();
      }
      for (const p of projected) {
        const dim = lit !== null && p.s.arm !== lit ? 0.25 : 1;
        const colour = colours[p.s.arm];
        const halo = p.r * (p === hovered ? 7 : 4.5);
        const g = ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, halo);
        g.addColorStop(0, colour.copy({ opacity: 0.9 * p.glow * dim }).formatRgb());
        g.addColorStop(0.25, colour.copy({ opacity: 0.35 * p.glow * dim }).formatRgb());
        g.addColorStop(1, colour.copy({ opacity: 0 }).formatRgb());
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.px, p.py, halo, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.85 * p.glow * dim})`;
        ctx.beginPath();
        ctx.arc(p.px, p.py, Math.max(0.6, p.r * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      // Each arm named at its rim, in the arm's colour.
      ctx.font = `600 11px ${palette().font}`;
      ctx.textAlign = 'center';
      keys.forEach((key, arm) => {
        const tipStar = project({ x: Math.cos((arm / keys.length) * Math.PI * 2 + 1.06 * 3.2) * 1.06, z: Math.sin((arm / keys.length) * Math.PI * 2 + 1.06 * 3.2) * 1.06, y: 0, size: 0, name: '' }, time);
        ctx.fillStyle = colours[arm].copy({ opacity: lit !== null && lit !== arm ? 0.25 : 0.8 }).formatRgb();
        ctx.fillText(source.categories[key], tipStar.px, tipStar.py);
      });
      if (hovered) {
        ctx.fillStyle = '#fff';
        ctx.font = `700 12px ${palette().font}`;
        ctx.fillText(hovered.s.name, hovered.px, hovered.py - hovered.r * 3 - 6);
      }
    };

    const loop = (time) => {
      if (running && visible && !dragging) rotation += 0.0012;
      draw(time);
      frame = running && visible ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => { if (!frame && running && visible) frame = requestAnimationFrame(loop); };

    const nearest = (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      let best = null;
      let distance = 14;
      for (const p of projected) {
        const d = Math.hypot(p.px - x, p.py - y);
        if (d < distance + p.r) { best = p; distance = d; }
      }
      return best;
    };
    const describe = (s) => `<b>${s.name}</b><br>${source.categories[s.category]}${s.language ? ` · ${s.language}` : ''} · ${s.year}${s.stars ? ` · ★ ${s.stars}` : ''}<br><span style="opacity:.7">${KorczisHub.t('js_click_to_open')}</span>`;

    canvas.addEventListener('pointerdown', (event) => {
      dragging = { x: event.clientX, rotation, moved: false };
      canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('pointerup', () => {
      if (!dragging) return;
      const moved = dragging.moved;
      dragging = null;
      canvas.style.cursor = hovered ? 'pointer' : 'grab';
      if (!moved && hovered) window.location.href = hovered.s.url;
    });
    canvas.addEventListener('pointermove', (event) => {
      if (dragging) {
        const dx = event.clientX - dragging.x;
        if (Math.abs(dx) > 3) dragging.moved = true;
        rotation = dragging.rotation + dx / 180;
        if (!running) draw();
        return;
      }
      hovered = nearest(event);
      canvas.style.cursor = hovered ? 'pointer' : 'grab';
      if (hovered) tip.show(describe(hovered.s), event); else tip.hide();
      if (!running) draw();
    });
    canvas.addEventListener('pointerleave', () => { hovered = null; tip.hide(); if (!running) draw(); });

    const sight = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; kick(); });
    sight.observe(box);
    const onResize = new ResizeObserver(() => { resize(); draw(); });
    onResize.observe(box);
    resize();
    draw();
    kick();
    return {
      update() { resize(); draw(); },
      destroy() { running = false; cancelAnimationFrame(frame); sight.disconnect(); onResize.disconnect(); canvas.remove(); },
    };
  },
});
