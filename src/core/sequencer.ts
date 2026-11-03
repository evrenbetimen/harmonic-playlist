import { medianBpm } from './bpm';
import { clamp01, energyAccuracy, energyCurve } from './energy';
import { analyzeTransition } from './harmonic';
import type {
  BridgeSuggestion,
  FlowProfile,
  PlannedSlot,
  PlanResult,
  PlanWarning,
  SequencingOptions,
  SetMetrics,
  TrackWithKey,
  Transition,
  TransitionGrade,
  WorkerProgress,
} from './types';

/* ------------------------------------------------------------------ */
/* Deterministic RNG — the same seed must always produce the same set.  */
/* ------------------------------------------------------------------ */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PlanHooks {
  onProgress?: (p: Omit<WorkerProgress, 'type' | 'requestId'>) => void;
}

const BEAM_WIDTH = 18;
const MAX_BRIDGES = 2;

/* ------------------------------------------------------------------ */
/* Public entry points                                                 */
/* ------------------------------------------------------------------ */

/**
 * Build a set from scratch.
 *
 * Strategy: beam search over the crate. A pure greedy pick gets stuck after a
 * bad early choice; full DP over 2^n crates is impossible, so we keep the best
 * `BEAM_WIDTH` partial sets at every step. Deterministic, O(n · beam · crate).
 */
