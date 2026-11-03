import { describe, expect, it } from 'vitest';
import { analyzeBpm, medianBpm, sameTempoFamily } from '@/core/bpm';

describe('analyzeBpm', () => {
  it('locks identical tempos', () => {
    const result = analyzeBpm(124, 124);
    expect(result.score).toBe(100);
    expect(result.deltaPercent).toBe(0);
    expect(result.compatible).toBe(true);
    expect(result.label).toBe('Locked');
  });

  it('keeps small corrections seamless', () => {
    const result = analyzeBpm(124, 125);
    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.deltaPercent).toBeCloseTo(0.81, 1);
    expect(result.compatible).toBe(true);
  });

  it('flags a 4 BPM jump as a beatmatch, not a mistake', () => {
    const result = analyzeBpm(124, 128);
    expect(result.deltaPercent).toBeCloseTo(3.23, 1);
    expect(result.score).toBe(84);
    expect(result.compatible).toBe(true);
  });

  it('rejects a 15 % tempo gap', () => {
    const result = analyzeBpm(120, 138);
    expect(result.compatible).toBe(false);
    expect(result.score).toBeLessThan(50);
  });

  it('folds half-time: 70 → 140 is a lock, not a 100 % gap', () => {
    const result = analyzeBpm(70, 140);
    expect(result.ratio).toBe('half-time');
    expect(result.score).toBe(94); // 100 minus octave penalty
    expect(result.deltaPercent).toBe(0);
    expect(result.compatible).toBe(true);
  });

  it('folds double-time: 140 → 70', () => {
    const result = analyzeBpm(140, 70);
    expect(result.ratio).toBe('double-time');
    expect(result.compatible).toBe(true);
  });

  it('prefers 1:1 when the octave jump is not closer', () => {
    const result = analyzeBpm(120, 122);
    expect(result.ratio).toBe('1:1');
    expect(result.deltaBpm).toBeCloseTo(2, 2);
  });

  it('survives broken metadata', () => {
    expect(analyzeBpm(0, 0).compatible).toBe(true);
    expect(Number.isFinite(analyzeBpm(0, 124).deltaPercent)).toBe(true);
  });
});

describe('sameTempoFamily', () => {
  it('recognises octave relationships', () => {
    expect(sameTempoFamily(70, 140)).toBe(true);
    expect(sameTempoFamily(124, 124)).toBe(true);
    expect(sameTempoFamily(124, 138)).toBe(false);
  });
});

describe('medianBpm', () => {
  it('handles even and odd lengths', () => {
    expect(medianBpm([120, 122, 124])).toBe(122);
    expect(medianBpm([120, 122, 124, 130])).toBe(123);
    expect(medianBpm([])).toBe(0);
  });
});
