import type { BpmAnalysis } from './types';

/**
 * DJ tempo rules.
 *
 * - ≤ 2 %   : inaudible pitch change, call it seamless.
 * - ≤ 4 %   : standard beatmatch, still transparent on most tracks.
 * - ≤ 6 %   : audible but musical (key lock helps).
 * - ≤ 8 %   : edge of the vinyl/CDJ comfort zone.
 * - > 8 %   : the crowd hears the chipmunk/slowdown → need a bridge track.
 *
 * Half/double time is the escape hatch: 70 ↔ 140 BPM mixes perfectly because
 * a kick every beat at 70 equals a kick every other beat at 140. We fold the
 * incoming tempo into the outgoing tempo's octave before comparing.
 */
export function analyzeBpm(fromBpm: number, toBpm: number): BpmAnalysis {
  const safeFrom = fromBpm > 0 ? fromBpm : 120;
  const safeTo = toBpm > 0 ? toBpm : 120;

  const candidates: Array<{ tempo: number; ratio: BpmAnalysis['ratio'] }> = [
    { tempo: safeTo, ratio: '1:1' },
    { tempo: safeTo * 2, ratio: 'double-time' },
    { tempo: safeTo / 2, ratio: 'half-time' },
  ];

  let best = candidates[0];
  let bestAbs = Infinity;
  for (const c of candidates) {
    const diff = Math.abs(c.tempo - safeFrom);
    // Prefer 1:1 when the difference is a tie (it is the default DJ move).
    if (diff < bestAbs - 0.001) {
      bestAbs = diff;
      best = c;
    }
  }

  const deltaBpm = best.tempo - safeFrom;
  const deltaPercent = (deltaBpm / safeFrom) * 100;
  const abs = Math.abs(deltaPercent);

  let score: number;
  if (abs <= 0.5) score = 100;
  else if (abs <= 1) score = 98;
  else if (abs <= 2) score = 95;
  else if (abs <= 3) score = 90;
  else if (abs <= 4) score = 84;
  else if (abs <= 6) score = 74;
  else if (abs <= 8) score = 62;
  else if (abs <= 10) score = 44;
  else if (abs <= 14) score = 28;
  else score = 12;

  // Octave jumps are valid but slightly less "invisible" than a true match.
  if (best.ratio !== '1:1') score = Math.max(20, score - 6);

  return {
    score,
    deltaPercent: round(deltaPercent, 2),
    deltaBpm: round(deltaBpm, 2),
    ratio: best.ratio,
    compatible: abs <= 6,
    label: bpmLabel(abs, best.ratio),
  };
}

function bpmLabel(absPercent: number, ratio: BpmAnalysis['ratio']): string {
  const suffix =
    ratio === 'half-time' ? ' · half-time' : ratio === 'double-time' ? ' · double-time' : '';
  if (absPercent <= 0.3) return 'Locked' + suffix;
  if (absPercent <= 2) return `Seamless ${signed(absPercent)}%${suffix}`;
  if (absPercent <= 4) return `Beatmatch ${signed(absPercent)}%${suffix}`;
  if (absPercent <= 6) return `Push ${signed(absPercent)}%${suffix}`;
  if (absPercent <= 8) return `Stretch ${signed(absPercent)}%${suffix}`;
  return `Too far ${signed(absPercent)}%${suffix}`;
}

export function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${round(n, 1)}`;
}

function round(n: number, digits: number): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

/** True when the two tempos can be mixed without an octave trick. */
export function sameTempoFamily(a: number, b: number): boolean {
  const ratios = [1, 2, 0.5, 4 / 3, 3 / 4];
  return ratios.some((r) => Math.abs(a * r - b) / b < 0.06);
}

/** Weighted median — robust "centre" BPM of a crate. */
export function medianBpm(bpms: number[]): number {
  if (bpms.length === 0) return 0;
  const sorted = [...bpms].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
