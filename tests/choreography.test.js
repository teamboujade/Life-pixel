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
  const ev = groupNotes(notes, { tempo: 2, maxDuration: 5 });
  assert.ok(ev.every((e) => e.time <= 5));
  const ev1 = groupNotes(notes, { tempo: 1 });
  assert.ok(Math.abs((ev1[5].time - 1) / 2 - (groupNotes(notes, { tempo: 2 })[5].time - 1)) < 1e-9);
});

test('la balle touche chaque anneau pile au moment de sa note, sans sortir', () => {
  const events = groupNotes(notes);
  const ch = new Choreography(events);
  const br = ch.cfg.ballRadius;
  events.forEach((e, i) => {
    const p = ch.positionAt(e.time);
    const d = Math.hypot(p.x - ch.cx, p.y - ch.cy);
    assert.ok(Math.abs(d - (ch.rings[i].radius - br)) < 0.5, `contact ${i} : d=${d}`);
  });
  for (let t = 0; t < ch.lastTime; t += 0.004) {
    const i = ch.times.findIndex((x) => x >= t);
    const p = ch.positionAt(t);
    const d = Math.hypot(p.x - ch.cx, p.y - ch.cy);
    assert.ok(d <= ch.rings[i].radius - br + 1, `sortie à t=${t}`);
  }
});

test('advanceTo émet un événement par note puis la fin', () => {
  const events = groupNotes(notes);
  const ch = new Choreography(events);
  let passes = 0;
  let finished = 0;
  for (let t = 0; t <= ch.endTime; t += 1 / 60) {
    ch.advanceTo(t);
    for (const e of ch.drainEvents()) {
      if (e.type === 'pass') passes++;
      if (e.type === 'finish') finished++;
    }
  }
  assert.equal(passes, events.length);
  assert.equal(finished, 1);
  assert.equal(ch.remaining, 0);
});
