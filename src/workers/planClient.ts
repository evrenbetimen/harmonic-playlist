import type {
  PlanResult,
  SequencingOptions,
  TrackWithKey,
  WorkerRequest,
  WorkerResponse,
} from '@/core/types';
import { planSet } from '@/core/sequencer';

type ProgressFn = (progress: number, detail?: string) => void;

interface Pending {
  resolve: (result: PlanResult) => void;
  reject: (error: Error) => void;
  onProgress?: ProgressFn;
}

let worker: Worker | null = null;
const pending = new Map<string, Pending>();

function ensureWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;

  worker = new Worker(new URL('./sequencer.worker.ts', import.meta.url), {
    type: 'module',
    name: 'harmonic-playlist-sequencer',
  });

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    const entry = pending.get(msg.requestId);
    if (!entry) return;

    if (msg.type === 'progress') {
      entry.onProgress?.(msg.progress, msg.detail);
      return;
    }
    pending.delete(msg.requestId);
    if (msg.type === 'result') entry.resolve(msg.result);
    else entry.reject(new Error(msg.message));
  };

  worker.onerror = (event) => {
    const error = new Error(event.message || 'Worker çöktü');
    for (const [, entry] of pending) entry.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
  };

  return worker;
}

/**
 * Run the sequencer off the main thread. Falls back to a synchronous call
 * when Worker is unavailable (e.g. unit tests, exotic webviews).
 */
export function planInWorker(
  tracks: TrackWithKey[],
  options: SequencingOptions,
  onProgress?: ProgressFn,
): Promise<PlanResult> {
  const w = ensureWorker();
  if (!w) {
    return Promise.resolve(planSet(tracks, options));
  }

  const requestId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise<PlanResult>((resolve, reject) => {
    pending.set(requestId, { resolve, reject, onProgress });
    const request: WorkerRequest = { type: 'plan', requestId, tracks, options };
    w.postMessage(request);
  });
}

export function disposeWorker(): void {
  worker?.terminate();
  worker = null;
}
