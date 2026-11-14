// Hero background (p5.js): a seeded field of glyphs, each drawn from segments of a 3x3 lattice,
// lit by a slow noise wave. Decorative only (aria-hidden); the same seed draws the same field.
// Pauses off-screen and in a hidden tab; draws one still frame under prefers-reduced-motion.
KorczisHub.viz('glyphs', {
  lib: 'p5',
  // Declared static (rule project.viz-ergonomics): the decorative hero behind the page header,
  // aria-hidden and pointer-events: none; there is nothing to maximize or drive.
  static: 'decorative hero background, aria-hidden',
  mount(box, _source, { palette, reducedMotion }) {
    const CELL = 30;
    const FPS = 20;
    const seed = [...(box.dataset.seed || 'korczis')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    // The 12 edges of a 3x3 lattice and its 4 diagonals of the corner squares: a glyph alphabet.
    const LATTICE = [
      [0, 0, 1, 0], [1, 0, 2, 0], [0, 1, 1, 1], [1, 1, 2, 1], [0, 2, 1, 2], [1, 2, 2, 2],
      [0, 0, 0, 1], [0, 1, 0, 2], [1, 0, 1, 1], [1, 1, 1, 2], [2, 0, 2, 1], [2, 1, 2, 2],
      [0, 0, 1, 1], [1, 1, 2, 2], [2, 0, 1, 1], [1, 1, 0, 2],
    ];
    let colours = palette();
    let visible = true;
    let instance = null;
    // p5 2.x starts asynchronously: until setup has run there is no renderer, and p.clear() throws.
    // A resize or a theme change before that waits for setup, which draws the current state anyway.
    let ready = false;

    const sketch = (p) => {
      let glyphs = [];
      let t = 0;

      function layout() {
        p.randomSeed(seed);
        p.noiseSeed(seed);
        glyphs = [];
        const cols = Math.ceil(p.width / CELL) + 1;
        const rows = Math.ceil(p.height / CELL) + 1;
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            const strokes = 2 + Math.floor(p.random(3));
            const segments = [];
            for (let i = 0; i < strokes; i += 1) segments.push(LATTICE[Math.floor(p.random(LATTICE.length))]);
            glyphs.push({ x: col * CELL, y: row * CELL, segments });
          }
        }
      }

      function frame() {
        p.clear();
        const ink = p.color(colours.primary);
        const unit = CELL / 3.2;
        for (const glyph of glyphs) {
          const wave = p.noise(glyph.x * 0.004, glyph.y * 0.006, t);
          const level = p.constrain((wave - 0.42) * 3.2, 0, 1);
          if (level <= 0.02) continue;
          ink.setAlpha(level * (colours.dark ? 190 : 165));
          p.stroke(ink);
          for (const [x1, y1, x2, y2] of glyph.segments) {
            p.line(glyph.x + x1 * unit, glyph.y + y1 * unit, glyph.x + x2 * unit, glyph.y + y2 * unit);
          }
        }
      }

      p.setup = () => {
        p.createCanvas(box.clientWidth, box.clientHeight);
        p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
        p.frameRate(FPS);
        p.strokeWeight(1.25);
        p.strokeCap(p.ROUND);
        p.noFill();
        layout();
        frame();
        if (reducedMotion()) p.noLoop();
        ready = true;
        // Right after setup p5 sets touch-action: none on every canvas in the document, not only its
        // own; a simulator's canvas that already exists (a ?viz= deep link) would stop scrolling the
        // page under a finger. Put back what the others had, once p5 is done with them.
        const others = [...document.getElementsByTagName('canvas')].filter((c) => !box.contains(c)).map((c) => [c, c.style.touchAction]);
        setTimeout(() => others.forEach(([c, value]) => { c.style.touchAction = value; }), 0);
      };

      p.draw = () => {
        if (!visible) return;
        t += 0.006;
        frame();
      };

      p.redrawStill = () => {
        if (!ready) return;
        layout();
        frame();
      };
    };

    instance = new p5(sketch, box);


    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && !document.hidden;
    });
    seen.observe(box);
    document.addEventListener('visibilitychange', () => {
      visible = !document.hidden;
    });

    return {
      update() {
        colours = palette();
        instance?.redrawStill();
      },
      // The layer observes the box and calls this when its size changes.
      resize() {
        if (!ready || !instance || !box.clientWidth) return;
        instance.resizeCanvas(box.clientWidth, box.clientHeight);
        instance.redrawStill();
      },
      destroy() {
        seen.disconnect();
        instance?.remove();
      },
    };
  },
});
