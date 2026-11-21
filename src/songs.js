// Morceau de démonstration (domaine public) : Beethoven, « Lettre à Élise »,
// thème principal joué deux fois. Unité = une double-croche.

const U = 0.16; // durée d'une double-croche (s)

// [début en doubles-croches, note MIDI, durée en doubles-croches]
const THEME = [
  [0, 76, 1], [1, 75, 1],
  [2, 76, 1], [3, 75, 1], [4, 76, 1], [5, 71, 1], [6, 74, 1], [7, 72, 1],
  [8, 69, 2], [8, 45, 1], [9, 52, 1], [10, 57, 1], [11, 60, 1], [12, 64, 1], [13, 69, 1],
  [14, 71, 2], [14, 40, 1], [15, 52, 1], [16, 56, 1], [17, 64, 1], [18, 68, 1], [19, 71, 1],
  [20, 72, 2], [20, 45, 1], [21, 52, 1], [22, 57, 1], [23, 64, 1], [24, 76, 1], [25, 75, 1],
  [26, 76, 1], [27, 75, 1], [28, 76, 1], [29, 71, 1], [30, 74, 1], [31, 72, 1],
  [32, 69, 2], [32, 45, 1], [33, 52, 1], [34, 57, 1], [35, 60, 1], [36, 64, 1], [37, 69, 1],
  [38, 71, 2], [38, 40, 1], [39, 52, 1], [40, 56, 1], [41, 64, 1], [42, 72, 1], [43, 71, 1],
  [44, 69, 4], [44, 45, 1], [45, 52, 1], [46, 57, 3],
];

function build() {
  const notes = [];
  for (const rep of [0, 48]) {
    for (const [u, pitch, d] of THEME) {
      notes.push({ time: (u + rep) * U, duration: d * U, pitch, velocity: pitch < 60 ? 70 : 96, channel: 0 });
    }
  }
  return notes.sort((x, y) => x.time - y.time);
}

export const DEMO_SONGS = [
  { id: 'elise', title: 'Lettre à Élise — Beethoven', tracks: [{ name: 'Piano', notes: build() }] },
];
