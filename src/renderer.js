// Rendu Canvas 2D : anneaux, balle, particules, compteur et final visualiseur.

const PALETTE = ['#ff3fa4', '#c04dff', '#7a4dff', '#ff4fd8', '#ff8a2a', '#ffb52e', '#ff5f6d'];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const PALETTE_RGB = PALETTE.map(hexToRgb);

/** Couleur d'un anneau : dégradé cyclique rose → violet → orange. */
export function ringColor(i, period = 34) {
  const x = (i / period) % PALETTE_RGB.length;
  const a = PALETTE_RGB[Math.floor(x)];
  const b = PALETTE_RGB[(Math.floor(x) + 1) % PALETTE_RGB.length];
  const f = x - Math.floor(x);
  const s = f * f * (3 - 2 * f);
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * s));
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.trail = [];
    this.title = '';
    this.freq = null;
    this.wave = null;
    this.pulse = 0;
    this.shake = 0;
  }

  reset(sim) {
    this.sim = sim;
    this.canvas.width = sim.cfg.width;
    this.canvas.height = sim.cfg.height;
    // couleur selon le rayon → bandes rose / violet / orange visibles quelle que soit la densité
    this.colors = sim.rings.map((r) => ringColor(r.radius / 2.2));
    // anneaux décoratifs (non physiques) pour remplir tout l'écran
    const c = sim.cfg;
    const maxR = Math.hypot(c.width / 2, c.height / 2) + 20;
    const step = Math.max(sim.spacing || 3, 2.6);
    const base = sim.rings[0].gapOffset;
    this.decor = [];
    for (let r = c.outerRadius + step; r < maxR; r += step) {
      const idx = (r - c.innerRadius) / (sim.spacing || step);
      this.decor.push({ radius: r, gapOffset: base + idx * c.twist, color: ringColor(r / 2.2) });
    }
    this.particles = [];
    this.trail = [];
    this.pulse = 0;
    this.finaleStart = null;
  }

  onEvents(events) {
    const sim = this.sim;
    for (const e of events) {
      if (e.type === 'pass') {
        const [r, g, b] = this.colors[e.ring];
        const n = 14;
        for (let k = 0; k < n; k++) {
          const a = e.angle + (Math.random() - 0.5) * 0.9;
          const sp = 120 + Math.random() * 420;
          this.particles.push({
            x: sim.cx + Math.cos(e.angle) * e.radius,
            y: sim.cy + Math.sin(e.angle) * e.radius,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 0.5 + Math.random() * 0.5,
            age: 0,
            size: 2 + Math.random() * 3.5,
            color: `${r},${g},${b}`,
          });
        }
        this.pulse = Math.min(1, this.pulse + 0.35);
      } else if (e.type === 'bounce') {
        this.shake = Math.min(1, this.shake + 0.25);
      } else if (e.type === 'finish') {
        this.finaleStart = e.time;
        for (let k = 0; k < 160; k++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 200 + Math.random() * 900;
          this.particles.push({
            x: sim.ball.x, y: sim.ball.y,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 0.8 + Math.random() * 0.8, age: 0, size: 2 + Math.random() * 4,
            color: this.colors[k % this.colors.length].join(','),
          });
        }
      }
    }
  }

  setAudioData(freq, wave, level) {
    this.freq = freq;
    this.wave = wave;
    this.level = level;
  }

  draw(dt, open) {
    const { ctx, sim } = this;
    const { width: W, height: H } = sim.cfg;
    const level = this.level || 0;
    this.pulse = Math.max(0, this.pulse - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 5);

    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // halo de fond
    const glow = ctx.createRadialGradient(sim.cx, sim.cy, 0, sim.cx, sim.cy, H * 0.6);
    glow.addColorStop(0, `rgba(120,40,160,${0.10 + 0.25 * this.pulse})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    const sx = (Math.random() - 0.5) * 6 * this.shake;
    const sy = (Math.random() - 0.5) * 6 * this.shake;
    ctx.translate(sx, sy);

    this.drawDecor(level, open);
    if (!sim.finished) this.drawRings(level, open);
    else this.drawFinale(dt);

    this.drawParticles(dt);
    this.drawBall();
    this.drawTexts();
    ctx.restore();
  }

  drawDecor(level, open) {
    const { ctx, sim } = this;
    const c = sim.cfg;
    let alpha = 0.5 + 0.3 * Math.min(1, level * 2.2) + (open ? 0.1 : 0);
    if (sim.finished) alpha *= Math.max(0, 1 - (sim.time - (this.finaleStart ?? sim.time)) / 1.2);
    if (alpha <= 0.01) return;
    const half = c.gapAngle / 2;
    const rot = c.rotationSpeed * sim.time;
    ctx.lineWidth = Math.max(1, Math.max(sim.spacing || 3, 2.6) * 0.62);
    for (const d of this.decor) {
      const g = d.gapOffset + rot;
      const [r, gr, b] = d.color;
      ctx.strokeStyle = `rgba(${r},${gr},${b},${alpha})`;
      ctx.beginPath();
      ctx.arc(sim.cx, sim.cy, d.radius, g + half, g - half + Math.PI * 2);
      ctx.stroke();
    }
  }

  drawRings(level, open) {
    const { ctx, sim } = this;
    const c = sim.cfg;
    const half = c.gapAngle / 2;
    const lw = Math.max(1, sim.spacing * 0.62);
    const bright = 0.62 + 0.38 * Math.min(1, level * 2.2) + (open ? 0.12 : 0);
    ctx.lineWidth = lw;
    ctx.lineCap = 'butt';
    for (let i = sim.rings.length - 1; i >= sim.current; i--) {
      const ring = sim.rings[i];
      const g = sim.gapCenter(i);
      const [r, gr, b] = this.colors[i];
      const f = ring.flash;
      const mix = (v) => Math.round(v + (255 - v) * f * 0.85);
      const fade = i === sim.current ? 1 : Math.max(0.55, 1 - (i - sim.current) / 900);
      ctx.strokeStyle = `rgba(${mix(r)},${mix(gr)},${mix(b)},${Math.min(1, bright * fade)})`;
      ctx.beginPath();
      ctx.arc(sim.cx, sim.cy, ring.radius, g + half, g - half + Math.PI * 2);
      ctx.stroke();
    }
    // liseré lumineux de l'anneau intérieur
    const inner = sim.rings[sim.current];
    if (inner) {
      const g = sim.gapCenter(sim.current);
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,0.9)';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sim.cx, sim.cy, inner.radius, g + half, g - half + Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawFinale(dt) {
    const { ctx, sim } = this;
    const freq = this.freq;
    const t = sim.time - (this.finaleStart ?? sim.time);
    const appear = Math.min(1, t / 1.2);
    const R = 190;
    if (freq) {
      const bars = 120;
      const usable = Math.floor(freq.length * 0.7);
      ctx.lineCap = 'round';
      ctx.lineWidth = 7;
      for (let k = 0; k < bars; k++) {
        const m = k < bars / 2 ? k : bars - 1 - k; // symétrie
        const idx = Math.floor((m / (bars / 2)) * usable * 0.6);
        const v = freq[idx] / 255;
        const len = (20 + v * v * 330) * appear;
        const a = (k / bars) * Math.PI * 2 - Math.PI / 2;
        const [r, g, b] = ringColor(k * 3);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.95)`;
        ctx.beginPath();
        ctx.moveTo(sim.cx + Math.cos(a) * (R + 12), sim.cy + Math.sin(a) * (R + 12));
        ctx.lineTo(sim.cx + Math.cos(a) * (R + 12 + len), sim.cy + Math.sin(a) * (R + 12 + len));
        ctx.stroke();
      }
    }
    // cercle ondulé (forme d'onde)
    ctx.save();
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * appear})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const N = 180;
    for (let k = 0; k <= N; k++) {
      const a = (k / N) * Math.PI * 2;
      const w = this.wave ? (this.wave[Math.floor((k % N) / N * this.wave.length)] - 128) / 128 : 0;
      const rr = R + w * 40 * appear;
      const x = sim.cx + Math.cos(a) * rr;
      const y = sim.cy + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawParticles(dt) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const alive = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vx *= 1 - dt * 2.5;
      p.vy *= 1 - dt * 2.5;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = 1 - p.age / p.life;
      ctx.fillStyle = `rgba(${p.color},${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
      alive.push(p);
    }
    this.particles = alive.length > 2500 ? alive.slice(-2500) : alive;
    ctx.restore();
  }

  drawBall() {
    const { ctx, sim } = this;
    const b = sim.ball;
    const r = sim.cfg.ballRadius * (sim.finished ? 1.6 : 1);
    this.trail.push({ x: b.x, y: b.y });
    if (this.trail.length > 14) this.trail.shift();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.trail.forEach((p, i) => {
      const a = (i / this.trail.length) * 0.35;
      ctx.fillStyle = `rgba(255,190,60,${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * (0.4 + 0.6 * i / this.trail.length), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    ctx.save();
    ctx.shadowColor = 'rgba(255,190,40,1)';
    ctx.shadowBlur = 40;
    const g = ctx.createRadialGradient(b.x - r * 0.3, b.y - r * 0.3, r * 0.1, b.x, b.y, r);
    g.addColorStop(0, '#fffbe0');
    g.addColorStop(0.45, '#ffd23f');
    g.addColorStop(1, '#e08a00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawTexts() {
    const { ctx, sim } = this;
    const W = sim.cfg.width;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 12;
    if (!sim.finished) {
      ctx.font = '800 96px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(String(sim.remaining), sim.cx, sim.cy);
    }
    if (this.title) {
      ctx.font = '700 64px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      wrapText(ctx, this.title, W / 2, 260, W - 140, 76);
    }
    ctx.restore();
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}
