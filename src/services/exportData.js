// Exportation des données (section 20) : JSON complet ou CSV à plat.

export function exportUserDataToJson(storeState) {
  const { workouts, runs, readingSessions, totals, readingSpeedPagesPerMin } = storeState;
  const backup = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    data: { totals, readingSpeedPagesPerMin, workouts, runs, readingSessions },
  };
  return JSON.stringify(backup, null, 2);
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Une ligne par session : date, catégorie, détail, quantité, durée (s), distance (km). */
export function toCsv({ workouts = [], runs = [], readingSessions = [] }) {
  const rows = [['date', 'categorie', 'detail', 'quantite', 'duree_sec', 'distance_km']];
  workouts.forEach((w) => rows.push([w.date, 'sport', w.type, w.reps, w.durationSec, '']));
  runs.forEach((r) => rows.push([r.date, 'course', 'pas', r.steps, r.durationSec, r.km.toFixed(3)]));
  readingSessions.forEach((s) =>
    rows.push([s.date, 'lecture', s.title, s.pagesRead, s.activeSeconds, '']),
  );
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}
