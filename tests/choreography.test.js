import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Choreography, groupNotes } from '../src/choreography.js';
import { DEMO_SONGS } from '../src/songs.js';

const notes = DEMO_SONGS[0].tracks[0].notes;

test('groupNotes regroupe les accords et décale le début', () => {
  const ev = groupNotes([
    { time: 2, duration: 1, pitch: 60, velocity: 90 },
    { time: 2.01, duration: 1, pitch: 64, velocity: 90 },
    { time: 3, duration: 1, pitch: 67, velocity: 90 },
  ], { start: 1 });
  assert.equal(ev.length, 2);
  assert.equal(ev[0].time, 1);
  assert.equal(ev[0].notes.length, 2);
  assert.equal(ev[1].time, 2);
});

test('groupNotes applique la vitesse et la durée max', () => {
  assert.ok(groupNotes(notes, { tempo: 2, maxDuration: 5 }).every((e) => e.time <= 5));
  const a = groupNotes(notes, { tempo: 1 })[5].time - 1;
  const b = groupNotes(notes, { tempo: 2 })[5].time - 1;
  assert.ok(Math.abs(a / 2 - b) < 1e-9);
});

const configs = {
  simple: {},
  grossit: { grow: 3, maxBallRadius: 120 },
  dedouble: { splitEvery: 2, maxBalls: 16 },
  tout: { grow: 2, splitEvery: 3, maxBalls: 24 },
};

for (const [name, opts] of Object.entries(configs)) {
  test(`${name} : chaque note tombe pile sur un rebond contre le cercle, sans sortir`, () => {
    const events = groupNotes(notes);
    const ch = new Choreography(events, opts);
    const R = ch.cfg.radius;
    const hits = ch.timeline.filter((e) => e.type === 'hit' && e.notes);
    assert.equal(hits.length, events.length);
    hits.forEach((h, i) => assert.ok(Math.abs(h.time - events[i].time) < 1e-9, `note ${i} décalée`));
    for (const b of ch.balls) {
      for (const s of b.segments) {
        // au contact, la balle touche le cercle
        const tau = s.t1 - s.t0;
        const x = s.x0 + s.vx * tau - ch.cx;
        const y = s.y0 + s.vy * tau + 0.5 * s.g * tau * tau - ch.cy;
        assert.ok(Math.abs(Math.hypot(x, y) + s.r - R) < 0.5, 'contact hors du cercle');
        // et ne sort jamais entre deux contacts
        for (let k = 1; k < 20; k++) {
          const t = (k / 20) * tau;
          const d = Math.hypot(s.x0 + s.vx * t - ch.cx, s.y0 + s.vy * t + 0.5 * s.g * t * t - ch.cy);
          assert.ok(d + s.r <= R + 1, `balle ${b.id} sort du cercle`);
        }
      }
    }
    if (opts.splitEvery) {
      assert.ok(ch.balls.length > 1 && ch.balls.length <= opts.maxBalls);
    }
    if (opts.grow) {
      assert.ok(ch.balls[0].r > ch.cfg.ballRadius && ch.balls[0].r <= ch.cfg.maxBallRadius);
    }
  });
}

test('advanceTo joue toutes les notes puis la fin', () => {
  const events = groupNotes(notes);
  const ch = new Choreography(events, { splitEvery: 2 });
  let played = 0;
  let finished = 0;
  for (let t = 0; t <= ch.endTime; t += 1 / 60) {
    ch.advanceTo(t);
    for (const e of ch.drainEvents()) {
      if (e.type === 'hit' && e.notes) played++;
      if (e.type === 'finish') finished++;
    }
  }
  assert.equal(played, events.length);
  assert.equal(finished, 1);
  assert.equal(ch.remaining, 0);
});
