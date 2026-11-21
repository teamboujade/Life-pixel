// Moteur physique déterministe : une balle rebondit à l'intérieur d'anneaux
// concentriques. Chaque anneau possède une ouverture (arc manquant) qui tourne.
// Quand la balle franchit l'ouverture de l'anneau le plus intérieur, l'anneau
// est détruit et la balle se retrouve dans l'anneau suivant.

export const DEFAULTS = Object.freeze({
  width: 1080,
  height: 1920,
  rings: 200,          // nombre d'anneaux
  innerRadius: 130,    // rayon du premier anneau (px)
  outerRadius: 520,    // rayon du dernier anneau (px)
  gapAngle: 0.75,      // largeur angulaire de l'ouverture (radians)
  rotationSpeed: 1.1,  // vitesse de rotation des ouvertures (rad/s)
  twist: 0.02,         // décalage d'ouverture entre deux anneaux voisins (rad)
  ballRadius: 15,
  gravity: 1500,       // px/s²
  minBounceSpeed: 820, // vitesse minimale après un rebond (px/s)
  maxSpeed: 1900,
  jitter: 0.08,        // perturbation aléatoire à chaque rebond (rad)
  seed: 1,
});

export const STEP = 1 / 240; // pas de temps fixe

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

export class Simulation {
  constructor(options = {}) {
    this.cfg = { ...DEFAULTS, ...options };
    const c = this.cfg;
    this.rand = mulberry32(c.seed);
    this.cx = c.width / 2;
    this.cy = c.height / 2;
    const spacing = c.rings > 1 ? (c.outerRadius - c.innerRadius) / (c.rings - 1) : 0;
    const base = this.rand() * Math.PI * 2;
    this.rings = Array.from({ length: c.rings }, (_, i) => ({
      radius: c.innerRadius + i * spacing,
      gapOffset: base + i * c.twist,
      alive: true,
      flash: 0,
    }));
    this.spacing = spacing;
    this.current = 0; // index du plus petit anneau encore présent
    const dir = this.rand() * Math.PI * 2;
    const v0 = c.minBounceSpeed * 0.8;
    this.ball = { x: this.cx, y: this.cy, vx: Math.cos(dir) * v0, vy: Math.sin(dir) * v0 };
    this.time = 0;
    this.finished = false;
    this.finishTime = null;
    this.lastPassTime = -Infinity;
    this.events = [];
  }

  get remaining() {
    return this.cfg.rings - this.current;
  }

  gapCenter(i, t = this.time) {
    return this.rings[i].gapOffset + this.cfg.rotationSpeed * t;
  }

  step(dt = STEP) {
    const c = this.cfg;
    const b = this.ball;
    this.time += dt;
    for (const r of this.rings) if (r.flash > 0) r.flash = Math.max(0, r.flash - dt * 4);

    if (this.finished) {
      // la balle revient doucement au centre pour le final
      const k = 1 - Math.exp(-dt * 3);
      b.x += (this.cx - b.x) * k;
      b.y += (this.cy - b.y) * k;
      b.vx = b.vy = 0;
      return;
    }

    b.vy += c.gravity * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    while (this.current < c.rings) {
      const ring = this.rings[this.current];
      const R = ring.radius;
      const dx = b.x - this.cx;
      const dy = b.y - this.cy;
      const d = Math.hypot(dx, dy) || 1e-9;
      if (d + c.ballRadius <= R) break; // entièrement à l'intérieur

      const ang = Math.atan2(dy, dx);
      const diff = Math.abs(angleDiff(ang, this.gapCenter(this.current)));
      const fits = diff <= c.gapAngle / 2 - (c.ballRadius / R) * 0.8;

      if (fits || d >= R) {
        if (d >= R) {
          // anneau franchi → détruit
          ring.alive = false;
          this.events.push({ type: 'pass', ring: this.current, angle: ang, radius: R, time: this.time });
          this.lastPassTime = this.time;
          this.current++;
          continue;
        }
        break; // en train de traverser l'ouverture
      }

      // rebond sur la paroi
      const nx = dx / d;
      const ny = dy / d;
      const vn = b.vx * nx + b.vy * ny;
      if (vn > 0) {
        b.vx -= 2 * vn * nx;
        b.vy -= 2 * vn * ny;
        const j = (this.rand() - 0.5) * 2 * c.jitter;
        const cos = Math.cos(j);
        const sin = Math.sin(j);
        const vx = b.vx * cos - b.vy * sin;
        b.vy = b.vx * sin + b.vy * cos;
        b.vx = vx;
        let s = Math.hypot(b.vx, b.vy);
        const target = Math.min(c.maxSpeed, Math.max(s, c.minBounceSpeed));
        if (s > 0) {
          b.vx *= target / s;
          b.vy *= target / s;
        }
        ring.flash = 1;
        this.events.push({ type: 'bounce', ring: this.current, angle: ang, time: this.time });
      }
      const inside = R - c.ballRadius;
      b.x = this.cx + nx * inside;
      b.y = this.cy + ny * inside;
      break;
    }

    if (this.current >= c.rings) {
      this.finished = true;
      this.finishTime = this.time;
      this.events.push({ type: 'finish', time: this.time });
    }
  }

