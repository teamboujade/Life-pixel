// Chorégraphie : une ou plusieurs balles rebondissent dans UN cercle fermé.
// Les trajectoires sont calculées à l'avance pour que chaque note du morceau
// tombe EXACTEMENT sur un rebond. Mutations possibles à chaque rebond :
// la balle grossit, se dédouble, change de couleur.

export const DEFAULTS = Object.freeze({
  width: 1080,
  height: 1920,
  radius: 470,          // rayon intérieur du cercle
  ballRadius: 20,
  gravity: 1400,
  speed: 1300,          // vitesse visée (px/s)
  grow: 0,              // px gagnés par rebond (0 = désactivé)
  maxBallRadius: 170,
  splitEvery: 0,        // une balle se dédouble tous les N rebonds (0 = jamais)
  maxBalls: 32,
  colorChange: true,    // la balle change de couleur à chaque rebond
  seed: 1,
});

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Regroupe les notes simultanées (accords) en un seul rebond. */
export function groupNotes(notes, { merge = 0.045, start = 1, tempo = 1, maxDuration = Infinity } = {}) {
  const sorted = [...notes].sort((a, b) => a.time - b.time);
  if (!sorted.length) return [];
  const first = sorted[0].time;
  const events = [];
  for (const n of sorted) {
    const time = (n.time - first) / tempo + start;
    if (time > maxDuration) break;
    const note = { ...n, time, duration: n.duration / tempo };
    const last = events[events.length - 1];
    if (last && time - last.time < merge) last.notes.push(note);
    else events.push({ time, notes: [note] });
  }
  return events;
}

const G_LEVELS = [1, 0.55, 0.25, 0];
const G_PENALTY = [0, 0.35, 0.7, 1.1];
const MIN_DT = 0.03;

export class Choreography {
  constructor(events, options = {}) {
    this.cfg = { ...DEFAULTS, ...options };
    this.notes = events;
    this.rand = mulberry32(this.cfg.seed);
    this.cx = this.cfg.width / 2;
    this.cy = this.cfg.height / 2;
    this.lastTime = events.length ? events[events.length - 1].time : 0;
    this.endTime = this.lastTime + 3;
    this.plan();
    this.time = 0;
    this.cursor = 0; // prochain événement de la timeline
    this.played = 0;
    this.finished = false;
    this.finishTime = null;
    this.lastHitTime = -Infinity;
    this.out = [];
  }

  get remaining() {
    return this.notes.length - this.played;
  }

  newBall(P, vin, t, r, hue) {
    const b = { id: this.balls.length, P, vin, lastT: t, born: t, r, hue, hits: 0, segments: [] };
    this.balls.push(b);
    return b;
  }

  plan() {
    const c = this.cfg;
    this.balls = [];
    this.timeline = []; // { time, type: 'hit'|'spawn', ball, angle, notes?, r, hue }
    this.newBall({ x: this.cx, y: this.cy }, null, 0, c.ballRadius, 0);
    const N = this.notes.length;
    for (let i = 0; i < N; i++) {
      const t = this.notes[i].time;
      // la balle libre depuis le plus longtemps prend la note
      let b = this.balls[0];
      for (const x of this.balls) if (x.lastT < b.lastT) b = x;
      this.flyTo(b, t, this.notes[i].notes);
      this.mutate(b, t);
    }
    // les balles qui ont fini avant les autres font des rebonds silencieux
    for (const b of this.balls) {
      while (this.lastTime - b.lastT > 0.6) this.flyTo(b, b.lastT + 0.45 + this.rand() * 0.2, null);
      if (this.lastTime - b.lastT > MIN_DT) this.flyTo(b, this.lastTime, null);
    }
    this.timeline.sort((a, b) => a.time - b.time || (a.type === 'spawn') - (b.type === 'spawn'));
  }

