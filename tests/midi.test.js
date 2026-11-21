import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMidi } from '../src/midi.js';

function vlq(n) {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

function midiFile() {
  const ppq = 480;
  const t0 = [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20, ...vlq(0), 0xff, 0x2f, 0]; // 500000 µs → 120 bpm
  const ev = [
    ...vlq(0), 0xff, 0x03, 4, ...Buffer.from('Lead'),
    ...vlq(0), 0x90, 60, 100,
    ...vlq(480), 0x80, 60, 0,
    ...vlq(0), 0x90, 64, 80, // running status ci-dessous
    ...vlq(240), 64, 0,
    ...vlq(0), 0xff, 0x2f, 0,
  ];
  const chunk = (id, data) => [...Buffer.from(id), (data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255, ...data];
  const bytes = [...chunk('MThd', [0, 1, 0, 2, ppq >> 8, ppq & 255]), ...chunk('MTrk', t0), ...chunk('MTrk', ev)];
  return new Uint8Array(bytes).buffer;
}

test('parseMidi lit les notes, le tempo et le running status', () => {
  const m = parseMidi(midiFile());
  assert.equal(m.tracks.length, 1);
  const [a, b] = m.tracks[0].notes;
  assert.equal(m.tracks[0].name, 'Lead');
  assert.deepEqual([a.pitch, a.time, a.duration], [60, 0, 0.5]);
  assert.deepEqual([b.pitch, b.time, b.duration, b.velocity], [64, 0.5, 0.25, 80]);
});
