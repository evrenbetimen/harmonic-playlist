import type { FlowProfile } from './types';

/**
 * Energy curves.
 *
 * Every profile is a pure function of the position in the set, returning a
 * target `energy` between 0 and 1 that the sequencer tries to track. Keeping
 * them pure makes them testable and lets the UI draw the same curve the
 * engine optimises against — no drift between preview and result.
 */

export interface ProfileMeta {
  id: FlowProfile;
  name: string;
  tagline: string;
  description: string;
  icon: string;
}

export const PROFILES: ProfileMeta[] = [
  {
    id: 'steady-climb',
    name: 'Steady Climb',
    tagline: 'Kademeli yükseliş',
    description: 'Kesintisiz tırmanış. Her 10 şarkıda bir basamak; son 20 dakika tam gaz.',
    icon: '↗',
  },
  {
    id: 'wave',
    name: 'Wave',
    tagline: 'İnip çıkan dalga',
    description: 'Pisti dinlendir, tekrar coştur. 20–25 dakikalık 2–3 tepe noktası.',
    icon: '∿',
  },
  {
    id: 'peak-time',
    name: 'Peak Time',
    tagline: 'Dar BPM, yüksek enerji',
    description: 'Baştan sona yüksek enerji. BPM penceresi daraltılır, dolgu azalır.',
    icon: '▲',
  },
  {
    id: 'warm-up',
    name: 'Warm-up',
    tagline: 'Kapı açılışı',
    description: 'Düşük enerji, geniş ton yelpazesi. Ana set için alan açar.',
    icon: '◔',
  },
  {
    id: 'sunrise',
    name: 'Sunrise',
    tagline: 'Kapanış / gün doğumu',
    description: 'Zirveden iniş. Duygusal, melodik, düşük BPM kapanış.',
    icon: '◡',
  },
];

export const PROFILE_MAP: Record<FlowProfile, ProfileMeta> = Object.fromEntries(
  PROFILES.map((p) => [p.id, p]),
) as Record<FlowProfile, ProfileMeta>;

/** t = normalised position 0..1 */
export function targetEnergy(profile: FlowProfile, t: number): number {
  const x = clamp01(t);
  switch (profile) {
    case 'steady-climb': {
      // ease-in-out so the first third stays patient and the last third pushes
      const eased = x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
      return 0.32 + eased * 0.67;
    }
    case 'wave': {
      // two full waves, bias upward, start and end mid-low
      const wave = Math.sin(x * Math.PI * 4 - Math.PI / 2); // -1 → 1 → -1 ...
      return 0.52 + 0.30 * wave + 0.10 * x;
    }
    case 'peak-time': {
      return 0.80 + 0.18 * Math.sin(x * Math.PI); // near-flat, tiny arc
    }
    case 'warm-up': {
      return 0.18 + 0.42 * x ** 1.35;
    }
    case 'sunrise': {
      return 0.72 - 0.44 * x ** 0.85;
    }
  }
}

export function energyCurve(profile: FlowProfile, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [targetEnergy(profile, 0.5)];
  return Array.from({ length: count }, (_, i) =>
    Number(targetEnergy(profile, i / (count - 1)).toFixed(4)),
  );
}

/** Normalised 0..1 energy for a track. Prefers Spotify energy, falls back to tempo. */
export function deriveEnergy(tempo: number, energy: number | null | undefined): number {
  if (energy != null && Number.isFinite(energy)) return clamp01(energy);
  // 90 BPM → ~0.2 · 125 BPM → ~0.55 · 150 BPM → ~0.9
  return clamp01((tempo - 80) / 80);
}

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/** Mean absolute error between achieved and target energy (0 = perfect). */
export function energyAccuracy(achieved: number[], target: number[]): number {
  const n = Math.min(achieved.length, target.length);
  if (n === 0) return 0;
  let err = 0;
  for (let i = 0; i < n; i++) err += Math.abs(achieved[i] - target[i]);
  return clamp01(1 - err / n);
}
