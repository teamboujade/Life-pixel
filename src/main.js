import { Simulation, calibrate, DEFAULTS } from './simulation.js';
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import { VideoRecorder } from './recorder.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const renderer = new Renderer(canvas);
const audio = new AudioEngine();
const FINALE_SECONDS = 5; // durée du final (visualiseur) après le dernier anneau

let running = null; // { stop() }
let fileName = '';

function settings() {
  const num = (id) => Number($(id).value);
  return {
    rings: Math.max(5, Math.min(700, Math.round(num('rings')) || DEFAULTS.rings)),
    seed: Math.max(1, Math.round(num('seed')) || 1),
    gapAngle: num('gapAngle'),
    rotationSpeed: num('rotationSpeed'),
    gravity: num('gravity'),
    minBounceSpeed: num('minBounceSpeed'),
  };
}

function segment() {
  const total = audio.duration;
  const start = Math.min(Math.max(0, Number($('start').value) || 0), Math.max(0, total - 1));
  const wanted = Number($('duration').value);
  const duration = wanted > 0 ? Math.min(wanted, total - start) : total - start;
  return { start, duration };
}

function setStatus(text) {
  $('status').textContent = text;
}

function setBusy(busy) {
  $('preview').disabled = busy || !audio.buffer;
  $('record').disabled = busy || !audio.buffer;
  $('stop').disabled = !busy;
}

function drawIdle() {
  const sim = new Simulation(settings());
  renderer.reset(sim);
  renderer.title = $('title').value;
  renderer.draw(0, false);
}

$('audioFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  fileName = file.name.replace(/\.[^.]+$/, '');
  $('fileLabel').textContent = file.name;
  setStatus('Décodage de la musique…');
  try {
    await audio.load(file);
    setStatus(`Musique chargée (${audio.duration.toFixed(1)} s). Lance une prévisualisation ou génère la vidéo.`);
    setBusy(false);
  } catch (err) {
    console.error(err);
    setStatus("Impossible de lire ce fichier audio. Essaie un MP3, M4A ou WAV.");
  }
});

for (const id of ['rings', 'seed', 'gapAngle', 'title']) $(id).addEventListener('input', () => !running && drawIdle());

$('preview').addEventListener('click', () => run(false));
$('record').addEventListener('click', () => run(true));
$('stop').addEventListener('click', () => running?.stop());

async function run(record) {
  if (running || !audio.buffer) return;
  const { start, duration } = segment();
  const opts = settings();
  audio.muffledGain = Number($('muffledGain').value);
  audio.muffledCutoff = Number($('muffledCutoff').value);
  const hold = Number($('hold').value);

  if ($('autoFit').checked) {
    setStatus('Calcul du nombre d\'anneaux pour coller à la durée…');
    await new Promise((r) => setTimeout(r, 30));
    const target = Math.max(3, duration - FINALE_SECONDS);
    const best = calibrate(opts, target);
    opts.rings = best.rings;
    opts.seed = best.seed;
    $('rings').value = best.rings;
    $('seed').value = best.seed;
  }

  const sim = new Simulation(opts);
  renderer.reset(sim);
  renderer.title = $('title').value;
  setBusy(true);
  $('download').hidden = true;

  const t0 = await audio.play(start, duration);
  audio.setMonitor(true);
  let recorder = null;
  if (record) {
    recorder = new VideoRecorder(canvas, audio.streamDest.stream, 60);
    recorder.start();
  }
  setStatus(record ? 'Enregistrement en cours… garde cet onglet au premier plan.' : 'Prévisualisation…');

  let stopped = false;
  let last = performance.now();
  let raf = 0;

  const finish = async () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    audio.stop();
    running = null;
    if (recorder) {
      setStatus('Finalisation du fichier…');
      const { blob, ext } = await recorder.stop();
      const url = URL.createObjectURL(blob);
      const a = $('download');
      a.href = url;
      a.download = `${fileName || 'ring-escape'}.${ext}`;
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
    const t = Math.max(0, audio.ctx.currentTime - t0);
    sim.advanceTo(t);
    renderer.onEvents(sim.drainEvents());
    const open = sim.finished || t - sim.lastPassTime < hold;
    audio.setOpen(open);
    const lv = audio.levels();
    renderer.setAudioData(lv.freq, lv.wave, lv.level);
    renderer.draw(dt, open);
    $('bar').style.width = `${Math.min(100, (t / duration) * 100)}%`;
    if (t >= duration) {
      finish();
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

drawIdle();
