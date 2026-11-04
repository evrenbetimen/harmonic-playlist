import { create } from 'zustand';
import type { TrackWithKey } from '@/core/types';

/** Where the audio you are hearing actually came from. */
export type AudioSource = 'spotify' | 'isrc' | 'search' | 'itunes' | 'synth' | null;

interface PlayerState {
  track: TrackWithKey | null;
  index: number | null;
  playing: boolean;
  /** 0..1 */
  progress: number;
  duration: number;
  volume: number;
  crossfade: number;
  autoMix: boolean;
  loading: boolean;
  /**
   * Which resolver produced the current audio. `synth` means the built-in pad is
   * playing because no real preview exists — the UI must say so instead of
   * letting the user believe they are hearing the track.
   */
  audioSource: AudioSource;
  /** Explanation shown next to the source badge. */
  audioNote: string | null;

  setTrack: (track: TrackWithKey, index: number) => void;
  setPlaying: (playing: boolean) => void;
  setProgress: (progress: number, duration: number) => void;
  setVolume: (volume: number) => void;
  setCrossfade: (seconds: number) => void;
  toggleAutoMix: () => void;
  setAudioInfo: (source: AudioSource, note: string | null) => void;
  clear: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  track: null,
  index: null,
  playing: false,
  progress: 0,
  duration: 0,
  volume: 0.75,
  crossfade: 4,
  autoMix: true,
  loading: false,
  audioSource: null,
  audioNote: null,

  setTrack: (track, index) =>
    set({
      track,
      index,
      progress: 0,
      duration: 30,
      playing: false,
      // Never let the previous track's source badge describe the new one.
      audioSource: null,
      audioNote: null,
    }),

  setPlaying: (playing) => set({ playing }),

  setProgress: (progress, duration) => set({ progress, duration }),

  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),

  setCrossfade: (seconds) => set({ crossfade: Math.min(12, Math.max(0, seconds)) }),

  toggleAutoMix: () => set((s) => ({ autoMix: !s.autoMix })),

  setAudioInfo: (audioSource, audioNote) => set({ audioSource, audioNote }),

  clear: () =>
    set({
      track: null,
      index: null,
      playing: false,
      progress: 0,
      duration: 0,
      audioSource: null,
      audioNote: null,
    }),
}));
