import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEnergy, findHighlight, planSegment } from '../src/analysis.js';

// morceau synthétique : intro calme, couplet moyen, drop fort à 40 s
function song(sr = 8000) {
  const total = 70;
  const x = new Float32Array(total * sr);
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const amp = t < 15 ? 0.08 : t < 40 ? 0.22 : 0.7;
    const kick = t >= 40 ? Math.sin(2 * Math.PI * 55 * t) * Math.exp(-((t % 0.5) * 12)) : 0;
    x[i] = amp * (0.5 * rnd() + 0.5 * Math.sin(2 * Math.PI * 440 * t)) + 0.6 * kick;
  }
  return { x, sr };
}

test('détecte le drop du morceau', () => {
  const { x, sr } = song();
  const h = findHighlight(analyzeEnergy([x], sr));
  assert.ok(Math.abs(h.time - 40) < 0.6, `drop détecté à ${h.time}`);
});

test('planSegment place le drop avant la fin avec la durée demandée', () => {
  assert.deepEqual(planSegment(200, 90, { videoDuration: 60, climax: 15 }), { start: 45, duration: 60, dropAt: 45 });
  const early = planSegment(200, 20, { videoDuration: 60, climax: 15 });
  assert.equal(early.start, 0);
  assert.equal(early.dropAt, 20);
  const late = planSegment(100, 95, { videoDuration: 60, climax: 15 });
  assert.equal(late.start + late.duration, 100);
});
