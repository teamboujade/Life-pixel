// Chorégraphie : la trajectoire de la balle est calculée à l'avance pour
// qu'elle touche un anneau EXACTEMENT à l'instant de chaque note.
// Chaque contact joue la note (ou l'accord) et casse l'anneau touché ;
// la balle continue alors jusqu'à l'anneau suivant, un peu plus grand.

export const DEFAULTS = Object.freeze({
  width: 1080,
  height: 1920,
  innerRadius: 120,
  outerRadius: 520,
  gapAngle: 0.6,       // ouverture décorative des anneaux (rad)
  rotationSpeed: 1.1,  // rotation des ouvertures (rad/s)
  twist: 0.02,
  ballRadius: 14,
  gravity: 1400,       // px/s²
  speed: 1300,         // vitesse visée de la balle (px/s)
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

/**
 * Regroupe les notes en « coups » : les notes qui démarrent presque en même
 * temps (accords) sont jouées par un seul rebond.
 */
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

export class Choreography {
  constructor(events, options = {}) {
    this.cfg = { ...DEFAULTS, ...options };
    const c = this.cfg;
    this.events_ = events;
    this.times = events.map((e) => e.time);
    const N = events.length;
    this.rand = mulberry32(c.seed);
    this.cx = c.width / 2;
    this.cy = c.height / 2;
    this.spacing = N > 1 ? (c.outerRadius - c.innerRadius) / (N - 1) : 0;
    const base = this.rand() * Math.PI * 2;
    this.rings = events.map((_, i) => ({
      radius: c.innerRadius + i * this.spacing,
      gapOffset: base + i * c.twist,
      alive: true,
      flash: 0,
    }));
    this.lastTime = N ? this.times[N - 1] : 0;
    this.endTime = this.lastTime + 3;
    this.current = 0;
    this.time = 0;
    this.finished = false;
    this.finishTime = null;
    this.lastPassTime = -Infinity;
    this.events = [];
    this.ball = { x: this.cx, y: this.cy };
    this.plan();
  }

  get remaining() {
    return this.rings.length - this.current;
  }

  gapCenter(i, t = this.time) {
    return this.rings[i].gapOffset + this.cfg.rotationSpeed * t;
  }

  /** Calcule un arc balistique par note, de contact en contact. */
  plan() {
    const c = this.cfg;
    const N = this.rings.length;
    this.segments = [];
    let P = { x: this.cx, y: this.cy };
    let vin = null;
    let t0 = 0;
    let prevSign = 1;
    for (let i = 0; i < N; i++) {
      const t1 = this.times[i];
      const dt = Math.max(0.02, t1 - t0);
      const R = this.rings[i].radius;
      const Rc = R - c.ballRadius;
      const gap = this.gapCenter(i, t1);
      const gapHalf = c.gapAngle / 2 + c.ballRadius / R + 0.05;
      const pAng = Math.atan2(P.y - this.cy, P.x - this.cx);
      let best = null;
      const K = 72;
      for (let k = 0; k < K; k++) {
        const ang = (k / K) * Math.PI * 2 + this.rand() * (Math.PI * 2 / K);
        if (Math.abs(angleDiff(ang, gap)) < gapHalf) continue; // on ne tape pas dans le vide
        const Q = { x: this.cx + Math.cos(ang) * Rc, y: this.cy + Math.sin(ang) * Rc };
        for (let gl = 0; gl < G_LEVELS.length; gl++) {
          const g = c.gravity * G_LEVELS[gl];
          const vx = (Q.x - P.x) / dt;
          const vy = (Q.y - P.y - 0.5 * g * dt * dt) / dt;
          if (!this.insideArc(P, vx, vy, g, dt, Rc)) continue;
          const speed = Math.hypot(vx, vy) || 1e-6;
          let score = 2.5 * Math.abs(Math.log(speed / c.speed)) + G_PENALTY[gl];
          if (vin) {
            // rebond crédible : la sortie doit ressembler au reflet de l'entrée
            const d = Math.hypot(P.x - this.cx, P.y - this.cy) || 1;
            const nx = (P.x - this.cx) / d;
            const ny = (P.y - this.cy) / d;
            const vn = vin.x * nx + vin.y * ny;
            const rx = vin.x - 2 * vn * nx;
            const ry = vin.y - 2 * vn * ny;
            const cos = (rx * vx + ry * vy) / ((Math.hypot(rx, ry) || 1) * speed);
            score += 2.2 * Math.acos(Math.max(-1, Math.min(1, cos)));
          } else {
            score += 0.4 * Math.abs(angleDiff(ang, Math.PI / 2)); // 1er coup : plutôt vers le bas
          }
          const sign = Math.sign(angleDiff(ang, pAng)) || 1;
          if (sign !== prevSign) score += 0.15;
          if (!best || score < best.score) best = { score, Q, vx, vy, g, sign };
          break; // la gravité la plus forte qui marche suffit
        }
      }
      if (!best) {
        // secours : ligne droite vers le point opposé (toujours dans le disque)
        const ang = pAng + Math.PI;
        const Q = { x: this.cx + Math.cos(ang) * Rc, y: this.cy + Math.sin(ang) * Rc };
        best = { Q, vx: (Q.x - P.x) / dt, vy: (Q.y - P.y) / dt, g: 0, sign: prevSign };
      }
      this.segments.push({ t0, t1, x0: P.x, y0: P.y, vx: best.vx, vy: best.vy, g: best.g });
      vin = { x: best.vx, y: best.vy + best.g * dt };
      P = best.Q;
      prevSign = best.sign;
      t0 = t1;
    }
  }

  insideArc(P, vx, vy, g, dt, Rc) {
    const S = 14;
    const lim = (Rc + 0.5) * (Rc + 0.5);
    for (let s = 1; s < S; s++) {
      const t = (s / S) * dt;
      const x = P.x + vx * t - this.cx;
      const y = P.y + vy * t + 0.5 * g * t * t - this.cy;
      if (x * x + y * y > lim) return false;
    }
    return true;
  }

  positionAt(t) {
    const segs = this.segments;
    if (!segs.length) return { x: this.cx, y: this.cy };
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].t1 < t) lo = mid + 1;
      else hi = mid;
    }
    const s = segs[lo];
    const tau = Math.max(0, Math.min(t, s.t1) - s.t0);
    return { x: s.x0 + s.vx * tau, y: s.y0 + s.vy * tau + 0.5 * s.g * tau * tau };
  }

  advanceTo(t) {
    const dt = Math.max(0, t - this.time);
    this.time = t;
    for (const r of this.rings) if (r.flash > 0) r.flash = Math.max(0, r.flash - dt * 4);
    while (this.current < this.rings.length && this.times[this.current] <= t) {
      const i = this.current;
      const p = this.positionAt(this.times[i]);
      const ring = this.rings[i];
      ring.alive = false;
      this.events.push({
        type: 'pass',
        ring: i,
        angle: Math.atan2(p.y - this.cy, p.x - this.cx),
        radius: ring.radius,
        time: this.times[i],
        notes: this.events_[i].notes,
      });
      this.lastPassTime = this.times[i];
      this.current++;
    }
    if (!this.finished && this.current >= this.rings.length && t >= this.lastTime) {
      this.finished = true;
      this.finishTime = t;
      this.events.push({ type: 'finish', time: t });
    }
    if (this.finished) {
      const k = 1 - Math.exp(-dt * 3);
      this.ball.x += (this.cx - this.ball.x) * k;
      this.ball.y += (this.cy - this.ball.y) * k;
    } else {
      const p = this.positionAt(t);
      this.ball.x = p.x;
      this.ball.y = p.y;
    }
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
