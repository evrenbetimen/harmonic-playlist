import { previewEngine } from '@/audio/previewEngine';
import { usePlayerStore } from '@/state/usePlayerStore';
import { useSetStore } from '@/state/useSetStore';

/**
 * Playback commands shared by every surface (list, wheel, transport).
 * Kept outside React so keyboard shortcuts and workers can call them too.
 */

async function startSlot(index: number, autoplay = true): Promise<void> {
  const plan = useSetStore.getState().plan;
  const slot = plan?.slots[index];
  if (!slot) return;

  const player = usePlayerStore.getState();
  useSetStore.getState().selectSlot(index);
  player.setTrack(slot.track, index);

  if (!autoplay) return;

  previewEngine.setCrossfade(player.crossfade);
  const ok = await previewEngine.play(slot.track);
  usePlayerStore.getState().setPlaying(ok);
  if (!ok) usePlayerStore.setState({ loading: false });
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
