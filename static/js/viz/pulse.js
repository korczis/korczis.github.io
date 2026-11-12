// Live pulse (canvas, d3 for colour and time): activity as a heartbeat trace. Time runs left to
// right, newest on the right; every event is a beat on the trace and a glowing orb in its lane,
// coloured along the art palette, sized by its commits. A phosphor beam sweeps the trace like an
// oscilloscope. Two modes, chosen by the source the page embeds:
//   user  the owner's public GitHub events, one lane per repository (the home page);
//   repo  one project's commits, one lane per conventional commit type (feat, fix, docs, ...).
//   all   every recent project's commits, one lane per category (the work list; snapshot only).
// The page embeds the measured snapshot; when the source names a live GitHub endpoint, the browser
// asks it and keeps asking every five minutes while the visual is on screen (conditional requests,
// so a quiet poll costs no rate limit). Offline, rate-limited or on GitLab it stays on the snapshot
// and says so. Hover a beat to read it, click it to open the commit, pull request or release.
KorczisHub.viz('pulse', {
  lib: 'd3',
  mount(box, source, { palette, reducedMotion }) {
    const tip = KorczisHub.tooltip(box);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y';
    box.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const POLL = 5 * 60 * 1000;
    const user = KorczisHub.github;
    const byType = source.mode === 'repo';
    // A conventional commit's type names its lane; anything else is "other", merges are merges.
    const TYPES_CC = new Set(['feat', 'fix', 'docs', 'chore', 'refactor', 'test', 'ci', 'perf', 'build', 'style', 'revert']);
    const kindOf = (message) => {
      if (/^merge\b/i.test(message)) return 'merge';
      const m = /^(\w+)(\([^)]*\))?!?:/.exec(message);
      return m && TYPES_CC.has(m[1].toLowerCase()) ? m[1].toLowerCase() : KorczisHub.t('js_other');
    };
    const relative = new Intl.RelativeTimeFormat(KorczisHub.locale, { numeric: 'auto' });
    const clock = new Intl.DateTimeFormat(KorczisHub.locale, { hour: '2-digit', minute: '2-digit' });
    const day = new Intl.DateTimeFormat(KorczisHub.locale, { day: 'numeric', month: 'short' });
    const month = new Intl.DateTimeFormat(KorczisHub.locale, { month: 'short', year: 'numeric' });
    const year = new Intl.DateTimeFormat(KorczisHub.locale, { year: 'numeric' });
    const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const hash = (text) => {
      let h = 2166136261;
      for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
      return ((h >>> 0) % 10000) / 10000;
    };
    // [unit, seconds in it, the largest magnitude shown in it]
    const UNITS = [['second', 1, 60], ['minute', 60, 60], ['hour', 3600, 24], ['day', 86400, 30], ['month', 2592000, 12], ['year', 31536000, Infinity]];
    const ago = (ms) => {
      const s = (ms - Date.now()) / 1000;
      const [unit, size] = UNITS.find(([, size, max]) => Math.abs(s / size) < max);
      return relative.format(Math.round(s / size), unit);
    };

    // The snapshot the page embeds: the last commit of each recent project (user), or a project's
    // latest commits (repo).
    // The work list sends groups (a project, its category lane, its commits); flatten them.
    const embedded = source.groups ? source.groups.flatMap((g) => g.commits.map((c) => ({ ...c, repo: g.repo, lane: g.lane }))) : source.beats;
    const snapshot = embedded.map((b, i) => ({
      id: `s:${i}`,
      repo: b.repo,
      type: source.mode === 'user' ? 'push' : 'commit',
      lane: b.lane ?? (byType ? kindOf(b.message || '') : b.repo),
      message: b.message || '',
      at: Date.parse(b.at),
      weight: 1,
      url: b.url,
    }));

    // A public GitHub event, read as a beat; events the visual does not draw return null.
    const TYPES = {
      PushEvent: 'push', CreateEvent: 'create', PullRequestEvent: 'pr', IssuesEvent: 'issue',
      ReleaseEvent: 'release', WatchEvent: 'star', ForkEvent: 'fork', PublicEvent: 'create',
    };
    const beat = (e) => {
      const type = TYPES[e.type];
      if (!type) return null;
      const repo = e.repo.name.replace(`${user}/`, '');
      const base = `https://github.com/${e.repo.name}`;
      const p = e.payload || {};
      let url = base;
      let message = '';
      let weight = 1;
      if (type === 'push') {
        const commits = p.commits || [];
        weight = Math.max(1, p.size || commits.length);
        message = commits.length ? commits[commits.length - 1].message.split('\n')[0] : (p.ref || '').replace('refs/heads/', '');
        url = p.head ? `${base}/commit/${p.head}` : base;
      } else if (type === 'pr') {
        message = `${p.action || ''} #${p.number ?? p.pull_request?.number ?? ''} ${p.pull_request?.title || ''}`.trim();
        url = p.pull_request?.html_url || base;
      } else if (type === 'issue') {
        message = `${p.action || ''} #${p.issue?.number ?? ''} ${p.issue?.title || ''}`.trim();
        url = p.issue?.html_url || base;
      } else if (type === 'release') {
        message = p.release?.name || p.release?.tag_name || '';
        url = p.release?.html_url || base;
      } else if (type === 'create') {
        message = [p.ref_type, p.ref].filter(Boolean).join(' ');
      } else if (type === 'fork') {
        url = p.forkee?.html_url || base;
      }
      return { id: e.id, repo, type, lane: repo, message, at: Date.parse(e.created_at), weight, url };
    };
    // A commit of the repository endpoint, read as a beat.
    const commitBeat = (c) => {
      const message = (c.commit?.message || '').split('\n')[0];
      return { id: c.sha, repo: source.repo, type: 'commit', lane: kindOf(message), message, at: Date.parse(c.commit?.committer?.date), weight: 1, url: c.html_url };
    };

    let beats = snapshot;
    let live = false;
    let checked = null;
    let etag = null;
    let born = new Map();
    let width = 0;
    let height = 0;
    let colours = null;
    let points = [];
    let lanes = [];
    let trace = [];
    let hovered = null;
    let visible = true;
    let frame = 0;
    let timer = 0;
    let destroyed = false;

    const window_ = () => {
      // Live, the window runs up to now (a quiet stretch is a fact); a snapshot spans its own beats.
      const last = Math.max(...beats.map((b) => b.at));
      const end = live ? Math.max(Date.now(), last) : last;
      const first = Math.min(...beats.map((b) => b.at));
      // The events' own span (at least a day), with a little air on both sides.
      const span = Math.max(end - first, 86400000);
      return [end - span * 1.03, end + span * 0.03];
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = box.clientWidth;
      height = box.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = palette();
      colours = { ramp: d3.interpolateRgbBasis(c.art), text: 'rgba(229, 231, 235, 0.85)', faint: 'rgba(156, 163, 175, 0.55)' };
      layout();
    };

    const layout = () => {
      const [from, to] = window_();
      const x = d3.scaleTime().domain([from, to]).range([28, width - 28]);
      const base = height * 0.74;
      const maxWeight = Math.max(1, ...beats.map((b) => b.weight));
      // One lane per repository (or commit type), the busiest on top: orbs float above the trace.
      const counts = d3.rollup(beats, (v) => d3.sum(v, (b) => b.weight), (b) => b.lane);
      const keys = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
      lanes = keys.map((key, i) => ({ key, y: 52 + (keys.length === 1 ? 0.5 : i / (keys.length - 1)) * (base - 100), colour: d3.color(colours.ramp(keys.length === 1 ? 0.5 : i / (keys.length - 1))) }));
      const lane = new Map(lanes.map((l) => [l.key, l]));
      points = beats.map((b) => {
        const share = Math.sqrt(b.weight / maxWeight);
        return { b, px: x(b.at), base, oy: lane.get(b.lane).y, amp: (0.25 + 0.75 * share) * height * 0.16, r: 2.5 + 3.5 * share, colour: lane.get(b.lane).colour };
      }).sort((a, b) => a.px - b.px);
      points.x = x;
      // The trace and its colour, sampled every 2 px once per layout, not once per frame.
      const mid = d3.color(colours.ramp(0.5));
      trace = [];
      for (let px = 0; px <= width; px += 2) {
        const near = points.find((p) => Math.abs(p.px - px) < 24);
        trace.push({ px, y: base + traceAt(px), c: near ? near.colour : mid });
      }
    };

    // The trace: a flat line with one ECG beat (a dip, a spike, a rebound) per event; where beats
    // overlap the strongest wins, so a busy hour stays inside the card.
    const traceAt = (px) => {
      let y = 0;
      for (const p of points) {
        const d = (px - p.px) / 3;
        if (Math.abs(d) > 5) continue;
        const v = -p.amp * Math.exp(-d * d) + p.amp * 0.3 * Math.exp(-((d - 2) ** 2) * 1.5) + p.amp * 0.12 * Math.exp(-((d + 2.2) ** 2) * 2);
        if (Math.abs(v) > Math.abs(y)) y = v;
      }
      return y;
    };

    const draw = (time) => {
      if (!width || !colours) return;
      ctx.clearRect(0, 0, width, height);
      const base = height * 0.74;
      const motion = !reducedMotion();
      const sweep = motion ? ((time / 7000) % 1) * (width + 120) - 60 : width;

      // Time ticks along the bottom.
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = colours.faint;
      ctx.textAlign = 'center';
      for (const tick of points.x.ticks(Math.max(2, Math.floor(width / 140)))) {
        const px = points.x(tick);
        ctx.fillRect(px, base + 16, 1, 4);
        // Hours within days, days within months, months within years, years beyond.
        const [from, to] = points.x.domain();
        const span = to - from;
        const label = span > 2 * 31536000000 ? year : span > 120 * 86400000 ? month : tick.getHours() || tick.getMinutes() ? clock : day;
        ctx.fillText(label.format(tick), px, base + 32);
      }
      // Lanes: a faint rule per repository, its name at the left edge when there is room (the
      // right edge is now, where activity is densest).
      const labelled = (base - 100) / Math.max(1, lanes.length - 1) >= 13;
      ctx.textAlign = 'left';
      for (const l of lanes) {
        ctx.fillStyle = `rgba(${l.colour.r}, ${l.colour.g}, ${l.colour.b}, 0.10)`;
        ctx.fillRect(16, l.y, width - 32, 1);
        if (labelled && width > 480) {
          ctx.fillStyle = `rgba(${l.colour.r}, ${l.colour.g}, ${l.colour.b}, 0.75)`;
          ctx.fillText(l.key, 16, l.y - 4);
        }
      }
      ctx.textAlign = 'center';

      // The trace, glowing, brighter just behind the sweep (phosphor afterglow).
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glowAt = (px) => (motion ? Math.max(0.25, 1 - Math.max(0, sweep - px) / (width * 0.9)) * (px > sweep ? 0.25 : 1) : 0.8);
      for (const [lineWidth, alpha] of [[6, 0.08], [2.5, 0.25], [1.2, 0.9]]) {
        ctx.lineWidth = lineWidth;
        for (let i = 1; i < trace.length; i += 1) {
          const { px, y, c } = trace[i];
          ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha * glowAt(px)})`;
          ctx.beginPath();
          ctx.moveTo(trace[i - 1].px, trace[i - 1].y);
          ctx.lineTo(px, y);
          ctx.stroke();
        }
      }
      // The beam.
      if (motion && sweep > 0 && sweep < width) {
        const g = ctx.createLinearGradient(sweep - 40, 0, sweep + 4, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(255,255,255,0.10)');
        ctx.fillStyle = g;
        ctx.fillRect(sweep - 40, 8, 44, height - 16);
      }
      ctx.restore();
      // Orbs: one per beat in its repository's lane, a thread down to its spike; a fresh live beat
      // rings as it arrives.
      for (const p of points) {
        const y = p.oy;
        const lit = hovered === p ? 1.6 : 1;
        const pulse = motion ? 0.85 + 0.15 * Math.sin(time / 500 + hash(p.b.id) * 6.28) : 1;
        const r = p.r * lit * pulse;
        // A soft halo per orb while there are few; a dense sky (the work list) keeps it for the hovered.
        if (points.length <= 160 || hovered === p) {
          const halo = ctx.createRadialGradient(p.px, y, 0, p.px, y, r * 4);
          halo.addColorStop(0, `rgba(${p.colour.r}, ${p.colour.g}, ${p.colour.b}, ${hovered === p ? 0.5 : 0.22})`);
          halo.addColorStop(1, `rgba(${p.colour.r}, ${p.colour.g}, ${p.colour.b}, 0)`);
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(p.px, y, r * 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(${p.colour.r}, ${p.colour.g}, ${p.colour.b}, 0.95)`;
        ctx.beginPath();
        ctx.arc(p.px, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(${p.colour.r}, ${p.colour.g}, ${p.colour.b}, ${hovered === p ? 0.6 : 0.12})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.px, y + r);
        ctx.lineTo(p.px, p.base - p.amp);
        ctx.stroke();
        const since = born.get(p.b.id);
        if (since && motion) {
          const age = (time - since) / 1800;
          if (age < 1) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 * (1 - age)})`;
            ctx.beginPath();
            ctx.arc(p.px, y, r + age * 40, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // Status, top left: live with the time of the last check, or the snapshot.
      ctx.textAlign = 'left';
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      const dot = live ? (motion ? 0.6 + 0.4 * Math.sin(time / 300) : 1) : 0.5;
      ctx.fillStyle = live ? `rgba(52, 211, 153, ${dot})` : colours.faint;
      ctx.beginPath();
      ctx.arc(16, 18, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colours.text;
      const status = live ? `${KorczisHub.t('js_live').toUpperCase()} · ${clock.format(checked)}` : KorczisHub.t('js_snapshot').toUpperCase();
      ctx.fillText(`${status} · ${beats.length}`, 26, 22);
    };

    const loop = (time) => {
      frame = 0;
      draw(time);
      if (visible && !reducedMotion() && !destroyed) frame = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!frame && !destroyed) frame = requestAnimationFrame(loop);
    };

    const poll = async () => {
      if (!source.live || destroyed) return;
      try {
        const headers = { Accept: 'application/vnd.github+json' };
        if (etag) headers['If-None-Match'] = etag;
        const response = await fetch(`https://api.github.com/${source.live}?per_page=${byType ? 30 : 100}`, { headers });
        if (response.status === 304) {
          live = true;
          checked = new Date();
        } else if (response.ok) {
          etag = response.headers.get('ETag');
          const fresh = (await response.json()).map(byType ? commitBeat : beat).filter((b) => b && Number.isFinite(b.at));
          if (fresh.length) {
            const known = new Set(beats.map((b) => b.id));
            const now = performance.now();
            if (live) for (const b of fresh) if (!known.has(b.id)) born.set(b.id, now);
            beats = fresh;
            live = true;
            checked = new Date();
            layout();
          }
        }
      } catch {
        // Offline, blocked or rate-limited: the snapshot stays and the status says so.
      }
      kick();
      draw(performance.now());
    };

    const nearest = (event) => {
      const rect = canvas.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      let best = null;
      let bestD = 24 * 24;
      for (const p of points) {
        const oy = p.oy;
        // Near the orb, or anywhere on its column down to the trace.
        const inColumn = Math.abs(my - oy) < 10 || (my > p.base - p.amp - 4 && my < p.base + 12);
        const d = inColumn ? (p.px - mx) ** 2 : (p.px - mx) ** 2 + (oy - my) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      return best;
    };

    canvas.addEventListener('pointermove', (event) => {
      const p = nearest(event);
      hovered = p;
      canvas.style.cursor = p ? 'pointer' : 'default';
      if (p) {
        const b = p.b;
        const count = b.type === 'push' && b.weight > 1 ? ` · ${b.weight}×` : '';
        tip.show(
          `<strong>${escape(byType ? b.lane : b.repo)}</strong> · ${escape(KorczisHub.t(`js_pulse_${b.type}`))}${count}<br>`
          + `${b.message ? `${escape(b.message.slice(0, 90))}<br>` : ''}<span class="opacity-75">${escape(ago(b.at))} · ${escape(KorczisHub.t('js_click_to_open'))}</span>`,
          event,
        );
      } else tip.hide();
      if (reducedMotion()) draw(performance.now());
    });
    canvas.addEventListener('pointerleave', () => {
      hovered = null;
      tip.hide();
      if (reducedMotion()) draw(performance.now());
    });
    canvas.addEventListener('click', (event) => {
      const p = nearest(event);
      if (p) window.open(p.b.url, '_blank', 'noopener');
    });

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) kick();
    });
    io.observe(box);
    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(box);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisibility);

    resize();
    draw(performance.now());
    kick();
    poll();
    timer = setInterval(() => {
      if (visible && document.visibilityState === 'visible') poll();
    }, POLL);

    return {
      // The list twin: what the pulse shows now (live or snapshot), newest first.
      items: () => [...beats].sort((a, b) => b.at - a.at)
        .map((b) => ({ label: `${b.repo}: ${b.message || KorczisHub.t(`js_pulse_${b.type}`)}`, url: b.url, note: ago(b.at) })),
      update() {
        resize();
        draw(performance.now());
      },
      destroy() {
        destroyed = true;
        clearInterval(timer);
        cancelAnimationFrame(frame);
        io.disconnect();
        ro.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
      },
    };
  },
});
