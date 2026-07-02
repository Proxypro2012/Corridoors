// audio: fully procedural. every sound + music track is synthesized live —
// original compositions, no external files.

const NOTE = {}; // name -> freq, built below
{
  const names = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
  for (let oct = 1; oct <= 7; oct++) {
    names.forEach((n, i) => {
      NOTE[n + oct] = 440 * Math.pow(2, (oct * 12 + i - 57) / 12);
    });
  }
}

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.listener = { x: 0, y: 0 };
    this.track = 'none';
    this._nextBarTime = 0;
    this._barIndex = 0;
    this._timer = null;
    this._rainGain = null;
    this._droneGain = null;
    this._heartTimer = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    this.ctx = new C();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 6;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    this.master.gain.value = this.muted ? 0 : 0.9;

    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.55; this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 1; this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain(); this.ambBus.gain.value = 0.8; this.ambBus.connect(this.master);

    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this._startAmbience();
    this._timer = setInterval(() => this._musicTick(), 40);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  setListener(x, y) { this.listener.x = x; this.listener.y = y; }

  // ---------------- low level synth helpers ----------------

  _env(g, t, vol, a, dur, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, Math.max(t + a, t + dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.01);
  }

  tone({ t, freq, dur = 0.3, type = 'sine', vol = 0.2, a = 0.01, rel = 0.08, out = null, detune = 0, glideTo = 0, pan = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    t = t ?? ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t + dur);
    if (detune) o.detune.value = detune;
    const g = ctx.createGain();
    this._env(g, t, vol, a, dur, rel);
    o.connect(g);
    let node = g;
    if (pan) {
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      g.connect(p); node = p;
    }
    node.connect(out || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.1);
  }

  noise({ t, dur = 0.3, vol = 0.2, a = 0.005, rel = 0.1, filter = 'lowpass', freq = 800, q = 1, glideTo = 0, out = null, pan = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    t = t ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter();
    f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (glideTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + dur);
    const g = ctx.createGain();
    this._env(g, t, vol, a, dur, rel);
    src.connect(f); f.connect(g);
    let node = g;
    if (pan) {
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      g.connect(p); node = p;
    }
    node.connect(out || this.sfxBus);
    src.start(t); src.stop(t + dur + 0.15);
  }

  _kick(t, out, vol = 0.5) {
    this.tone({ t, freq: 140, glideTo: 38, dur: 0.16, type: 'sine', vol, a: 0.002, rel: 0.1, out });
  }
  _hat(t, out, vol = 0.08) {
    this.noise({ t, dur: 0.05, vol, filter: 'highpass', freq: 6500, out, a: 0.001, rel: 0.03 });
  }
  _snare(t, out, vol = 0.2) {
    this.noise({ t, dur: 0.14, vol, filter: 'bandpass', freq: 1800, q: 0.8, out, a: 0.001 });
    this.tone({ t, freq: 190, dur: 0.08, type: 'triangle', vol: vol * 0.6, out });
  }

  // ---------------- positional SFX ----------------

  playAt(name, x, y, maxDist = 900) {
    if (!this.ctx) return;
    const dx = x - this.listener.x, dy = y - this.listener.y;
    const d = Math.hypot(dx, dy);
    if (d > maxDist) return;
    const vol = Math.pow(1 - d / maxDist, 1.4);
    const pan = Math.max(-0.9, Math.min(0.9, dx / 600));
    this.play(name, { vol, pan });
  }

  // ---------------- one-shot SFX library ----------------

  play(name, o = {}) {
    if (!this.ctx) return;
    const v = o.vol ?? 1, pan = o.pan ?? 0;
    const t = this.ctx.currentTime;
    const fx = {
      doorOpen: () => {
        this.noise({ t, dur: 0.5, vol: 0.16 * v, filter: 'bandpass', freq: 300, glideTo: 900, q: 2, pan });
        this.tone({ t, freq: 90, glideTo: 60, dur: 0.4, type: 'triangle', vol: 0.1 * v, pan });
      },
      doorClose: () => {
        this.noise({ t, dur: 0.12, vol: 0.3 * v, filter: 'lowpass', freq: 500, pan });
        this.tone({ t, freq: 70, glideTo: 45, dur: 0.18, type: 'sine', vol: 0.35 * v, pan });
      },
      doorSlam: () => {
        this.noise({ t, dur: 0.2, vol: 0.55 * v, filter: 'lowpass', freq: 700, pan });
        this.tone({ t, freq: 90, glideTo: 30, dur: 0.35, type: 'sine', vol: 0.6 * v, pan });
      },
      locked: () => {
        for (let i = 0; i < 2; i++)
          this.noise({ t: t + i * 0.09, dur: 0.05, vol: 0.25 * v, filter: 'highpass', freq: 2200, pan });
        this.tone({ t, freq: 220, dur: 0.06, type: 'square', vol: 0.05 * v, pan });
      },
      unlock: () => {
        this.noise({ t, dur: 0.04, vol: 0.2 * v, filter: 'highpass', freq: 3000, pan });
        this.tone({ t: t + 0.1, freq: 660, dur: 0.08, type: 'triangle', vol: 0.12 * v, pan });
        this.tone({ t: t + 0.18, freq: 880, dur: 0.1, type: 'triangle', vol: 0.1 * v, pan });
      },
      drawer: () => this.noise({ t, dur: 0.28, vol: 0.14 * v, filter: 'bandpass', freq: 500, glideTo: 250, q: 1.5, pan }),
      paper: () => this.noise({ t, dur: 0.18, vol: 0.13 * v, filter: 'highpass', freq: 2800, pan }),
      coin: () => {
        this.tone({ t, freq: 1567, dur: 0.07, type: 'square', vol: 0.05 * v, pan });
        this.tone({ t: t + 0.07, freq: 2093, dur: 0.18, type: 'square', vol: 0.05 * v, pan });
      },
      key: () => {
        this.noise({ t, dur: 0.08, vol: 0.15 * v, filter: 'highpass', freq: 4000, pan });
        this.tone({ t, freq: 1200, dur: 0.1, type: 'triangle', vol: 0.08 * v, pan });
      },
      pickup: () => {
        this.tone({ t, freq: 523, dur: 0.08, type: 'triangle', vol: 0.1 * v, pan });
        this.tone({ t: t + 0.08, freq: 784, dur: 0.12, type: 'triangle', vol: 0.1 * v, pan });
      },
      flashlight: () => this.tone({ t, freq: 900, dur: 0.03, type: 'square', vol: 0.08 * v, pan }),
      heal: () => {
        [523, 659, 784].forEach((f, i) => this.tone({ t: t + i * 0.09, freq: f, dur: 0.2, type: 'sine', vol: 0.09 * v, pan }));
      },
      hide: () => this.noise({ t, dur: 0.35, vol: 0.18 * v, filter: 'lowpass', freq: 600, pan }),
      flicker: () => {
        for (let i = 0; i < 5; i++)
          this.noise({ t: t + i * 0.11 + Math.random() * 0.04, dur: 0.05, vol: 0.1 * v, filter: 'highpass', freq: 5000, pan });
        this.tone({ t, freq: 120, dur: 0.5, type: 'sawtooth', vol: 0.03 * v, pan });
      },
      shatter: () => {
        this.noise({ t, dur: 0.4, vol: 0.3 * v, filter: 'highpass', freq: 3500, pan });
        this.noise({ t: t + 0.05, dur: 0.3, vol: 0.2 * v, filter: 'bandpass', freq: 1400, q: 2, pan });
      },
      rushScream: () => {
        // layered distorted roar
        this.noise({ t, dur: 1.6, vol: 0.5 * v, filter: 'bandpass', freq: 300, glideTo: 1200, q: 1.4, pan });
        this.tone({ t, freq: 70, glideTo: 220, dur: 1.5, type: 'sawtooth', vol: 0.28 * v, pan });
        this.tone({ t, freq: 92, glideTo: 300, dur: 1.5, type: 'sawtooth', vol: 0.22 * v, detune: 30, pan });
        this.noise({ t: t + 0.2, dur: 1.1, vol: 0.4 * v, filter: 'highpass', freq: 900, pan });
      },
      ambushWarble: () => {
        for (let i = 0; i < 6; i++)
          this.tone({ t: t + i * 0.13, freq: 160 + (i % 2) * 90, glideTo: 120, dur: 0.14, type: 'sawtooth', vol: 0.2 * v, pan });
        this.noise({ t, dur: 1, vol: 0.3 * v, filter: 'bandpass', freq: 500, glideTo: 1500, q: 2, pan });
      },
      eyesHum: () => {
        this.tone({ t, freq: 82, dur: 1.2, type: 'sine', vol: 0.22 * v, pan });
        this.tone({ t, freq: 84, dur: 1.2, type: 'sine', vol: 0.2 * v, pan });
      },
      zap: () => this.noise({ t, dur: 0.12, vol: 0.25 * v, filter: 'bandpass', freq: 2400, q: 4, pan }),
      psst: () => this.noise({ t, dur: 0.3, vol: 0.35 * v, filter: 'bandpass', freq: 5200, q: 3, a: 0.02, rel: 0.15, pan }),
      screechShriek: () => {
        this.tone({ t, freq: 1450, glideTo: 2100, dur: 0.5, type: 'sawtooth', vol: 0.2 * v, pan });
        this.noise({ t, dur: 0.5, vol: 0.35 * v, filter: 'highpass', freq: 2800, pan });
      },
      bite: () => {
        this.noise({ t, dur: 0.15, vol: 0.4 * v, filter: 'lowpass', freq: 900, pan });
        this.tone({ t, freq: 300, glideTo: 90, dur: 0.2, type: 'square', vol: 0.2 * v, pan });
      },
      haltWhoosh: () => {
        this.noise({ t, dur: 0.8, vol: 0.35 * v, filter: 'bandpass', freq: 250, glideTo: 2000, q: 1, pan });
        this.tone({ t, freq: 55, dur: 0.8, type: 'sine', vol: 0.3 * v, pan });
      },
      jumpscare: () => {
        this.noise({ t, dur: 0.7, vol: 0.6 * v, filter: 'bandpass', freq: 900, q: 0.6, pan });
        this.tone({ t, freq: 400, glideTo: 100, dur: 0.6, type: 'sawtooth', vol: 0.35 * v, pan });
        this.tone({ t, freq: 620, glideTo: 130, dur: 0.6, type: 'sawtooth', vol: 0.3 * v, detune: 40, pan });
      },
      figureRoar: () => {
        this.tone({ t, freq: 55, glideTo: 130, dur: 1.4, type: 'sawtooth', vol: 0.4 * v, pan });
        this.tone({ t, freq: 68, glideTo: 160, dur: 1.4, type: 'sawtooth', vol: 0.3 * v, detune: -25, pan });
        this.noise({ t, dur: 1.3, vol: 0.4 * v, filter: 'lowpass', freq: 500, glideTo: 1600, pan });
      },
      figureStep: () => {
        this.noise({ t, dur: 0.1, vol: 0.22 * v, filter: 'lowpass', freq: 300, pan });
        this.tone({ t, freq: 60, glideTo: 35, dur: 0.22, type: 'sine', vol: 0.3 * v, pan });
      },
      heartbeat: () => {
        this.tone({ t, freq: 62, glideTo: 40, dur: 0.11, type: 'sine', vol: 0.5 * v, pan });
        this.tone({ t: t + 0.17, freq: 55, glideTo: 38, dur: 0.1, type: 'sine', vol: 0.38 * v, pan });
      },
      thunder: () => {
        this.noise({ t, dur: 1.8, vol: 0.3 * v, filter: 'lowpass', freq: 900, glideTo: 100, pan });
        this.tone({ t, freq: 50, glideTo: 28, dur: 1.6, type: 'sine', vol: 0.25 * v, pan });
      },
      chandelier: () => {
        this.noise({ t, dur: 0.5, vol: 0.4 * v, filter: 'highpass', freq: 2500, pan });
        this.tone({ t, freq: 100, glideTo: 40, dur: 0.5, type: 'triangle', vol: 0.3 * v, pan });
      },
      elevatorDing: () => {
        this.tone({ t, freq: NOTE.E5, dur: 0.5, type: 'sine', vol: 0.16 * v, pan });
        this.tone({ t: t + 0.02, freq: NOTE.E6, dur: 0.7, type: 'sine', vol: 0.08 * v, pan });
      },
      elevatorRumble: () => this.noise({ t, dur: 3, vol: 0.15 * v, filter: 'lowpass', freq: 140, pan }),
      gateSlam: () => {
        this.noise({ t, dur: 0.25, vol: 0.5 * v, filter: 'bandpass', freq: 900, q: 1, pan });
        this.tone({ t, freq: 200, glideTo: 60, dur: 0.4, type: 'square', vol: 0.2 * v, pan });
      },
      breaker: () => {
        this.noise({ t, dur: 0.05, vol: 0.3 * v, filter: 'highpass', freq: 2000, pan });
        this.tone({ t, freq: 150, dur: 0.06, type: 'square', vol: 0.1 * v, pan });
      },
      breakerGood: () => this.tone({ t, freq: 880, dur: 0.15, type: 'square', vol: 0.06 * v, pan }),
      breakerBad: () => this.tone({ t, freq: 160, dur: 0.4, type: 'square', vol: 0.12 * v, pan }),
      powerUp: () => {
        this.tone({ t, freq: 80, glideTo: 400, dur: 1.4, type: 'sawtooth', vol: 0.12 * v, pan });
        [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5].forEach((f, i) => this.tone({ t: t + 0.4 + i * 0.12, freq: f, dur: 0.3, type: 'triangle', vol: 0.1 * v, pan }));
      },
      glitch: () => {
        for (let i = 0; i < 8; i++)
          this.tone({ t: t + i * 0.04, freq: 200 + Math.random() * 2400, dur: 0.035, type: 'square', vol: 0.08 * v, pan: Math.random() * 1.6 - 0.8 });
      },
      guiding: () => {
        [NOTE.G5, NOTE.B5, NOTE.D6].forEach((f, i) => this.tone({ t: t + i * 0.15, freq: f, dur: 0.9, type: 'sine', vol: 0.07 * v, pan }));
      },
      shadowBoom: () => {
        this.tone({ t, freq: 45, dur: 1, type: 'sine', vol: 0.5 * v, pan });
        this.noise({ t, dur: 0.6, vol: 0.2 * v, filter: 'lowpass', freq: 300, pan });
      },
      seekGoo: () => {
        this.noise({ t, dur: 1.6, vol: 0.25 * v, filter: 'lowpass', freq: 250, glideTo: 800, pan });
        for (let i = 0; i < 5; i++)
          this.tone({ t: t + i * 0.22, freq: 90 + Math.random() * 60, glideTo: 60, dur: 0.3, type: 'triangle', vol: 0.12 * v, pan });
      },
      goblino: () => {
        // goofy little chatter blips
        for (let i = 0; i < 4; i++)
          this.tone({ t: t + i * 0.09, freq: 250 + Math.random() * 220, dur: 0.07, type: 'square', vol: 0.05 * v, pan });
      },
      lever: () => {
        this.noise({ t, dur: 0.1, vol: 0.2 * v, filter: 'bandpass', freq: 700, pan });
        this.tone({ t: t + 0.1, freq: 90, dur: 0.2, type: 'square', vol: 0.15 * v, pan });
      },
      spider: () => {
        this.noise({ t, dur: 0.3, vol: 0.3 * v, filter: 'highpass', freq: 3200, pan });
        this.tone({ t, freq: 800, glideTo: 1600, dur: 0.18, type: 'sawtooth', vol: 0.1 * v, pan });
      },
      crucifix: () => {
        [NOTE.C5, NOTE.G5, NOTE.C6, NOTE.E6].forEach((f, i) => this.tone({ t: t + i * 0.07, freq: f, dur: 0.7, type: 'sine', vol: 0.12 * v, pan }));
        this.noise({ t, dur: 0.8, vol: 0.15 * v, filter: 'highpass', freq: 5000, pan });
      },
      step: () => this.noise({ t, dur: 0.07, vol: 0.05 * v, filter: 'lowpass', freq: 480, a: 0.001, pan }),
      breath: () => this.noise({ t, dur: 0.5, vol: 0.05 * v, filter: 'bandpass', freq: 1000, q: 0.5, pan }),
    };
    (fx[name] || (() => {}))();
  }

  // ---------------- ambience ----------------

  _startAmbience() {
    const ctx = this.ctx;
    // low hotel drone: two detuned triangles through a slow-wobbling lowpass
    const g = ctx.createGain(); g.gain.value = 0.05; g.connect(this.ambBus);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160; f.connect(g);
    [55, 55.7, 36.7].forEach(fr => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
      o.connect(f); o.start();
    });
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 60;
    lfo.connect(lfoG); lfoG.connect(f.frequency); lfo.start();
    this._droneGain = g;

    // rain bed (used for courtyard / windows) — off by default
    const rg = ctx.createGain(); rg.gain.value = 0; rg.connect(this.ambBus);
    const rs = ctx.createBufferSource(); rs.buffer = this.noiseBuf; rs.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1800;
    rs.connect(rf); rf.connect(rg); rs.start();
    this._rainGain = rg;
  }

  setRain(on) {
    if (this._rainGain) this._rainGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 1.2);
  }
  // continuous rain loudness — used for the window-proximity swell
  setRainLevel(level) {
    if (this._rainGain) this._rainGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.4);
  }
  // smooth music ducking for monster presence
  fadeMusic(target, time = 1.5) {
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(target, this.ctx.currentTime, time / 3);
  }
  setDrone(level) {
    if (this._droneGain) this._droneGain.gain.setTargetAtTime(level, this.ctx.currentTime, 1.5);
  }

  // ---------------- generative music ----------------

  setMusic(name) {
    if (this.track === name) return;
    this.track = name;
    this._barIndex = 0;
    if (this.ctx) this._nextBarTime = this.ctx.currentTime + 0.1;
  }

  _musicTick() {
    if (!this.ctx || this.track === 'none') return;
    const ahead = 0.35;
    while (this._nextBarTime < this.ctx.currentTime + ahead) {
      const barLen = this._scheduleBar(this.track, this._nextBarTime, this._barIndex);
      if (!barLen) return;
      this._nextBarTime += barLen;
      this._barIndex++;
    }
  }

  _scheduleBar(track, t, bar) {
    const M = this.musicBus, N = NOTE;
    switch (track) {
      case 'lobby': {
        // eerie music-box waltz in A minor (original motif)
        const bpm = 76, beat = 60 / bpm, barLen = beat * 3;
        const motifs = [
          [N.A4, N.C5, N.E5], [N.G4, N.B4, N.E5], [N.F4, N.A4, N.D5], [N.E4, N.A4, N.C5],
        ];
        const m = motifs[bar % 4];
        m.forEach((f, i) => this.tone({ t: t + i * beat, freq: f, dur: beat * 0.92, type: 'sine', vol: 0.12, a: 0.004, rel: beat * 0.5, out: M }));
        // sparkle octave echo
        if (bar % 2 === 1) this.tone({ t: t + beat * 2, freq: m[2] * 2, dur: beat, type: 'sine', vol: 0.04, out: M });
        // low root
        this.tone({ t, freq: m[0] / 4, dur: barLen, type: 'triangle', vol: 0.07, a: 0.1, rel: 0.6, out: M });
        return barLen;
      }
      case 'dread': {
        // sparse tension: long low cluster + rare high pings
        const barLen = 3.2;
        this.tone({ t, freq: 49 + (bar % 3) * 4, dur: barLen, type: 'sawtooth', vol: 0.035, a: 1.2, rel: 1.2, out: M });
        this.tone({ t, freq: 65.4, dur: barLen, type: 'sine', vol: 0.05, a: 1, rel: 1, out: M });
        if (bar % 4 === 2) this.tone({ t: t + 1.2, freq: [N.Ds6, N.D6, N.As5][bar % 3], dur: 1.8, type: 'sine', vol: 0.025, a: 0.5, rel: 1, out: M });
        return barLen;
      }
      case 'chase': {
        // driving original chase loop in E minor, 4/4
        const bpm = 148, beat = 60 / bpm, barLen = beat * 4;
        const bassLines = [
          [N.E2, N.E2, N.G2, N.E2, N.A2, N.G2, N.Fs2, N.D2],
          [N.E2, N.E2, N.G2, N.E2, N.C3, N.B2, N.A2, N.B2],
        ];
        const bl = bassLines[bar % 2];
        bl.forEach((f, i) => this.tone({ t: t + i * beat / 2, freq: f, dur: beat * 0.42, type: 'sawtooth', vol: 0.14, a: 0.005, rel: 0.04, out: M }));
        for (let i = 0; i < 4; i++) this._kick(t + i * beat, M, 0.5);
        for (let i = 0; i < 8; i++) this._hat(t + i * beat / 2 + beat / 4, M, 0.06);
        this._snare(t + beat, M, 0.22); this._snare(t + beat * 3, M, 0.22);
        // stabby lead every 4 bars
        if (bar % 4 === 3) {
          [N.E4, N.D4, N.B3, N.D4].forEach((f, i) =>
            this.tone({ t: t + i * beat, freq: f, dur: beat * 0.5, type: 'square', vol: 0.05, out: M }));
        }
        return barLen;
      }
      case 'shop': {
        // relaxed swing loop (original) — safe haven
        const bpm = 92, beat = 60 / bpm, barLen = beat * 4;
        const chords = [
          [N.D3, N.Fs3, N.A3, N.C4], [N.G3, N.B3, N.D4, N.F4],
          [N.C3, N.E3, N.G3, N.B3], [N.A3, N.Cs4, N.E4, N.G4],
        ];
        const ch = chords[bar % 4];
        ch.forEach(f => this.tone({ t: t + beat * 0.5, freq: f, dur: beat * 2.6, type: 'triangle', vol: 0.045, a: 0.05, rel: 0.5, out: M }));
        this.tone({ t, freq: ch[0] / 2, dur: beat * 0.8, type: 'sine', vol: 0.13, out: M });
        this.tone({ t: t + beat * 2, freq: ch[2] / 2, dur: beat * 0.8, type: 'sine', vol: 0.11, out: M });
        for (let i = 0; i < 4; i++) this._hat(t + i * beat + (i % 2 ? beat * 0.66 : 0), M, 0.05);
        // lazy noodle melody
        if (bar % 2 === 0) {
          const mel = [ch[3], ch[2], ch[1]];
          mel.forEach((f, i) => this.tone({ t: t + beat * (1.5 + i), freq: f * 2, dur: beat * 0.7, type: 'sine', vol: 0.05, out: M }));
        }
        return barLen;
      }
      case 'library': {
        // hushed heartbeat pulse + high tension shimmer
        const barLen = 2.4;
        this.play('heartbeat', { vol: 0.35 });
        this.tone({ t, freq: N.C2, dur: barLen, type: 'sine', vol: 0.06, a: 0.8, rel: 0.8, out: M });
        if (bar % 3 === 1) this.tone({ t: t + 0.8, freq: N.G6, dur: 1.4, type: 'sine', vol: 0.018, a: 0.6, rel: 0.7, out: M });
        return barLen;
      }
      case 'finale': {
        // dark pulsing finale
        const bpm = 120, beat = 60 / bpm, barLen = beat * 4;
        for (let i = 0; i < 8; i++)
          this.tone({ t: t + i * beat / 2, freq: i % 2 ? N.C2 : N.C2 * 1.5, dur: beat * 0.4, type: 'sawtooth', vol: 0.07, out: M });
        this._kick(t, M, 0.4); this._kick(t + beat * 2, M, 0.4);
        if (bar % 2) this.tone({ t: t + beat, freq: N.Gs4, dur: beat * 2, type: 'sine', vol: 0.04, a: 0.3, out: M });
        return barLen;
      }
      case 'guiding': {
        // soft afterlife bells
        const barLen = 2.8;
        const seq = [[N.G5, N.D6], [N.E5, N.B5], [N.C5, N.G5], [N.D5, N.A5]];
        const s = seq[bar % 4];
        s.forEach((f, i) => this.tone({ t: t + i * 0.9, freq: f, dur: 2, type: 'sine', vol: 0.07, a: 0.05, rel: 1.4, out: M }));
        this.tone({ t, freq: N.C3, dur: barLen, type: 'triangle', vol: 0.04, a: 1, rel: 1, out: M });
        return barLen;
      }
      case 'elevator': {
        // groovy escape jam (original)
        const bpm = 112, beat = 60 / bpm, barLen = beat * 4;
        const bass = [N.C3, N.C3, N.Ds3, N.C3, N.F3, N.Ds3, N.C3, N.G2];
        bass.forEach((f, i) => this.tone({ t: t + i * beat / 2, freq: f, dur: beat * 0.4, type: 'triangle', vol: 0.16, out: M }));
        for (let i = 0; i < 4; i++) { this._kick(t + i * beat, M, 0.45); this._hat(t + i * beat + beat / 2, M, 0.07); }
        this._snare(t + beat, M, 0.18); this._snare(t + beat * 3, M, 0.18);
        const chords = [[N.C4, N.Ds4, N.G4], [N.As3, N.D4, N.F4]];
        chords[bar % 2].forEach(f => this.tone({ t: t + beat * 2, freq: f, dur: beat * 1.6, type: 'square', vol: 0.025, a: 0.04, out: M }));
        return barLen;
      }
    }
    return 0;
  }
}
