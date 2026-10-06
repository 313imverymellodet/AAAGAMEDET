// Procedural audio: every sound effect and the soundtrack are synthesized with WebAudio.
export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.musicOn = false;
    this.lastPlay = new Map();
    this.listener = { x: 0, z: 0 };
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.sfx = c.createGain();
    this.music = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.sfx.connect(comp); comp.connect(this.master);
    this.music.connect(this.master);
    // shared noise buffer
    const len = c.sampleRate * 1.5;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // reverb (generated impulse)
    this.verb = c.createConvolver();
    const ir = c.createBuffer(2, c.sampleRate * 2.2, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const x = ir.getChannelData(ch);
      for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3);
    }
    this.verb.buffer = ir;
    this.verbGain = c.createGain();
    this.verbGain.gain.value = 0.22;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.volume ?? 0.8;
    this.sfx.gain.value = s.sfx ?? 0.9;
    this.music.gain.value = (s.music ?? 0.45) * 0.5;
  }

  // positional attenuation
  vol(x, z) {
    if (x == null) return 1;
    const d = Math.hypot(x - this.listener.x, z - this.listener.z);
    return Math.max(0, 1 - d / 55) ** 1.5;
  }

  throttle(key, ms) {
    const now = performance.now();
    if ((this.lastPlay.get(key) || 0) + ms > now) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  // ---------------------------------------------------------------- primitives
  tone({ f = 440, f2, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.005, at = 0, verb = 0, detune = 0 }) {
    const c = this.ctx; if (!c) return;
    const t0 = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    o.detune.value = detune;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.sfx);
    if (verb) { const vg = c.createGain(); vg.gain.value = verb; g.connect(vg); vg.connect(this.verb); }
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  noiseHit({ dur = 0.2, vol = 0.3, f = 1200, f2, q = 1, type = 'bandpass', at = 0, verb = 0 }) {
    const c = this.ctx; if (!c) return;
    const t0 = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const fl = c.createBiquadFilter();
    fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t0);
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(this.sfx);
    if (verb) { const vg = c.createGain(); vg.gain.value = verb; g.connect(vg); vg.connect(this.verb); }
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  // ---------------------------------------------------------------- sound library
  play(name, x, z, mul = 1) {
    if (!this.ctx) return;
    const v = this.vol(x, z) * mul;
    if (v < 0.03) return;
    switch (name) {
      case 'swing': this.noiseHit({ dur: 0.16, vol: 0.25 * v, f: 900, f2: 3200, q: 2 }); break;
      case 'heavySwing': this.noiseHit({ dur: 0.28, vol: 0.32 * v, f: 400, f2: 1600, q: 1.5 }); break;
      case 'hit': if (!this.throttle('hit', 40)) return; this.noiseHit({ dur: 0.09, vol: 0.32 * v, f: 2400, q: 0.8 }); this.tone({ f: 160, f2: 60, type: 'sine', dur: 0.12, vol: 0.35 * v }); break;
      case 'bigHit': this.noiseHit({ dur: 0.25, vol: 0.4 * v, f: 1200, f2: 300, q: 0.7 }); this.tone({ f: 120, f2: 40, dur: 0.3, vol: 0.5 * v }); break;
      case 'shoot': if (!this.throttle('shoot', 50)) return; this.noiseHit({ dur: 0.12, vol: 0.18 * v, f: 3000, f2: 1200, q: 3 }); this.tone({ f: 880, f2: 520, type: 'triangle', dur: 0.1, vol: 0.08 * v }); break;
      case 'bow': this.tone({ f: 220, f2: 110, type: 'triangle', dur: 0.12, vol: 0.2 * v }); this.noiseHit({ dur: 0.1, vol: 0.18 * v, f: 4000, f2: 2000, q: 4 }); break;
      case 'magic': this.tone({ f: 660, f2: 990, type: 'triangle', dur: 0.25, vol: 0.18 * v, verb: 0.4 }); this.tone({ f: 990, f2: 1480, type: 'sine', dur: 0.3, vol: 0.12 * v, at: 0.04, verb: 0.4 }); break;
      case 'fire': this.noiseHit({ dur: 0.45, vol: 0.32 * v, f: 600, f2: 200, q: 0.6, type: 'lowpass' }); this.tone({ f: 200, f2: 80, type: 'sawtooth', dur: 0.3, vol: 0.06 * v }); break;
      case 'explosion': this.noiseHit({ dur: 0.9, vol: 0.55 * v, f: 900, f2: 60, q: 0.5, type: 'lowpass', verb: 0.5 }); this.tone({ f: 90, f2: 30, dur: 0.7, vol: 0.5 * v }); break;
      case 'ice': for (let i = 0; i < 4; i++) this.tone({ f: 1800 + i * 420, type: 'sine', dur: 0.4, vol: 0.06 * v, at: i * 0.03, verb: 0.6 }); this.noiseHit({ dur: 0.2, vol: 0.2 * v, f: 6000, q: 2 }); break;
      case 'heal': [523, 659, 784, 1046].forEach((f, i) => this.tone({ f, type: 'sine', dur: 0.5, vol: 0.09 * v, at: i * 0.06, verb: 0.6 })); break;
      case 'shield': this.tone({ f: 330, f2: 660, type: 'triangle', dur: 0.35, vol: 0.18 * v, verb: 0.5 }); break;
      case 'dash': this.noiseHit({ dur: 0.22, vol: 0.25 * v, f: 500, f2: 2500, q: 1.2 }); break;
      case 'blink': this.tone({ f: 1200, f2: 300, type: 'sine', dur: 0.25, vol: 0.15 * v, verb: 0.5 }); this.noiseHit({ dur: 0.15, vol: 0.15 * v, f: 5000, q: 3 }); break;
      case 'slam': this.noiseHit({ dur: 0.6, vol: 0.5 * v, f: 300, f2: 50, q: 0.7, type: 'lowpass', verb: 0.4 }); this.tone({ f: 70, f2: 30, dur: 0.6, vol: 0.55 * v }); break;
      case 'wind': this.noiseHit({ dur: 0.7, vol: 0.3 * v, f: 400, f2: 2200, q: 2, verb: 0.3 }); break;
      case 'dark': this.tone({ f: 110, f2: 55, type: 'sawtooth', dur: 0.5, vol: 0.12 * v, verb: 0.5 }); this.tone({ f: 165, f2: 82, type: 'triangle', dur: 0.5, vol: 0.12 * v }); break;
      case 'tower': if (!this.throttle('tower', 120)) return; this.tone({ f: 1400, f2: 300, type: 'square', dur: 0.18, vol: 0.06 * v }); this.noiseHit({ dur: 0.15, vol: 0.12 * v, f: 3000, q: 2 }); break;
      case 'death': this.tone({ f: 300, f2: 70, type: 'triangle', dur: 0.8, vol: 0.25 * v, verb: 0.5 }); break;
      case 'minionDeath': if (!this.throttle('md', 60)) return; this.noiseHit({ dur: 0.12, vol: 0.12 * v, f: 700, q: 1 }); break;
      case 'gold': if (!this.throttle('gold', 70)) return; this.tone({ f: 1568, type: 'square', dur: 0.07, vol: 0.05 }); this.tone({ f: 2093, type: 'square', dur: 0.1, vol: 0.05, at: 0.06 }); break;
      case 'level': [392, 523, 659, 784].forEach((f, i) => this.tone({ f, type: 'triangle', dur: 0.35, vol: 0.13, at: i * 0.07, verb: 0.5 })); break;
      case 'buy': this.tone({ f: 880, type: 'triangle', dur: 0.08, vol: 0.12 }); this.tone({ f: 1320, type: 'triangle', dur: 0.12, vol: 0.12, at: 0.07 }); break;
      case 'click': this.tone({ f: 1200, f2: 900, type: 'sine', dur: 0.05, vol: 0.08 }); break;
      case 'deny': this.tone({ f: 200, type: 'square', dur: 0.12, vol: 0.07 }); this.tone({ f: 150, type: 'square', dur: 0.15, vol: 0.07, at: 0.1 }); break;
      case 'recall': this.tone({ f: 440, f2: 880, type: 'sine', dur: 1.2, vol: 0.08, verb: 0.6 }); break;
      case 'structure': this.noiseHit({ dur: 1.6, vol: 0.6 * v, f: 500, f2: 40, q: 0.4, type: 'lowpass', verb: 0.6 }); this.tone({ f: 55, f2: 30, dur: 1.4, vol: 0.5 * v }); break;
      case 'announce': [0, 4, 7, 12].forEach((s, i) => this.tone({ f: 220 * 2 ** (s / 12), type: 'sawtooth', dur: 0.9, vol: 0.05, at: i * 0.02, verb: 0.7 })); break;
      case 'bad': [0, 3, 6].forEach((s, i) => this.tone({ f: 196 * 2 ** (s / 12), type: 'sawtooth', dur: 0.9, vol: 0.05, at: i * 0.02, verb: 0.7 })); break;
      case 'victory': [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone({ f: 262 * 2 ** (s / 12), type: 'triangle', dur: 1.4, vol: 0.12, at: i * 0.12, verb: 0.7 })); break;
      case 'defeat': [12, 10, 7, 3, 0].forEach((s, i) => this.tone({ f: 196 * 2 ** (s / 12), type: 'triangle', dur: 1.4, vol: 0.12, at: i * 0.18, verb: 0.7 })); break;
    }
  }

  // ---------------------------------------------------------------- generative soundtrack
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const c = this.ctx;
    const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]];
    const midi = (n) => 440 * 2 ** ((n - 69) / 12);
    const bar = 3.2;
    let next = c.currentTime + 0.1;
    let i = 0;
    const pad = (f, t, dur) => {
      for (const det of [-6, 6]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        const fl = c.createBiquadFilter();
        fl.type = 'lowpass'; fl.frequency.value = 900; fl.Q.value = 0.5;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.022, t + 0.8);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(fl); fl.connect(g); g.connect(this.music);
        const vg = c.createGain(); vg.gain.value = 0.5; g.connect(vg); vg.connect(this.verb);
        o.start(t); o.stop(t + dur + 0.1);
      }
    };
    const pluck = (f, t) => {
      const o = c.createOscillator();
      o.type = 'triangle'; o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.04, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(this.music);
      const vg = c.createGain(); vg.gain.value = 0.6; g.connect(vg); vg.connect(this.verb);
      o.start(t); o.stop(t + 0.6);
    };
    const drum = (t, low) => {
      const o = c.createOscillator();
      o.frequency.setValueAtTime(low ? 90 : 180, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      const g = c.createGain();
      g.gain.setValueAtTime(low ? 0.12 : 0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + 0.3);
    };
    const schedule = () => {
      if (!this.musicOn) return;
      while (next < c.currentTime + 1.5) {
        const ch = chords[i % chords.length];
        for (const n of ch) pad(midi(n - 12), next, bar + 0.4);
        const arp = [0, 2, 1, 3, 2, 1, 3, 0];
        for (let k = 0; k < 8; k++) pluck(midi(ch[arp[k]] + 12), next + k * (bar / 8));
        for (let k = 0; k < 4; k++) drum(next + k * (bar / 4), k % 2 === 0);
        next += bar;
        i++;
      }
      this.musicTimer = setTimeout(schedule, 400);
    };
    schedule();
  }
  stopMusic() {
    this.musicOn = false;
    clearTimeout(this.musicTimer);
  }
}
