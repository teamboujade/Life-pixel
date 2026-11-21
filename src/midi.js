// Lecteur de fichiers MIDI (format 0 et 1) → liste de notes en secondes.

function readVarLen(view, pos) {
  let value = 0;
  let byte;
  do {
    byte = view.getUint8(pos.i++);
    value = (value << 7) | (byte & 0x7f);
  } while (byte & 0x80);
  return value;
}

function readStr(view, at, len) {
  let s = '';
  for (let k = 0; k < len; k++) s += String.fromCharCode(view.getUint8(at + k));
  return s;
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {{ tracks: { name: string, notes: { time:number, duration:number, pitch:number, velocity:number, channel:number }[] }[], duration: number }}
 */
export function parseMidi(buffer) {
  const view = new DataView(buffer);
  if (readStr(view, 0, 4) !== 'MThd') throw new Error('Pas un fichier MIDI');
  const headerLen = view.getUint32(4);
  const ntracks = view.getUint16(10);
  const division = view.getUint16(12);
  let p = 8 + headerLen;

  const tempos = []; // { tick, uspq }
  const rawTracks = [];
  for (let t = 0; t < ntracks && p + 8 <= view.byteLength; t++) {
    const id = readStr(view, p, 4);
    const len = view.getUint32(p + 4);
    const start = p + 8;
    const end = Math.min(view.byteLength, start + len);
    p = end;
    if (id !== 'MTrk') continue;
    const pos = { i: start };
    let tick = 0;
    let status = 0;
    let name = '';
    const open = new Map(); // "canal:hauteur" → [débuts]
    const notes = [];
    while (pos.i < end) {
      tick += readVarLen(view, pos);
      let b = view.getUint8(pos.i);
      if (b & 0x80) {
        status = b;
        pos.i++;
      } else if (!status) break;
      if (status === 0xff) {
        const type = view.getUint8(pos.i++);
        const l = readVarLen(view, pos);
        if (type === 0x51 && l === 3) {
          tempos.push({ tick, uspq: (view.getUint8(pos.i) << 16) | (view.getUint8(pos.i + 1) << 8) | view.getUint8(pos.i + 2) });
        } else if (type === 0x03 && !name) {
          name = readStr(view, pos.i, l);
        }
        pos.i += l;
        if (type === 0x2f) break;
        status = 0;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        pos.i += readVarLen(view, pos);
        status = 0;
        continue;
      }
      const kind = status & 0xf0;
      const ch = status & 0x0f;
      const d1 = view.getUint8(pos.i++);
      const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : view.getUint8(pos.i++);
      const key = `${ch}:${d1}`;
      if (kind === 0x90 && d2 > 0) {
        if (!open.has(key)) open.set(key, []);
        open.get(key).push({ tick, velocity: d2 });
      } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
        const q = open.get(key);
        if (q && q.length) {
          const on = q.shift();
          notes.push({ tick: on.tick, endTick: tick, pitch: d1, velocity: on.velocity, channel: ch });
        }
      }
    }
    for (const [key, q] of open) {
      const [ch, pitch] = key.split(':').map(Number);
      for (const on of q) notes.push({ tick: on.tick, endTick: on.tick + division, pitch, velocity: on.velocity, channel: ch });
    }
    rawTracks.push({ name, notes });
  }

  // conversion ticks → secondes avec la carte des tempos
  let toSeconds;
  if (division & 0x8000) {
    const fps = 256 - (division >> 8);
    const tpf = division & 0xff;
    toSeconds = (tick) => tick / (fps * tpf);
  } else {
    tempos.sort((a, b) => a.tick - b.tick);
    const map = [{ tick: 0, uspq: 500000, sec: 0 }];
    for (const tp of tempos) {
      const prev = map[map.length - 1];
      const sec = prev.sec + ((tp.tick - prev.tick) * prev.uspq) / 1e6 / division;
      if (tp.tick === prev.tick) prev.uspq = tp.uspq;
      else map.push({ tick: tp.tick, uspq: tp.uspq, sec });
    }
    toSeconds = (tick) => {
      let k = map.length - 1;
      while (k > 0 && map[k].tick > tick) k--;
      const m = map[k];
      return m.sec + ((tick - m.tick) * m.uspq) / 1e6 / division;
    };
  }

  let duration = 0;
  const tracks = rawTracks
    .map((tr, idx) => ({
      name: tr.name.trim() || `Piste ${idx + 1}`,
      notes: tr.notes
        .map((n) => {
          const time = toSeconds(n.tick);
          const end = toSeconds(n.endTick);
          duration = Math.max(duration, end);
          return { time, duration: Math.max(0.05, end - time), pitch: n.pitch, velocity: n.velocity, channel: n.channel };
        })
        .sort((a, b) => a.time - b.time || a.pitch - b.pitch),
    }))
    .filter((tr) => tr.notes.length > 0);
  return { tracks, duration };
}
