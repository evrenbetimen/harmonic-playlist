import { useEffect, useRef } from 'react';
import { previewEngine } from '@/audio/previewEngine';
import { usePlayerStore } from '@/state/usePlayerStore';
import { useSetStore } from '@/state/useSetStore';
import { playNext } from '@/state/playback';

/**
 * Bridges the zustand stores with the Web Audio engine:
 *  · volume / crossfade → engine
 *  · requestAnimationFrame → progress + auto-crossfade
 */
export function usePlaybackBridge(): void {
  const volume = usePlayerStore((s) => s.volume);
  const crossfade = usePlayerStore((s) => s.crossfade);
  const playing = usePlayerStore((s) => s.playing);

  const autoMixRef = useRef(usePlayerStore.getState().autoMix);
  const transitionedRef = useRef(false);

  useEffect(() => {
    previewEngine.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    previewEngine.setCrossfade(crossfade);
  }, [crossfade]);

  useEffect(() => {
    previewEngine.setVolume(usePlayerStore.getState().volume);
    previewEngine.setCrossfade(usePlayerStore.getState().crossfade);
  }, []);

  useEffect(() => {
    let raf = 0;

    const tick = () => {
      const player = usePlayerStore.getState();
      autoMixRef.current = player.autoMix;

      if (player.playing) {
        const progress = previewEngine.getProgress();
        const duration = previewEngine.getDuration();
        player.setProgress(progress, duration);

        const remaining = duration * (1 - progress);
        const plan = useSetStore.getState().plan;
        const hasNext = plan ? (player.index ?? -1) + 1 < plan.slots.length : false;

        if (
          autoMixRef.current &&
          hasNext &&
          remaining <= player.crossfade &&
          !transitionedRef.current
        ) {
          transitionedRef.current = true;
          playNext();
          window.setTimeout(() => {
            transitionedRef.current = false;
          }, 600);
        }

        if (progress >= 0.999 && !hasNext) {
          player.setPlaying(false);
          previewEngine.stop(0.4);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Reset the transition guard whenever the track changes.
  const index = usePlayerStore((s) => s.index);
  useEffect(() => {
    transitionedRef.current = false;
  }, [index]);

  // A regenerated set may no longer contain the track that is playing. Without
  // this the transport keeps advertising a stale (often demo) track while the
  // playlist shows real Spotify songs — which reads as "the preview is fake".
  const plan = useSetStore((s) => s.plan);
  useEffect(() => {
    const player = usePlayerStore.getState();
    if (!player.track) return;
    // A cleared set (new crate import) or a regenerated one may no longer
    // contain what is playing.
    const stillInSet = plan
      ? plan.slots.some((slot) => slot.track.id === player.track?.id)
      : false;
    if (!stillInSet) {
      previewEngine.stop(0.2);
      player.clear();
    }
  }, [plan]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        void import('@/state/playback').then((m) => m.togglePlay());
      }
      if (event.key === 'ArrowRight' && event.shiftKey) {
        void import('@/state/playback').then((m) => m.playNext());
      }
      if (event.key === 'ArrowLeft' && event.shiftKey) {
        void import('@/state/playback').then((m) => m.playPrevious());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing]);
}
