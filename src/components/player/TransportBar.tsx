import { useEffect, useRef, useState } from 'react';
import { keyColor } from '@/core/camelot';
import { previewEngine } from '@/audio/previewEngine';
import { cn, formatTime } from '@/lib/format';
import { usePlayerStore } from '@/state/usePlayerStore';
import { useSetStore } from '@/state/useSetStore';
import { playNext, playPrevious, togglePlay } from '@/state/playback';
import {
  IconPause,
  IconPlay,
  IconSkipBack,
  IconSkipForward,
  IconVolume,
  IconZap,
} from '@/components/ui/icons';

export function TransportBar() {
  const track = usePlayerStore((s) => s.track);
  const playing = usePlayerStore((s) => s.playing);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const crossfade = usePlayerStore((s) => s.crossfade);
  const setCrossfade = usePlayerStore((s) => s.setCrossfade);
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const autoMix = usePlayerStore((s) => s.autoMix);
  const toggleAutoMix = usePlayerStore((s) => s.toggleAutoMix);
  const plan = useSetStore((s) => s.plan);
  const selected = useSetStore((s) => s.selectedSlot);

  const [level, setLevel] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const loop = () => {
      setLevel(previewEngine.getLevel());
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const color = keyColor(track?.camelot ?? null);

  return (
    <footer className="relative z-30 flex h-[74px] shrink-0 items-center gap-5 border-t border-white/[0.06] bg-ink-950/70 px-4 backdrop-blur-2xl">
      {/* now playing mini */}
      <div className="flex w-[240px] shrink-0 items-center gap-2.5">
        <div
          className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg"
          style={{
            background: `linear-gradient(145deg, ${color}44, #0b0b10 75%)`,
            boxShadow: `inset 0 0 0 1px ${color}33`,
          }}
        >
          {track?.artworkUrl ? (
            <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="num text-[11px] font-bold" style={{ color }}>
              {track?.camelotId ?? '∿'}
            </span>
          )}
          {playing && (
            <span className="absolute inset-x-0 bottom-0 flex h-2 items-end justify-center gap-[1px] bg-black/50">
              {[2, 5, 3, 6].map((h, i) => (
                <span
                  key={i}
                  className="eq-bar w-[1px] bg-neon-mint"
                  style={{ height: h, animationDelay: `${i * 90}ms` }}
                />
              ))}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-fog-100">
            {track?.title ?? 'Önizleme hazır'}
          </p>
          <p className="truncate text-[9px] text-fog-400">
            {track ? `${track.artist} · ${Math.round(track.features.tempo)} BPM` : 'Bir şarkı seç'}
          </p>
        </div>
      </div>

      {/* transport */}
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
        <div className="flex items-center gap-1.5">
          <button className="icon-btn h-7 w-7" onClick={playPrevious} aria-label="Önceki">
            <IconSkipBack className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={togglePlay}
            className="group relative flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-950 transition hover:scale-105 active:scale-95"
            style={{ boxShadow: `0 0 24px -6px ${color}CC` }}
            aria-label={playing ? 'Duraklat' : 'Çal'}
          >
            {playing ? <IconPause className="h-3.5 w-3.5" /> : <IconPlay className="ml-0.5 h-3.5 w-3.5" />}
          </button>
          <button className="icon-btn h-7 w-7" onClick={playNext} aria-label="Sonraki">
            <IconSkipForward className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex w-full max-w-[520px] items-center gap-2">
          <span className="num w-8 text-right text-[8px] text-fog-400">
            {formatTime(progress * duration)}
          </span>
          <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150"
              style={{
                width: `${Math.round(progress * 100)}%`,
                background: `linear-gradient(90deg, ${color}, #3DFFB0)`,
                boxShadow: `0 0 10px ${color}99`,
              }}
            />
            <div className="absolute inset-0 flex justify-between px-[1px]">
              {Array.from({ length: 40 }, (_, i) => (
                <span key={i} className="h-full w-px bg-ink-950/40" />
              ))}
            </div>
          </div>
          <span className="num w-8 text-[8px] text-fog-400">{formatTime(duration)}</span>
          {selected != null && plan && (
            <span className="num hidden text-[8px] text-fog-400 sm:inline">
              / {String(selected + 1).padStart(2, '0')}
            </span>
          )}
        </div>
      </div>

      {/* mix controls */}
      <div className="flex w-[300px] shrink-0 items-center justify-end gap-3">
        <button
          onClick={toggleAutoMix}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[8px] font-semibold tracking-wider transition',
            autoMix
              ? 'border-neon-mint/35 bg-neon-mint/[0.08] text-neon-mint'
              : 'border-white/[0.08] bg-white/[0.03] text-fog-400 hover:text-fog-200',
          )}
          title="Şarkı bitmeden crossfade ile sonrakine geç"
        >
          <IconZap className="h-3 w-3" />
          AUTO MIX
        </button>

        <div className="w-[92px]">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[7.5px] uppercase tracking-widest text-fog-400">Crossfade</span>
            <span className="num text-[8px] text-fog-200">{crossfade.toFixed(1)}s</span>
          </div>
          <input
            type="range"
            min={0}
            max={12}
            step={0.5}
            value={crossfade}
            onChange={(e) => setCrossfade(Number(e.target.value))}
            className="range-neon h-3"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <IconVolume className="h-3.5 w-3.5 text-fog-400" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="range-neon w-12"
            aria-label="Ses"
          />
        </div>

        <div className="flex h-6 w-1.5 items-end overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="w-full rounded-full bg-gradient-to-t from-neon-mint to-neon-cyan transition-[height] duration-75"
            style={{ height: `${Math.round(level * 100)}%` }}
          />
        </div>
      </div>
    </footer>
  );
}
