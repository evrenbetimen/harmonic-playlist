import { describe, expect, it } from 'vitest';
import {
  CAMELOT_NUMBERS,
  camelotId,
  camelotToMusicalName,
  camelotToPitchClass,
  camelotToSpotify,
  keyColor,
  parseCamelot,
  semitoneDelta,
  spotifyToCamelot,
  wheelDelta,
  wheelDistance,
} from '@/core/camelot';
import type { CamelotKey } from '@/core/types';

const ALL: CamelotKey[] = (['A', 'B'] as const).flatMap((letter) =>
  CAMELOT_NUMBERS.map((number) => ({ number, letter })),
);

describe('spotifyToCamelot', () => {
  it('maps the full reference table correctly', () => {
    // [spotify key, mode, camelot number, letter]
    const table: Array<[number, 0 | 1, number, 'A' | 'B']> = [
      [0, 0, 5, 'A'], // C minor
      [0, 1, 8, 'B'], // C major
      [1, 1, 3, 'B'], // C# major / Db
      [1, 0, 12, 'A'], // C# minor
      [4, 0, 9, 'A'], // E minor
      [6, 0, 11, 'A'], // F# minor
      [9, 0, 8, 'A'], // A minor  ← the "home" key
      [9, 1, 11, 'B'], // A major
      [11, 1, 1, 'B'], // B major
      [10, 0, 3, 'A'], // Bb minor
    ];
    for (const [key, mode, number, letter] of table) {
      expect(spotifyToCamelot(key, mode)).toEqual({ number, letter });
    }
  });

  it('returns null for missing or malformed keys', () => {
    expect(spotifyToCamelot(null, 0)).toBeNull();
    expect(spotifyToCamelot(3, null)).toBeNull();
    expect(spotifyToCamelot(12, 0)).toBeNull();
    expect(spotifyToCamelot(-1, 0)).toBeNull();
    expect(spotifyToCamelot(3, 2)).toBeNull();
    expect(spotifyToCamelot(3.5, 0)).toBeNull();
  });
});

describe('camelotToSpotify', () => {
  it('round-trips every camelot key', () => {
    for (const key of ALL) {
      const spotify = camelotToSpotify(key);
      expect(spotifyToCamelot(spotify.key, spotify.mode)).toEqual(key);
    }
  });

  it('anchors the circle of fifths on A minor = 8A', () => {
    expect(camelotToPitchClass({ number: 8, letter: 'A' })).toBe(9); // A
    expect(camelotToPitchClass({ number: 8, letter: 'B' })).toBe(0); // C
    expect(camelotToPitchClass({ number: 5, letter: 'A' })).toBe(0); // C minor
    expect(camelotToPitchClass({ number: 1, letter: 'B' })).toBe(11); // B major
  });
});

describe('wheel geometry', () => {
  it('wraps 12 → 1', () => {
    expect(wheelDistance({ number: 12, letter: 'A' }, { number: 1, letter: 'A' })).toBe(1);
    expect(wheelDelta({ number: 12, letter: 'A' }, { number: 1, letter: 'A' })).toBe(1);
    expect(wheelDelta({ number: 1, letter: 'A' }, { number: 12, letter: 'A' })).toBe(-1);
  });

  it('reports signed semitone distance', () => {
    // 8A (A minor) → 10A (B minor) = +2 semitones
    expect(semitoneDelta({ number: 8, letter: 'A' }, { number: 10, letter: 'A' })).toBe(2);
    // 8A → 6A (G minor) = -2 semitones
    expect(semitoneDelta({ number: 8, letter: 'A' }, { number: 6, letter: 'A' })).toBe(-2);
  });
});

describe('formatting helpers', () => {
  it('parses ids defensively', () => {
    expect(parseCamelot('8a')).toEqual({ number: 8, letter: 'A' });
    expect(parseCamelot(' 12B ')).toEqual({ number: 12, letter: 'B' });
    expect(parseCamelot('13A')).toBeNull();
    expect(parseCamelot('8C')).toBeNull();
  });

  it('builds ids and musical names', () => {
    expect(camelotId({ number: 8, letter: 'A' })).toBe('8A');
    expect(camelotId(null)).toBeNull();
    expect(camelotToMusicalName({ number: 8, letter: 'A' })).toBe('A min');
    expect(camelotToMusicalName({ number: 8, letter: 'B' })).toBe('C maj');
  });

  it('has a colour for each of the 12 positions', () => {
    for (const n of CAMELOT_NUMBERS) {
      expect(keyColor({ number: n, letter: 'A' })).toMatch(/^#[0-9A-F]{6}$/i);
    }
    expect(keyColor(null)).toBe('#6B7280');
  });
});
