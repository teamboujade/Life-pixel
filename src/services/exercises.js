// Machines à états biomécaniques (sections 8, 14, 15, 16).
// Chaque validateur reçoit les keypoints (coordonnées en pixels) et renvoie
// { count, feedback, valid, angle }.
import { calculateAngle } from '../utils/geometry';

const MIN_SCORE = 0.5;

/** Choisit le côté (gauche/droite) le plus visible pour une chaîne d'articulations. */
export function pickSide(keypoints, joints) {
  const get = (name) => keypoints.find((k) => k.name === name);
  const sideScore = (side) =>
    joints.reduce((acc, j) => acc + (get(`${side}_${j}`)?.score ?? 0), 0);
  const side = sideScore('left') >= sideScore('right') ? 'left' : 'right';
  const points = joints.map((j) => get(`${side}_${j}`));
  if (points.some((p) => !p || p.score < MIN_SCORE)) return null;
  return points;
}

export class PushUpValidator {
  constructor() {
    this.state = 'UP';
    this.count = 0;
  }

  update(elbowAngle, bodyAlignmentAngle) {
    if (bodyAlignmentAngle < 155) {
      return { count: this.count, feedback: 'Gardez le dos bien droit !', valid: false };
    }
    if (this.state === 'UP' && elbowAngle < 85) {
      this.state = 'DOWN';
      return { count: this.count, feedback: 'Descente validée, remontez !', valid: true };
    }
    if (this.state === 'DOWN' && elbowAngle > 160) {
      this.state = 'UP';
      this.count += 1;
      return { count: this.count, feedback: 'Pompe validée (+1) !', valid: true };
    }
    return {
      count: this.count,
      feedback: this.state === 'UP' ? 'Descendez, bras fléchis' : 'Poussez, tendez les bras',
      valid: true,
    };
  }

  process(keypoints) {
    const arm = pickSide(keypoints, ['shoulder', 'elbow', 'wrist']);
    const body = pickSide(keypoints, ['shoulder', 'hip', 'ankle']);
    if (!arm || !body) return null;
    const elbow = calculateAngle(...arm);
    return { ...this.update(elbow, calculateAngle(...body)), angle: elbow };
  }
}

export class SquatValidator {
  constructor() {
    this.state = 'STANDING';
    this.count = 0;
  }

  update(kneeAngle) {
    if (this.state === 'STANDING' && kneeAngle < 95) {
      this.state = 'SQUATTING';
      return { count: this.count, feedback: 'Flexion parfaite, poussez sur les talons !', valid: true };
    }
    if (this.state === 'SQUATTING' && kneeAngle > 165) {
      this.state = 'STANDING';
      this.count += 1;
      return { count: this.count, feedback: 'Squat validé (+1) !', valid: true };
    }
    if (this.state === 'SQUATTING') {
      return { count: this.count, feedback: 'Remontez jusqu’en position debout', valid: true };
    }
    return { count: this.count, feedback: 'Descendez plus bas', valid: false };
  }

  process(keypoints) {
    const leg = pickSide(keypoints, ['hip', 'knee', 'ankle']);
    if (!leg) return null;
    const knee = calculateAngle(...leg);
    return { ...this.update(knee), angle: knee };
  }
}

export class SitUpValidator {
  constructor() {
    this.state = 'LYING';
    this.count = 0;
  }

  update(hipAngle) {
    if (this.state === 'LYING' && hipAngle < 55) {
      this.state = 'CRUNCHED';
      return { count: this.count, feedback: 'Contraction validée, redescendez !', valid: true };
    }
    if (this.state === 'CRUNCHED' && hipAngle > 130) {
      this.state = 'LYING';
      this.count += 1;
      return { count: this.count, feedback: 'Abdo validé (+1) !', valid: true };
    }
    if (this.state === 'CRUNCHED') {
      return { count: this.count, feedback: 'Redescendez, dos au sol', valid: true };
    }
    return { count: this.count, feedback: 'Relevez le buste', valid: false };
  }

  process(keypoints) {
    const trunk = pickSide(keypoints, ['shoulder', 'hip', 'knee']);
    if (!trunk) return null;
    const hip = calculateAngle(...trunk);
    return { ...this.update(hip), angle: hip };
  }
}

/**
 * Gainage : le chronomètre ne tourne que si l'alignement épaule-hanche-cheville
 * est ≥ 170° (l'angle calculé est borné à 180°). `count` = secondes tenues.
 */
export class PlankValidator {
  constructor() {
    this.count = 0;
    this.heldMs = 0;
    this.lastTs = null;
  }

  update(alignmentAngle, now = Date.now()) {
    const aligned = alignmentAngle >= 170;
    if (aligned && this.lastTs != null) {
      // On plafonne le delta pour ignorer les trous dans le flux vidéo.
      this.heldMs += Math.min(now - this.lastTs, 1000);
    }
    this.lastTs = aligned ? now : null;
    this.count = Math.floor(this.heldMs / 1000);
    return aligned
      ? { count: this.count, feedback: 'Alignement parfait, tenez !', valid: true }
      : { count: this.count, feedback: alignmentAngle < 170 ? 'Alignez épaules, hanches et chevilles' : '', valid: false };
  }

  process(keypoints, now) {
    const body = pickSide(keypoints, ['shoulder', 'hip', 'ankle']);
    if (!body) {
      this.lastTs = null;
      return null;
    }
    const angle = calculateAngle(...body);
    return { ...this.update(angle, now), angle };
  }
}

export const EXERCISES = {
  pompes: {
    label: 'Pompes',
    unit: 'répétitions',
    tip: 'Placez le téléphone au sol, de profil, corps entier visible.',
    create: () => new PushUpValidator(),
  },
  squats: {
    label: 'Squats',
    unit: 'répétitions',
    tip: 'Placez-vous de profil, à 2–3 m, jambes entièrement visibles.',
    create: () => new SquatValidator(),
  },
  abdos: {
    label: 'Abdos',
    unit: 'répétitions',
    tip: 'Allongez-vous de profil par rapport à la caméra, genoux pliés.',
    create: () => new SitUpValidator(),
  },
  gainage: {
    label: 'Gainage',
    unit: 'secondes',
    tip: 'Planche de profil, téléphone au sol à 2 m.',
    create: () => new PlankValidator(),
  },
};
