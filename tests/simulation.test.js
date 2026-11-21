import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, calibrate, finishTime, angleDiff } from '../src/simulation.js';

test('angleDiff reste dans [-π, π]', () => {
  assert.ok(Math.abs(angleDiff(0.1, 2 * Math.PI) - 0.1) < 1e-9);
  assert.ok(Math.abs(angleDiff(-3, 3) - (2 * Math.PI - 6)) < 1e-9);
});

test('la simulation est déterministe pour une même graine', () => {
  assert.equal(finishTime({ rings: 60, seed: 4 }, 300), finishTime({ rings: 60, seed: 4 }, 300));
});

test('la balle reste dans l’anneau intérieur sauf en traversant une ouverture', () => {
  const sim = new Simulation({ rings: 80, seed: 2 });
  let passes = 0;
  while (!sim.finished && sim.time < 300) {
    sim.step();
    for (const e of sim.drainEvents()) if (e.type === 'pass') passes++;
    const ring = sim.rings[sim.current];
    if (!ring) break;
    const d = Math.hypot(sim.ball.x - sim.cx, sim.ball.y - sim.cy);
    assert.ok(d < ring.radius + 1e-6, `balle hors de l’anneau à t=${sim.time}`);
  }
  assert.ok(sim.finished, 'tous les anneaux doivent finir par être détruits');
  assert.equal(passes, 80);
  assert.equal(sim.remaining, 0);
});

test('la calibration termine juste avant la durée cible', () => {
  for (const target of [25, 55, 120]) {
    const best = calibrate({}, target);
    assert.ok(best.finish !== null && best.finish <= target, `cible ${target}`);
    assert.ok(target - best.finish < 6, `écart trop grand pour ${target}: ${target - best.finish}`);
    assert.equal(finishTime({ rings: best.rings, seed: best.seed }, target + 1), best.finish);
  }
});
