export class Audio {
  constructor() { this.ctx = null; this.muffle = 0; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 18000;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(this.lp); this.lp.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const bb = ctx.createBuffer(1, len, ctx.sampleRate), bd = bb.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    this.brownBuf = bb;
    this.ambience();
  }
  get t() { return this.ctx.currentTime; }
  noise(dur, type, freq, q, gain, attack = 0.002, freqEnd, buf) {
    if (!this.ctx) return;
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = buf || this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, this.t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, this.t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, this.t);
    g.gain.exponentialRampToValueAtTime(gain, this.t + attack); g.gain.exponentialRampToValueAtTime(0.0001, this.t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(this.t, Math.random()); s.stop(this.t + dur + 0.05);
  }
  tone(f0, f1, dur, type, gain, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = type;
    const t = this.t + delay;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  punch(s = 1) {
    this.tone(130 * (0.9 + Math.random() * 0.2), 45, 0.16, 'sine', 0.9 * s);
    this.noise(0.12, 'lowpass', 2200, 1, 0.8 * s, 0.001, 300);
    this.noise(0.04, 'bandpass', 4000, 2, 0.25 * s);
  }
  wet(s = 1) { this.noise(0.18, 'bandpass', 900, 3, 0.35 * s, 0.003, 350); }
  crack() {
    this.noise(0.07, 'highpass', 2500, 1, 0.9); this.noise(0.25, 'bandpass', 700, 4, 0.5, 0.002, 200);
    this.tone(300, 80, 0.12, 'square', 0.15);
  }
  whoosh(s = 1) { this.noise(0.22, 'bandpass', 500, 1.5, 0.25 * s, 0.06, 2200); }
  glass() {
    this.noise(0.35, 'highpass', 3000, 0.7, 0.7, 0.001);
    for (let i = 0; i < 6; i++) this.tone(2500 + Math.random() * 4000, 2000 + Math.random() * 3000, 0.15 + Math.random() * 0.2, 'sine', 0.12, Math.random() * 0.08);
  }
  slam() {
    this.tone(90, 28, 0.7, 'sine', 1.3); this.noise(0.6, 'lowpass', 600, 1, 1.0, 0.002, 80); this.crack(); this.crowd(1.4);
  }
  hurt() { this.tone(180, 70, 0.2, 'sawtooth', 0.18); this.noise(0.15, 'lowpass', 900, 1, 0.6); }
  grunt(pitch = 1) { this.noise(0.18, 'bandpass', 380 * pitch, 6, 0.4, 0.02, 220 * pitch, this.brownBuf); this.tone(140 * pitch, 95 * pitch, 0.18, 'sawtooth', 0.06); }
  slowIn() { this.tone(500, 70, 0.6, 'sine', 0.3); this.noise(0.6, 'lowpass', 2000, 1, 0.2, 0.01, 150); }
  slowOut() { this.tone(70, 500, 0.3, 'sine', 0.18); }
  heartbeat() { this.tone(60, 40, 0.12, 'sine', 0.9); this.tone(55, 38, 0.12, 'sine', 0.6, 0.18); }
  crowd(s = 1) { this.noise(2.2, 'bandpass', 900, 0.6, 0.35 * s, 0.4, 600, this.brownBuf); this.noise(2.0, 'bandpass', 1800, 0.8, 0.15 * s, 0.5); }
  clunk() { this.tone(70, 30, 0.35, 'sine', 1.0); this.noise(0.25, 'lowpass', 400, 1, 0.8, 0.002, 90); }
  buzz() { this.tone(100, 100, 0.4, 'sawtooth', 0.12); this.noise(0.3, 'bandpass', 3000, 4, 0.2); }
  bell() { this.tone(880, 860, 1.2, 'triangle', 0.35); this.tone(1760, 1700, 0.8, 'sine', 0.12); }
  clang() { for (const f of [820, 1240, 1710]) this.tone(f, f * 0.98, 0.5, 'triangle', 0.18); this.noise(0.08, 'highpass', 3000, 1, 0.5); }
  parry() { this.clang(); this.tone(1400, 2600, 0.25, 'sine', 0.2); this.noise(0.3, 'bandpass', 5000, 3, 0.3, 0.002, 1500); }
  thunk() { this.tone(110, 60, 0.18, 'sine', 0.8); this.noise(0.12, 'bandpass', 700, 2, 0.6, 0.001, 250); }
  cash() { for (let i = 0; i < 4; i++) this.tone(1800 + i * 300, 2400 + i * 300, 0.12, 'square', 0.05, i * 0.06); this.noise(0.25, 'highpass', 4000, 1, 0.25); }
  boom() { this.tone(70, 22, 1.4, 'sine', 1.6); this.noise(1.2, 'lowpass', 900, 0.7, 1.2, 0.003, 60, this.brownBuf); this.noise(0.3, 'highpass', 2000, 1, 0.5); }
  warn() { this.tone(660, 660, 0.12, 'square', 0.08); this.tone(660, 660, 0.12, 'square', 0.08, 0.2); }
  spikes() { this.noise(0.15, 'highpass', 2500, 1, 0.8); this.tone(400, 90, 0.2, 'sawtooth', 0.2); }
  roar(s = 1) { this.crowd(1.6 * s); this.noise(3, 'bandpass', 600, 0.5, 0.4 * s, 0.3, 400, this.brownBuf); }
  setMuffle(k) {
    if (!this.ctx) return;
    this.lp.frequency.setTargetAtTime(18000 - k * 17200, this.t, 0.08);
  }
  ambience() {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.brownBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0.07;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    // muffled jukebox groove
    this.juke = ctx.createGain(); this.juke.gain.value = 0.16;
    const jf = ctx.createBiquadFilter(); jf.type = 'lowpass'; jf.frequency.value = 700;
    this.juke.connect(jf); jf.connect(this.master);
    const bass = [41.2, 41.2, 49, 55, 41.2, 41.2, 61.7, 55];
    let step = 0, next = ctx.currentTime + 0.1;
    const beat = 60 / 112 / 2;
    const sched = () => {
      while (next < ctx.currentTime + 0.3) {
        if (step % 2 === 0) { const o = ctx.createOscillator(), gg = ctx.createGain(); o.frequency.setValueAtTime(120, next); o.frequency.exponentialRampToValueAtTime(40, next + 0.12); gg.gain.setValueAtTime(0.9, next); gg.gain.exponentialRampToValueAtTime(0.001, next + 0.2); o.connect(gg); gg.connect(this.juke); o.start(next); o.stop(next + 0.25); }
        if (step % 4 === 2) { const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 1800; const gg = ctx.createGain(); gg.gain.setValueAtTime(0.5, next); gg.gain.exponentialRampToValueAtTime(0.001, next + 0.15); n.connect(hf); hf.connect(gg); gg.connect(this.juke); n.start(next); n.stop(next + 0.2); }
        const o = ctx.createOscillator(), gg = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = bass[step % 8];
        gg.gain.setValueAtTime(0.25, next); gg.gain.exponentialRampToValueAtTime(0.001, next + beat * 0.9);
        o.connect(gg); gg.connect(this.juke); o.start(next); o.stop(next + beat);
        step++; next += beat;
      }
    };
    setInterval(sched, 100);
  }
}
