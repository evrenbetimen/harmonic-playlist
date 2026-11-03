import { useMemo, useState } from 'react';
import { keyColor, keyColorAlpha } from '@/core/camelot';
import type { TrackWithKey } from '@/core/types';
import { cn, formatDuration } from '@/lib/format';
import { crateFor, genreCounts, useSetStore } from '@/state/useSetStore';
import { playSlot } from '@/state/playback';
import { usePlayerStore } from '@/state/usePlayerStore';
import {
  IconAlert,
  IconCheck,
  IconDisc,
  IconPlay,
  IconPlus,
  IconSearch,
  IconX,
} from '@/components/ui/icons';

const GENRE_ORDER = (a: string, b: string) => a.localeCompare(b);

/**
 * Krate — the source pool the sequencer draws from.
 *
 * Without this view the crate was invisible: users could only see the 40 tracks
 * that happened to be selected, never the 150 that were passed over. It also
 * makes "why is this neighbour missing from the set?" answerable.
 */
export function CrateView() {
  const allTracks = useSetStore((s) => s.allTracks);
  const activeGenres = useSetStore((s) => s.activeGenres);
  const toggleGenre = useSetStore((s) => s.toggleGenre);
  const clearGenres = useSetStore((s) => s.clearGenres);
  const plan = useSetStore((s) => s.plan);
  const appendTrack = useSetStore((s) => s.appendTrack);
  const source = useSetStore((s) => s.source);
  const error = useSetStore((s) => s.error);
  const reset = useSetStore((s) => s.reset);

  const [query, setQuery] = useState('');
  const [keyFilter, setKeyFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<'bpm' | 'energy' | 'key' | 'title'>('bpm');

  const crate = useMemo(() => crateFor(allTracks, activeGenres), [allTracks, activeGenres]);
  const genres = useMemo(() => genreCounts(allTracks), [allTracks]);
  const inSet = useMemo(
    () => new Set(plan?.slots.map((s) => s.track.id) ?? []),
    [plan],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = crate.filter((t) => {
      if (keyFilter && t.camelotId !== keyFilter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        (t.camelotId ?? '').toLowerCase() === q
      );
    });

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'energy':
          return b.features.energy - a.features.energy;
        case 'key':
          return (a.camelot?.number ?? 0) - (b.camelot?.number ?? 0) ||
            (a.camelot?.letter ?? 'A').localeCompare(b.camelot?.letter ?? 'A');
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return a.features.tempo - b.features.tempo;
      }
    });
  }, [crate, query, keyFilter, sort]);

  const keyCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of crate) {
      if (!t.camelotId) continue;
      map.set(t.camelotId, (map.get(t.camelotId) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [crate]);

  const avgEnergy =
    crate.length === 0
      ? 0
      : crate.reduce((sum, t) => sum + t.features.energy, 0) / crate.length;
  const bpmValues = crate.map((t) => t.features.tempo).sort((a, b) => a - b);
  const bpmMedian =
    bpmValues.length === 0 ? 0 : bpmValues[Math.floor(bpmValues.length / 2)];

  return (
    <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-y-auto pb-1 pr-0.5">
      <section className="glass grain shrink-0 rounded-2xl px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-neon-mint/25 bg-neon-mint/[0.08]">
              <IconDisc className="h-4 w-4 text-neon-mint" />
            </span>
            <div>
              <p className="label-xs">Krate</p>
              <p className="mt-0.5 text-[12.5px] font-medium text-white">
                {crate.length} / {allTracks.length} parça havuzda
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <Metric label="kaynak" value={source === 'demo' ? 'demo' : 'spotify'} />
            <Metric label="ort. enerji" value={avgEnergy.toFixed(2)} />
            <Metric label="medyan BPM" value={String(Math.round(bpmMedian))} />
            <Metric label="sette" value={`${inSet.size}`} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            className="chip"
            data-active={activeGenres.length === 0}
            onClick={clearGenres}
          >
            Tümü
          </button>
          {[...genres].sort((a, b) => GENRE_ORDER(a.genre, b.genre)).map((g) => (
            <button
              key={g.genre}
              className="chip capitalize"
              data-active={activeGenres.includes(g.genre)}
              onClick={() => toggleGenre(g.genre)}
            >
              {g.genre.replace(/-/g, ' ')}
              <span className="ml-1.5 text-[9px] opacity-60">{g.count}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[190px] flex-1">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fog-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Krate içinde ara…"
              className="h-8 w-full rounded-lg border border-white/[0.07] bg-white/[0.035] pl-8 pr-2.5 text-[11px] text-fog-100 placeholder:text-fog-400/70 outline-none focus:border-neon-mint/40 focus:ring-2 focus:ring-neon-mint/10"
            />
          </div>

          <div className="flex items-center gap-1">
            {(['bpm', 'energy', 'key', 'title'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={cn(
                  'rounded-md border px-2 py-1 text-[9.5px] transition',
                  sort === s
                    ? 'border-white/15 bg-white/[0.08] text-white'
                    : 'border-white/[0.06] text-fog-400 hover:text-fog-200',
                )}
              >
                {s === 'bpm' ? 'BPM' : s === 'energy' ? 'Enerji' : s === 'key' ? 'Key' : 'A-Z'}
              </button>
            ))}
            {keyFilter && (
              <button
                onClick={() => setKeyFilter(null)}
                className="ml-1 flex items-center gap-1 rounded-md border border-neon-mint/30 bg-neon-mint/[0.1] px-1.5 py-1 text-[9.5px] text-neon-mint"
              >
                {keyFilter}
                <IconX className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.08] px-2.5 py-1.5 text-[10px] text-rose-200">
            <IconAlert className="h-3 w-3 shrink-0 text-rose-400" />
            <span className="flex-1">{error}</span>
            <button onClick={reset} className="rounded p-0.5 hover:bg-white/10" aria-label="Kapat">
              <IconX className="h-3 w-3" />
            </button>
          </div>
        )}
      </section>

      <section className="glass grain shrink-0 rounded-2xl px-4 py-3">
        <div className="flex items-baseline justify-between">
          <p className="label-xs">Ton dağılımı</p>
          <span className="text-[9px] text-fog-400">
            {keyCounts.length} farklı anahtar · hücreye tıkla → filtre
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {keyCounts.map(([keyId, count]) => {
            const active = keyFilter === keyId;
            const key = crate.find((t) => t.camelotId === keyId)?.camelot ?? null;
            const color = keyColor(key);
            return (
              <button
                key={keyId}
                onClick={() => setKeyFilter(active ? null : keyId)}
                title={`${count} parça ${keyId}`}
                className={cn(
                  'num flex h-6 min-w-[38px] items-center justify-center gap-1 rounded-md border px-1.5 text-[10px] font-semibold transition',
                  active ? 'text-white' : 'text-fog-200 hover:text-white',
                )}
                style={{
                  color: active ? '#fff' : color,
                  borderColor: keyColorAlpha(key, active ? 0.9 : 0.3),
                  background: keyColorAlpha(key, active ? 0.35 : 0.1),
                  boxShadow: active ? `0 0 18px -6px ${color}` : undefined,
                }}
              >
                {keyId}
                <span className="text-[8px] font-normal opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="glass grain flex min-h-[320px] flex-col overflow-hidden rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
          <p className="label-xs">Havuz</p>
          <span className="num text-[10px] text-fog-400">{rows.length} PARÇA</span>
        </div>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
          {rows.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <p className="text-[12px] text-fog-200">Bu filtreyle parça yok</p>
              <p className="text-[10.5px] text-fog-400">
                Janra veya anahtar filtresini gevşet.
              </p>
            </div>
          )}

          {rows.map((track) => (
            <CrateRow
              key={track.id}
              track={track}
              inSet={inSet.has(track.id)}
              onAdd={() => appendTrack(track)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function CrateRow({
  track,
  inSet,
  onAdd,
}: {
  track: TrackWithKey;
  inSet: boolean;
  onAdd: () => void;
}) {
  const color = keyColor(track.camelot);
  const playing = usePlayerStore((s) => s.playing);
  const playerTrack = usePlayerStore((s) => s.track);
  const isPlaying = playing && playerTrack?.id === track.id;

  return (
    <div className="group grid grid-cols-[26px_minmax(0,1fr)_52px_44px_54px_30px] items-center gap-x-2.5 border-b border-white/[0.035] px-4 py-[5px] transition-colors hover:bg-white/[0.028]">
      <div className="relative flex h-6 w-6 items-center justify-center">
        <span
          className={cn(
            'text-[8.5px] font-semibold text-fog-400 group-hover:opacity-0',
            isPlaying && 'opacity-0',
          )}
        >
          {Math.round(track.features.energy * 100)}
        </span>
        <button
          onClick={() => {
            const plan = useSetStore.getState().plan;
            const index = plan?.slots.findIndex((s) => s.track.id === track.id) ?? -1;
            if (index >= 0) playSlot(index);
          }}
          disabled={!inSet}
          title={inSet ? 'Setteki yerinden önizle' : 'Önizleme yalnızca setteki parçalar için'}
          className={cn(
            'absolute inset-0 flex items-center justify-center rounded-md text-white opacity-0 transition hover:bg-white/10 group-hover:opacity-100',
            isPlaying && 'opacity-100',
            !inSet && 'cursor-not-allowed opacity-0 group-hover:opacity-40',
          )}
          aria-label="Önizle"
        >
          <IconPlay className="h-2.5 w-2.5" />
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md text-[7.5px] font-bold"
          style={{
            background: `linear-gradient(145deg, ${color}33, #0b0b10 70%)`,
            boxShadow: `inset 0 0 0 1px ${color}30`,
            color,
          }}
        >
          {track.artworkUrl ? (
            <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials(track.artist)
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[11px] font-medium leading-tight text-fog-100">
              {track.title}
            </p>
            {inSet && (
              <span className="shrink-0 rounded border border-neon-mint/25 bg-neon-mint/10 px-1 text-[7px] font-bold uppercase tracking-wider text-neon-mint">
                sette
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[9px] leading-tight text-fog-400">
            {track.artist}
            <span className="mx-1.5 opacity-40">·</span>
            {formatDuration(track.durationMs)}
          </p>
        </div>
      </div>

      <span className="num text-right text-[11px] text-fog-200">
        {Math.round(track.features.tempo)}
      </span>

      <span
        className="inline-flex h-[19px] min-w-[34px] items-center justify-center rounded-md border px-1 text-[9.5px] font-bold"
        style={{
          color,
          borderColor: keyColorAlpha(track.camelot, 0.35),
          background: keyColorAlpha(track.camelot, 0.12),
        }}
      >
        {track.camelotId ?? '—'}
      </span>

      <EnergyBars value={track.features.energy} color={color} />

      <button
        onClick={onAdd}
        disabled={inSet}
        title={inSet ? 'Zaten sette' : 'Setin sonuna ekle'}
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded transition',
          inSet
            ? 'cursor-default text-neon-mint'
            : 'text-fog-400 opacity-0 hover:bg-neon-mint/15 hover:text-neon-mint group-hover:opacity-100',
        )}
        aria-label="Sete ekle"
      >
        {inSet ? <IconCheck className="h-3 w-3" /> : <IconPlus className="h-3 w-3" />}
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-white/[0.055] bg-white/[0.025] px-2 py-1">
      <span className="text-[8.5px] uppercase tracking-wider text-fog-400">{label}</span>
      <span className="num text-[10.5px] font-semibold text-fog-100">{value}</span>
    </span>
  );
}

function EnergyBars({ value, color }: { value: number; color: string }) {
  const active = Math.round(value * 5);
  return (
    <div className="flex items-end gap-[2px]" title={`Energy ${Math.round(value * 100)}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className="w-[2.5px] rounded-sm"
          style={{
            height: 4 + i * 2.6,
            background: i < active ? color : 'rgba(255,255,255,0.09)',
          }}
        />
      ))}
    </div>
  );
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
