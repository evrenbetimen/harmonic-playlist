/**
 * Camelot Wheel — single source of truth.
 *
 * Spotify gives us `key` (pitch class, C = 0) + `mode` (0 minor / 1 major).
 * The Camelot wheel is a circle of fifths, so neighbouring numbers are a
 * perfect fourth/fifth apart — the smoothest possible harmonic move.
 *
 * Reference table (must match every DJ tool on the market):
 *
 *   1A  Ab minor      1B  B major
 *   2A  Eb minor      2B  F# major
 *   3A  Bb minor      3B  Db major
 *   4A  F  minor      4B  Ab major
 *   5A  C  minor      5B  Eb major
 *   6A  G  minor      6B  Bb major
 *   7A  D  minor      7B  F  major
 *   8A  A  minor      8B  C  major
 *   9A  E  minor      9B  G  major
 *  10A  B  minor     10B  D  major
 *  11A  F# minor     11B  A  major
 *  12A  C# minor     12B  E  major
 */

import type { CamelotKey, CamelotLetter, PitchClass, SpotifyMode } from './types';

export const CAMELOT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export const PITCH_CLASS_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;

/** Index by pitch class. major = B side of the wheel. */
const MAJOR_TO_CAMELOT: readonly number[] = [
  8, // C
  3, // C#
  10, // D
  5, // D#
  12, // E
  7, // F
  2, // F#
  9, // G
  4, // G#
  11, // A
  6, // A#
  1, // B
];

/** Index by pitch class. minor = A side of the wheel. */
const MINOR_TO_CAMELOT: readonly number[] = [
  5, // C
  12, // C#
  7, // D
  2, // D#
  9, // E
  4, // F
  11, // F#
  6, // G
  1, // G#
  8, // A
  3, // A#
  10, // B
];

/**
 * Camelot number → pitch class.
 * A side: pc = (13 - 5n) mod 12 · B side: pc = (4 + 7n) mod 12
 * (both are just the circle of fifths, anchored differently)
 */
export function camelotToPitchClass(key: CamelotKey): PitchClass {
  const n = clampNumber(key.number);
  const pc =
    key.letter === 'A'
      ? (((13 - 5 * n) % 12) + 12) % 12
      : (((4 + 7 * n) % 12) + 12) % 12;
  return pc as PitchClass;
}

export function clampNumber(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const rounded = Math.round(n);
  if (rounded < 1) return 12;
  if (rounded > 12) return 1;
  return rounded;
}

/** The only conversion the provider layer needs. */
export function spotifyToCamelot(
  key: number | null | undefined,
  mode: number | null | undefined,
): CamelotKey | null {
  if (key == null || mode == null) return null;
  if (!Number.isInteger(key) || key < 0 || key > 11) return null;
  if (mode !== 0 && mode !== 1) return null;
  const number =
    mode === 1 ? MAJOR_TO_CAMELOT[key] : MINOR_TO_CAMELOT[key];
  return { number, letter: mode === 1 ? 'B' : 'A' };
}

/** Reverse mapping — needed when writing back to Spotify / Serato exports. */
export function camelotToSpotify(key: CamelotKey): {
  key: PitchClass;
  mode: SpotifyMode;
} {
  return {
    key: camelotToPitchClass(key),
    mode: key.letter === 'B' ? 1 : 0,
  };
}

export function camelotId(key: CamelotKey | null): string | null {
  return key ? `${clampNumber(key.number)}${key.letter}` : null;
}

export function parseCamelot(input: string): CamelotKey | null {
  const match = /^\s*(1[0-2]|[1-9])\s*([AaBb])\s*$/.exec(input);
  if (!match) return null;
  return {
    number: Number(match[1]),
    letter: match[2].toUpperCase() as CamelotLetter,
  };
}

/** Short musical name, e.g. "A min" / "C maj". */
export function camelotToMusicalName(key: CamelotKey): string {
  const pc = camelotToPitchClass(key);
  return `${PITCH_CLASS_NAMES[pc]} ${key.letter === 'A' ? 'min' : 'maj'}`;
}

export function describeCamelot(key: CamelotKey | null): string {
  if (!key) return 'Key unknown';
  return `${camelotId(key)} · ${camelotToMusicalName(key)}`;
}

/** Circular distance on the wheel, 0..6. */
export function wheelDistance(a: CamelotKey, b: CamelotKey): number {
  const raw = Math.abs(clampNumber(a.number) - clampNumber(b.number));
  return Math.min(raw, 12 - raw);
}

/** Signed shortest step on the wheel, -6..+6. */
export function wheelDelta(a: CamelotKey, b: CamelotKey): number {
  let d = clampNumber(b.number) - clampNumber(a.number);
  if (d > 6) d -= 12;
  if (d < -6) d += 12;
  return d;
}

/** Signed semitone distance, -6..+6. */
export function semitoneDelta(a: CamelotKey, b: CamelotKey): number {
  const raw = (camelotToPitchClass(b) - camelotToPitchClass(a) + 12) % 12;
  return raw > 6 ? raw - 12 : raw;
}

/* ------------------------------------------------------------------ */
/* Colour system — the UI derives every neon accent from the key.       */
/* ------------------------------------------------------------------ */

/** 12 neon hues, tuned for a #0D0D11 background (OKLCH-ish, sRGB output). */
export const CAMELOT_COLORS: Record<number, string> = {
  1: '#5B8CFF', // midnight blue
  2: '#8B5CF6', // violet
  3: '#D946EF', // fuchsia
  4: '#FF2D9B', // hot pink
  5: '#FF5C38', // warm orange
  6: '#FFB020', // amber
  7: '#D6F25B', // acid lime
  8: '#3DFFB0', // aqua mint  (A minor — the "home" key)
  9: '#00E5C0', // teal
  10: '#00C2FF', // ocean blue
  11: '#2E7BFF', // electric blue
  12: '#7C5CFF', // indigo
};

export function keyColor(key: CamelotKey | null | undefined): string {
  if (!key) return '#6B7280';
  return CAMELOT_COLORS[clampNumber(key.number)] ?? '#00E5C0';
}

/** Soft rgba version for glows/borders. */
export function keyColorAlpha(key: CamelotKey | null | undefined, alpha = 1): string {
  const hex = keyColor(key).replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Relative luminance — used to pick black/white text on neon chips. */
export function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}