export function planSet(
  crate: TrackWithKey[],
  options: SequencingOptions,
  hooks: PlanHooks = {},
): PlanResult {
  const started = now();
  const warnings: PlanWarning[] = [];

  const pool = preparePool(crate, options, warnings);
  if (pool.length < 2) {
    return emptyResult(options, warnings, started);
  }

  const targetCount = Math.min(options.targetCount, pool.length);
  if (targetCount < options.targetCount) {
    warnings.push({
      code: 'NOT_ENOUGH_TRACKS',
      severity: 'warn',
      message: `Havuzda yalnızca ${pool.length} uygun şarkı var; set ${options.targetCount} yerine ${targetCount} şarkı olarak üretildi.`,
    });
  }

  const targets = targetsFor(options.profile, targetCount, pool);
  const tempoMid = (options.bpmRange[0] + options.bpmRange[1]) / 2;
  const tempoHalf = Math.max(1, (options.bpmRange[1] - options.bpmRange[0]) / 2);

  const n = pool.length;
  const keyScore = new Uint8Array(n * n);
  const keyCompat = new Uint8Array(n * n);
  const bpmScore = new Uint8Array(n * n);
  const bpmCompat = new Uint8Array(n * n);

  hooks.onProgress?.({ phase: 'scoring', progress: 0.02, detail: 'Key & BPM matrisi' });

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const t = analyzeTransition(pool[i], pool[j], { targetEnergy: targets[1] });
      keyScore[i * n + j] = t.key.score;
      keyCompat[i * n + j] = t.key.compatible ? 1 : 0;
      bpmScore[i * n + j] = t.bpm.score;
      bpmCompat[i * n + j] = t.bpm.compatible ? 1 : 0;
    }
  }

  /* ---------------- seed / opening choice ---------------- */

  const forcedStart = options.startTrackId
    ? pool.findIndex((t) => t.id === options.startTrackId)
    : -1;

  const rng = mulberry32(options.seed || 1);
  const startScore = (i: number) => {
    const energyFit = 1 - Math.abs(pool[i].features.energy - targets[0]);
    const bpmFit = 1 - Math.min(1, Math.abs(pool[i].features.tempo - tempoMid) / tempoHalf);
    return energyFit * 0.62 + bpmFit * 0.38 + rng() * 0.06;
  };

  const startIndices =
    forcedStart >= 0
      ? [forcedStart]
      : rankIndices(pool.length, startScore).slice(0, BEAM_WIDTH);

  interface Beam {
    order: number[];
    used: Set<number>;
    last: number;
    score: number;
  }

  let beams: Beam[] = startIndices.map((i) => ({
    order: [i],
    used: new Set([i]),
    last: i,
    score: startScore(i) * 12,
  }));

  /* ---------------- beam search ---------------- */

  const minKeyScore = 20 + clamp01(options.harmonicStrictness) * 46;

  for (let step = 1; step < targetCount; step++) {
    const target = targets[step];
    const next: Beam[] = [];

    for (const beam of beams) {
      const last = beam.last;
      let candidates: Array<{ idx: number; gain: number }> = [];

      const directional =
        options.profile === 'steady-climb' ||
        options.profile === 'peak-time' ||
        options.profile === 'sunrise';

      // Harmonic quality is the hard constraint; the energy corridor only
      // decides *which* legal track to take. If the crate is too narrow for
      // the corridor we widen it progressively instead of giving up.
      const corridors = directional ? [0.09, 0.16, 0.26, 0.4, 1.01] : [1.01];

      for (const corridor of corridors) {
        for (let j = 0; j < n; j++) {
          if (beam.used.has(j)) continue;
          const ks = keyScore[last * n + j];
          if (ks < minKeyScore) continue;

          const deviation = Math.min(1, Math.abs(pool[j].features.energy - target));
          if (deviation > corridor) continue;

          // Tempo must not drift away from the requested window at all.
          const bpm = pool[j].features.tempo;
          if (bpm < options.bpmRange[0] * 0.94 || bpm > options.bpmRange[1] * 1.06) {
            continue;
          }

          let gain = ks * 0.42 + bpmScore[last * n + j] * 0.28 + (1 - deviation) * 100 * 0.3;

          if (
            options.profile === 'steady-climb' &&
            pool[j].features.energy < pool[last].features.energy - 0.04
          ) {
            gain -= 12;
          }
          if (
            options.profile === 'sunrise' &&
            pool[j].features.energy > pool[last].features.energy + 0.05
          ) {
            gain -= 8;
          }
          if (options.profile === 'peak-time' && pool[j].features.energy < 0.6) {
            gain -= 12;
          }

          // Repetition control
          if (options.artistCooldown > 0) {
            const window = beam.order.slice(-options.artistCooldown);
            const artist = pool[j].artist;
            if (window.some((k) => pool[k].artist === artist)) gain -= 26;
          }
          // Avoid three identical keys in a row (boring, even if "perfect")
          const prevKey = pool[last].camelotId;
          if (prevKey && pool[j].camelotId === prevKey) {
            const streak = trailingKeyStreak(beam.order, pool);
            if (streak >= 1) gain -= 6 * streak;
          }
          // Small deterministic jitter breaks ties between equal-scoring crates
          gain += rng() * 0.8;

          candidates.push({ idx: j, gain });
        }
        if (candidates.length > 0) break;
      }

      // Dead end: allow anything that is not a semitone clash.
      if (candidates.length === 0) {
        for (let j = 0; j < n; j++) {
          if (beam.used.has(j)) continue;
          if (keyScore[last * n + j] < 15) continue;
          const fit = 1 - Math.min(1, Math.abs(pool[j].features.energy - target));
          candidates.push({
            idx: j,
            gain: keyScore[last * n + j] * 0.46 + bpmScore[last * n + j] * 0.3 + fit * 24,
          });
        }
      }

      // Dead end: allow anything that is not a semitone clash.
      if (candidates.length === 0) {
        for (let j = 0; j < n; j++) {
          if (beam.used.has(j)) continue;
          if (keyScore[last * n + j] < 15) continue;
          const fit = 1 - Math.min(1, Math.abs(pool[j].features.energy - target));
          candidates.push({
            idx: j,
            gain: keyScore[last * n + j] * 0.46 + bpmScore[last * n + j] * 0.3 + fit * 24,
          });
        }
      }

      candidates.sort((a, b) => b.gain - a.gain);
      const branchLimit = Math.min(candidates.length, 6);

      for (let c = 0; c < branchLimit; c++) {
        const { idx, gain } = candidates[c];
        const used = new Set(beam.used);
        used.add(idx);
        next.push({
          order: [...beam.order, idx],
          used,
          last: idx,
          score: beam.score + gain - c * 0.4, // slight preference for the top pick
        });
      }
    }

    if (next.length === 0) break;
    next.sort((a, b) => b.score - a.score);
    beams = next.slice(0, BEAM_WIDTH);

    if (step % 4 === 0 || step === targetCount - 1) {
      hooks.onProgress?.({
        phase: 'searching',
        progress: 0.05 + (step / targetCount) * 0.8,
        detail: `${step + 1}/${targetCount} şarkı · ${beams.length} aday rota`,
      });
    }
  }

  const best = beams
    .filter((b) => b.order.length === targetCount)
    .sort((a, b) => b.score - a.score)[0] ?? beams[0];

  let order = best.order;

  /* ---------------- bridges ---------------- */

  hooks.onProgress?.({ phase: 'bridging', progress: 0.88, detail: 'Geçiş köprüleri' });

  const bridges = findBridges(order, pool, options);
  const bridgeIndices = new Set<number>();
  if (options.allowBridges && bridges.length > 0) {
    const used = new Set(order);
    const patched: number[] = [];
    let inserted = 0;
    for (let i = 0; i < order.length; i++) {
      patched.push(order[i]);
      if (i === order.length - 1) continue;
      const gap = bridges.find(
        (b) => b.fromId === pool[order[i]].id && b.toId === pool[order[i + 1]].id,
      );
      if (!gap || inserted >= MAX_BRIDGES) continue;
      const candidate = gap.options[0];
      if (!candidate) continue;
      const idx = pool.findIndex((t) => t.id === candidate.track.id);
      if (idx < 0 || used.has(idx)) continue;
      patched.push(idx);
      used.add(idx);
      inserted++;
      bridgeIndices.add(patched.length - 1);
      warnings.push({
        code: 'BRIDGE_INSERTED',
        severity: 'info',
        index: patched.length - 1,
        message: `"${gap.fromTitle}" → "${gap.toTitle}" arasına "${candidate.track.title}" köprü olarak eklendi.`,
      });
    }
    order = patched;
    // Keep the requested length: a bridge replaces the weakest tail slot.
    if (order.length > options.targetCount) {
      order = order.slice(0, options.targetCount);
      for (const i of [...bridgeIndices]) if (i >= order.length) bridgeIndices.delete(i);
    }
  }

  hooks.onProgress?.({ phase: 'metrics', progress: 0.96, detail: 'QC raporu' });

  const result = finalize(order, pool, options, bridges, warnings, started);
  for (const i of bridgeIndices) {
    if (result.slots[i]) result.slots[i] = { ...result.slots[i], isBridge: true };
  }
  return result;
}

