import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackWithKey } from '@/core/types';
import type { PlayReport } from '@/audio/previewEngine';

/**
 * Playback wiring.
 *
 * The engine reports *which* resolver produced the audio; the UI is only
 * honest if that report actually reaches the player store and the loading flag
 * is always cleared. These tests pin that contract, including the failure
 * path, because a swallowed error here is what made the old synth fallback
 * silent and confusing.
 */

const playReport = vi.fn<(t: TrackWithKey) => Promise<PlayReport>>();

vi.mock('@/audio/previewEngine', () => ({
  previewEngine: {
    setCrossfade: vi.fn(),
    playReport: (t: TrackWithKey) => playReport(t),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
  },
}));

vi.mock('@/services/previews', () => ({
  clearPreviewCache: vi.fn(),
}));

const track = {
  id: 'spotify-1',
  uri: 'spotify:track:1',
  title: 'Downfall',
  artist: 'Innellea',
  artists: ['Innellea'],
  album: 'Downfall - Single',
  artworkUrl: null,
  previewUrl: null,
  isrc: 'GBENL2303736',
  durationMs: 364_000,
  popularity: 60,
  explicit: false,
  genres: ['Techno'],
  features: {
    energy: 0.78,
    danceability: 0.62,
    valence: 0.28,
    acousticness: 0.02,
    speechiness: 0.04,
    instrumentalness: 0.86,
    tempo: 124,
    key: 9,
    mode: 1,
    source: 'reccobeats' as const,
  },
  camelot: '10B' as const,
  camelotId: 21,
} as unknown as TrackWithKey;

async function load() {
  vi.resetModules();
  const setStore = await import('@/state/useSetStore');
  const playerStore = await import('@/state/usePlayerStore');
  const playback = await import('@/state/playback');
  return { setStore, playerStore, playback };
}

function seedPlan(setStore: Awaited<ReturnType<typeof load>>['setStore']): void {
  setStore.useSetStore.setState({
    plan: {
      id: 'plan-1',
      createdAt: Date.now(),
      slots: [{ track, score: 98, reasons: [], transition: null }],
      stats: { averageScore: 98 },
    } as never,
    selectedSlot: 0,
  });
}

beforeEach(() => {
  playReport.mockReset();
});

describe('playSlot', () => {
  it('stores the resolver that actually played', async () => {
    const { setStore, playerStore, playback } = await load();
    seedPlan(setStore);
    playReport.mockResolvedValue({ ok: true, source: 'itunes' });

    playback.playSlot(0);
    await vi.waitFor(() => expect(playerStore.usePlayerStore.getState().audioSource).toBe('itunes'));

    const p = playerStore.usePlayerStore.getState();
    expect(p.playing).toBe(true);
    expect(p.loading).toBe(false);
    expect(p.audioNote).toBeNull();
  });

  it('surfaces the reason when only the synth is available', async () => {
    const { setStore, playerStore, playback } = await load();
    seedPlan(setStore);
    playReport.mockResolvedValue({
      ok: true,
      source: 'synth',
      note: 'Bu kayıt için 30 sn önizleme bulunamadı — sentetik önizleme çalınıyor.',
    });

    playback.playSlot(0);
    await vi.waitFor(() => expect(playerStore.usePlayerStore.getState().audioSource).toBe('synth'));

    const p = playerStore.usePlayerStore.getState();
    expect(p.audioNote).toContain('sentetik');
    expect(p.loading).toBe(false);
  });

  it('shows loading while the resolver is in flight', async () => {
    const { setStore, playerStore, playback } = await load();
    seedPlan(setStore);

    let release!: (r: PlayReport) => void;
    playReport.mockReturnValue(new Promise<PlayReport>((res) => (release = res)));

    playback.playSlot(0);
    await vi.waitFor(() => expect(playerStore.usePlayerStore.getState().loading).toBe(true));
    release({ ok: true, source: 'itunes' });
    await vi.waitFor(() => expect(playerStore.usePlayerStore.getState().loading).toBe(false));
  });

  it('never leaves the player stuck when the engine throws', async () => {
    const { setStore, playerStore, playback } = await load();
    seedPlan(setStore);
    playReport.mockRejectedValue(new Error('resolver exploded'));

    playback.playSlot(0);
    await vi.waitFor(() => expect(playerStore.usePlayerStore.getState().loading).toBe(false));

    const p = playerStore.usePlayerStore.getState();
    expect(p.playing).toBe(false);
    expect(p.audioSource).toBe('synth');
    expect(p.audioNote).toContain('Önizleme çözümlenemedi');
  });

  it('clears the previous source when a new track is selected', async () => {
    const { setStore, playerStore, playback } = await load();
    seedPlan(setStore);
    playReport.mockResolvedValue({ ok: true, source: 'itunes' });

    playback.playSlot(0);
    await vi.waitFor(() => expect(playerStore.usePlayerStore.getState().audioSource).toBe('itunes'));

    playerStore.usePlayerStore.getState().setTrack({ ...track, id: 'other' } as TrackWithKey, 1);
    expect(playerStore.usePlayerStore.getState().audioSource).toBeNull();
    expect(playerStore.usePlayerStore.getState().audioNote).toBeNull();
  });
});

describe('retryPreview', () => {
  it('drops the cache and re-resolves the current track', async () => {
    const { setStore, playerStore, playback } = await load();
    seedPlan(setStore);
    playReport.mockResolvedValueOnce({ ok: true, source: 'synth', note: 'bulunamadı' });

    playback.playSlot(0);
    await vi.waitFor(() => expect(playerStore.usePlayerStore.getState().audioSource).toBe('synth'));

    // Second attempt now finds real audio.
    playReport.mockResolvedValueOnce({ ok: true, source: 'itunes' });
    await playback.retryPreview();

    const p = playerStore.usePlayerStore.getState();
    expect(p.audioSource).toBe('itunes');
    expect(p.loading).toBe(false);
    expect(playReport).toHaveBeenCalledTimes(2);

    const { clearPreviewCache } = await import('@/services/previews');
    expect(clearPreviewCache).toHaveBeenCalledWith('GBENL2303736', 'Downfall', 'Innellea');
  });

  it('is a no-op when nothing is loaded', async () => {
    const { playback } = await load();
    await expect(playback.retryPreview()).resolves.toBeUndefined();
    expect(playReport).not.toHaveBeenCalled();
  });
});
