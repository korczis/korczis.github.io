// Live pulse (canvas, d3 for colour and time): activity as a heartbeat trace. Time runs left to
// right, newest on the right; every event is a beat on the trace and a glowing orb in its lane,
// coloured along the art palette, sized by its commits. A phosphor beam sweeps the trace like an
// oscilloscope and replays the beats in order: each one rings as the beam crosses it. Three modes,
// chosen by the source the page embeds:
//   user  the owner's public GitHub events, one lane per repository (the home page);
//   repo  one project's commits, one lane per conventional commit type (feat, fix, docs, ...);
//   all   every recent project's commits, one lane per category (the work list; snapshot only).
// The page embeds the measured snapshot; when the source names a live GitHub endpoint, the browser
// asks it and keeps asking every five minutes while the visual is on screen (conditional requests,
// so a quiet poll costs no rate limit). Offline, rate-limited or on GitLab it stays on the snapshot
// and says so; a failed poll is never a console error.
// Parameters (handle.controls()): the time window (hours to years, or everything), play/pause of
// the sweep, a lane filter and the replay speed. Hover a beat to read it; a click opens its work
// page, or its commit, pull request or release where the beat has no other page (a work page's
// own pulse); a lane's name opens its work or category page.
KorczisHub.viz('pulse', {
  lib: 'd3',
  mount(box, source, { palette, colour, reducedMotion, motion, go, link, escape, hash, t }) {
    // A commit title is shown as text: terminal colour codes and other control characters are
    // dropped (the same expression as scripts/lib/plain.mjs, which cleans the snapshot).
    // eslint-disable-next-line no-control-regex
    const plain = (text) => String(text || '').replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
    const embedded = !source ? [] : source.groups
      ? source.groups.flatMap((grp) => (grp.commits || []).map((c) => ({ ...c, repo: grp.repo, lane: grp.lane, category: grp.category })))
      : source.beats || [];
    if (!embedded.length && !source?.live) return { empty: true, items: () => [] };
    const tip = KorczisHub.tooltip(box);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y';
    box.appendChild(canvas);
    const g = canvas.getContext('2d');
    const POLL = 5 * 60 * 1000;
    const HOUR = 3600000;
    const DAY = 24 * HOUR;
    const user = KorczisHub.github;
    const byType = source.mode === 'repo';
    // A conventional commit's type names its lane; anything else is "other", merges are merges.
    const TYPES_CC = new Set(['feat', 'fix', 'docs', 'chore', 'refactor', 'test', 'ci', 'perf', 'build', 'style', 'revert']);
    const kindOf = (message) => {
      if (/^merge\b/i.test(message)) return 'merge';
      const m = /^(\w+)(\([^)]*\))?!?:/.exec(message);
      return m && TYPES_CC.has(m[1].toLowerCase()) ? m[1].toLowerCase() : t('js_other');
    };
    const locale = KorczisHub.locale;
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const clock = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
    const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
    const month = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' });
    const year = new Intl.DateTimeFormat(locale, { year: 'numeric' });
    const hours = new Intl.NumberFormat(locale, { style: 'unit', unit: 'hour', unitDisplay: 'long' });
    const days = new Intl.NumberFormat(locale, { style: 'unit', unit: 'day', unitDisplay: 'long' });
    const years = new Intl.NumberFormat(locale, { style: 'unit', unit: 'year', unitDisplay: 'long' });
    const unit = (text) => (hash(text) % 10000) / 10000;
    // [unit, seconds in it, the largest magnitude shown in it]
    const UNITS = [['second', 1, 60], ['minute', 60, 60], ['hour', 3600, 24], ['day', 86400, 30], ['month', 2592000, 12], ['year', 31536000, Infinity]];
    const ago = (ms) => {
      const s = (ms - Date.now()) / 1000;
      const [name, size] = UNITS.find(([, n, max]) => Math.abs(s / n) < max);
      return relative.format(Math.round(s / size), name);
    };

    // The snapshot the page embeds: the last commit of each recent project (user), a project's
    // latest commits (repo), or every recent project's commits in its category's lane (all).
    const snapshot = embedded.map((b, i) => ({
      id: `s:${i}`,
      repo: b.repo,
      type: source.mode === 'user' ? 'push' : 'commit',
      lane: b.lane ?? (byType ? kindOf(plain(b.message)) : b.repo),
      category: b.category ?? null,
      message: plain(b.message),
      at: Date.parse(b.at),
      weight: 1,
      url: b.url,
    })).filter((b) => Number.isFinite(b.at));

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
      return { id: e.id, repo, type, lane: repo, category: null, message: plain(message), at: Date.parse(e.created_at), weight, url };
    };
    // A commit of the repository endpoint, read as a beat.
    const commitBeat = (c) => {
      const message = plain((c.commit?.message || '').split('\n')[0]);
      return { id: c.sha, repo: source.repo, type: 'commit', lane: kindOf(message), category: null, message, at: Date.parse(c.commit?.committer?.date), weight: 1, url: c.html_url };
    };

    // Where a beat leads: its work page first (rule project.everything-interlinked), its commit,
    // pull request or release when the work page is this very page or there is none.
    const here = location.pathname;
    const pageOf = (url) => (url && new URL(url, location.href).pathname !== here ? url : null);
    const target = (b) => pageOf(link('work', b.repo)) ?? b.url;
    const laneUrl = (l) => (byType ? null : pageOf(l.category ? link('category', l.category) : link('work', l.key)));

    // The time windows the range steps through: hours, days, then the whole span.
    const WINDOWS = [6, 12, 24, 48, 72, 168, 336, 720, 2160, 4320, 8760, 17520, 35064].map((h) => h * HOUR).concat(Infinity);
    const ALL = WINDOWS.length - 1;
    const windowLabel = (i) => {
      const w = WINDOWS[i];
      if (w === Infinity) return t('js_pulse_window_all');
      if (w < 72 * HOUR) return hours.format(w / HOUR);
      return w < 365 * DAY ? days.format(Math.round(w / DAY)) : years.format(Math.round(w / (365 * DAY)));
    };

    // The model the visitor drives.
    let windowIndex = ALL;
    let laneFilter = 'all';
    let playing = !reducedMotion();
    let speed = 1;

    let beats = snapshot;
    let live = false;
    let checked = null;
    let etag = null;
    const born = new Map();
    let width = 0;
    let height = 0;
    let ink = null;
    let points = [];
    let lanes = [];
    let laneLabels = [];
    let trace = [];
    let shown = [];
    let hovered = null;
    let hoveredLane = null;
    let visible = true;
    let frame = 0;
    let timer = 0;
    let destroyed = false;
    // The sweep's own clock, so a pause holds the beam where it is and a speed change does not jump.
    let phase = 0;
    let lastTime = 0;
    let lastSweep = -Infinity;
    const start = performance.now();

    // [from, to] of the time axis. Live, the window runs up to now (a quiet stretch is a fact); a
    // snapshot ends at its last beat. The whole span is the beats' own (at least a day), a chosen
    // window is that long; both with a little air on the sides.
    const span = () => {
      const ats = beats.map((b) => b.at);
      const last = ats.length ? Math.max(...ats) : Date.now();
      const end = live || !ats.length ? Math.max(Date.now(), last) : last;
      const w = WINDOWS[windowIndex];
      if (w !== Infinity) return [end - w, end + w * 0.03];
      const first = ats.length ? Math.min(...ats) : end;
      const s = Math.max(end - first, DAY);
      return [end - s * 1.03, end + s * 0.03];
    };

    const paint = () => {
      const c = palette();
      // The night sky is dark in both themes: its inks are the --hub-night-* tokens, the live dot
      // --hub-live.
      const n = c.night;
      ink = {
        ramp: d3.interpolateRgbBasis(c.art),
        text: c.alpha(n.text, 0.85),
        faint: c.alpha(n.muted, 0.7),
        ink: n.ink,
        live: c.live,
        font: c.font,
        alpha: c.alpha,
      };
    };

    // The drawing surface follows the box (the layer calls resize(), also when it is maximized),
    // in device pixels.
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = box.clientWidth;
      height = box.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const layout = () => {
      if (!width || !ink) return;
      const [from, to] = span();
      const x = d3.scaleTime().domain([from, to]).range([28, width - 28]);
      const base = height * 0.74;
      shown = beats.filter((b) => b.at >= from && (laneFilter === 'all' || b.lane === laneFilter));
      const maxWeight = Math.max(1, ...shown.map((b) => b.weight));
      // One lane per repository (or commit type, or category), the busiest on top: orbs float above
      // the trace.
      const counts = d3.rollup(shown, (v) => d3.sum(v, (b) => b.weight), (b) => b.lane);
      const keys = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
      const category = new Map(shown.map((b) => [b.lane, b.category]));
      lanes = keys.map((key, i) => ({
        key,
        category: category.get(key),
        y: 52 + (keys.length === 1 ? 0.5 : i / (keys.length - 1)) * (base - 100),
        // [r, g, b], parsed once per layout: a frame only adds the alpha (colour.css).
        colour: colour.parse(ink.ramp(keys.length === 1 ? 0.5 : i / (keys.length - 1))),
      }));
      const lane = new Map(lanes.map((l) => [l.key, l]));
      points = shown.map((b) => {
        const share = Math.sqrt(b.weight / maxWeight);
        return { b, px: x(b.at), base, oy: lane.get(b.lane).y, amp: (0.25 + 0.75 * share) * height * 0.16, r: 2.5 + 3.5 * share, colour: lane.get(b.lane).colour };
      }).sort((a, b) => a.px - b.px);
      points.x = x;
      // The trace and its colour, sampled every 2 px once per layout, not once per frame.
      const mid = colour.parse(ink.ramp(0.5));
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

    // The sweep's pace: one pass in seven seconds at 1×; a pace the visitor sets, not an animation.
    const SWEEP_MS = 7000;
    const tint = (rgb, a) => colour.css(rgb, a);

    const draw = (time = performance.now()) => {
      if (!width || !ink || !points.x) return;
      const m = motion();
      g.clearRect(0, 0, width, height);
      const base = height * 0.74;
      const sweep = playing ? phase * (width + 120) - 60 : width;
      // The entrance, once: the orbs grow in from left to right.
      const grown = (p) => (m.enter ? Math.min(1, Math.max(0, (time - start - (p.px / Math.max(1, width)) * m.maxDelay) / m.enter)) : 1);

      // Time ticks along the bottom.
      g.font = `11px ${ink.font}`;
      g.fillStyle = ink.faint;
      g.textAlign = 'center';
      const [from, to] = points.x.domain();
      const range = to - from;
      for (const tick of points.x.ticks(Math.max(2, Math.floor(width / 140)))) {
        const px = points.x(tick);
        g.fillRect(px, base + 16, 1, 4);
        // Hours within days, days within months, months within years, years beyond.
        const label = range > 2 * 31536000000 ? year : range > 120 * DAY ? month : tick.getHours() || tick.getMinutes() ? clock : day;
        g.fillText(label.format(tick), px, base + 32);
      }
      // Lanes: a faint rule per lane, its name at the left edge when there is room (the right edge
      // is now, where activity is densest); a name with a page is a link.
      const labelled = lanes.length === 1 || (base - 100) / Math.max(1, lanes.length - 1) >= 13;
      g.textAlign = 'left';
      laneLabels = [];
      for (const l of lanes) {
        g.fillStyle = tint(l.colour, 0.1);
        g.fillRect(16, l.y, width - 32, 1);
        if (labelled && width > 480) {
          const on = hoveredLane === l;
          g.fillStyle = tint(l.colour, on ? 1 : 0.75);
          g.fillText(l.key, 16, l.y - 4);
          const w = g.measureText(l.key).width;
          if (on) g.fillRect(16, l.y - 2, w, 1);
          if (laneUrl(l)) laneLabels.push({ l, x: 12, y: l.y - 17, w: w + 8, h: 16 });
        }
      }
      g.textAlign = 'center';

      // The trace, glowing, brighter just behind the sweep (phosphor afterglow).
      g.save();
      g.globalCompositeOperation = 'lighter';
      const glowAt = (px) => (playing ? Math.max(0.25, 1 - Math.max(0, sweep - px) / (width * 0.9)) * (px > sweep ? 0.25 : 1) : 0.8);
      for (const [lineWidth, a] of [[6, 0.08], [2.5, 0.25], [1.2, 0.9]]) {
        g.lineWidth = lineWidth;
        for (let i = 1; i < trace.length; i += 1) {
          const { px, y, c } = trace[i];
          g.strokeStyle = tint(c, a * glowAt(px));
          g.beginPath();
          g.moveTo(trace[i - 1].px, trace[i - 1].y);
          g.lineTo(px, y);
          g.stroke();
        }
      }
      // The beam.
      if (playing && sweep > 0 && sweep < width) {
        const beam = g.createLinearGradient(sweep - 40, 0, sweep + 4, 0);
        beam.addColorStop(0, ink.alpha(ink.ink, 0));
        beam.addColorStop(1, ink.alpha(ink.ink, 0.1));
        g.fillStyle = beam;
        g.fillRect(sweep - 40, 8, 44, height - 16);
      }
      g.restore();
      // The replay: a beat the beam crosses rings, in the order the beats happened.
      if (playing && m.enter) {
        for (const p of points) if (p.px > lastSweep && p.px <= sweep) born.set(p.b.id, time);
      }
      lastSweep = sweep;
      // Orbs: one per beat in its lane, a thread down to its spike; a ringing beat (a fresh live one,
      // or one the beam just crossed) sends out a ring.
      const ring = m.enter * 2;
      for (const p of points) {
        const y = p.oy;
        const lit = hovered === p ? 1.6 : 1;
        const beatPulse = playing ? 0.85 + 0.15 * Math.sin(time / 500 + unit(p.b.id) * 6.28) : 1;
        const r = p.r * lit * beatPulse * grown(p);
        if (r <= 0) continue;
        // A soft halo per orb while there are few; a dense sky (the work list) keeps it for the hovered.
        if (points.length <= 160 || hovered === p) {
          const halo = g.createRadialGradient(p.px, y, 0, p.px, y, r * 4);
          halo.addColorStop(0, tint(p.colour, hovered === p ? 0.5 : 0.22));
          halo.addColorStop(1, tint(p.colour, 0));
          g.fillStyle = halo;
          g.beginPath();
          g.arc(p.px, y, r * 4, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = tint(p.colour, 0.95);
        g.beginPath();
        g.arc(p.px, y, r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = tint(p.colour, hovered === p ? 0.6 : 0.12);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(p.px, y + r);
        g.lineTo(p.px, p.base - p.amp);
        g.stroke();
        const since = born.get(p.b.id);
        if (since && ring) {
          const age = (time - since) / ring;
          if (age < 1) {
            g.strokeStyle = ink.alpha(ink.ink, 0.6 * (1 - age));
            g.beginPath();
            g.arc(p.px, y, r + age * 40, 0, Math.PI * 2);
            g.stroke();
          } else born.delete(p.b.id);
        }
      }
      if (!points.length) {
        g.font = `12px ${ink.font}`;
        g.fillStyle = ink.text;
        g.fillText(t('js_pulse_quiet'), width / 2, height * 0.42);
      }

      // Status, top left: live with the time of the last check, or the snapshot.
      g.textAlign = 'left';
      g.font = `600 11px ${ink.font}`;
      const dot = live ? (playing ? 0.6 + 0.4 * Math.sin(time / 300) : 1) : 0.5;
      g.fillStyle = live ? ink.alpha(ink.live, dot) : ink.faint;
      g.beginPath();
      g.arc(16, 18, 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ink.text;
      const status = live ? `${t('js_live').toUpperCase()} · ${clock.format(checked)}` : t('js_snapshot').toUpperCase();
      g.fillText(`${status} · ${points.length}`, 26, 22);
    };

    const entering = (time) => time - start < motion().maxDelay + motion().enter;
    const loop = (time) => {
      frame = 0;
      const dt = lastTime ? Math.min(100, time - lastTime) : 0;
      lastTime = time;
      if (playing) {
        phase += (dt * speed) / SWEEP_MS;
        if (phase >= 1) {
          phase %= 1;
          lastSweep = -Infinity;
        }
      }
      draw(time);
      if (visible && !destroyed && (playing || entering(time))) frame = requestAnimationFrame(loop);
      else lastTime = 0;
    };
    const kick = () => {
      if (!frame && !destroyed && visible) frame = requestAnimationFrame(loop);
    };
    const redraw = () => {
      if (!frame) draw();
      kick();
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
          }
        }
      } catch {
        // Offline, blocked or rate-limited: the snapshot stays and the status says so.
      }
      if (destroyed) return;
      layout();
      redraw();
    };

    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    const nearest = (event) => {
      const [mx, my] = point(event);
      let best = null;
      let bestD = 24 * 24;
      for (const p of points) {
        // Near the orb, or anywhere on its column down to the trace.
        const inColumn = Math.abs(my - p.oy) < 10 || (my > p.base - p.amp - 4 && my < p.base + 12);
        const d = inColumn ? (p.px - mx) ** 2 : (p.px - mx) ** 2 + (p.oy - my) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      return best;
    };
    const laneAt = (event) => {
      const [x, y] = point(event);
      return laneLabels.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.l ?? null;
    };
    const opens = `<span class="opacity-75">${escape(t('js_click_to_open'))}</span>`;
    const describe = (b) => {
      const count = b.type === 'push' && b.weight > 1 ? ` · ${b.weight}×` : '';
      return `<strong>${escape(byType ? b.lane : b.repo)}</strong> · ${escape(t(`js_pulse_${b.type}`))}${count}<br>`
        + `${b.message ? `${escape(b.message.slice(0, 90))}<br>` : ''}<span class="opacity-75">${escape(ago(b.at))} · ${escape(t('js_click_to_open'))}</span>`;
    };
    const describeLane = (l) => {
      const n = shown.filter((b) => b.lane === l.key).length;
      return `<strong>${escape(l.key)}</strong><br>${escape(t('js_pulse_beats', { n }))}<br>${opens}`;
    };

    const hover = (event) => {
      hoveredLane = laneAt(event);
      hovered = hoveredLane ? null : nearest(event);
      canvas.style.cursor = hovered || hoveredLane ? 'pointer' : 'default';
      if (hoveredLane) tip.show(describeLane(hoveredLane), event);
      else if (hovered) tip.show(describe(hovered.b), event);
      else tip.hide();
    };
    const onMove = (event) => {
      hover(event);
      redraw();
    };
    const onLeave = () => {
      hovered = null;
      hoveredLane = null;
      tip.hide();
      redraw();
    };
    // A click, a tap (the browser sends click after a tap) and a middle click (auxclick) open the
    // beat or the lane under the pointer; go() picks the tab.
    const onClick = (event) => {
      if (event.type === 'auxclick' && event.button !== 1) return;
      hover(event);
      if (hoveredLane) go(laneUrl(hoveredLane), event);
      else if (hovered) go(target(hovered.b), event);
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('auxclick', onClick);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) kick();
    });
    io.observe(box);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisibility);

    paint();
    resize();
    layout();
    draw();
    kick();
    poll();
    timer = setInterval(() => {
      if (visible && document.visibilityState === 'visible') poll();
    }, POLL);

    // Lane options come from the snapshot (a live poll may bring a lane the snapshot lacks; the
    // filter then shows what matches).
    const laneTotals = d3.rollup(snapshot, (v) => v.length, (b) => b.lane);
    const laneOptions = [{ value: 'all', label: t('js_pulse_lanes_all') }].concat(
      [...laneTotals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([key, n]) => ({ value: key, label: t('js_pulse_lane', { name: key, n }) })),
    );

    return {
      // The list twin: what the pulse shows now (live or snapshot, window and lane), newest first.
      items: () => [...shown].sort((a, b) => b.at - a.at)
        .map((b) => ({ label: `${b.repo}: ${b.message || t(`js_pulse_${b.type}`)}`, url: target(b), note: ago(b.at) })),
      controls: () => [
        {
          key: 'play',
          type: 'play',
          value: !reducedMotion(),
          set(on) {
            playing = Boolean(on);
            lastSweep = playing ? phase * (width + 120) - 60 : -Infinity;
            redraw();
          },
        },
        {
          key: 'window', type: 'range', label: t('js_pulse_window'), min: 0, max: ALL, step: 1, value: ALL,
          format: (v) => windowLabel(Number(v)),
          set(v) {
            windowIndex = Math.min(ALL, Math.max(0, Math.round(Number(v))));
            hovered = null;
            layout();
            redraw();
          },
        },
        {
          key: 'lane', type: 'select', label: t('js_pulse_lane_filter'), options: laneOptions, value: 'all',
          set(v) {
            laneFilter = laneOptions.some((o) => o.value === v) ? v : 'all';
            hovered = null;
            layout();
            redraw();
          },
        },
        {
          key: 'speed', type: 'range', label: t('js_pulse_speed'), min: 0.25, max: 4, step: 0.25, value: 1,
          format: (v) => `${Number(v).toLocaleString(locale)}×`,
          set(v) { speed = Number(v); },
        },
      ],
      resize() {
        resize();
        layout();
        draw();
      },
      update() {
        paint();
        layout();
        draw();
      },
      destroy() {
        destroyed = true;
        clearInterval(timer);
        cancelAnimationFrame(frame);
        io.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('click', onClick);
        canvas.removeEventListener('auxclick', onClick);
        tip.remove();
        canvas.remove();
      },
    };
  },
});
