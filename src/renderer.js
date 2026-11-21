// Rendu Canvas 2D : un cercle lumineux, les balles, leurs traînées,
// les étincelles à chaque note et le final visualiseur.

const HUES = ['#ff3fa4', '#ff5f6d', '#ff8a2a', '#ffb52e', '#ffe14d', '#8dff6a', '#2ee6c8', '#38b6ff', '#5b6bff', '#9b4dff', '#c04dff', '#ff4fd8'];

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const HUES_RGB = HUES.map(rgb);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.title = '';
    this.level = 0;
  }

  reset(sim) {
    this.sim = sim;
    this.canvas.width = sim.cfg.width;
    this.canvas.height = sim.cfg.height;
    this.particles = [];
    this.trails = new Map();
    this.ripples = [];
    this.pulse = 0;
    this.flash = 0;
    this.shake = 0;
    this.finaleStart = null;
    this.ringHue = 0;
    this.beat = 0;
  }

  onEvents(events) {
    const { sim } = this;
    const R = sim.cfg.radius;
    for (const e of events) {
      if (e.type === 'hit' || e.type === 'spawn') {
        const [r, g, b] = HUES_RGB[e.hue % 12];
        const px = sim.cx + Math.cos(e.angle) * R;
        const py = sim.cy + Math.sin(e.angle) * R;
        const n = e.type === 'spawn' ? 26 : e.notes ? 12 : 4;
        for (let k = 0; k < n; k++) {
          const a = e.angle + Math.PI + (Math.random() - 0.5) * 2.2;
          const sp = 150 + Math.random() * 520;
          this.particles.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.5, age: 0, size: 2 + Math.random() * 3.5, color: `${r},${g},${b}` });
        }
        if (e.notes) {
          this.ripples.push({ angle: e.angle, age: 0, color: `${r},${g},${b}` });
          this.pulse = Math.min(1, this.pulse + 0.3);
          this.ringHue = e.hue;
        }
        if (e.type === 'spawn') this.shake = Math.min(1, this.shake + 0.5);
      } else if (e.type === 'finish') {
        this.finaleStart = e.time;
        this.flash = 0.8;
        for (let k = 0; k < 180; k++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 200 + Math.random() * 900;
          const [r, g, b] = HUES_RGB[k % 12];
          this.particles.push({ x: sim.cx, y: sim.cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.8 + Math.random() * 0.8, age: 0, size: 2 + Math.random() * 4, color: `${r},${g},${b}` });
        }
      }
    }
  }

  setAudioData(freq, wave, level) {
    this.beat = Math.max(this.beat * 0.85, Math.max(0, level - this.level) * 6);
    this.freq = freq;
    this.wave = wave;
    this.level = level;
  }

  draw(dt) {
    const { ctx, sim } = this;
    const { width: W, height: H } = sim.cfg;
    this.pulse = Math.max(0, this.pulse - dt * 2.5);
    this.shake = Math.max(0, this.shake - dt * 4);

    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const [hr, hg, hb] = HUES_RGB[this.ringHue % 12];
    const glow = ctx.createRadialGradient(sim.cx, sim.cy, 0, sim.cx, sim.cy, H * 0.6);
    glow.addColorStop(0, `rgba(${hr},${hg},${hb},${0.06 + 0.2 * this.pulse})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.translate((Math.random() - 0.5) * 10 * this.shake, (Math.random() - 0.5) * 10 * this.shake);

    if (sim.finished) this.drawFinale();
    this.drawRing(dt);
    this.drawParticles(dt);
    this.drawBalls();
    this.drawTexts();
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * this.flash})`;
      ctx.fillRect(0, 0, W, H);
      this.flash = Math.max(0, this.flash - dt * 1.8);
    }
  }

  drawRing(dt) {
    const { ctx, sim } = this;
    const R = sim.cfg.radius;
    let alpha = 1;
    if (sim.finished) alpha = Math.max(0, 1 - (sim.time - this.finaleStart) / 1.2);
    if (alpha <= 0) return;
    // anneau dégradé qui tourne lentement
    const rot = sim.time * 0.4;
    const grad = ctx.createConicGradient ? ctx.createConicGradient(rot, sim.cx, sim.cy) : null;
    if (grad) HUES.forEach((h, i) => grad.addColorStop(i / HUES.length, h)), grad.addColorStop(1, HUES[0]);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = `rgba(255,255,255,${0.5 + this.pulse * 0.5})`;
    ctx.shadowBlur = 20 + 30 * this.pulse;
    ctx.strokeStyle = grad || '#ff3fa4';
    ctx.lineWidth = 10 + 6 * this.pulse;
    ctx.beginPath();
    ctx.arc(sim.cx, sim.cy, R + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // éclats sur le cercle à l'endroit des impacts
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const alive = [];
    for (const rp of this.ripples) {
      rp.age += dt;
      if (rp.age > 0.45) continue;
      const a = 1 - rp.age / 0.45;
      const spread = 0.12 + rp.age * 0.9;
      ctx.strokeStyle = `rgba(${rp.color},${a})`;
      ctx.lineWidth = 16 * a + 4;
      ctx.beginPath();
      ctx.arc(sim.cx, sim.cy, R + 5, rp.angle - spread, rp.angle + spread);
      ctx.stroke();
      alive.push(rp);
    }
    this.ripples = alive.slice(-200);
    ctx.restore();
  }

  drawFinale() {
    const { ctx, sim } = this;
    const t = sim.time - this.finaleStart;
    const appear = Math.min(1, t / 1.2);
    const R = 200;
    if (this.freq) {
      const bars = 120;
      const usable = Math.floor(this.freq.length * 0.42);
      ctx.lineCap = 'round';
      ctx.lineWidth = 7;
      for (let k = 0; k < bars; k++) {
        const m = k < bars / 2 ? k : bars - 1 - k;
        const v = this.freq[Math.floor((m / (bars / 2)) * usable)] / 255;
        const len = (16 + v * v * 380 + this.beat * 60) * appear;
        const a = (k / bars) * Math.PI * 2 - Math.PI / 2;
        const [r, g, b] = HUES_RGB[Math.floor(k / 10) % 12];
        ctx.strokeStyle = `rgba(${r},${g},${b},0.95)`;
        ctx.beginPath();
        ctx.moveTo(sim.cx + Math.cos(a) * R, sim.cy + Math.sin(a) * R);
        ctx.lineTo(sim.cx + Math.cos(a) * (R + len), sim.cy + Math.sin(a) * (R + len));
        ctx.stroke();
      }
    }
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
    this.particles = alive.length > 3000 ? alive.slice(-3000) : alive;
    ctx.restore();
  }

  drawBalls() {
    const { ctx, sim } = this;
    const states = sim.state || [];
    const many = states.filter(Boolean).length > 12;
    states.forEach((s, id) => {
      if (!s) return;
      const [r, g, b] = HUES_RGB[s.hue % 12];
      let trail = this.trails.get(id);
      if (!trail) this.trails.set(id, (trail = []));
      trail.push({ x: s.x, y: s.y, r: s.r });
      if (trail.length > (many ? 6 : 12)) trail.shift();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      trail.forEach((p, i) => {
        const a = (i / trail.length) * 0.3;
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.35 + 0.65 * i / trail.length), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      ctx.save();
      if (!many) {
        ctx.shadowColor = `rgb(${r},${g},${b})`;
        ctx.shadowBlur = 30;
      }
      const grad = ctx.createRadialGradient(s.x - s.r * 0.3, s.y - s.r * 0.35, s.r * 0.1, s.x, s.y, s.r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, `rgb(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)})`);
      grad.addColorStop(1, `rgb(${r >> 1},${g >> 1},${b >> 1})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  drawTexts() {
    const { ctx, sim } = this;
    const W = sim.cfg.width;
    const top = sim.cy - sim.cfg.radius;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 12;
    const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    if (this.title) {
      ctx.font = font(800, 66);
      wrapText(ctx, this.title, W / 2, top - 250, W - 140, 78);
    }
    const balls = (sim.state || []).filter(Boolean).length;
    ctx.font = font(800, 92);
    ctx.fillText(`♪ ${sim.remaining}`, W / 2, top - 100);
    if (sim.cfg.splitEvery > 0 || sim.cfg.grow > 0) {
      ctx.font = font(700, 48);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      const bottom = sim.cy + sim.cfg.radius;
      const info = sim.cfg.splitEvery > 0 ? `${balls} balle${balls > 1 ? 's' : ''}` : `taille ×${((sim.state?.[0]?.r || sim.cfg.ballRadius) / sim.cfg.ballRadius).toFixed(1)}`;
      ctx.fillText(info, W / 2, bottom + 110);
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
