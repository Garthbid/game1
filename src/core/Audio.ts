import { CONFIG } from '../config';

/** Every sound is synthesized with the Web Audio API, so the game ships with no audio files. */
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;

  /** Must be called from a user gesture (a tap or click). Safe to call repeatedly. */
  init() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return; // no audio available; the game still runs
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = CONFIG.audio.volume;
    // A gentle limiter keeps overlapping shots from clipping
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);

    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  private gain(at: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(this.master);
    return g;
  }

  private tone(type: OscillatorType, from: number, to: number, at: number, dur: number, peak: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + dur);
    o.connect(this.gain(at, peak, 0.005, dur));
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private burst(at: number, dur: number, peak: number, filterType: BiquadFilterType, freq: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    src.connect(f).connect(this.gain(at, peak, 0.002, dur));
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.05);
  }

  private get now(): number | null {
    return this.ctx && this.ctx.state === 'running' ? this.ctx.currentTime : null;
  }

  shoot() {
    const t = this.now;
    if (t === null) return;
    this.burst(t, 0.09, 0.6, 'lowpass', 3200);
    this.tone('square', 180, 55, t, 0.08, 0.25);
  }

  dryFire() {
    const t = this.now;
    if (t === null) return;
    this.tone('square', 900, 700, t, 0.02, 0.1);
  }

  reload(duration: number) {
    const t = this.now;
    if (t === null) return;
    this.burst(t, 0.03, 0.3, 'highpass', 2500);
    this.burst(t + duration * 0.17, 0.03, 0.3, 'highpass', 2000);
    this.burst(t + Math.max(0.05, duration - 0.15), 0.04, 0.4, 'bandpass', 1800);
  }

  enemyHit() {
    const t = this.now;
    if (t === null) return;
    this.tone('triangle', 1400, 1100, t, 0.05, 0.18);
  }

  headshot() {
    const t = this.now;
    if (t === null) return;
    this.tone('triangle', 1800, 2400, t, 0.06, 0.22);
    this.burst(t, 0.04, 0.2, 'highpass', 4000);
  }

  /** Pitch climbs with the combo so a streak sounds like a streak. */
  enemyDeath(streak = 1) {
    const t = this.now;
    if (t === null) return;
    const p = 1 + Math.min(streak, 10) * 0.06;
    this.tone('sawtooth', 420 * p, 60, t, 0.35, 0.2);
    this.burst(t, 0.15, 0.25, 'lowpass', 800);
  }

  explosion() {
    const t = this.now;
    if (t === null) return;
    this.burst(t, 0.35, 0.7, 'lowpass', 500);
    this.tone('sine', 120, 30, t, 0.4, 0.5);
  }

  dash() {
    const t = this.now;
    if (t === null) return;
    this.burst(t, 0.18, 0.35, 'bandpass', 900);
    this.tone('sine', 220, 440, t, 0.15, 0.12);
  }

  playerHurt() {
    const t = this.now;
    if (t === null) return;
    this.tone('sine', 140, 50, t, 0.22, 0.5);
    this.burst(t, 0.08, 0.3, 'lowpass', 600);
  }

  secondWind() {
    const t = this.now;
    if (t === null) return;
    [330, 440, 660, 880].forEach((f, i) => this.tone('triangle', f, f * 1.01, t + i * 0.08, 0.3, 0.2));
  }

  orbFire() {
    const t = this.now;
    if (t === null) return;
    this.tone('sine', 300, 700, t, 0.25, 0.12);
  }

  pickup() {
    const t = this.now;
    if (t === null) return;
    this.tone('triangle', 520, 1040, t, 0.15, 0.2);
    this.tone('triangle', 780, 1560, t + 0.08, 0.15, 0.15);
  }

  comboUp(tier: number) {
    const t = this.now;
    if (t === null) return;
    const f = 660 * (1 + tier * 0.15);
    this.tone('square', f, f * 1.5, t, 0.12, 0.12);
  }

  upgrade() {
    const t = this.now;
    if (t === null) return;
    [523, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.09, 0.25, 0.18));
  }

  waveStart() {
    const t = this.now;
    if (t === null) return;
    this.tone('square', 330, 330, t, 0.18, 0.12);
    this.tone('square', 440, 440, t + 0.2, 0.3, 0.12);
  }

  waveClear() {
    const t = this.now;
    if (t === null) return;
    [523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.12, 0.3, 0.16));
  }

  gameOver() {
    const t = this.now;
    if (t === null) return;
    [392, 311, 233].forEach((f, i) => this.tone('sawtooth', f, f * 0.97, t + i * 0.22, 0.35, 0.12));
  }
}