/**
 * Recompute an existing order (drag & drop, manual edits) without searching.
 * Single source of truth for transitions + metrics.
 */
export function rebuildPlan(
  ordered: TrackWithKey[],
  options: SequencingOptions,
  bridges: BridgeSuggestion[] = [],
  warnings: PlanWarning[] = [],
): PlanResult {
  const started = now();
  const order = ordered.map((_, i) => i);
  return finalize(order, ordered, options, bridges, warnings, started);
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

function finalize(
  order: number[],
  pool: TrackWithKey[],
  options: SequencingOptions,
  bridges: BridgeSuggestion[],
  warnings: PlanWarning[],
  started: number,
): PlanResult {
  const targets = targetsFor(options.profile, order.length, pool);
  const slots: PlannedSlot[] = order.map((idx, i) => {
    const track = pool[idx];
    const transition =
      i === 0 ? null : analyzeTransition(pool[order[i - 1]], track, { targetEnergy: targets[i] });
    if (i === 0) {
      if (!track.camelot) {
        warnings.push({
          code: 'NO_KEY_DATA',
          severity: 'info',
          index: 0,
          message: `"${track.title}" için ton bilgisi yok; harmoni analizi sınırlı.`,
        });
      }
    } else if (transition && !transition.compatible) {
      warnings.push({
        code: 'WEAK_TRANSITION',
        severity: transition.key.clash ? 'error' : 'warn',
        index: i,
        message: `#${i + 1} "${track.title}" geçişi zayıf: ${transition.reason}`,
      });
    }
    return {
      track,
      targetEnergy: Number(targets[i].toFixed(4)),
      transition,
      isBridge: false,
      uid: `${track.id}-${i}`,
    };
  });

  const metrics = computeMetrics(slots, targets);
  return {
    slots,
    metrics,
    warnings,
    bridges,
    elapsedMs: Math.max(1, Math.round(now() - started)),
    options,
  };
}

export function computeMetrics(slots: PlannedSlot[], targets: number[]): SetMetrics {
  const gradeCounts: Record<TransitionGrade, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  const transitions = slots.slice(1).map((s) => s.transition).filter(Boolean) as Transition[];
  let total = 0;
  let compatible = 0;
  let clashes = 0;
  let streak = 0;
  let longest = 0;

  for (const t of transitions) {
    total += t.score;
    gradeCounts[t.grade]++;
    if (t.compatible) {
      compatible++;
      streak++;
      longest = Math.max(longest, streak);
    } else {
      streak = 0;
    }
    if (t.key.clash) clashes++;
  }

  const bpms = slots.map((s) => s.track.features.tempo);
  const energies = slots.map((s) => clamp01(s.track.features.energy));
  const keys = new Set(slots.map((s) => s.track.camelotId ?? s.track.id));

  return {
    trackCount: slots.length,
    totalDurationMs: slots.reduce((acc, s) => acc + s.track.durationMs, 0),
    harmonicPurity:
      transitions.length === 0 ? 100 : Math.round((compatible / transitions.length) * 100),
    clashRate: transitions.length === 0 ? 0 : Math.round((clashes / transitions.length) * 100),
    averageScore: transitions.length === 0 ? 100 : Math.round(total / transitions.length),
    longestCompatibleStreak: longest,
    bpmMin: bpms.length ? Math.min(...bpms) : 0,
    bpmMax: bpms.length ? Math.max(...bpms) : 0,
    bpmDrift: bpms.length ? Math.round((Math.max(...bpms) - Math.min(...bpms)) * 10) / 10 : 0,
    energyAccuracy: Math.round(energyAccuracy(energies, targets) * 100),
    keySpread: keys.size,
    gradeCounts,
  };
}

/**
 * Transition bridge finder.
 *
 * For every rough pair A → B it looks for a C where:
 *   · A → C is harmonically legal,
 *   · C → B is harmonically legal,
 *   · the combined BPM error is smaller than the direct jump.
 * Returns up to two options per gap, ordered by quality.
 */
export function findBridges(
  order: number[],
  pool: TrackWithKey[],
  _options: SequencingOptions,
): BridgeSuggestion[] {
  const result: BridgeSuggestion[] = [];
  const used = new Set(order);

  for (let i = 0; i < order.length - 1; i++) {
    const from = pool[order[i]];
    const to = pool[order[i + 1]];
    const direct = analyzeTransition(from, to);
    if (direct.grade === 'S' || direct.grade === 'A') continue;

    const candidates: BridgeSuggestion['options'] = [];
    for (let j = 0; j < pool.length; j++) {
      if (used.has(j)) continue;
      const mid = pool[j];
      const legA = analyzeTransition(from, mid);
      const legB = analyzeTransition(mid, to);
      if (!legA.compatible || !legB.compatible) continue;
      const viaScore = Math.round((legA.score + legB.score) / 2);
      if (viaScore <= direct.score + 4) continue;
      candidates.push({ track: mid, score: Math.round(legA.score), viaScore });
    }

    if (candidates.length === 0) continue;
    candidates.sort((a, b) => b.viaScore - a.viaScore);

    result.push({
      fromId: from.id,
      toId: to.id,
      fromTitle: from.title,
      toTitle: to.title,
      reason: direct.key.clash
        ? `${from.camelotId ?? '?'} → ${to.camelotId ?? '?'} ton çakışması`
        : `${from.camelotId ?? '?'} → ${to.camelotId ?? '?'} sert geçiş (${direct.score})`,
      options: candidates.slice(0, 2),
    });
  }

  return result;
}

/**
 * Map the abstract 0..1 profile onto the crate's *actual* energy window.
 * A library whose loudest track sits at 0.76 must still produce a full arc —
 * otherwise "Steady Climb" would chase an unreachable 0.99 and flatten out.
 */
export function targetsFor(
  profile: FlowProfile,
  count: number,
  pool: TrackWithKey[],
): number[] {
  if (count <= 0) return [];
  const energies = pool.map((t) => clamp01(t.features.energy)).sort((a, b) => a - b);
  const lo = quantile(energies, 0.08);
  const hi = quantile(energies, 0.92);
  const span = Math.max(0.08, hi - lo);
  const raw = energyCurve(profile, count);
  const rMin = Math.min(...raw);
  const rMax = Math.max(...raw);
  const norm = (t: number) => (rMax - rMin < 1e-6 ? 0.5 : (t - rMin) / (rMax - rMin));

  return raw.map((t) => {
    const n = norm(t);
    switch (profile) {
      case 'peak-time':
        return round4(lo + span * 0.72 + span * 0.28 * n);
      case 'sunrise':
        return round4(lo + span * 0.92 * n);
      case 'warm-up':
        return round4(lo + span * 0.72 * n);
      default:
        return round4(lo + span * n);
    }
  });
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0.5;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function preparePool(  crate: TrackWithKey[],
  options: SequencingOptions,
  warnings: PlanWarning[],
): TrackWithKey[] {
  const seen = new Set<string>();
  const [minBpm, maxBpm] = options.bpmRange;
  const out: TrackWithKey[] = [];

  for (const t of crate) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    if (!t.features || !Number.isFinite(t.features.tempo) || t.features.tempo <= 0) continue;
    if (t.features.speechiness > 0.66) continue; // podcasts / spoken word
    if (t.features.tempo < minBpm || t.features.tempo > maxBpm) continue;
    out.push(t);
  }

  // Peak-time narrows the tempo window by 30 % around the weighted median.
  if (options.profile === 'peak-time' && out.length > 8) {
    const mid = medianBpm(out.map((t) => t.features.tempo));
    const half = ((maxBpm - minBpm) * 0.35) / 2;
    const narrowed = out.filter((t) => Math.abs(t.features.tempo - mid) <= half);
    if (narrowed.length >= options.targetCount * 0.6) {
      out.length = 0;
      out.push(...narrowed);
    }
  }

  const unknownKeys = out.filter((t) => !t.camelot).length;
  if (unknownKeys > 0) {
    warnings.push({
      code: 'NO_KEY_DATA',
      severity: 'info',
      message: `${unknownKeys} şarkıda ton verisi yok; bunlar yalnızca BPM/enerji ile değerlendirilecek.`,
    });
  }

  return out;
}

function rankIndices(n: number, score: (i: number) => number): number[] {
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => score(b) - score(a));
}

function trailingKeyStreak(order: number[], pool: TrackWithKey[]): number {
  const lastKey = pool[order[order.length - 1]].camelotId;
  if (!lastKey) return 0;
  let streak = 0;
  for (let i = order.length - 2; i >= 0; i--) {
    if (pool[order[i]].camelotId !== lastKey) break;
    streak++;
  }
  return streak;
}

function emptyResult(
  options: SequencingOptions,
  warnings: PlanWarning[],
  started: number,
): PlanResult {
  return {
    slots: [],
    metrics: computeMetrics([], []),
    warnings,
    bridges: [],
    elapsedMs: Math.max(1, Math.round(now() - started)),
    options,
  };
}

/** Defaults used by the UI and the tests. */
export function defaultOptions(overrides: Partial<SequencingOptions> = {}): SequencingOptions {
  return {
    targetCount: 40,
    bpmRange: [118, 128],
    profile: 'steady-climb',
    harmonicStrictness: 0.72,
    allowBridges: true,
    startTrackId: null,
    startCamelotId: null,
    artistCooldown: 3,
    seed: 2027,
    ...overrides,
  };
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
