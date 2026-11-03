import { semitoneDelta, wheelDelta } from './camelot';
import type {
  CamelotKey,
  KeyAnalysis,
  KeyRelation,
  TrackWithKey,
  Transition,
  TransitionGrade,
} from './types';
import { analyzeBpm } from './bpm';

/**
 * Harmonic compatibility matrix.
 *
 * Scores are intentionally spaced so the sequencer can tell "perfect" from
 * "creative but risky".
 *
 *   same           8A → 8A    0 st   → 100  (loop / re-edit)
 *   adjacent-up    8A → 9A   +7 st   → 96   (perfect fifth up — the classic lift)
 *   adjacent-down  8A → 7A   −5 st   → 94   (perfect fourth up)
 *   relative       8A → 8B   +3 st   → 90   (A minor → C major, same notes)
 *   energy-boost   8A → 10A  +2 st   → 74   (whole-step lift)
 *   energy-drop    8A → 6A   −2 st   → 70
 *   diagonal       8A → 10B  +5 st   → 56   (fourth, but outside the classic wheel set)
 *   mode-shift     8A → 9B   +7 st   → 34   (A minor → E major; musical, not Camelot-legal)
 *   clash          any semitone pair → 10   (the classic train wreck)
 *
 * `mode-shift` covers the diagonals that change alphabet *and* move a
 * fifth. They can sound great (V chord motion) but they break the wheel's
 * promise, so the UI flags them instead of silently allowing them.
 */

const RELATION_SCORE: Record<KeyRelation, number> = {
  same: 100,
  'adjacent-up': 96,
  'adjacent-down': 94,
  relative: 90,
  'energy-boost': 74,
  'energy-drop': 70,
  diagonal: 56,
  'mode-shift': 34,
  clash: 10,
  unknown: 50,
};

const RELATION_LABEL: Record<KeyRelation, string> = {
  same: 'Same key',
  'adjacent-up': 'Perfect 5th up',
  'adjacent-down': 'Perfect 4th up',
  relative: 'Relative major/minor',
  'energy-boost': 'Energy boost (+2)',
  'energy-drop': 'Energy drop (−2)',
  diagonal: 'Diagonal shift',
  'mode-shift': 'Mode shift (off-wheel)',
  clash: 'Semitone clash',
  unknown: 'Unknown key',
};

/** Relation between two Camelot keys. Pure, no side effects. */
export function analyzeKey(
  from: CamelotKey | null,
  to: CamelotKey | null,
): KeyAnalysis {
  if (!from || !to) {
    return {
      relation: 'unknown',
      score: RELATION_SCORE.unknown,
      semitoneDelta: null,
      label: RELATION_LABEL.unknown,
      compatible: true, // never block the user because metadata is missing
      clash: false,
    };
  }

  const delta = wheelDelta(from, to);
  const semis = semitoneDelta(from, to);
  const sameLetter = from.letter === to.letter;
  const absSemis = Math.abs(semis);

  // A semitone apart is *always* a train wreck, whatever the wheel says.
  if (absSemis === 1) {
    return {
      relation: 'clash',
      score: RELATION_SCORE.clash,
      semitoneDelta: semis,
      label: RELATION_LABEL.clash,
      compatible: false,
      clash: true,
    };
  }

  let relation: KeyRelation;
  if (delta === 0 && sameLetter) relation = 'same';
  else if (delta === 0) relation = 'relative';
  else if (sameLetter && delta === 1) relation = 'adjacent-up';
  else if (sameLetter && delta === -1) relation = 'adjacent-down';
  else if (sameLetter && delta === 2) relation = 'energy-boost';
  else if (sameLetter && delta === -2) relation = 'energy-drop';
  else if (absSemis <= 2) relation = 'diagonal';
  else if (absSemis === 5 || absSemis === 7) relation = 'mode-shift';
  else relation = 'clash';

  // A tritone never resolves — cap it even if the wheel maths says diagonal.
  const score =
    absSemis === 6 ? Math.min(RELATION_SCORE[relation], 26) : RELATION_SCORE[relation];

  const analysis: KeyAnalysis = {
    relation,
    score,
    semitoneDelta: semis,
    label: RELATION_LABEL[relation],
    compatible: score >= 56,
    clash: score < 40,
  };

  return analysis;
}

