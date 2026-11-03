import { useMemo, useState } from 'react';
import { keyColor, keyColorAlpha } from '@/core/camelot';
import type { PlannedSlot, TransitionGrade } from '@/core/types';
import { cn, formatDuration } from '@/lib/format';
import { useSetStore } from '@/state/useSetStore';
import { playSlot } from '@/state/playback';
import { usePlayerStore } from '@/state/usePlayerStore';
import {
  IconCheck,
  IconGrip,
  IconPause,
  IconPlay,
  IconPlus,
  IconX,
} from '@/components/ui/icons';

interface Props {
  query: string;
  selected: number | null;
  onSelect: (index: number) => void;
  onOpenBridge: (index: number) => void;
}

const GRID =
  'grid grid-cols-[14px_26px_minmax(0,1fr)_52px_44px_54px_46px_22px] items-center gap-x-2.5';

export function TrackList({ query, selected, onSelect, onOpenBridge }: Props) {
  const plan = useSetStore((s) => s.plan);
  const status = useSetStore((s) => s.status);
  const reorder = useSetStore((s) => s.reorder);
  const removeSlot = useSetStore((s) => s.removeSlot);
  const flashIndex = useSetStore((s) => s.flashIndex);
  const playing = usePlayerStore((s) => s.playing);
  const playerIndex = usePlayerStore((s) => s.index);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!plan) return [];
    const q = query.trim().toLowerCase();
    return plan.slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => {
        if (!q) return true;
        return (
          slot.track.title.toLowerCase().includes(q) ||
          slot.track.artist.toLowerCase().includes(q) ||
          (slot.track.camelotId ?? '').toLowerCase() === q
        );
      });
  }, [plan, query]);

  const total = plan?.slots.length ?? 0;

  return (
    <div className="glass grain flex min-h-0 flex-col overflow-hidden rounded-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-baseline gap-2.5">
          <p className="label-xs">Playlist</p>
          {plan && (
            <span className="num text-[10px] text-fog-400">
              {String(total).padStart(2, '0')} TRACKS
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {plan && (
            <span className="flex items-center gap-1 text-[9px] text-fog-400">
              <IconCheck className="h-3 w-3 text-neon-mint" />
              QC {plan.metrics.harmonicPurity}% uyumlu
            </span>
          )}
          <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-fog-400">
            sürükle → sırala
          </span>
        </div>
      </div>

      <div className={cn(GRID, 'shrink-0 border-b border-white/[0.05] px-4 py-1.5 text-[8.5px] uppercase tracking-[0.14em] text-fog-400')}>
        <span />
        <span>#</span>
        <span>Parça</span>
        <span className="text-right">BPM</span>
        <span>Key</span>
        <span>Enerji</span>
        <span>Flow</span>
        <span />
      </div>

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
        {!plan && status === 'planning' && <SkeletonRows />}

        {!plan && status !== 'planning' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
              <IconPlus className="h-6 w-6 text-fog-400" />
              <span className="absolute inset-0 rounded-2xl bg-neon-mint/10 blur-xl" />
            </div>
            <div>
              <p className="text-[13px] font-medium text-fog-200">Henüz set üretilmedi</p>
              <p className="mt-1 text-[10.5px] text-fog-400">
                Janra, BPM ve akış profilini seçip <span className="text-neon-mint">Set Üret</span>'e bas.
              </p>
            </div>
          </div>
        )}

        {plan && filtered.length === 0 && (
          <div className="flex h-full items-center justify-center text-[11px] text-fog-400">
            "{query}" için sonuç yok.
          </div>
        )}

        {filtered.map(({ slot, index }) => (
          <TrackRow
            key={slot.uid}
            slot={slot}
            index={index}
            selected={selected === index}
            isPlaying={playing && playerIndex === index}
            isFlashing={flashIndex === index}
            isDragging={dragIndex === index}
            isOver={overIndex === index && dragIndex !== index}
            onSelect={() => onSelect(index)}
            onPlay={() => playSlot(index)}
            onRemove={() => removeSlot(index)}
            onBridge={() => onOpenBridge(index)}
            onDragStart={() => setDragIndex(index)}
            onDragOver={() => setOverIndex(index)}
            onDrop={() => {
              if (dragIndex != null && dragIndex !== index) reorder(dragIndex, index);
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function TrackRow({
  slot,
  index,
  selected,
  isPlaying,
  isFlashing,
  isDragging,
  isOver,
  onSelect,
  onPlay,
  onRemove,
  onBridge,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  slot: PlannedSlot;
  index: number;
  selected: boolean;
  isPlaying: boolean;
  isFlashing: boolean;
  isDragging: boolean;
  isOver: boolean;
  onSelect: () => void;
  onPlay: () => void;
  onRemove: () => void;
  onBridge: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const track = slot.track;
  const key = track.camelot;
  const color = keyColor(key);
  const grade = slot.transition?.grade;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={cn(
        GRID,
        'group relative cursor-pointer border-b border-white/[0.035] px-4 py-[5px] transition-colors duration-150',
        selected
          ? 'bg-white/[0.055]'
          : 'hover:bg-white/[0.028]',
        isDragging && 'opacity-40',
        isFlashing && 'bg-neon-mint/[0.09]',
      )}
      style={
        selected
          ? { boxShadow: `inset 2px 0 0 ${color}, inset 0 0 40px -18px ${keyColorAlpha(key, 0.9)}` }
          : undefined
      }
    >
      {isOver && (
        <span className="pointer-events-none absolute left-0 right-0 top-0 h-[2px] bg-neon-mint shadow-[0_0_10px_#3DFFB0]" />
      )}

      <span className="flex justify-center text-fog-400 opacity-0 transition group-hover:opacity-100">
        <IconGrip className="h-3 w-3" />
      </span>

      <span className="relative flex h-6 w-6 items-center justify-center">
        <span className={cn('num text-[10px] text-fog-400 group-hover:opacity-0', isPlaying && 'opacity-0')}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          className={cn(
            'absolute inset-0 flex items-center justify-center rounded-md text-white opacity-0 transition hover:bg-white/10 group-hover:opacity-100',
            isPlaying && 'opacity-100',
          )}
          aria-label={isPlaying ? 'Duraklat' : 'Önizle'}
        >
          {isPlaying ? (
            <IconPause className="h-3 w-3 text-neon-mint" />
          ) : (
            <IconPlay className="h-2.5 w-2.5" />
          )}
        </button>
      </span>

      <div className="flex min-w-0 items-center gap-2.5">
        <Artwork slot={slot} color={color} playing={isPlaying} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p
              className={cn(
                'truncate text-[11.5px] font-medium leading-tight',
                selected ? 'text-white' : 'text-fog-100',
              )}
            >
              {track.title}
            </p>
            {slot.isBridge && (
              <span className="shrink-0 rounded border border-neon-cyan/30 bg-neon-cyan/10 px-1 text-[7px] font-bold uppercase tracking-wider text-neon-cyan">
                bridge
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[9.5px] leading-tight text-fog-400">
            {track.artist}
            <span className="mx-1.5 opacity-40">·</span>
            {track.album}
          </p>
        </div>
      </div>

      <div className="text-right">
        <span className="num text-[11px] font-medium text-fog-200">
          {Math.round(track.features.tempo)}
        </span>
        <span className="mt-0.5 block text-[7.5px] uppercase tracking-wider text-fog-400/70">
          {formatDuration(track.durationMs)}
        </span>
      </div>

      <div>
        <span
          className="inline-flex h-[19px] min-w-[34px] items-center justify-center rounded-md border px-1 text-[9.5px] font-bold"
          style={{
            color,
            borderColor: keyColorAlpha(key, 0.35),
            background: keyColorAlpha(key, 0.12),
          }}
        >
          {track.camelotId ?? '—'}
        </span>
      </div>

      <EnergyBars value={track.features.energy} color={color} />

      <div className="flex items-center">
        {grade ? (
          <button
            title={slot.transition?.reason}
            onClick={(e) => {
              e.stopPropagation();
              if (grade === 'C' || grade === 'D') onBridge();
            }}
            className={cn(
              'num flex h-[19px] w-[36px] items-center justify-center gap-0.5 rounded-md border text-[9px] font-bold transition',
              gradeColor(grade),
              (grade === 'C' || grade === 'D') && 'hover:brightness-125',
            )}
          >
            {grade === 'D' ? '!' : grade}
            <span className="text-[7.5px] font-medium opacity-60">
              {slot.transition?.score}
            </span>
          </button>
        ) : (
          <span className="num text-[9px] text-fog-400">—</span>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="flex h-5 w-5 items-center justify-center rounded text-fog-400 opacity-0 transition hover:bg-rose-500/15 hover:text-rose-300 group-hover:opacity-100"
        aria-label="Kaldır"
      >
        <IconX className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

function Artwork({ slot, color, playing }: { slot: PlannedSlot; color: string; playing: boolean }) {
  const track = slot.track;
  return (
    <div
      className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md"
      style={{
        background: `linear-gradient(145deg, ${color}33, #0b0b10 70%)`,
        boxShadow: `inset 0 0 0 1px ${color}30`,
      }}
    >
      {track.artworkUrl ? (
        <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <>
          <span
            className="text-[8px] font-bold tracking-tight"
            style={{ color, opacity: 0.9 }}
          >
            {initials(track.artist)}
          </span>
          <span
            className="absolute -bottom-2 -right-1 h-5 w-5 rounded-full blur-[6px]"
            style={{ background: color, opacity: 0.35 }}
          />
        </>
      )}
      {playing && (
        <span className="absolute inset-0 flex items-end justify-center gap-[1.5px] bg-ink-950/60 pb-1">
          {[3, 7, 5, 9].map((h, i) => (
            <span
              key={i}
              className="eq-bar w-[1.5px] rounded-sm bg-neon-mint"
              style={{ height: h, animationDelay: `${i * 110}ms` }}
            />
          ))}
        </span>
      )}
    </div>
  );
}

function EnergyBars({ value, color }: { value: number; color: string }) {
  const active = Math.round(value * 5);
  return (
    <div className="flex items-end gap-[2px]" title={`Energy ${Math.round(value * 100)}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className="w-[2.5px] rounded-sm transition-all"
          style={{
            height: 4 + i * 2.6,
            background: i < active ? color : 'rgba(255,255,255,0.09)',
            opacity: i < active ? 0.9 : 1,
          }}
        />
      ))}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-1 px-3 py-2">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg px-1 py-2">
          <div className="h-3 w-4 rounded bg-white/[0.05]" />
          <div className="h-8 w-8 rounded-md bg-white/[0.05]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-[42%] rounded bg-white/[0.06]" />
            <div className="h-2 w-[26%] rounded bg-white/[0.04]" />
          </div>
          <div className="h-3 w-8 rounded bg-white/[0.05]" />
          <div className="h-4 w-8 rounded bg-white/[0.05]" />
        </div>
      ))}
    </div>
  );
}

function gradeColor(grade: TransitionGrade): string {
  switch (grade) {
    case 'S':
      return 'border-neon-mint/35 bg-neon-mint/12 text-neon-mint';
    case 'A':
      return 'border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan';
    case 'B':
      return 'border-amber-400/30 bg-amber-400/10 text-amber-300';
    case 'C':
      return 'border-orange-500/35 bg-orange-500/10 text-orange-300';
    default:
      return 'border-rose-500/40 bg-rose-500/12 text-rose-300';
  }
}

function initials(artist: string): string {
  return artist
    .replace(/[^\p{L}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