  /** Calcule l'arc de la balle b jusqu'à un point du cercle à l'instant t1. */
  flyTo(b, t1, notes) {
    const c = this.cfg;
    const P = b.P;
    const dt = Math.max(MIN_DT, t1 - b.lastT);
    const Rc = c.radius - b.r;
    const vin = b.vin;
    let best = null;
    const K = 72;
    for (let k = 0; k < K; k++) {
      const ang = ((k + this.rand()) / K) * Math.PI * 2;
      const Q = { x: this.cx + Math.cos(ang) * Rc, y: this.cy + Math.sin(ang) * Rc };
      for (let gl = 0; gl < G_LEVELS.length; gl++) {
        const g = c.gravity * G_LEVELS[gl];
        const vx = (Q.x - P.x) / dt;
        const vy = (Q.y - P.y - 0.5 * g * dt * dt) / dt;
        if (!this.insideArc(P, vx, vy, g, dt, Rc)) continue;
        const speed = Math.hypot(vx, vy) || 1e-6;
        let score = 2.5 * Math.abs(Math.log(speed / (c.speed * Math.max(0.35, Rc / (c.radius - c.ballRadius))))) + G_PENALTY[gl];
        if (vin) {
          const d = Math.hypot(P.x - this.cx, P.y - this.cy) || 1;
          const nx = (P.x - this.cx) / d;
          const ny = (P.y - this.cy) / d;
          const vn = vin.x * nx + vin.y * ny;
          const rx = vin.x - 2 * vn * nx;
          const ry = vin.y - 2 * vn * ny;
          const cos = (rx * vx + ry * vy) / ((Math.hypot(rx, ry) || 1) * speed);
          score += 2.2 * Math.acos(Math.max(-1, Math.min(1, cos)));
        } else {
          score += 0.4 * Math.abs(angleDiff(ang, Math.PI / 2));
        }
        if (!best || score < best.score) best = { score, Q, vx, vy, g, ang };
        break;
      }
    }
    if (!best) {
      const pa = Math.atan2(P.y - this.cy, P.x - this.cx) + Math.PI;
      const Q = { x: this.cx + Math.cos(pa) * Rc, y: this.cy + Math.sin(pa) * Rc };
      best = { Q, vx: (Q.x - P.x) / dt, vy: (Q.y - P.y) / dt, g: 0, ang: pa };
    }
    const t0 = t1 - dt;
    b.segments.push({ t0, t1, x0: P.x, y0: P.y, vx: best.vx, vy: best.vy, g: best.g, r: b.r, hue: b.hue });
    b.vin = { x: best.vx, y: best.vy + best.g * dt };
    b.P = best.Q;
    b.lastT = t1;
    b.lastAng = best.ang;
    this.timeline.push({ time: t1, type: 'hit', ball: b.id, angle: best.ang, notes, r: b.r, hue: b.hue });
  }

  mutate(b, t) {
    const c = this.cfg;
    b.hits++;
    if (c.colorChange) b.hue = (b.hue + 1) % 12;
    if (c.grow > 0 && b.r < c.maxBallRadius) {
      b.r = Math.min(c.maxBallRadius, b.r + c.grow);
      // la balle gonfle vers l'intérieur : on recule son centre
      const Rc = c.radius - b.r;
      b.P = { x: this.cx + Math.cos(b.lastAng) * Rc, y: this.cy + Math.sin(b.lastAng) * Rc };
    }
    if (c.splitEvery > 0 && b.hits % c.splitEvery === 0 && this.balls.length < c.maxBalls) {
      // la copie part en miroir (composante tangentielle inversée)
      const nx = Math.cos(b.lastAng);
      const ny = Math.sin(b.lastAng);
      const vn = b.vin.x * nx + b.vin.y * ny;
      const tx = b.vin.x - vn * nx;
      const ty = b.vin.y - vn * ny;
      const vin = { x: vn * nx - tx, y: vn * ny - ty };
      const clone = this.newBall({ ...b.P }, vin, t, b.r, (b.hue + 6) % 12);
      clone.lastAng = b.lastAng;
      this.timeline.push({ time: t, type: 'spawn', ball: clone.id, parent: b.id, angle: b.lastAng, r: b.r, hue: clone.hue });
    }
  }

  insideArc(P, vx, vy, g, dt, Rc) {
    const S = Math.max(14, Math.ceil(dt * 60)); // plus de points pour les longs arcs
    const lim = (Rc + 0.25) * (Rc + 0.25);
    for (let s = 1; s < S; s++) {
      const t = (s / S) * dt;
      const x = P.x + vx * t - this.cx;
      const y = P.y + vy * t + 0.5 * g * t * t - this.cy;
      if (x * x + y * y > lim) return false;
    }
    return true;
  }

  /** État d'une balle à l'instant t : position, rayon, teinte (null si pas encore née). */
  ballAt(b, t) {
    if (t < b.born) return null;
    const segs = b.segments;
    if (!segs.length) return { x: b.P.x, y: b.P.y, r: b.r, hue: b.hue };
    if (t >= segs[segs.length - 1].t1) {
      const s = segs[segs.length - 1];
      return { x: b.P.x, y: b.P.y, r: b.r, hue: b.hue, end: true, last: s };
    }
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].t1 < t) lo = mid + 1;
      else hi = mid;
    }
    const s = segs[lo];
    const tau = Math.max(0, t - s.t0);
    return { x: s.x0 + s.vx * tau, y: s.y0 + s.vy * tau + 0.5 * s.g * tau * tau, r: s.r, hue: s.hue };
  }

  advanceTo(t) {
    const dt = Math.max(0, t - this.time);
    this.time = t;
    while (this.cursor < this.timeline.length && this.timeline[this.cursor].time <= t) {
      const e = this.timeline[this.cursor++];
      if (e.type === 'hit' && e.notes) {
        this.played++;
        this.lastHitTime = e.time;
      }
      this.out.push(e);
    }
    if (!this.finished && t >= this.lastTime && this.played >= this.notes.length) {
      this.finished = true;
      this.finishTime = t;
      this.out.push({ type: 'finish', time: t });
    }
    // positions courantes
    const k = 1 - Math.exp(-dt * 3);
    this.state = this.balls.map((b) => {
      const s = this.ballAt(b, t);
      if (!s) return null;
      if (this.finished) {
        const prev = this.state?.[b.id] || s;
        return { ...s, x: prev.x + (this.cx - prev.x) * k, y: prev.y + (this.cy - prev.y) * k };
      }
      return s;
    });
  }

  drainEvents() {
    const e = this.out;
    this.out = [];
    return e;
  }
}