export function gradeForScore(score: number): TransitionGrade {
  if (score >= 88) return 'S';
  if (score >= 78) return 'A';
  if (score >= 66) return 'B';
  if (score >= 52) return 'C';
  return 'D';
}

/**
 * Full transition analysis between two tracks.
 *
 * Weighting rationale (matches how DJs actually decide):
 *   key 50 % — a key clash is the only unrecoverable mistake
 *   bpm 32 % — fixable with a pitch fader, but costs energy
 *   nrg 18 % — the "does it make sense right now" factor
 */
export function analyzeTransition(
  from: TrackWithKey,
  to: TrackWithKey,
  options: { targetEnergy?: number; keyWeight?: number } = {},
): Transition {
  const key = analyzeKey(from.camelot, to.camelot);
  const bpm = analyzeBpm(from.features.tempo, to.features.tempo);

  const target = options.targetEnergy;
  const energyFit =
    target == null
      ? 80
      : Math.round(100 * (1 - Math.min(1, Math.abs(to.features.energy - target))));

  const kw = options.keyWeight ?? 0.5;
  const bw = 0.32;
  const ew = Math.max(0, 1 - kw - bw);

  const score = Math.round(key.score * kw + bpm.score * bw + energyFit * ew);

  const compatible = key.compatible && bpm.compatible;
  const grade = gradeForScore(score);

  return {
    score,
    grade,
    key,
    bpm,
    energyFit,
    compatible,
    reason: buildReason(key, bpm, grade),
  };
}

function buildReason(
  key: KeyAnalysis,
  bpm: ReturnType<typeof analyzeBpm>,
  grade: TransitionGrade,
): string {
  if (key.clash) return `${key.label} — avoid this pairing`;
  if (!bpm.compatible) return `${bpm.label} — tempo gap too wide`;
  if (grade === 'S')
    return `Perfect: ${key.label.toLowerCase()}, ${bpm.label.toLowerCase()}`;
  if (grade === 'A')
    return `Smooth: ${key.label.toLowerCase()}, ${bpm.label.toLowerCase()}`;
  if (grade === 'B')
    return `Workable: ${key.label.toLowerCase()}, ${bpm.label.toLowerCase()}`;
  return `Risky: ${key.label.toLowerCase()}, ${bpm.label.toLowerCase()}`;
}

/**
 * Hard validation used by QC ("is this a legal harmonic set?").
 * Returns every transition that breaks the requested key policy.
 */
export function findHarmonicViolations(
  tracks: TrackWithKey[],
  opts: { minKeyScore?: number } = {},
): Array<{ index: number; from: string; to: string; analysis: KeyAnalysis }> {
  const minKeyScore = opts.minKeyScore ?? 56;
  const out: Array<{ index: number; from: string; to: string; analysis: KeyAnalysis }> =
    [];
  for (let i = 1; i < tracks.length; i++) {
    const analysis = analyzeKey(tracks[i - 1].camelot, tracks[i].camelot);
    if (analysis.score < minKeyScore) {
      out.push({
        index: i,
        from: tracks[i - 1].title,
        to: tracks[i].title,
        analysis,
      });
    }
  }
  return out;
}

/** One-move neighbourhood — used to highlight the wheel on hover. */
export function compatibleNeighbours(key: CamelotKey): CamelotKey[] {
  const n = key.number;
  const wrap = (x: number) => ((x - 1 + 12) % 12) + 1;
  const other = key.letter === 'A' ? 'B' : 'A';
  return [
    { number: n, letter: key.letter },
    { number: wrap(n + 1), letter: key.letter },
    { number: wrap(n - 1), letter: key.letter },
    { number: n, letter: other },
    { number: wrap(n + 2), letter: key.letter },
    { number: wrap(n - 2), letter: key.letter },
  ];
}
