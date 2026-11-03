import { create } from 'zustand';
import type { TrackWithKey } from '@/core/types';

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

  setTrack: (track: TrackWithKey, index: number) => void;
  setPlaying: (playing: boolean) => void;
  setProgress: (progress: number, duration: number) => void;
  setVolume: (volume: number) => void;
  setCrossfade: (seconds: number) => void;
  toggleAutoMix: () => void;
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

  setTrack: (track, index) =>
    set({ track, index, progress: 0, duration: 30, playing: false }),

  setPlaying: (playing) => set({ playing }),

  setProgress: (progress, duration) => set({ progress, duration }),

  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),

  setCrossfade: (seconds) => set({ crossfade: Math.min(12, Math.max(0, seconds)) }),

  toggleAutoMix: () => set((s) => ({ autoMix: !s.autoMix })),

  clear: () =>
    set({ track: null, index: null, playing: false, progress: 0, duration: 0 }),
}));
