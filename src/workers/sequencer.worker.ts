/// <reference lib="webworker" />
import { planSet } from '@/core/sequencer';
import type { WorkerRequest } from '@/core/types';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (!req || req.type !== 'plan') return;

  try {
    const result = planSet(req.tracks, req.options, {
      onProgress: (p) => {
        ctx.postMessage({
          type: 'progress',
          requestId: req.requestId,
          ...p,
        });
      },
    });

    ctx.postMessage({ type: 'result', requestId: req.requestId, result });
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      requestId: req.requestId,
      message: error instanceof Error ? error.message : 'Bilinmeyen worker hatası',
    });
  }
};
