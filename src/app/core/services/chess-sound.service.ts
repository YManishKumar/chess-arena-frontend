import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ChessSoundService {
  private ctx: AudioContext | null = null;
  private reverbBuffer: AudioBuffer | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.buildReverb();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // Short stone-room reverb impulse response
  private buildReverb() {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len  = Math.floor(rate * 0.38);
    const buf  = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
      }
    }
    this.reverbBuffer = buf;
  }

  // Burst of filtered noise — initial marble contact transient
  private noise(freq: number, q: number, gain: number, decay: number, delayMs = 0) {
    const ctx = this.getCtx();
    setTimeout(() => {
      try {
        const rate    = ctx.sampleRate;
        const bufLen  = Math.floor(rate * 0.05);
        const buf     = ctx.createBuffer(1, bufLen, rate);
        const data    = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.25));
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;

        const bpf = ctx.createBiquadFilter();
        bpf.type = 'bandpass';
        bpf.frequency.value = freq;
        bpf.Q.value = q;

        const env = ctx.createGain();
        env.gain.setValueAtTime(gain, ctx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + decay);

        const wet   = ctx.createGain(); wet.gain.value = 0.22;
        const conv  = ctx.createConvolver();
        if (this.reverbBuffer) conv.buffer = this.reverbBuffer;

        src.connect(bpf);
        bpf.connect(env);
        env.connect(ctx.destination);
        // Wet reverb path
        if (this.reverbBuffer) {
          env.connect(wet); wet.connect(conv); conv.connect(ctx.destination);
        }
        src.start();
      } catch { /* audio unavailable */ }
    }, delayMs);
  }

  // Tonal oscillator + decay — stone body resonance
  private tone(freq: number, gain: number, decay: number, delayMs = 0) {
    const ctx = this.getCtx();
    setTimeout(() => {
      try {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass';
        lpf.frequency.value = freq * 2.2;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.55, ctx.currentTime + decay * 0.8);

        env.gain.setValueAtTime(gain, ctx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + decay);

        osc.connect(lpf); lpf.connect(env); env.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + decay + 0.01);
      } catch { /* audio unavailable */ }
    }, delayMs);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Soft marble slide + light stone placement
  playMove() {
    this.noise(2800, 3.5, 0.28, 0.10);        // crisp click transient
    this.noise(900,  2.0, 0.18, 0.22, 18);    // stone body
    this.tone(380,   0.10, 0.30, 35);          // low resonance
  }

  // Heavy marble-on-marble impact with short reverb tail
  playCapture() {
    this.noise(1800, 2.5, 0.52, 0.14);        // hard impact crack
    this.noise(600,  1.8, 0.38, 0.35, 12);    // stone thud body
    this.tone(220,   0.22, 0.45, 20);          // low boom
    this.noise(3500, 4.0, 0.20, 0.08, 5);     // bright impact sparkle
  }

  // Subtle luxury chime — check
  playCheck() {
    this.tone(1480, 0.18, 0.55);
    this.tone(1980, 0.12, 0.45, 75);
  }

  // Rising chimes — checkmate
  playCheckmate() {
    this.tone(1480, 0.20, 0.60);
    this.tone(1980, 0.16, 0.55, 85);
    this.tone(2480, 0.12, 0.65, 185);
  }

  // Muted premium error — invalid move
  playInvalid() {
    this.noise(280, 1.2, 0.18, 0.22);
    this.tone(160, 0.10, 0.25, 15);
  }
}
