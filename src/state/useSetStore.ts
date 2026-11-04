import { create } from 'zustand';
import { defaultOptions, rebuildPlan } from '@/core/sequencer';import { toTracksWithKey } from '@/core/track';
import type {
  PlanResult,
  SequencingOptions,
  TrackWithKey,
} from '@/core/types';
import { getDemoTracks, DEMO_GENRES } from '@/data/mockTracks';
import { readCache, writeCache } from '@/services/cache';
import { planInWorker } from '@/workers/planClient';

export type PlanStatus = 'idle' | 'planning' | 'ready' | 'error';
export type SourceMode = 'demo' | 'spotify';

/** Last imported crate, so a relaunch does not silently fall back to demo. */
const CRATE_CACHE_KEY = 'crate:last';
const CRATE_TTL = 14 * 24 * 60 * 60 * 1000;

interface SetState {
  source: SourceMode;
  allTracks: TrackWithKey[];
  activeGenres: string[];
  options: SequencingOptions;
  plan: PlanResult | null;
  status: PlanStatus;
  progress: number;
  progressDetail: string;
  error: string | null;
  selectedSlot: number | null;
  flashIndex: number | null;
  lastGeneratedAt: number | null;

  generate: () => Promise<void>;
  toggleGenre: (genre: string) => void;
  clearGenres: () => void;
  patchOptions: (patch: Partial<SequencingOptions>) => void;
  reorder: (from: number, to: number) => void;
  removeSlot: (index: number) => void;
  insertBridge: (gapIndex: number, track: TrackWithKey) => void;
  /** Replace the active plan wholesale (used by the Routes view). */
  setPlan: (plan: PlanResult) => void;
  /** Append a crate track to the end of the set and re-validate. */
  appendTrack: (track: TrackWithKey) => void;
  selectSlot: (index: number | null) => void;
  loadTracks: (tracks: TrackWithKey[], source?: SourceMode) => void;
  /** Restore the last Spotify crate from cache (boot). Returns false when none. */
  restoreCrate: () => boolean;
  /** Leave Spotify data and go back to the built-in demo crate. */
  loadDemo: () => void;
  reset: () => void;
}

let flashTimer: ReturnType<typeof setTimeout> | null = null;

