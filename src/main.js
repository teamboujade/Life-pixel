import { Simulation, calibrate, DEFAULTS } from './simulation.js';
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import { VideoRecorder } from './recorder.js';
import { analyzeEnergy, findHighlight, planSegment } from './analysis.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const renderer = new Renderer(canvas);
const audio = new AudioEngine();
const FINALE_SECONDS = 5; // sans moment fort : durée du final après le dernier anneau

let running = null; // { stop() }
let fileName = '';
let analysis = null; // { curve, hop, time }
let dropTime = null; // moment fort choisi (s dans le morceau)

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

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

const useHighlight = () => $('useHighlight').checked && dropTime !== null;

/** Passage de la musique à utiliser + instant (relatif) où la balle doit finir. */
function plan() {
  const total = audio.duration;
  const wanted = Number($('duration').value) || 60;
  if (useHighlight()) {
    const climax = Math.max(3, Number($('climax').value) || 15);
    const p = planSegment(total, dropTime, { videoDuration: wanted, climax });
    return { ...p, finishAt: p.dropAt, highlight: true };
  }
  const start = Math.min(Math.max(0, Number($('start').value) || 0), Math.max(0, total - 1));
  const duration = Math.min(wanted, total - start);
  return {
    start,
    duration,
    finishAt: $('autoFit').checked ? Math.max(3, duration - FINALE_SECONDS) : null,
    highlight: false,
  };
}

function setStatus(text) {
  $('status').textContent = text;
}

function setBusy(busy) {
  $('preview').disabled = busy || !audio.buffer;
  $('record').disabled = busy || !audio.buffer;
  $('stop').disabled = !busy;
}

function syncModeFields() {
  const hl = $('useHighlight').checked;
  document.querySelectorAll('.hl').forEach((el) => (el.hidden = !hl));
  document.querySelectorAll('.nohl').forEach((el) => (el.hidden = hl));
  drawWave();
}

function drawWave() {
  const c = $('wave');
  if (!analysis) return;
  const ctx = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  const total = audio.duration;
  ctx.clearRect(0, 0, W, H);
  const p = audio.buffer ? plan() : null;
  if (p) {
    ctx.fillStyle = 'rgba(255,63,164,0.18)';
    ctx.fillRect((p.start / total) * W, 0, (p.duration / total) * W, H);
  }
  const { curve } = analysis;
  const per = curve.length / W;
  for (let x = 0; x < W; x++) {
    let m = 0;
    for (let i = Math.floor(x * per); i < Math.floor((x + 1) * per); i++) m = Math.max(m, curve[i] || 0);
    const h = Math.min(1, m) * (H - 8);
    const t = (x / W) * total;
    const inSeg = p && t >= p.start && t <= p.start + p.duration;
    const afterDrop = useHighlight() && t >= dropTime && inSeg;
    ctx.fillStyle = afterDrop ? '#ffb52e' : inSeg ? '#ff6fbf' : '#4a4060';
    ctx.fillRect(x, H - h, 1, h);
  }
  if (useHighlight()) {
    const x = (dropTime / total) * W;
    ctx.fillStyle = '#ffb52e';
    ctx.fillRect(x - 1.5, 0, 3, H);
  }
}

$('wave').addEventListener('click', (e) => {
  if (!analysis || running) return;
  const r = e.target.getBoundingClientRect();
  dropTime = ((e.clientX - r.left) / r.width) * audio.duration;
  $('useHighlight').checked = true;
  syncModeFields();
  setStatus(`Moment fort déplacé à ${fmt(dropTime)}.`);
});

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
  setStatus('Décodage et analyse de la musique…');
  try {
    const buf = await audio.load(file);
    await new Promise((r) => setTimeout(r, 20));
    const channels = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
    const h = findHighlight(analyzeEnergy(channels, buf.sampleRate));
    analysis = h;
    dropTime = h.time;
    $('waveBox').hidden = false;
    syncModeFields();
    setStatus(`Musique chargée (${fmt(audio.duration)}). Moment fort détecté à ${fmt(dropTime)}.`);
    setBusy(false);
  } catch (err) {
    console.error(err);
    setStatus('Impossible de lire ce fichier audio. Essaie un MP3, M4A ou WAV.');
  }
});

for (const id of ['rings', 'seed', 'gapAngle', 'title']) $(id).addEventListener('input', () => !running && drawIdle());
for (const id of ['duration', 'climax', 'start']) $(id).addEventListener('input', drawWave);
$('useHighlight').addEventListener('change', syncModeFields);
$('autoFit').addEventListener('change', drawWave);

$('preview').addEventListener('click', () => run(false));
$('record').addEventListener('click', () => run(true));
$('stop').addEventListener('click', () => running?.stop());

async function run(record) {
  if (running || !audio.buffer) return;
  const p = plan();
  const opts = settings();
  audio.muffledGain = Number($('muffledGain').value);
  audio.muffledCutoff = Number($('muffledCutoff').value);
  audio.climaxBoost = Number($('climaxBoost').value);
  const hold = Number($('hold').value);

  // facteur de vitesse pour que le dernier anneau casse pile au bon moment
  let timeScale = 1;
  if (p.finishAt !== null) {
    setStatus('Calcul de la partie pour tomber pile sur le bon moment…');
    await new Promise((r) => setTimeout(r, 30));
    const best = calibrate(opts, p.finishAt);
    opts.rings = best.rings;
    opts.seed = best.seed;
    $('rings').value = best.rings;
    $('seed').value = best.seed;
    if (best.finish) timeScale = Math.min(1.15, Math.max(0.85, best.finish / p.finishAt));
  }

  const sim = new Simulation(opts);
  renderer.reset(sim);
  renderer.title = $('title').value;
  setBusy(true);
  $('download').hidden = true;

  const t0 = await audio.play(p.start, p.duration);
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
    sim.advanceTo(t * timeScale);
    // filet de sécurité : le moment fort démarre toujours à l'heure
    if (p.highlight && t >= p.finishAt && !sim.finished) sim.forceFinish();
    renderer.onEvents(sim.drainEvents());
    const passing = t * timeScale - sim.lastPassTime < hold;
    const state = sim.finished ? (p.highlight ? 'climax' : 'open') : passing ? 'open' : 'muffled';
    audio.setState(state);
    const lv = audio.levels();
    renderer.setAudioData(lv.freq, lv.wave, lv.level);
    renderer.draw(dt, state !== 'muffled');
    $('bar').style.width = `${Math.min(100, (t / p.duration) * 100)}%`;
    if (t >= p.duration) {
      finish();
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

syncModeFields();
drawIdle();
