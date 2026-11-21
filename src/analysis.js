// Analyse de la musique : courbe d'énergie et détection du « moment fort »
// (drop / refrain) = l'endroit où l'énergie saute brusquement vers une
// section forte et soutenue.

/**
 * @param {Float32Array[]} channels  échantillons PCM par canal
 * @param {number} sampleRate
 * @param {number} hop  taille d'une fenêtre d'analyse (s)
 */
export function analyzeEnergy(channels, sampleRate, hop = 0.05) {
  const len = channels[0].length;
  const win = Math.max(1, Math.round(sampleRate * hop));
  const frames = Math.floor(len / win);
  const rms = new Float32Array(frames);
  const bass = new Float32Array(frames);
  const a = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate); // passe-bas 150 Hz
  let low = 0;
  const nc = channels.length;
  for (let f = 0; f < frames; f++) {
    let s = 0;
    let sb = 0;
    const start = f * win;
    for (let i = start; i < start + win; i++) {
      let x = 0;
      for (let c = 0; c < nc; c++) x += channels[c][i];
      x /= nc;
      low += a * (x - low);
      s += x * x;
      sb += low * low;
    }
    rms[f] = Math.sqrt(s / win);
    bass[f] = Math.sqrt(sb / win);
  }
  return { hop, rms, bass, duration: len / sampleRate };
}

function percentile(arr, p) {
  const sorted = Array.from(arr).sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] || 1e-9;
}

function movingAverage(arr, n) {
  const out = new Float32Array(arr.length);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= n) sum -= arr[i - n];
    out[i] = sum / Math.min(i + 1, n);
  }
  // recentrage (moyenne glissante centrée)
  const shift = Math.floor(n / 2);
  return out.map((_, i) => out[Math.min(arr.length - 1, i + shift)]);
}

/**
 * Renvoie { time, curve } : `time` = début du moment fort (s), `curve` =
 * énergie normalisée [0..1] par fenêtre (pour l'affichage).
 */
export function findHighlight(analysis, { minTime = 8, after = 8, before = 5 } = {}) {
  const { hop, rms, bass, duration } = analysis;
  const n = rms.length;
  const r95 = percentile(rms, 0.95);
  const b95 = percentile(bass, 0.95);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = Math.min(1.2, 0.55 * (rms[i] / r95) + 0.45 * (bass[i] / b95));
  const curve = movingAverage(raw, Math.max(1, Math.round(0.4 / hop)));

  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + curve[i];
  const mean = (i0, i1) => {
    const a = Math.max(0, i0);
    const b = Math.min(n, i1);
    return b > a ? (prefix[b] - prefix[a]) / (b - a) : 0;
  };

  const A = Math.round(after / hop);
  const B = Math.round(before / hop);
  const first = Math.min(n - 1, Math.round(minTime / hop));
  const last = Math.max(first, n - Math.round(4 / hop));
  let best = first;
  let bestScore = -Infinity;
  for (let i = first; i <= last; i++) {
    const ea = mean(i, i + A);
    const eb = mean(i - B, i);
    const score = ea + 1.6 * Math.max(0, ea - eb);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  // affinage : la plus forte montée d'énergie à ±1,2 s du point trouvé
  const W = Math.round(1.2 / hop);
  const step = Math.max(1, Math.round(0.25 / hop));
  let onset = best;
  let bestRise = -Infinity;
  for (let i = Math.max(step, best - W); i <= Math.min(n - 1 - step, best + W); i++) {
    const rise = mean(i, i + step) - mean(i - step, i);
    if (rise > bestRise) {
      bestRise = rise;
      onset = i;
    }
  }
  return { time: Math.min(duration, onset * hop), score: bestScore, curve, hop };
}

/**
 * Choisit le passage de la musique à utiliser : la balle joue pendant
 * `lead` secondes, puis le moment fort s'entend en entier pendant `climax` s.
 */
export function planSegment(total, drop, { videoDuration = 60, climax = 15 } = {}) {
  const end = Math.min(total, drop + climax);
  const start = Math.max(0, end - videoDuration);
  return { start, duration: end - start, dropAt: drop - start };
}
