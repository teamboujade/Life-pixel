import { Choreography, groupNotes } from './choreography.js';
import { Renderer } from './renderer.js';
import { Synth } from './synth.js';
import { VideoRecorder } from './recorder.js';
import { parseMidi } from './midi.js';
import { DEMO_SONGS } from './songs.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const renderer = new Renderer(canvas);
const synth = new Synth();
const LOOKAHEAD = 0.3; // les notes sont programmées 0,3 s à l'avance

let song = null; // { title, tracks }
let running = null;

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const setStatus = (t) => ($('status').textContent = t);

function setBusy(busy) {
  $('preview').disabled = busy || !song;
  $('record').disabled = busy || !song;
  $('stop').disabled = !busy;
}

function selectedNotes() {
  if (!song) return [];
  const boxes = [...document.querySelectorAll('#tracks input')];
  return song.tracks.flatMap((tr, i) => (boxes[i]?.checked ? tr.notes : []));
}

function buildEvents() {
  return groupNotes(selectedNotes(), {
    merge: Number($('merge').value) / 1000,
    tempo: Number($('tempo').value),
    maxDuration: Math.max(5, Number($('maxDuration').value) || 60) - 3,
  });
}

function options() {
  const num = (id) => Number($(id).value);
  return {
    gravity: num('gravity'),
    speed: num('speed'),
    seed: Math.max(1, Math.round(num('seed')) || 1),
    ballRadius: num('ballRadius'),
    grow: $('growOn').checked ? num('grow') : 0,
    maxBallRadius: Math.max(num('maxBallRadius'), num('ballRadius')),
    splitEvery: $('splitOn').checked ? Math.max(1, Math.round(num('splitEvery')) || 1) : 0,
    maxBalls: Math.max(2, Math.min(128, Math.round(num('maxBalls')) || 32)),
    colorChange: $('colorChange').checked,
  };
}

function refresh() {
  if (running) return;
  const events = song ? buildEvents() : groupNotes(DEMO_SONGS[0].tracks[0].notes);
  const ch = new Choreography(events, options());
  ch.advanceTo(0);
  renderer.reset(ch);
  renderer.title = $('title').value;
  renderer.draw(0);
  if (song) {
    const notes = events.reduce((n, e) => n + e.notes.length, 0);
    setStatus(`${song.title} : ${events.length} rebonds (${notes} notes), vidéo de ${fmt(ch.endTime)}.`);
  }
}

function loadSong(s) {
  song = s;
  const box = $('tracks');
  box.innerHTML = '';
  for (const tr of s.tracks) {
    const isDrums = tr.notes.every((n) => n.channel === 9);
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !isDrums; // la batterie n'a pas de hauteur de note : désactivée par défaut
    input.addEventListener('change', refresh);
    label.append(input, ` ${tr.name} — ${tr.notes.length} notes${isDrums ? ' (batterie)' : ''}`);
    box.append(label);
  }
  $('tracksBox').hidden = s.tracks.length < 2;
  setBusy(false);
  refresh();
}

$('midiFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $('fileLabel').textContent = file.name;
  try {
    const midi = parseMidi(await file.arrayBuffer());
    if (!midi.tracks.length) throw new Error('aucune note');
    loadSong({ title: file.name.replace(/\.[^.]+$/, ''), tracks: midi.tracks });
  } catch (err) {
    console.error(err);
    setStatus('Impossible de lire ce fichier. Il faut un fichier MIDI (.mid).');
  }
});

$('demo').addEventListener('click', () => {
  $('fileLabel').textContent = 'Choisir un fichier MIDI (.mid)…';
  loadSong(DEMO_SONGS[0]);
});

$('tempo').addEventListener('input', () => {
  $('tempoVal').textContent = `×${Number($('tempo').value).toFixed(2).replace(/\.?0+$/, '')}`;
  refresh();
});
for (const id of ['maxDuration', 'merge', 'gravity', 'speed', 'seed', 'title', 'ballRadius', 'grow', 'maxBallRadius', 'splitEvery', 'maxBalls']) $(id).addEventListener('input', refresh);
for (const id of ['growOn', 'splitOn', 'colorChange']) $(id).addEventListener('change', refresh);

$('preview').addEventListener('click', () => run(false));
$('record').addEventListener('click', () => run(true));
$('stop').addEventListener('click', () => running?.stop());

async function run(record) {
  if (running || !song) return;
  const events = buildEvents();
  if (!events.length) {
    setStatus('Aucune note à jouer : coche au moins une piste.');
    return;
  }
  const ch = new Choreography(events, options());
  renderer.reset(ch);
  renderer.title = $('title').value;
  synth.instrument = $('instrument').value;
  synth.volume = Number($('volume').value);
  setBusy(true);
  $('download').hidden = true;

  const t0 = await synth.begin();
  let recorder = null;
  if (record) {
    recorder = new VideoRecorder(canvas, synth.streamDest.stream, 60);
    recorder.start();
  }
  setStatus(record ? 'Enregistrement en cours… garde cet onglet au premier plan.' : 'Prévisualisation…');

  let scheduled = 0; // index du prochain coup à programmer
  let stopped = false;
  let last = performance.now();
  let raf = 0;

  const finish = async () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    synth.end();
    running = null;
    if (recorder) {
      setStatus('Finalisation du fichier…');
      const { blob, ext } = await recorder.stop();
      const a = $('download');
      a.href = URL.createObjectURL(blob);
      a.download = `${song.title || 'ring-escape'}.${ext}`;
      a.textContent = `⬇ Télécharger la vidéo (${ext.toUpperCase()}, ${(blob.size / 1e6).toFixed(1)} Mo)`;
      a.hidden = false;
      setStatus(ext === 'webm'
        ? 'Vidéo prête (WebM). Pour TikTok/Instagram, convertis-la en MP4 si besoin (voir README).'
        : 'Vidéo prête !');
    } else {
      setStatus('Prévisualisation terminée.');
    }
    setBusy(false);
  };
  running = { stop: finish };

  const frame = (now) => {
    if (stopped) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const t = Math.max(0, synth.ctx.currentTime - t0);
    // programmation des notes juste avant leur rebond (timing exact côté audio)
    while (scheduled < events.length && events[scheduled].time < t + LOOKAHEAD) {
      const ev = events[scheduled++];
      synth.playGroup(ev.notes, t0 + ev.time);
    }
    ch.advanceTo(t);
    renderer.onEvents(ch.drainEvents());
    const lv = synth.levels();
    renderer.setAudioData(lv.freq, lv.wave, lv.level);
    renderer.draw(dt);
    $('bar').style.width = `${Math.min(100, (t / ch.endTime) * 100)}%`;
    if (t >= ch.endTime) {
      finish();
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

refresh();
