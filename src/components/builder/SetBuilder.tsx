import { useMemo } from 'react';
import { PROFILES } from '@/core/energy';
import type { FlowProfile } from '@/core/types';
import { cn } from '@/lib/format';
import { genreCounts, useCrate, useSetStore } from '@/state/useSetStore';
import {
  IconCheck,
  IconLink,
  IconRefresh,
  IconSparkles,
  IconZap,
} from '@/components/ui/icons';

export function SetBuilder() {
  const options = useSetStore((s) => s.options);
  const patch = useSetStore((s) => s.patchOptions);
  const activeGenres = useSetStore((s) => s.activeGenres);
  const toggleGenre = useSetStore((s) => s.toggleGenre);
  const allTracks = useSetStore((s) => s.allTracks);
  const generate = useSetStore((s) => s.generate);
  const status = useSetStore((s) => s.status);
  const progress = useSetStore((s) => s.progress);
  const progressDetail = useSetStore((s) => s.progressDetail);
  const reset = useSetStore((s) => s.reset);

  const crate = useCrate();
  const genres = useMemo(() => genreCounts(allTracks).slice(0, 8), [allTracks]);
  const planning = status === 'planning';

  const strictLabel =
    options.harmonicStrictness >= 0.82
      ? 'Sadece kusursuz'
      : options.harmonicStrictness >= 0.62
        ? 'Dengeli'
        : options.harmonicStrictness >= 0.38
          ? 'Yaratıcı'
          : 'Serbest';

  return (
    <aside className="glass grain flex min-h-0 flex-col overflow-hidden rounded-2xl">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
        <div>
          <p className="label-xs">Set Builder</p>
          <h2 className="display mt-1.5 text-[15px] text-white">Yeni Set Oluştur</h2>
        </div>
        <button className="icon-btn" onClick={reset} title="Sıfırla">
          <IconRefresh className="h-4 w-4" />
        </button>
      </header>

      <div className="scroll-slim min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* GENRE */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="label-xs">Janra</p>
            <span className="text-[10px] text-fog-400">{activeGenres.length || 'tümü'}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {genres.map((g) => {
              const active = activeGenres.includes(g.genre);
              return (
                <button
                  key={g.genre}
                  onClick={() => toggleGenre(g.genre)}
                  className={cn(
                    'chip capitalize',
                    active && 'shadow-[0_0_16px_-6px_rgba(61,255,176,0.9)]',
                  )}
                  data-active={active}
                >
                  {g.genre.replace('-', ' ')}
                  <span className={cn('num text-[9px]', active ? 'opacity-60' : 'text-fog-400/70')}>
                    {g.count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <Divider />

        {/* BPM */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="label-xs">Tempo Aralığı</p>
            <span className="text-[10px] text-fog-400">BPM</span>
          </div>
          <div className="mb-3 flex items-baseline gap-2">
            <span className="num text-[22px] font-semibold leading-none text-white">
              {options.bpmRange[0]}
            </span>
            <span className="text-fog-400">—</span>
            <span className="num text-[22px] font-semibold leading-none text-neon-mint">
              {options.bpmRange[1]}
            </span>
            <span className="ml-auto rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-fog-400">
              {options.bpmRange[1] - options.bpmRange[0]} BPM
            </span>
          </div>

          <RangeControl
            label="Min"
            value={options.bpmRange[0]}
            min={90}
            max={options.bpmRange[1] - 2}
            onChange={(v) => patch({ bpmRange: [v, options.bpmRange[1]] })}
          />
          <RangeControl
            label="Max"
            value={options.bpmRange[1]}
            min={options.bpmRange[0] + 2}
            max={150}
            onChange={(v) => patch({ bpmRange: [options.bpmRange[0], v] })}
          />
        </section>

        <Divider />

        {/* COUNT */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="label-xs">Şarkı Adedi</p>
            <span className="num text-[13px] font-semibold text-white">
              {options.targetCount}
            </span>
          </div>
          <input
            type="range"
            className="range-neon"
            min={8}
            max={80}
            step={1}
            value={options.targetCount}
            onChange={(e) => patch({ targetCount: Number(e.target.value) })}
          />
          <div className="mt-1 flex justify-between text-[9px] text-fog-400">
            <span>8</span>
            <span>~{Math.round(options.targetCount * 6)} dk set</span>
            <span>80</span>
          </div>
        </section>

        <Divider />

        {/* PROFILE */}
        <section>
          <p className="label-xs mb-2">Akış Profili</p>
          <div className="space-y-1.5">
            {PROFILES.map((p) => (
              <ProfileRow
                key={p.id}
                active={options.profile === p.id}
                icon={p.icon}
                name={p.name}
                tagline={p.tagline}
                onClick={() => patch({ profile: p.id as FlowProfile })}
              />
            ))}
          </div>
        </section>

        <Divider />

        {/* STRICTNESS */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="label-xs">Harmonik Katılık</p>
            <span className="text-[10px] font-semibold text-neon-mint">{strictLabel}</span>
          </div>
          <input
            type="range"
            className="range-neon"
            min={0}
            max={1}
            step={0.01}
            value={options.harmonicStrictness}
            onChange={(e) => patch({ harmonicStrictness: Number(e.target.value) })}
          />
          <p className="mt-1.5 text-[10px] leading-relaxed text-fog-400">
            {options.harmonicStrictness >= 0.62
              ? 'Yalnızca Camelot komşuları, relatif tonlar ve enerji ±2 geçişleri.'
              : 'Daha geniş ton yelpazesi; diagonal geçişlere de izin verilir.'}
          </p>
        </section>

        <Divider />

        {/* BRIDGES */}
        <section className="flex items-start justify-between gap-3">
          <div>
            <p className="label-xs">Geçiş Köprüsü</p>
            <p className="mt-1.5 text-[10px] leading-relaxed text-fog-400">
              Sert geçişlerde araya 1–2 uyumlu şarkı ekle.
            </p>
          </div>
          <Switch
            checked={options.allowBridges}
            onChange={(v) => patch({ allowBridges: v })}
          />
        </section>
      </div>

      <footer className="border-t border-white/[0.06] p-3">
        <button
          className="btn-neon w-full"
          onClick={() => void generate()}
          disabled={planning || crate.length < 2}
        >
          {planning ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-950/30 border-t-ink-950" />
              <span className="num text-[11px]">{Math.round(progress * 100)}%</span>
              <span className="text-[11px] font-medium opacity-80">{progressDetail || 'Hesaplanıyor'}</span>
            </>
          ) : (
            <>
              <IconSparkles className="h-4 w-4" />
              Set Üret
              <span className="ml-auto flex items-center gap-0.5 rounded-md bg-ink-950/10 px-1.5 py-0.5 text-[9px] font-semibold opacity-70">
                <IconZap className="h-2.5 w-2.5" />AI
              </span>
            </>
          )}
        </button>

        {planning && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-neon-mint to-neon-cyan transition-all duration-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}

        <div className="mt-2 flex items-center justify-between text-[9px] text-fog-400">
          <span className="flex items-center gap-1">
            <IconCheck className="h-3 w-3 text-neon-mint" />
            {crate.length} uygun şarkı
          </span>
          <span className="flex items-center gap-1">
            <IconLink className="h-3 w-3" />
            {new Set(crate.map((t) => t.camelotId)).size} ton
          </span>
        </div>
      </footer>
    </aside>
  );
}

function ProfileRow({
  active,
  icon,
  name,
  tagline,
  onClick,
}: {
  active: boolean;
  icon: string;
  name: string;
  tagline: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all duration-200',
        active
          ? 'border-neon-mint/35 bg-neon-mint/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_24px_-12px_rgba(61,255,176,0.8)]'
          : 'border-transparent bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.045]',
      )}
    >
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[13px] leading-none',
          active
            ? 'border-neon-mint/40 bg-neon-mint/15 text-neon-mint'
            : 'border-white/10 bg-white/[0.03] text-fog-300',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[11.5px] font-semibold',
            active ? 'text-white' : 'text-fog-200',
          )}
        >
          {name}
        </span>
        <span className="block truncate text-[9.5px] text-fog-400">{tagline}</span>
      </span>
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full transition',
          active ? 'bg-neon-mint shadow-[0_0_8px_#3DFFB0]' : 'bg-white/10',
        )}
      />
    </button>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <span className="w-6 text-[9px] uppercase tracking-wider text-fog-400">{label}</span>
      <input
        type="range"
        className="range-neon"
        min={min}
        max={max}
        step={1}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="num w-7 text-right text-[10px] text-fog-200">{value}</span>
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
        checked
          ? 'border-neon-mint/50 bg-neon-mint/25'
          : 'border-white/10 bg-white/[0.06]',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all',
          checked
            ? 'left-[18px] bg-neon-mint shadow-[0_0_10px_rgba(61,255,176,0.9)]'
            : 'left-0.5 bg-fog-400',
        )}
      />
    </button>
  );
}

function Divider() {
  return <div className="h-px bg-white/[0.055]" />;
}
