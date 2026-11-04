import { previewEngine } from '@/audio/previewEngine';
import { clearPreviewCache } from '@/services/previews';
import { usePlayerStore } from '@/state/usePlayerStore';
import { useSetStore } from '@/state/useSetStore';
import type { TrackWithKey } from '@/core/types';

/**
 * Playback commands shared by every surface (list, wheel, transport).
 * Kept outside React so keyboard shortcuts and workers can call them too.
 */

/**
 * Resolves and starts a preview, keeping the player store consistent no
 * matter which resolver answered or which one threw.
 */
async function startPreview(track: TrackWithKey): Promise<void> {
  previewEngine.setCrossfade(usePlayerStore.getState().crossfade);
  // Preview resolution is a network round-trip (iTunes search), so the UI must
  // show a loading state instead of appearing frozen on a slow connection.
  usePlayerStore.setState({ loading: true });
  try {
    const report = await previewEngine.playReport(track);
    const after = usePlayerStore.getState();
    after.setPlaying(report.ok);
    after.setAudioInfo(report.source, report.note ?? null);
  } catch (error) {
    // The engine is defensive, but a resolver bug must never break playback
    // controls — report it and leave the state consistent.
    const after = usePlayerStore.getState();
    after.setPlaying(false);
    after.setAudioInfo('synth', `Önizleme çözümlenemedi: ${String(error)}`);
  } finally {
    usePlayerStore.setState({ loading: false });
  }
}

async function startSlot(index: number, autoplay = true): Promise<void> {
  const plan = useSetStore.getState().plan;
  const slot = plan?.slots[index];
  if (!slot) return;

  useSetStore.getState().selectSlot(index);
  usePlayerStore.getState().setTrack(slot.track, index);

  if (!autoplay) return;
  await startPreview(slot.track);
}

export function playSlot(index: number): void {
  void startSlot(index, true);
}

export function togglePlay(): void {
  const player = usePlayerStore.getState();
  if (!player.track) {
    playSlot(0);
    return;
  }

  if (player.playing) {
    previewEngine.pause();
    player.setPlaying(false);
  } else {
    previewEngine.resume();
    player.setPlaying(true);
  }
}

export function playNext(): void {
  const plan = useSetStore.getState().plan;
  const index = usePlayerStore.getState().index;
  if (!plan || index == null) return;
  const next = index + 1;
  if (next < plan.slots.length) playSlot(next);
}

export function playPrevious(): void {
  const index = usePlayerStore.getState().index;
  if (index == null) return;
  const prev = Math.max(0, index - 1);
  playSlot(prev);
}

export function stopPlayback(): void {
  previewEngine.stop(0.2);
  usePlayerStore.setState({ playing: false, progress: 0 });
}

/**
 * Re-runs preview resolution for the current track after dropping its cached
 * result. Used by the "Tekrar dene" button when the synth is playing.
 */
export async function retryPreview(): Promise<void> {
  const { track } = usePlayerStore.getState();
  if (!track) return;
  clearPreviewCache(track.isrc ?? null, track.title, track.artist);
  usePlayerStore.setState({ audioSource: null, audioNote: null });
  await startPreview(track);
}
