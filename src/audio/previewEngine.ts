import { camelotToPitchClass, keyColor } from '@/core/camelot';
import type { TrackWithKey } from '@/core/types';

/**
 * Preview engine.
 *
 * Two sources, one crossfader:
 *   · Spotify 30s MP3  → decoded into an AudioBuffer (sample-accurate starts)
 *   · Demo tracks      → a procedural chord pad synthesised from the Camelot
 *                        key + BPM, so the app is fully playable offline and
 *                        the "harmonic" promise is actually audible.
 *
 * Every voice owns a GainNode. Switching tracks ramps the old gain to 0 while
 * the new one ramps up — that is the crossfade, not a CSS animation.
 */

interface Voice {
  gain: GainNode;
  startedAt: number;
  duration: number;
  stop: (when: number) => void;
}

const PREVIEW_SECONDS = 30;
const MAX_BUFFER_CACHE = 12;

export class PreviewEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private voice: Voice | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private volume = 0.75;
  private crossfade = 4;
  private suspended = false;

  get contextState(): AudioContextState | 'uninitialised' {
    return this.ctx?.state ?? 'uninitialised';
  }

  ensure(): AudioContext {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.suspended) void this.ctx.resume();
      return this.ctx;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: 'interactive' });

    const master = ctx.createGain();
    master.gain.value = this.volume;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;

    master.connect(analyser);
    analyser.connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;
    this.analyser = analyser;
    this.samples = new Float32Array(analyser.fftSize);
    return ctx;
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.06);
    }
  }

  setCrossfade(seconds: number): void {
    this.crossfade = Math.max(0, seconds);
  }

  /**
   * Start a track, crossfading from whatever is playing.
   * Returns false when the browser refuses to start audio.
   */
  async play(track: TrackWithKey, crossfadeOverride?: number): Promise<boolean> {
    const ctx = this.ensure();
    this.suspended = false;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }

    const fade = crossfadeOverride ?? this.crossfade;
    this.stopVoice(this.voice, fade);
    this.voice = null;

    const dest = this.master;
    if (!dest) return false;

    const voice = track.previewUrl
      ? await this.createBufferVoice(ctx, dest, track, fade)
      : this.createSynthVoice(ctx, dest, track, fade);

    if (!voice) return false;
    this.voice = voice;
    return true;
  }

  pause(): void {
    if (this.ctx?.state === 'running') {
      this.suspended = true;
      void this.ctx.suspend();
    }
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') {
      this.suspended = false;
      void this.ctx.resume();
    }
  }

  stop(fade = 0.25): void {
    this.stopVoice(this.voice, fade);
    this.voice = null;
  }

  /** 0..1 playback position of the active voice. */
  getProgress(): number {
    if (!this.voice || !this.ctx) return 0;
    const elapsed = this.ctx.currentTime - this.voice.startedAt;
    return Math.min(1, Math.max(0, elapsed / this.voice.duration));
  }

  getElapsed(): number {
    if (!this.voice || !this.ctx) return 0;
    return Math.max(0, this.ctx.currentTime - this.voice.startedAt);
  }

  getDuration(): number {
    return this.voice?.duration ?? 0;
  }

  /** RMS 0..1 for the master meter. */
  getLevel(): number {
    if (!this.analyser || !this.samples) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (let i = 0; i < this.samples.length; i++) sum += this.samples[i] * this.samples[i];
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 3.2);
  }

  /* ---------------------------------------------------------------- */

  private stopVoice(voice: Voice | null, fade: number): void {
    if (!voice || !this.ctx) return;
    const now = this.ctx.currentTime;
    const when = now + Math.max(0.02, fade);
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0.0001, when);
      voice.stop(when + 0.02);
    } catch {
      /* already stopped */
    }
  }

  private async createBufferVoice(
    ctx: AudioContext,
    dest: GainNode,
    track: TrackWithKey,
    fade: number,
  ): Promise<Voice | null> {
    const url = track.previewUrl!;
    let buffer = this.buffers.get(url);

    if (!buffer) {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(`preview ${res.status}`);
        const data = await res.arrayBuffer();
        buffer = await ctx.decodeAudioData(data);
        if (this.buffers.size >= MAX_BUFFER_CACHE) {
          const oldest = this.buffers.keys().next().value;
          if (oldest) this.buffers.delete(oldest);
        }
        this.buffers.set(url, buffer);
      } catch {
        // CORS / expired URL → fall back to the synth so playback never dies.
        return this.createSynthVoice(ctx, dest, track, fade);
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    source.connect(gain);
    gain.connect(dest);

    const now = ctx.currentTime;
    const duration = Math.min(buffer.duration, PREVIEW_SECONDS);
    source.start(now);
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(1, now + Math.max(0.03, fade));

    return {
      gain,
      startedAt: now,
      duration,
      stop: (when) => {
        try {
          source.stop(when);
        } catch {
          /* noop */
        }
      },
    };
  }

  private createSynthVoice(
    ctx: AudioContext,
    dest: GainNode,
    track: TrackWithKey,
    fade: number,
  ): Voice {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(dest);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
    filter.connect(gain);

    const pc = track.camelot ? camelotToPitchClass(track.camelot) : 0;
    const minor = track.camelot?.letter !== 'B';
    const rootMidi = 45 + pc; // A2-ish register
    const root = 440 * Math.pow(2, (rootMidi - 69) / 12);
    const intervals = minor ? [0, 3, 7, 10, 12] : [0, 4, 7, 11, 12];
    const oscillators: OscillatorNode[] = [];

    for (let i = 0; i < intervals.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'triangle' : 'sine';
      const detune = i % 2 === 0 ? -4 : 5;
      osc.frequency.value = root * Math.pow(2, intervals[i] / 12);
      osc.detune.value = detune;

      const partial = ctx.createGain();
      partial.gain.value = i === 0 ? 0.24 : 0.13;
      osc.connect(partial);
      partial.connect(filter);
      osc.start(now);
      oscillators.push(osc);
    }

    // Slow filter breathing — gives the pad movement without a sequencer.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 380;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);
    lfo.start(now);
    oscillators.push(lfo);

    // Beat-synced amplitude pulse, so the BPM is audible/feelable.
    const pulse = ctx.createOscillator();
    pulse.frequency.value = Math.max(0.4, track.features.tempo / 60 / 2);
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.035;
    pulse.connect(pulseDepth);
    pulseDepth.connect(gain.gain);
    pulse.start(now);
    oscillators.push(pulse);

    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.5, now + Math.max(0.05, fade));

    const duration = PREVIEW_SECONDS;

    return {
      gain,
      startedAt: now,
      duration,
      stop: (when) => {
        for (const osc of oscillators) {
          try {
            osc.stop(when);
          } catch {
            /* noop */
          }
        }
      },
    };
  }
}

export const previewEngine = new PreviewEngine();
export { keyColor };
