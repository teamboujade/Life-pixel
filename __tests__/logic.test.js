import {
  calculateAngle,
  smoothKeypoints,
  calculateHaversineDistance,
  formatDuration,
  formatPace,
} from '../src/utils/geometry';
import {
  PushUpValidator,
  SquatValidator,
  SitUpValidator,
  PlankValidator,
  pickSide,
} from '../src/services/exercises';
import { paginateText, estimateReadingMinutes } from '../src/services/reading';
import { toCsv } from '../src/services/exportData';

describe('géométrie', () => {
  test('angle droit et angle plat', () => {
    expect(calculateAngle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90);
    expect(calculateAngle({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(180);
  });

  test('angle toujours entre 0 et 180', () => {
    const a = calculateAngle({ x: 1, y: -1 }, { x: 0, y: 0 }, { x: 1, y: 1 });
    expect(a).toBeCloseTo(90);
  });

  test('lissage exponentiel', () => {
    const prev = [{ x: 0, y: 0, score: 0.9 }];
    const curr = [{ x: 10, y: 10, score: 0.9 }];
    expect(smoothKeypoints(prev, curr, 0.5)[0]).toMatchObject({ x: 5, y: 5 });
    expect(smoothKeypoints([], curr)).toBe(curr);
    // point peu fiable : pas de lissage
    expect(smoothKeypoints(prev, [{ x: 10, y: 10, score: 0.1 }], 0.5)[0].x).toBe(10);
  });

  test('Haversine Paris → Lyon ≈ 392 km', () => {
    expect(calculateHaversineDistance(48.8566, 2.3522, 45.764, 4.8357)).toBeCloseTo(392, -1);
  });

  test('formatage', () => {
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatPace(330, 1)).toBe(`5'30"`);
    expect(formatPace(100, 0)).toBe('–');
  });
});

describe('machines à états', () => {
  test('pompes : une répétition complète', () => {
    const v = new PushUpValidator();
    v.update(170, 175);
    v.update(80, 175);
    expect(v.update(165, 175)).toMatchObject({ count: 1, valid: true });
  });

  test('pompes : dos cassé => pas de comptage', () => {
    const v = new PushUpValidator();
    expect(v.update(80, 140).valid).toBe(false);
    expect(v.state).toBe('UP');
    v.update(165, 175);
    expect(v.count).toBe(0);
  });

  test('squats et abdos', () => {
    const s = new SquatValidator();
    s.update(90);
    expect(s.update(170).count).toBe(1);
    const a = new SitUpValidator();
    a.update(50);
    expect(a.update(135).count).toBe(1);
  });

  test('demi-mouvement non compté', () => {
    const s = new SquatValidator();
    s.update(120);
    s.update(170);
    expect(s.count).toBe(0);
  });

  test('gainage : chronomètre seulement si aligné', () => {
    const p = new PlankValidator();
    p.update(175, 0);
    p.update(175, 1000);
    p.update(175, 2000);
    p.update(150, 3000); // cassé
    p.update(175, 10000);
    expect(p.update(175, 11000).count).toBe(3);
  });

  test('pickSide prend le côté le plus visible', () => {
    const kp = [
      { name: 'left_hip', x: 0, y: 0, score: 0.2 },
      { name: 'left_knee', x: 0, y: 1, score: 0.2 },
      { name: 'left_ankle', x: 0, y: 2, score: 0.2 },
      { name: 'right_hip', x: 1, y: 0, score: 0.9 },
      { name: 'right_knee', x: 1, y: 1, score: 0.9 },
      { name: 'right_ankle', x: 1, y: 2, score: 0.9 },
    ];
    expect(pickSide(kp, ['hip', 'knee', 'ankle'])[0].x).toBe(1);
  });
});

describe('lecture et export', () => {
  test('pagination du texte', () => {
    const text = Array.from({ length: 50 }, (_, i) => `Paragraphe ${i} `.repeat(20)).join('\n\n');
    const pages = paginateText(text, 1000);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join('\n\n').replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
    pages.forEach((p) => expect(p.length).toBeLessThanOrEqual(1400));
  });

  test('estimation du temps de lecture', () => {
    expect(estimateReadingMinutes(30, 1)).toBe(30);
    expect(estimateReadingMinutes(30, 2)).toBe(15);
    expect(estimateReadingMinutes(1, 5)).toBe(1);
  });

  test('CSV', () => {
    const csv = toCsv({
      workouts: [{ date: '2026-01-01', type: 'pompes', reps: 10, durationSec: 60 }],
      runs: [],
      readingSessions: [{ date: '2026-01-02', title: 'Le "Livre", 1', pagesRead: 3, activeSeconds: 120 }],
    });
    expect(csv).toContain('2026-01-01,sport,pompes,10,60');
    expect(csv).toContain('"Le ""Livre"", 1"');
  });
});

describe('bibliothèque', () => {
  const { searchClassics, searchFreeBooks } = require('../src/services/bookFinder');
  test('recherche dans les classiques sans accents', () => {
    expect(searchClassics('verne')).toHaveLength(3);
    expect(searchClassics('miserables')[0].author).toBe('Victor Hugo');
    expect(searchClassics('')).toHaveLength(10);
  });
  test('repli sur les classiques si Gutendex échoue', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    const res = await searchFreeBooks('dumas', 'fr');
    expect(res.offline).toBe(true);
    expect(res.books).toHaveLength(2);
  });
});
