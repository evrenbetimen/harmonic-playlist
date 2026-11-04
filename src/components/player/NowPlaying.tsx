import { useMemo } from 'react';
import { keyColor, keyColorAlpha } from '@/core/camelot';
import { cn, formatTime } from '@/lib/format';
import { usePlayerStore, type AudioSource } from '@/state/usePlayerStore';
import { useSetStore } from '@/state/useSetStore';
import { playNext, playPrevious, playSlot, retryPreview, togglePlay } from '@/state/playback';
import {
  IconPause,
  IconPlay,
  IconSkipBack,
  IconSkipForward,
  IconSparkles,
} from '@/components/ui/icons';

export function NowPlaying() {
  const player = usePlayerStore();
  const { audioSource, audioNote } = player;
  const plan = useSetStore((s) => s.plan);
  const selected = useSetStore((s) => s.selectedSlot);

  const queued = plan && selected != null ? plan.slots[selected] : null;
  const track = player.track ?? queued?.track ?? null;
  const isCurrent = player.track != null && player.track.id === track?.id;
  const progress = isCurrent ? player.progress : 0;
  const duration = isCurrent ? player.duration : 30;
  const color = keyColor(track?.camelot);

  const bars = useMemo(() => waveform(track?.id ?? 'empty'), [track?.id]);
  const activeBars = Math.round(bars.length * progress);

  const onPlay = () => {
    if (!track) return;
    if (isCurrent) togglePlay();
    else if (selected != null) playSlot(selected);
    else if (player.index != null) playSlot(player.index);
  };

  return (
    <section className="glass grain shrink-0 overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <p className="label-xs">Now Playing</p>
          {player.loading && (
            <span className="flex items-center gap-1 text-[8px] font-semibold tracking-widest text-fog-400">
              <span className="h-1 w-1 animate-pulse rounded-full bg-neon-mint" />
              ÖNİZLEME ARANIYOR
            </span>
          )}
          {!player.loading && isCurrent && player.playing && (
            <span className="flex items-center gap-1 text-[8px] font-semibold tracking-widest text-neon-mint">
              <span className="h-1 w-1 animate-pulse rounded-full bg-neon-mint" />
              LIVE
            </span>
          )}
        </div>
        <span className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[8px] tracking-wider text-fog-400">
          30s PREVIEW
        </span>
      </div>

      <div className="px-3">
        <div
          className="group relative aspect-square w-full overflow-hidden rounded-xl"
          style={{
            background: `radial-gradient(120% 100% at 20% 0%, ${keyColorAlpha(track?.camelot ?? null, 0.4)} 0%, #0b0b10 62%)`,
            boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 0 80px -20px ${keyColorAlpha(track?.camelot ?? null, 0.7)}`,
          }}
        >
          {track?.artworkUrl ? (
            <img src={track.artworkUrl} alt={track.title} className="h-full w-full object-cover" />
          ) : (
            <>
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="animate-spin-slow rounded-full border opacity-40"
                  style={{
                    width: '64%',
                    height: '64%',
                    borderColor: keyColorAlpha(track?.camelot ?? null, 0.5),
                    background: `conic-gradient(from 0deg, transparent 0deg, ${keyColorAlpha(track?.camelot ?? null, 0.35)} 40deg, transparent 90deg, transparent 180deg, ${keyColorAlpha(track?.camelot ?? null, 0.22)} 230deg, transparent 300deg)`,
                  }}
                />
                <div className="absolute h-[46%] w-[46%] rounded-full border border-white/[0.06] bg-ink-950/50 backdrop-blur-sm" />
                <span
                  className="absolute display text-[42px] font-semibold tracking-tight"
                  style={{ color, textShadow: `0 0 30px ${keyColorAlpha(track?.camelot ?? null, 0.8)}` }}
                >
                  {track?.camelotId ?? '—'}
                </span>
              </div>

              <div className="absolute left-3 top-3 flex flex-col gap-1">
                <span className="rounded-md border border-white/10 bg-black/30 px-1.5 py-0.5 text-[8px] tracking-wider text-fog-300 backdrop-blur">
                  {track ? track.genres[0]?.replace('-', ' ').toUpperCase() ?? 'TRACK' : 'NO TRACK'}
                </span>
              </div>
            </>
          )}

          {/* waveform strip */}
          <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
          <div className="absolute inset-x-3 bottom-3 flex h-9 items-end gap-[2px]">
            {bars.map((h, i) => (
              <span
                key={i}
                className={cn(
                  'flex-1 rounded-[1px] transition-colors duration-300',
                  i < activeBars ? 'opacity-100' : 'opacity-30',
                  player.playing && i < activeBars && 'eq-bar',
                )}
                style={{
                  height: `${h * 100}%`,
                  background: i < activeBars ? color : 'rgba(255,255,255,0.55)',
                  animationDelay: `${(i % 9) * 80}ms`,
                  animationDuration: `${700 + (i % 5) * 130}ms`,
                }}
              />
            ))}
          </div>

          {track && (
            <div className="absolute right-3 top-3">
              <span
                className="num rounded-md border px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur"
                style={{
                  color,
                  borderColor: keyColorAlpha(track.camelot, 0.4),
                  background: keyColorAlpha(track.camelot, 0.16),
                }}
              >
                {track.camelotId ?? '—'}
              </span>
            </div>
          )}

          {track && (
            <button
              onClick={onPlay}
              className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white opacity-0 backdrop-blur-md transition-all duration-200 hover:scale-105 hover:bg-white/20 group-hover:opacity-100"
              style={{ boxShadow: `0 0 0 1px rgba(255,255,255,0.15), 0 12px 40px -8px ${keyColorAlpha(track.camelot, 0.8)}` }}
              aria-label="Çal"
            >
              {player.playing && isCurrent ? (
                <IconPause className="h-5 w-5" />
              ) : (
                <IconPlay className="ml-0.5 h-5 w-5" />
              )}
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pb-3 pt-3">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-semibold leading-tight text-white">
            {track?.title ?? 'Bir şarkı seç'}
          </h3>
          <p className="mt-0.5 truncate text-[10.5px] text-fog-400">
            {track?.artist ?? 'Kütüphaneden önizleme başlat'}
          </p>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button className="icon-btn h-7 w-7" onClick={playPrevious} aria-label="Önceki">
            <IconSkipBack className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onPlay}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-950 transition hover:scale-105 active:scale-95 disabled:opacity-40"
            disabled={!track}
            aria-label={player.playing ? 'Duraklat' : 'Çal'}
          >
            {player.playing && isCurrent ? (
              <IconPause className="h-3.5 w-3.5" />
            ) : (
              <IconPlay className="ml-0.5 h-3.5 w-3.5" />
            )}
          </button>
          <button className="icon-btn h-7 w-7" onClick={playNext} aria-label="Sonraki">
            <IconSkipForward className="h-3.5 w-3.5" />
          </button>

          <div className="mx-1 flex-1">
            <div className="relative h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.round(progress * 100)}%`,
                  background: `linear-gradient(90deg, ${color}, #fff)`,
                  boxShadow: `0 0 10px ${keyColorAlpha(track?.camelot ?? null, 0.8)}`,
                }}
              />
            </div>
            <div className="num mt-1 flex justify-between text-[8px] text-fog-400">
              <span>{formatTime(progress * duration)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <span className="flex items-center gap-1 rounded-md border border-neon-mint/20 bg-neon-mint/[0.06] px-1.5 py-1 text-[8px] font-medium text-neon-mint/90">
            <IconSparkles className="h-2.5 w-2.5" />
            HARM
          </span>
        </div>

        {/*
          Spotify stopped returning `preview_url`, so "playing" can mean three
          different things. Saying which one is not decoration: without it the
          user hears a synth pad and believes the track sounded like that.
        */}
        {track && audioSource && (
          <div
            className={cn(
              'mt-2 flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-[9px] leading-snug',
              audioSource === 'synth'
                ? 'border-amber-400/25 bg-amber-400/[0.07] text-amber-200'
                : 'border-white/[0.06] bg-white/[0.025] text-fog-400',
            )}
          >
            <span className="mt-[1px] shrink-0 font-semibold uppercase tracking-wider">
              {audioSourceLabel(audioSource)}
            </span>
            <span className="min-w-0 flex-1">
              {audioNote ??
                (audioSource === 'synth'
                  ? 'Sentetik önizleme çalınıyor.'
                  : '30 sn gerçek önizleme çalınıyor.')}
            </span>
            {audioSource === 'synth' && !player.loading && (
              <button
                onClick={() => void retryPreview()}
                className="shrink-0 underline underline-offset-2 hover:text-white"
              >
                Tekrar dene
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function audioSourceLabel(source: NonNullable<AudioSource>): string {
  switch (source) {
    case 'spotify':
      return 'spotify';
    case 'isrc':
      return 'isrc';
    case 'itunes':
      return 'apple';
    case 'search':
      return 'arama';
    default:
      return 'synth';
  }
}

function waveform(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: number[] = [];
  for (let i = 0; i < 56; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h >>> 0) % 1000) / 1000;
    const envelope = 0.45 + 0.55 * Math.sin((i / 56) * Math.PI);
    out.push(0.14 + r * 0.86 * envelope);
  }
  return out;
}
