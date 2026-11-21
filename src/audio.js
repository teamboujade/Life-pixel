// Chaîne audio : source → passe-bas → gain → (haut-parleurs + flux enregistré).
// « Fermé » = musique étouffée (filtrée et moins forte) ; « ouvert » = son clair.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffer = null;
    this.source = null;
    this.muffledCutoff = 450;
    this.muffledGain = 0.35;
    this.climaxBoost = 1.8; // gain du moment fort (le limiteur évite la saturation)
  }

  ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      const ctx = this.ctx;
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.Q.value = 0.8;
      this.gain = ctx.createGain();
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.75;
      this.streamDest = ctx.createMediaStreamDestination();
      this.monitor = ctx.createGain();
      // limiteur : permet de pousser le volume au moment fort sans saturer
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -6;
      this.limiter.knee.value = 4;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.15;
      this.filter.connect(this.gain);
      this.gain.connect(this.limiter);
      this.limiter.connect(this.analyser);
      this.limiter.connect(this.streamDest);
      this.limiter.connect(this.monitor);
      this.monitor.connect(ctx.destination);
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.wave = new Uint8Array(this.analyser.fftSize);
    }
    return this.ctx;
  }

  async load(file) {
    const ctx = this.ensureContext();
    const data = await file.arrayBuffer();
    this.buffer = await ctx.decodeAudioData(data);
    return this.buffer;
  }

  get duration() {
    return this.buffer ? this.buffer.duration : 0;
  }

  /** state : 'muffled' (étouffé), 'open' (passage d'anneau) ou 'climax' (moment fort à fond). */
  setState(state, instant = false) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const open = state !== 'muffled';
    const f = open ? 20000 : this.muffledCutoff;
    const g = state === 'climax' ? this.climaxBoost : open ? 0.9 : this.muffledGain;
    if (instant) {
      this.filter.frequency.setValueAtTime(f, now);
      this.gain.gain.setValueAtTime(g, now);
    } else {
      this.filter.frequency.setTargetAtTime(f, now, open ? 0.015 : 0.08);
      this.gain.gain.setTargetAtTime(g, now, open ? 0.02 : 0.09);
    }
  }

  setMonitor(on) {
    if (this.monitor) this.monitor.gain.value = on ? 1 : 0;
  }

  /** Démarre la lecture ; renvoie l'instant (ctx.currentTime) de t = 0. */
  async play(offset, duration) {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
    this.stop();
    this.source = ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.filter);
    this.setState('muffled', true);
    const t0 = ctx.currentTime + 0.1;
    this.source.start(t0, offset, duration);
    return t0;
  }

  stop() {
    if (this.source) {
      try { this.source.stop(); } catch { /* déjà arrêtée */ }
      this.source.disconnect();
      this.source = null;
    }
  }

  levels() {
    this.analyser.getByteFrequencyData(this.freq);
    this.analyser.getByteTimeDomainData(this.wave);
    let sum = 0;
    for (let i = 0; i < this.wave.length; i++) {
      const v = (this.wave[i] - 128) / 128;
      sum += v * v;
    }
    return { freq: this.freq, wave: this.wave, level: Math.sqrt(sum / this.wave.length) };
  }
}
