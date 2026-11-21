// Synthétiseur Web Audio : joue chaque note au moment exact du rebond.

const INSTRUMENTS = {
  piano: { type: 'sine', partials: [[1, 1], [2, 0.45], [3, 0.2], [4, 0.1], [5, 0.05]], decay: (m) => Math.min(1.6, Math.max(0.35, 1.6 - (m - 48) * 0.025)) },
  marimba: { type: 'sine', partials: [[1, 1], [3.99, 0.3], [10.1, 0.06]], decay: () => 0.32 },
  bell: { type: 'sine', partials: [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.93, 0.1]], decay: () => 1.1 },
  synth: { type: 'sawtooth', partials: [[1, 0.5], [1.006, 0.35]], decay: () => 0.6, filter: 2600 },
};

export const INSTRUMENT_NAMES = { piano: 'Piano', marimba: 'Marimba', bell: 'Cloche / glockenspiel', synth: 'Synthé' };

export class Synth {
  constructor() {
    this.ctx = null;
    this.instrument = 'piano';
    this.volume = 0.8;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.2;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.75;
    this.streamDest = ctx.createMediaStreamDestination();
    this.monitor = ctx.createGain();
    this.master.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.limiter.connect(this.streamDest);
    this.limiter.connect(this.monitor);
    this.monitor.connect(ctx.destination);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.wave = new Uint8Array(this.analyser.fftSize);
    return ctx;
  }

  /** Démarre une session ; renvoie l'instant audio correspondant à t = 0. */
  async begin() {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') await ctx.resume();
    this.end();
    this.bus = ctx.createGain();
    this.bus.gain.value = this.volume;
    this.bus.connect(this.master);
    return ctx.currentTime + 0.15;
  }

  end() {
    if (this.bus) {
      const bus = this.bus;
      bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      setTimeout(() => bus.disconnect(), 300);
      this.bus = null;
    }
  }

  /** Joue un groupe de notes (accord) à l'instant `when` (temps audio). */
  playGroup(notes, when) {
    const scale = 1 / Math.sqrt(notes.length);
    for (const n of notes) this.playNote(n.pitch, when, n.duration, n.velocity, scale);
  }

  playNote(midi, when, duration, velocity = 100, scale = 1) {
    if (!this.bus) return;
    const ctx = this.ctx;
    const inst = INSTRUMENTS[this.instrument] || INSTRUMENTS.piano;
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const decay = inst.decay(midi);
    const amp = 0.28 * (velocity / 127) * scale;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(amp, when + 0.004);
    env.gain.setTargetAtTime(0, when + 0.004, decay / 3);
    const hold = Math.min(duration, decay * 1.5);
    env.gain.setTargetAtTime(0, when + Math.max(0.05, hold), 0.06);
    let out = env;
    if (inst.filter) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = inst.filter;
      env.connect(lp);
      out = lp;
    }
    out.connect(this.bus);
    const stopAt = when + Math.max(0.05, hold) + 0.5;
    for (const [mult, g] of inst.partials) {
      const f = f0 * mult;
      if (f > 16000) continue;
      const osc = ctx.createOscillator();
      osc.type = inst.type;
      osc.frequency.value = f;
      const pg = ctx.createGain();
      pg.gain.value = g;
      osc.connect(pg);
      pg.connect(env);
      osc.start(when);
      osc.stop(stopAt);
      osc.onended = () => pg.disconnect();
    }
    setTimeout(() => out.disconnect(), Math.max(0, (stopAt - ctx.currentTime) * 1000 + 200));
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