  /** Termine la partie immédiatement (filet de sécurité pour tomber pile sur le moment fort). */
  forceFinish() {
    if (this.finished) return;
    for (let i = this.current; i < this.rings.length; i++) {
      this.rings[i].alive = false;
      this.events.push({ type: 'pass', ring: i, angle: Math.atan2(this.ball.y - this.cy, this.ball.x - this.cx), radius: this.rings[i].radius, time: this.time });
    }
    this.current = this.rings.length;
    this.lastPassTime = this.time;
    this.finished = true;
    this.finishTime = this.time;
    this.events.push({ type: 'finish', time: this.time });
  }

  /** Avance jusqu'au temps t (en secondes) par pas fixes. */
  advanceTo(t) {
    while (this.time + STEP <= t) this.step(STEP);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}

/** Simule sans affichage et renvoie le temps de fin (ou null). */
export function finishTime(options, maxTime) {
  const sim = new Simulation(options);
  const steps = Math.ceil(maxTime / STEP);
  for (let i = 0; i < steps && !sim.finished; i++) {
    sim.step(STEP);
    if (sim.events.length > 64) sim.events.length = 0;
  }
  return sim.finished ? sim.finishTime : null;
}

/**
 * Cherche un nombre d'anneaux et une graine pour que la balle détruise le
 * dernier anneau juste avant `targetTime` (laisse place au final).
 */
export function calibrate(options, targetTime, { minRings = 6, maxRings = 700, tolerance = 0.6, budgetMs = 5000 } = {}) {
  const start = Date.now();
  const base = { ...DEFAULTS, ...options };
  let best = { rings: base.rings, seed: base.seed, finish: null, error: Infinity };
  let lo = minRings;
  let hi = maxRings;
  let seed = base.seed;
  const rand = mulberry32(base.seed * 31 + 7);
  // recherche dichotomique approximative sur le nombre d'anneaux, puis
  // essais de graines voisines pour affiner
  for (let iter = 0; iter < 60 && Date.now() - start < budgetMs; iter++) {
    const rings = iter < 12 ? Math.round((lo + hi) / 2) : Math.max(minRings, Math.min(maxRings, best.rings + Math.round((rand() - 0.5) * 16)));
    if (iter >= 12) seed = (base.seed + iter * 7919) >>> 0;
    const f = finishTime({ ...base, rings, seed }, targetTime);
    if (f === null) {
      hi = rings; // trop d'anneaux
      continue;
    }
    const error = targetTime - f;
    if (error < best.error) best = { rings, seed, finish: f, error };
    if (iter < 12) lo = rings;
    if (best.error <= tolerance) break;
  }
  return best;
}
