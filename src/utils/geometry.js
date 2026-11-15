// Calculs mathématiques purs : angles articulaires, lissage, distance GPS.

/** Angle (en degrés, 0–180) au sommet b formé par les points a-b-c. */
export function calculateAngle(a, b, c) {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180) / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

/**
 * Lissage exponentiel des keypoints (section 13) pour éviter les tremblements.
 * Les points peu fiables (score < 0.4) ne sont pas lissés.
 */
export function smoothKeypoints(previousKeypoints, currentKeypoints, alpha = 0.65) {
  if (!previousKeypoints || previousKeypoints.length === 0) return currentKeypoints;
  return currentKeypoints.map((curr, idx) => {
    const prev = previousKeypoints[idx];
    if (!prev || curr.score < 0.4) return curr;
    return {
      ...curr,
      x: alpha * curr.x + (1 - alpha) * prev.x,
      y: alpha * curr.y + (1 - alpha) * prev.y,
    };
  });
}

/** Distance en km entre deux coordonnées GPS (formule de Haversine, section 17). */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Formate des secondes en mm:ss ou h:mm:ss. */
export function formatDuration(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Allure en min/km sous forme « 5'32" », ou « – » si inconnue. */
export function formatPace(durationSec, km) {
  if (!km || km < 0.01) return '–';
  const secPerKm = durationSec / km;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}