export const useSetStore = create<SetState>((set, get) => ({
  source: 'demo',
  allTracks: getDemoTracks(),
  activeGenres: ['afro-house'],
  options: defaultOptions({ bpmRange: [116, 126], targetCount: 40 }),
  plan: null,
  status: 'idle',
  progress: 0,
  progressDetail: '',
  error: null,
  selectedSlot: null,
  flashIndex: null,
  lastGeneratedAt: null,

  generate: async () => {
    const { allTracks, activeGenres, options, status } = get();
    if (status === 'planning') return;

    const crate = crateFor(allTracks, activeGenres);
    set({
      status: 'planning',
      progress: 0,
      progressDetail: 'Krate hazırlanıyor',
      error: null,
    });

    try {
      const plan = await planInWorker(crate, options, (progress, detail) => {
        set({ progress, progressDetail: detail ?? '' });
      });
      set({
        plan,
        status: 'ready',
        progress: 1,
        progressDetail: '',
        selectedSlot: plan.slots.length > 0 ? 0 : null,
        flashIndex: null,
        lastGeneratedAt: Date.now(),
      });
    } catch (error) {
      set({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Set üretilemedi. Lütfen tekrar deneyin.',
      });
    }
  },

  toggleGenre: (genre) => {
    const active = get().activeGenres;
    const next = active.includes(genre)
      ? active.filter((g) => g !== genre)
      : [...active, genre];
    set({ activeGenres: next });
  },

  clearGenres: () => set({ activeGenres: [] }),

  patchOptions: (patch) => {
    set({ options: { ...get().options, ...patch } });
  },

  reorder: (from, to) => {
    const plan = get().plan;
    if (!plan || from === to) return;
    const slots = [...plan.slots];
    if (from < 0 || from >= slots.length || to < 0 || to >= slots.length) return;
    const [moved] = slots.splice(from, 1);
    slots.splice(to, 0, moved);

    const rebuilt = rebuildPlan(
      slots.map((s) => s.track),
      plan.options,
      plan.bridges,
      plan.warnings.filter((w) => w.code !== 'WEAK_TRANSITION'),
    );

    set({
      plan: rebuilt,
      selectedSlot: to,
      flashIndex: to,
    });
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => set({ flashIndex: null }), 1400);
  },

  removeSlot: (index) => {
    const plan = get().plan;
    if (!plan) return;
    const slots = plan.slots.filter((_, i) => i !== index);
    if (slots.length === 0) {
      set({ plan: null, status: 'idle' });
      return;
    }
    const rebuilt = rebuildPlan(
      slots.map((s) => s.track),
      plan.options,
      plan.bridges,
      plan.warnings.filter((w) => w.code !== 'WEAK_TRANSITION'),
    );
    set({
      plan: rebuilt,
      selectedSlot: Math.min(index, rebuilt.slots.length - 1),
    });
  },

  insertBridge: (gapIndex, track) => {
    const plan = get().plan;
    if (!plan) return;
    const slots = [...plan.slots];
    const at = Math.min(slots.length, Math.max(0, gapIndex + 1));
    const rebuiltSlots = [
      ...slots.slice(0, at).map((s) => s.track),
      track,
      ...slots.slice(at).map((s) => s.track),
    ];
    const rebuilt = rebuildPlan(
      rebuiltSlots,
      plan.options,
      plan.bridges,
      plan.warnings.filter((w) => w.code !== 'WEAK_TRANSITION'),
    );
    rebuilt.slots[at] = { ...rebuilt.slots[at], isBridge: true };
    set({ plan: rebuilt, selectedSlot: at, flashIndex: at });
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => set({ flashIndex: null }), 1400);
  },

  selectSlot: (index) => set({ selectedSlot: index }),

  setPlan: (plan) =>
    set({
      plan,
      status: 'ready',
      progress: 1,
      progressDetail: '',
      selectedSlot: plan.slots.length > 0 ? 0 : null,
      flashIndex: null,
      error: null,
      lastGeneratedAt: Date.now(),
    }),

  appendTrack: (track) => {
    const plan = get().plan;
    if (!plan) {
      set({ error: 'Önce bir set üret, sonra şarkı ekleyebilirsin.' });
      return;
    }
    if (plan.slots.some((s) => s.track.id === track.id)) {
      set({ error: `"${track.title}" zaten sette.` });
      return;
    }
    const rebuilt = rebuildPlan(
      [...plan.slots.map((s) => s.track), track],
      plan.options,
      plan.bridges,
      plan.warnings.filter((w) => w.code !== 'WEAK_TRANSITION'),
    );
    set({
      plan: rebuilt,
      selectedSlot: rebuilt.slots.length - 1,
      flashIndex: rebuilt.slots.length - 1,
      error: null,
    });
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => set({ flashIndex: null }), 1400);
  },

  loadTracks: (tracks, source = 'spotify') => {
    set({
      allTracks: toTracksWithKey(tracks),
      source,
      activeGenres: [],
      plan: null,
      status: 'idle',
      selectedSlot: null,
    });
    // Remember the last real crate so the next launch opens with the user's
    // music instead of the demo pool.
    if (source === 'spotify' && tracks.length > 0) {
      writeCache(CRATE_CACHE_KEY, tracks, CRATE_TTL);
    }
  },

  restoreCrate: () => {
    const cached = readCache<TrackWithKey[]>(CRATE_CACHE_KEY);
    if (!cached || cached.length === 0) return false;
    set({
      allTracks: toTracksWithKey(cached),
      source: 'spotify',
      activeGenres: [],
      plan: null,
      status: 'idle',
      selectedSlot: null,
      error: null,
    });
    return true;
  },

  loadDemo: () => {
    set({
      allTracks: getDemoTracks(),
      source: 'demo',
      activeGenres: ['afro-house'],
      plan: null,
      status: 'idle',
      selectedSlot: null,
      error: null,
    });
  },

  reset: () =>
    set({
      plan: null,
      status: 'idle',
      selectedSlot: null,
      error: null,
      progress: 0,
      flashIndex: null,
    }),
}));

export function crateFor(tracks: TrackWithKey[], genres: string[]): TrackWithKey[] {
  if (genres.length === 0) return tracks;
  return tracks.filter((t) => t.genres.some((g) => genres.includes(g)));
}

export function useCrate(): TrackWithKey[] {
  const allTracks = useSetStore((s) => s.allTracks);
  const activeGenres = useSetStore((s) => s.activeGenres);
  return crateFor(allTracks, activeGenres);
}

export function genreCounts(tracks: TrackWithKey[]): Array<{ genre: string; count: number }> {
  const map = new Map<string, number>();
  for (const t of tracks) {
    for (const g of t.genres) {
      if (!DEMO_GENRES.includes(g)) continue;
      map.set(g, (map.get(g) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count);
}
