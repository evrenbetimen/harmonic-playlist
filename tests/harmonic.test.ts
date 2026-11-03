import { describe, expect, it } from 'vitest';
import {
  analyzeKey,
  analyzeTransition,
  compatibleNeighbours,
  findHarmonicViolations,
  gradeForScore,
} from '@/core/harmonic';
import { makeTrack } from '@/core/track';
import type { CamelotKey } from '@/core/types';

const key = (number: number, letter: 'A' | 'B'): CamelotKey => ({ number, letter });

describe('analyzeKey — Camelot rules', () => {
  it('scores the same key as perfect', () => {
    const result = analyzeKey(key(8, 'A'), key(8, 'A'));
    expect(result.relation).toBe('same');
    expect(result.score).toBe(100);
    expect(result.compatible).toBe(true);
  });

  it('accepts ±1 on the same letter (perfect fifth / fourth)', () => {
    const up = analyzeKey(key(8, 'A'), key(9, 'A'));
    const down = analyzeKey(key(8, 'A'), key(7, 'A'));
    expect(up.relation).toBe('adjacent-up');
    expect(up.score).toBe(96);
    expect(down.relation).toBe('adjacent-down');
    expect(down.score).toBe(94);
    expect(up.compatible && down.compatible).toBe(true);
  });

  it('accepts the relative major/minor', () => {
    const result = analyzeKey(key(8, 'A'), key(8, 'B'));
    expect(result.relation).toBe('relative');
    expect(result.score).toBe(90);
    expect(result.semitoneDelta).toBe(3);
  });

  it('treats ±2 same-letter moves as energy boost/drop', () => {
    expect(analyzeKey(key(8, 'A'), key(10, 'A')).relation).toBe('energy-boost');
    expect(analyzeKey(key(8, 'A'), key(6, 'A')).relation).toBe('energy-drop');
    expect(analyzeKey(key(8, 'A'), key(10, 'A')).score).toBe(74);
  });

  it('flags a semitone move as a clash — even if the wheel looks adjacent', () => {
    // 8A (A minor) → 3A (Bb minor) is +1 semitone
    const result = analyzeKey(key(8, 'A'), key(3, 'A'));
    expect(result.relation).toBe('clash');
    expect(result.clash).toBe(true);
    expect(result.compatible).toBe(false);
    expect(result.score).toBeLessThan(20);
  });

  it('marks off-wheel fifth shifts as mode-shift, not compatible', () => {
    // 8A (A minor) → 12B (E major): musical, but outside the classic set
    const result = analyzeKey(key(8, 'A'), key(12, 'B'));
    expect(result.relation).toBe('mode-shift');
    expect(result.score).toBe(34);
    expect(result.compatible).toBe(false);
  });

  it('caps tritone movement', () => {
    expect(analyzeKey(key(8, 'A'), key(2, 'A')).score).toBeLessThanOrEqual(26);
  });

  it('never blocks when metadata is missing', () => {
    const result = analyzeKey(null, key(8, 'A'));
    expect(result.relation).toBe('unknown');
    expect(result.compatible).toBe(true);
    expect(result.score).toBe(50);
  });
});

describe('analyzeTransition', () => {
  it('gives an S grade to a locked, matching pair', () => {
    const a = makeTrack({
      id: 'a',
      features: { key: 9, mode: 0, tempo: 124, energy: 0.5 },
    });
    const b = makeTrack({
      id: 'b',
      features: { key: 9, mode: 0, tempo: 124, energy: 0.52 },
    });
    const t = analyzeTransition(a, b, { targetEnergy: 0.5 });
    expect(t.key.score).toBe(100);
    expect(t.bpm.score).toBe(100);
    expect(t.grade).toBe('S');
    expect(t.compatible).toBe(true);
  });

  it('penalises a tempo jump even with a perfect key match', () => {
    const a = makeTrack({ id: 'a', features: { key: 9, mode: 0, tempo: 120, energy: 0.5 } });
    const b = makeTrack({ id: 'b', features: { key: 9, mode: 0, tempo: 136, energy: 0.5 } });
    const t = analyzeTransition(a, b);
    expect(t.key.score).toBe(100);
    expect(t.bpm.compatible).toBe(false);
    expect(t.compatible).toBe(false);
    expect(t.grade).not.toBe('S');
  });

  it('never calls a clashing pair compatible, however good the BPM is', () => {
    const a = makeTrack({ id: 'a', features: { key: 9, mode: 0, tempo: 124 } });
    const b = makeTrack({ id: 'b', features: { key: 10, mode: 0, tempo: 124 } }); // Bb minor
    const t = analyzeTransition(a, b);
    expect(t.key.clash).toBe(true);
    expect(t.compatible).toBe(false);
  });
});

describe('gradeForScore', () => {
  it.each([
    [100, 'S'],
    [88, 'S'],
    [87, 'A'],
    [78, 'A'],
    [77, 'B'],
    [66, 'B'],
    [65, 'C'],
    [52, 'C'],
    [51, 'D'],
    [0, 'D'],
  ] as const)('%i → %s', (score, grade) => {
    expect(gradeForScore(score)).toBe(grade);
  });
});

describe('findHarmonicViolations (QC)', () => {
  it('returns the exact indices of illegal transitions', () => {
    const tracks = [
      makeTrack({ id: '1', features: { key: 9, mode: 0 } }), // 8A
      makeTrack({ id: '2', features: { key: 9, mode: 0 } }), // 8A  ✅
      makeTrack({ id: '3', features: { key: 10, mode: 0 } }), // 3A  ❌ semitone
      makeTrack({ id: '4', features: { key: 5, mode: 0 } }), // 4A  ✅ (fifth up from 3A)
    ];
    const violations = findHarmonicViolations(tracks);
    expect(violations).toHaveLength(1);
    expect(violations[0].index).toBe(2);
    expect(violations[0].to).toBe('Untitled');
  });

  it('is empty for a perfectly mixed set', () => {
    const tracks = [
      makeTrack({ id: '1', features: { key: 9, mode: 0 } }), // 8A
      makeTrack({ id: '2', features: { key: 9, mode: 0 } }), // 8A
      makeTrack({ id: '3', features: { key: 0, mode: 1 } }), // 8B relative
      makeTrack({ id: '4', features: { key: 7, mode: 1 } }), // 9B? G major = 9B, 8B→9B ✅
    ];
    expect(findHarmonicViolations(tracks)).toHaveLength(0);
  });
});

describe('compatibleNeighbours', () => {
  it('returns the six one-move keys from 8A', () => {
    const ids = compatibleNeighbours(key(8, 'A'))
      .map((k) => `${k.number}${k.letter}`)
      .sort();
    expect(ids).toEqual(['10A', '6A', '7A', '8A', '8B', '9A'].sort());
  });
});
