/**
 * Domain types — shared by the UI, the worker and the tests.
 * Kept framework-free on purpose: this module is the "kernel" of the app.
 */

export type CamelotLetter = 'A' | 'B';

/** 1..12 + A/B  (A = minor, B = major) */
export interface CamelotKey {
  number: number;
  letter: CamelotLetter;
}

export type SpotifyMode = 0 | 1; // 0 = minor, 1 = major
export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/** Normalised audio features. Every provider must be able to produce this shape. */
export interface AudioFeatures {
  /** 0..1 */
  energy: number;
  /** 0..1 */
  danceability: number;
  /** 0..1 */
  valence: number;
  /** 0..1 — "acousticness" */
  acousticness: number;
  /** 0..1 — speechiness (used to filter podcasts/spoken word) */
  speechiness: number;
  /** 0..1 */
  instrumentalness: number;
  /** raw BPM */
  tempo: number;
  /** Spotify pitch class 0..11 (C=0). `null` when the provider has no key. */
  key: PitchClass | null;
  /** Spotify mode. `null` when unknown. */
  mode: SpotifyMode | null;
  /** 0..1 confidence of the key estimate, when available */
  keyConfidence?: number;
  /** Where the numbers came from — surfaced in the UI as a trust badge. */
  source: FeatureSource;
}

export type FeatureSource = 'spotify' | 'reccobeats' | 'local-dsp' | 'manual' | 'demo';

export interface Track {
  id: string;
  uri: string;
  title: string;
  artist: string;
  artists: string[];
  album: string;
  artworkUrl: string | null;
  /** 30s MP3, expires — always re-read from the API, never cache long-term. */
  previewUrl: string | null;
  /**
   * Global recording identifier from Spotify `external_ids.isrc`. Kept so a
   * preview can be resolved elsewhere when Spotify returns `preview_url: null`
   * (which it now does for every third-party app).
   */
  isrc?: string | null;
  durationMs: number;
  /** Spotify popularity 0..100 */
  popularity: number;
  explicit: boolean;
  genres: string[];
  releaseYear?: number;
  features: AudioFeatures;
}

export interface TrackWithKey extends Track {
  /** Derived once at the provider boundary, never persisted inconsistently. */
  camelot: CamelotKey | null;
  /** Camelot id, e.g. "8A" — null when key is unknown. */
  camelotId: string | null;
}

/* ------------------------------------------------------------------ */
/* Harmonic analysis                                                   */
/* ------------------------------------------------------------------ */

export type KeyRelation =
  | 'same'
  | 'adjacent-up'
  | 'adjacent-down'
  | 'relative'
  | 'energy-boost'
  | 'energy-drop'
  | 'diagonal'
  | 'mode-shift'
  | 'clash'
  | 'unknown';

export interface KeyAnalysis {
  relation: KeyRelation;
  /** 0..100 */
  score: number;
  /** signed semitone distance (-6..+6), null when unknown */
  semitoneDelta: number | null;
  label: string;
  compatible: boolean;
  /** true when the two keys are a semitone apart — the classic "train wreck" */
  clash: boolean;
}

export interface BpmAnalysis {
  /** 0..100 */
  score: number;
  /** % pitch change required on the incoming deck */
  deltaPercent: number;
  /** signed BPM delta after octave folding */
  deltaBpm: number;
  /** '1:1' | 'half-time' | 'double-time' */
  ratio: '1:1' | 'half-time' | 'double-time';
  compatible: boolean;
  label: string;
}

export type TransitionGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface Transition {
  /** 0..100 weighted total */
  score: number;
  grade: TransitionGrade;
  key: KeyAnalysis;
  bpm: BpmAnalysis;
  /** 0..100 — closeness of the energy step to the profile target */
  energyFit: number;
  compatible: boolean;
  /** human readable reason, used in tooltips + QC reports */
  reason: string;
}

/* ------------------------------------------------------------------ */
/* Sequencing                                                          */
/* ------------------------------------------------------------------ */

export type FlowProfile = 'steady-climb' | 'wave' | 'peak-time' | 'warm-up' | 'sunrise';

export interface SequencingOptions {
  targetCount: number;
  bpmRange: [number, number];
  profile: FlowProfile;
  /** 0..1 — how strictly key rules are enforced. 0.85 = only S/A transitions. */
  harmonicStrictness: number;
  /** allow the engine to suggest bridge tracks between rough jumps */
  allowBridges: boolean;
  /** optional seed track id that must open the set */
  startTrackId?: string | null;
  /** optional: lock the opening key */
  startCamelotId?: string | null;
  /** repeat the same artist within N tracks? 0 = off */
  artistCooldown: number;
  /** deterministic seed for reproducible sets */
  seed: number;
}

export interface PlannedSlot {
  track: TrackWithKey;
  /** target energy for this position, 0..1 */
  targetEnergy: number;
  /** transition INTO this track (null for index 0) */
  transition: Transition | null;
  /** true when the slot was synthesised by the bridge finder */
  isBridge: boolean;
  /** stable key for React lists */
  uid: string;
}

export interface PlanWarning {
  code:
    | 'NOT_ENOUGH_TRACKS'
    | 'WEAK_TRANSITION'
    | 'NO_KEY_DATA'
    | 'BPM_OUT_OF_RANGE'
    | 'ARTIST_REPEAT'
    | 'BRIDGE_INSERTED';
  message: string;
  index?: number;
  severity: 'info' | 'warn' | 'error';
}

export interface BridgeSuggestion {
  fromId: string;
  toId: string;
  fromTitle: string;
  toTitle: string;
  reason: string;
  options: Array<{
    track: TrackWithKey;
    score: number;
    viaScore: number;
  }>;
}

export interface SetMetrics {
  trackCount: number;
  totalDurationMs: number;
  /** % of transitions graded S/A/B */
  harmonicPurity: number;
  /** % of transitions with a key clash */
  clashRate: number;
  averageScore: number;
  longestCompatibleStreak: number;
  bpmMin: number;
  bpmMax: number;
  bpmDrift: number;
  /** 0..1 — how well the energy curve matches the requested profile */
  energyAccuracy: number;
  keySpread: number;
  gradeCounts: Record<TransitionGrade, number>;
}

export interface PlanResult {
  slots: PlannedSlot[];
  metrics: SetMetrics;
  warnings: PlanWarning[];
  bridges: BridgeSuggestion[];
  /** ms spent inside the worker */
  elapsedMs: number;
  options: SequencingOptions;
}

export interface WorkerRequest {
  type: 'plan';
  requestId: string;
  tracks: TrackWithKey[];
  options: SequencingOptions;
}

export interface WorkerProgress {
  type: 'progress';
  requestId: string;
  phase: 'scoring' | 'searching' | 'bridging' | 'metrics';
  /** 0..1 */
  progress: number;
  detail?: string;
}

export interface WorkerSuccess {
  type: 'result';
  requestId: string;
  result: PlanResult;
}

export interface WorkerFailure {
  type: 'error';
  requestId: string;
  message: string;
}

export type WorkerResponse = WorkerProgress | WorkerSuccess | WorkerFailure;
