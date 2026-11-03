import { describe, expect, it } from 'vitest';
import { defaultOptions, findBridges, planSet, rebuildPlan } from '@/core/sequencer';
import { getDemoTracks } from '@/data/mockTracks';
import { makeTrack } from '@/core/track';
import type { TrackWithKey } from '@/core/types';

function afroCrate(): TrackWithKey[] {
  return getDemoTracks().filter((t) => t.genres.includes('afro-house'));
}

const OPTS = defaultOptions({
  targetCount: 40,
  bpmRange: [116, 126],
  profile: 'steady-climb',
  seed: 2027,
  harmonicStrictness: 0.72,
  allowBridges: true,
});

describe('planSet — end-to-end sequencing', () => {
  const crate = afroCrate();

  it('produces exactly the requested number of tracks when the crate allows it', () => {
    const result = planSet(crate, OPTS);
    expect(result.slots).toHaveLength(40);
    expect(result.metrics.trackCount).toBe(40);
  });

  it('produces zero key clashes on the generated set', () => {
    const result = planSet(crate, OPTS);
    expect(result.metrics.clashRate).toBe(0);
    for (const slot of result.slots.slice(1)) {
      expect(slot.transition?.key.clash).toBe(false);
    }
  });

  it('never repeats a track and respects the requested BPM window', () => {
    const result = planSet(crate, OPTS);
    const ids = result.slots.map((s) => s.track.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const slot of result.slots) {
      expect(slot.track.features.tempo).toBeGreaterThanOrEqual(116);
      expect(slot.track.features.tempo).toBeLessThanOrEqual(126);
    }
  });

  it('builds a rising energy curve for steady-climb', () => {
    const result = planSet(crate, OPTS);
    const energies = result.slots.map((s) => s.track.features.energy);
    const head = energies.slice(0, 8).reduce((a, b) => a + b, 0) / 8;
    const tail = energies.slice(-8).reduce((a, b) => a + b, 0) / 8;
    expect(tail).toBeGreaterThan(head + 0.08);
    expect(result.metrics.energyAccuracy).toBeGreaterThan(85);
    expect(rankCorrelation(energies)).toBeGreaterThan(0.65);
  });

  it('is deterministic for a given seed', () => {
    const a = planSet(crate, OPTS);
    const b = planSet(crate, OPTS);
    expect(a.slots.map((s) => s.track.id)).toEqual(b.slots.map((s) => s.track.id));
    expect(a.metrics.averageScore).toBe(b.metrics.averageScore);
  });

  it('produces a different route for a different seed', () => {
    const a = planSet(crate, OPTS);
    const b = planSet(crate, { ...OPTS, seed: 99 });
    expect(a.slots.map((s) => s.track.id)).not.toEqual(b.slots.map((s) => s.track.id));
  });

  it('keeps all transitions above the configured harmonic floor', () => {
    const result = planSet(crate, OPTS);
    const weak = result.slots.slice(1).filter((s) => (s.transition?.key.score ?? 0) < 50);
    expect(weak).toHaveLength(0);
    expect(result.metrics.harmonicPurity).toBeGreaterThanOrEqual(85);
  });

  it('warns and truncates when the crate is smaller than the request', () => {
    const small = crate.slice(0, 6);
    const result = planSet(small, { ...OPTS, targetCount: 20 });
    expect(result.slots.length).toBeLessThanOrEqual(6);
    expect(result.warnings.some((w) => w.code === 'NOT_ENOUGH_TRACKS')).toBe(true);
  });

  it('handles an empty crate without throwing', () => {
    const result = planSet([], OPTS);
    expect(result.slots).toEqual([]);
    expect(result.metrics.trackCount).toBe(0);
  });

  it('honours the startTrackId constraint', () => {
    const start = crate[7];
    const result = planSet(crate, { ...OPTS, startTrackId: start.id });
    expect(result.slots[0].track.id).toBe(start.id);
  });

  it('records timing information', () => {
    const result = planSet(crate, OPTS);
    expect(result.elapsedMs).toBeGreaterThan(0);
    expect(result.elapsedMs).toBeLessThan(10_000);
  });
});

describe('planSet — peak-time profile', () => {
  it('keeps energy high throughout the set', () => {
    const result = planSet(afroCrate(), {
      ...OPTS,
      profile: 'peak-time',
      seed: 7,
    });
    const min = Math.min(...result.slots.map((s) => s.track.features.energy));
    expect(min).toBeGreaterThan(0.45);
  });
});

describe('rebuildPlan — manual edits', () => {
  it('recomputes transitions after a drag & drop reorder', () => {
    const result = planSet(afroCrate(), OPTS);
    const original = result.slots.map((s) => s.track);
    const reordered = [original[1], original[0], ...original.slice(2)];
    const rebuilt = rebuildPlan(reordered, OPTS);
    expect(rebuilt.slots[0].track.id).toBe(original[1].id);
    expect(rebuilt.slots[1].transition).not.toBeNull();
    expect(rebuilt.metrics.trackCount).toBe(40);
  });
});

describe('findBridges', () => {  it('finds a linking track between two incompatible keys', () => {
    const a = makeTrack({ id: 'a', title: 'A', features: { key: 9, mode: 0, tempo: 124 } }); // 8A
    const b = makeTrack({ id: 'b', title: 'B', features: { key: 6, mode: 0, tempo: 124 } }); // 11A
    const bridge = makeTrack({
      id: 'c',
      title: 'Bridge',
      features: { key: 4, mode: 0, tempo: 124 }, // 9A
    });
    const pool = [a, b, bridge];
    const suggestions = findBridges([0, 1], pool, OPTS);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].options[0].track.id).toBe('c');
    expect(suggestions[0].options[0].viaScore).toBeGreaterThan(80);
  });

  it('does not suggest bridges for already-smooth transitions', () => {
    const a = makeTrack({ id: 'a', features: { key: 9, mode: 0, tempo: 124 } });
    const b = makeTrack({ id: 'b', features: { key: 0, mode: 1, tempo: 125 } }); // 8B
    const c = makeTrack({ id: 'c', features: { key: 1, mode: 1, tempo: 124 } });
    expect(findBridges([0, 1], [a, b, c], OPTS)).toHaveLength(0);
  });
});

/** Spearman rank correlation between set position and energy. */
function rankCorrelation(values: number[]): number {
  const n = values.length;
  const rank = (arr: number[]) => {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(arr.length);
    sorted.forEach((item, r) => (ranks[item.i] = r + 1));
    return ranks;
  };
  const x = rank(values);
  const y = rank(Array.from({ length: n }, (_, i) => i));
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}
