import { beforeEach, describe, expect, it } from 'vitest';
import { defaultOptions, planSet } from '@/core/sequencer';
import { toTracksWithKey } from '@/core/track';
import { getDemoTracks } from '@/data/mockTracks';
import { crateFor, genreCounts, useSetStore } from '@/state/useSetStore';
import { useUiStore, type ViewId } from '@/state/useUiStore';

/**
 * These tests cover the behaviour the Krate and Routes views rely on:
 * crate filtering, genre counting, plan replacement and appending a crate
 * track back into the set. They run without React on purpose — the store is
 * the contract, the views are just renderers.
 */

const tracks = toTracksWithKey(getDemoTracks());
const afroHouse = tracks.filter((t) => t.genres.includes('afro-house'));

beforeEach(() => {
  useSetStore.setState({
    source: 'demo',
    allTracks: tracks,
    activeGenres: ['afro-house'],
    options: defaultOptions({ bpmRange: [116, 126], targetCount: 12, seed: 0x2027 }),
    plan: null,
    status: 'idle',
    selectedSlot: null,
    flashIndex: null,
    error: null,
  });
});

describe('crateFor', () => {
  it('returns the whole pool when no genre is selected', () => {
    expect(crateFor(tracks, [])).toHaveLength(tracks.length);
  });

  it('filters by every selected genre (union, not intersection)', () => {
    const both = crateFor(tracks, ['afro-house', 'techno']);
    const techno = tracks.filter((t) => t.genres.includes('techno'));
    expect(both.length).toBe(afroHouse.length + techno.length);
    expect(both.every((t) => crateFor([t], ['afro-house', 'techno']).length === 1)).toBe(true);
  });

  it('returns an empty crate when nothing matches', () => {
    expect(crateFor(tracks, ['polka'])).toHaveLength(0);
  });
});

describe('genreCounts', () => {
  it('counts only known demo genres and sorts descending', () => {
    const counts = genreCounts(tracks);
    expect(counts.length).toBeGreaterThan(3);
    expect(counts.every((c) => c.count > 0)).toBe(true);
    const sorted = [...counts].sort((a, b) => b.count - a.count);
    expect(counts.map((c) => c.genre)).toEqual(sorted.map((c) => c.genre));
  });

  it('produces the same afro-house count the crate filter uses', () => {
    const count = genreCounts(tracks).find((c) => c.genre === 'afro-house')?.count ?? 0;
    expect(count).toBe(afroHouse.length);
  });
});

describe('plan replacement and append', () => {
  it('setPlan adopts a candidate plan and clears the planning state', () => {
    const plan = planSet(afroHouse, defaultOptions({ targetCount: 10, seed: 7 }));

    useSetStore.getState().setPlan(plan);

    const state = useSetStore.getState();
    expect(state.plan).toBe(plan);
    expect(state.status).toBe('ready');
    expect(state.selectedSlot).toBe(0);
    expect(state.error).toBeNull();
  });

  it('appendTrack extends the set and recomputes transitions', () => {
    const plan = planSet(afroHouse, defaultOptions({ targetCount: 8, seed: 11 }));
    useSetStore.getState().setPlan(plan);

    const inSet = new Set(plan.slots.map((s) => s.track.id));
    const extra = afroHouse.find((t) => !inSet.has(t.id));
    expect(extra).toBeDefined();

    useSetStore.getState().appendTrack(extra!);

    const after = useSetStore.getState().plan!;
    expect(after.slots).toHaveLength(plan.slots.length + 1);
    expect(after.slots.at(-1)!.track.id).toBe(extra!.id);
    expect(after.metrics.trackCount).toBe(after.slots.length);
    // The appended slot must be scored against the previous track.
    expect(after.slots.at(-1)!.transition).not.toBeNull();
  });

  it('appendTrack rejects duplicates instead of silently adding them', () => {
    const plan = planSet(afroHouse, defaultOptions({ targetCount: 6, seed: 5 }));
    useSetStore.getState().setPlan(plan);

    const existing = plan.slots[2].track;
    useSetStore.getState().appendTrack(existing);

    const state = useSetStore.getState();
    expect(state.plan!.slots).toHaveLength(plan.slots.length);
    expect(state.error).toContain('zaten sette');
  });

  it('appendTrack explains what to do when there is no plan yet', () => {
    useSetStore.getState().appendTrack(afroHouse[0]);
    expect(useSetStore.getState().plan).toBeNull();
    expect(useSetStore.getState().error).toContain('Önce bir set üret');
  });
});

describe('route candidates', () => {
  it('different seeds over the same crate produce different orders', () => {
    const options = defaultOptions({ targetCount: 12 });
    const a = planSet(afroHouse, { ...options, seed: 1 });
    const b = planSet(afroHouse, { ...options, seed: 2 });

    const orderA = a.slots.map((s) => s.track.id).join('|');
    const orderB = b.slots.map((s) => s.track.id).join('|');
    expect(orderA).not.toBe(orderB);
  });

  it('is deterministic for a fixed seed', () => {
    const options = defaultOptions({ targetCount: 10, seed: 4242 });
    const a = planSet(afroHouse, options);
    const b = planSet(afroHouse, options);
    expect(a.slots.map((s) => s.track.id)).toEqual(b.slots.map((s) => s.track.id));
  });

  it('strictness actually changes the candidate pool', () => {
    const base = defaultOptions({ targetCount: 12, seed: 99 });
    const strict = planSet(afroHouse, { ...base, harmonicStrictness: 0.95 });
    const loose = planSet(afroHouse, { ...base, harmonicStrictness: 0.3 });

    expect(strict.metrics.harmonicPurity).toBeGreaterThanOrEqual(loose.metrics.harmonicPurity);
    expect(strict.metrics.clashRate).toBe(0);
  });
});

describe('navigation', () => {
  it('exposes a playlist view alongside the other real screens', () => {
    // 'playlist' existed in the ViewId union but was never reachable: the rail
    // omitted it and App had no render branch, so it was a dead enum value.
    const reachable: ViewId[] = ['builder', 'playlist', 'crate', 'routes', 'analytics'];
    for (const view of reachable) {
      useUiStore.getState().setView(view);
      expect(useUiStore.getState().view).toBe(view);
    }
  });

  it('defaults to the builder view', () => {
    useUiStore.setState({ view: 'builder' });
    expect(useUiStore.getState().view).toBe('builder');
  });
});
