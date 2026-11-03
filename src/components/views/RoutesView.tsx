import { useMemo, useState } from 'react';
import { keyColor, keyColorAlpha } from '@/core/camelot';
import { PROFILES } from '@/core/energy';
import type { FlowProfile, PlanResult, TransitionGrade } from '@/core/types';
import { cn, formatSetLength } from '@/lib/format';
import { crateFor, useSetStore } from '@/state/useSetStore';
import { planInWorker } from '@/workers/planClient';
import { playSlot } from '@/state/playback';
import {
  IconCheck,
  IconRefresh,
  IconRoute,
  IconSparkles,
  IconZap,
} from '@/components/ui/icons';

interface Candidate {
  id: string;
  label: string;
  hint: string;
  seed: number;
  profile: FlowProfile;
  strictness: number;
  plan: PlanResult;
}

/**
 * Harmonik Rotalar — several legal routes over the same crate.
 *
 * The builder commits to one plan; this view shows that the choice is not
 * arbitrary: same crate, different seeds and profiles, measurably different
 * outcomes. Picking a card replaces the active plan.
 */
export function RoutesView() {
  const allTracks = useSetStore((s) => s.allTracks);
  const activeGenres = useSetStore((s) => s.activeGenres);
  const options = useSetStore((s) => s.options);
  const plan = useSetStore((s) => s.plan);
  const setPlan = useSetStore((s) => s.setPlan);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ranKey, setRanKey] = useState('');

  const crate = useMemo(() => crateFor(allTracks, activeGenres), [allTracks, activeGenres]);
  const configKey = `${activeGenres.join('|')}::${options.profile}::${options.targetCount}::${options.bpmRange.join('-')}`;

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const variants: Array<Pick<Candidate, 'label' | 'hint' | 'seed' | 'profile' | 'strictness'>> = [
        {
          label: 'Dengeli',
          hint: 'Varsayılan sertlik, mevcut profil',
          seed: options.seed,
          profile: options.profile,
          strictness: options.harmonicStrictness,
        },
        {
          label: 'Kusursuz',
          hint: 'Sadece S/A geçişler — daha dar havuz',
          seed: options.seed + 17,
          profile: options.profile,
          strictness: 0.94,
        },
        {
          label: 'Cesur',
          hint: 'Daha fazla renk, daha çok risk',
          seed: options.seed + 91,
          profile: options.profile,
          strictness: 0.34,
        },
        {
          label: 'Alternatif akış',
          hint: 'Aynı krate, farklı enerji profili',
          seed: options.seed + 7,
          profile: alternateProfile(options.profile),
          strictness: options.harmonicStrictness,
        },
        {
          label: 'Farklı tohum',
          hint: 'Aynı kurallar, başka açılış',
          seed: options.seed + 2027,
          profile: options.profile,
          strictness: options.harmonicStrictness,
        },
      ];

      const results = await Promise.all(
        variants.map(async (v) => {
          const result = await planInWorker(crate, {
            ...options,
            seed: v.seed,
            profile: v.profile,
            harmonicStrictness: v.strictness,
          });
          return { ...v, id: `${v.seed}-${v.profile}-${v.strictness}`, plan: result };
        }),
      );

      // Best first, but keep the requested profile visible at the top of its group.
      results.sort((a, b) => b.plan.metrics.averageScore - a.plan.metrics.averageScore);
      setCandidates(results);
      setRanKey(configKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rotalar hesaplanamadı');
    } finally {
      setBusy(false);
    }
  };

  const stale = ranKey !== configKey;

  return (
    <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-y-auto pb-1 pr-0.5">
      <section className="glass grain shrink-0 rounded-2xl px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-neon-cyan/25 bg-neon-cyan/[0.08]">
              <IconRoute className="h-4 w-4 text-neon-cyan" />
            </span>
            <div>
              <p className="label-xs">Harmonik Rotalar</p>
              <p className="mt-0.5 text-[12.5px] font-medium text-white">
                Aynı krate, ölçülebilir alternatifler
              </p>
            </div>
          </div>

          <button
            className="btn-neon h-8 px-3 text-[11px] disabled:opacity-50"
            onClick={() => void generate()}
            disabled={busy || crate.length < 4}
          >
            {busy ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-950/30 border-t-ink-950" />
            ) : (
              <IconSparkles className="h-3.5 w-3.5" />
            )}
            {candidates.length === 0 ? 'Rotaları hesapla' : 'Yeniden hesapla'}
          </button>
        </div>

        <p className="mt-2 text-[10.5px] leading-relaxed text-fog-400">
          {crate.length} parçalık havuzdan 5 farklı rota üretilir: farklı tohum, harmonik
          sertlik ve enerji profili. Metrikler gerçek geçişlerden hesaplanır — hiçbir kart
          tahmini değer göstermez.
        </p>

        {stale && candidates.length > 0 && (
          <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-2.5 py-1.5 text-[10px] text-amber-200">
            Krate veya seçenekler değişti. Rotalar eski yapılandırmaya ait — yeniden hesapla.
          </p>
        )}

        {error && (
          <p className="mt-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.08] px-2.5 py-1.5 text-[10px] text-rose-200">
            {error}
          </p>
        )}
      </section>

      {candidates.length === 0 && !busy && (
        <section className="glass grain flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl px-6 py-10 text-center">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
            <IconRoute className="h-6 w-6 text-fog-400" />
            <span className="absolute inset-0 rounded-2xl bg-neon-cyan/10 blur-xl" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-fog-200">Henüz rota hesaplanmadı</p>
            <p className="mt-1 max-w-[420px] text-[10.5px] leading-relaxed text-fog-400">
              Aynı krateden beş farklı geçerli set üretip harmonik saflık, ortalama geçiş ve
              enerji doğruluğuna göre karşılaştır.
            </p>
          </div>
        </section>
      )}

      {busy && candidates.length === 0 && (
        <section className="glass grain flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-neon-mint" />
          <p className="text-[11px] text-fog-300">5 rota hesaplanıyor…</p>
        </section>
      )}

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {candidates.map((c, i) => (
          <RouteCard
            key={c.id}
            candidate={c}
            rank={i + 1}
            active={plan != null && sameOrder(plan, c.plan)}
            onApply={() => setPlan(c.plan)}
          />
        ))}
      </div>
    </div>
  );
}

function RouteCard({
  candidate,
  rank,
  active,
  onApply,
}: {
  candidate: Candidate;
  rank: number;
  active: boolean;
  onApply: () => void;
}) {
  const m = candidate.plan.metrics;
  const profileName = PROFILES.find((p) => p.id === candidate.profile)?.name ?? candidate.profile;
  const gradeTotal = Math.max(
    1,
    m.gradeCounts.S + m.gradeCounts.A + m.gradeCounts.B + m.gradeCounts.C + m.gradeCounts.D,
  );

  return (
    <section
      className={cn(
        'glass grain flex flex-col overflow-hidden rounded-2xl transition',
        active && 'ring-1 ring-neon-mint/45',
      )}
    >
      <header className="flex items-start justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="num text-[9px] text-fog-400">#{rank}</span>
            <p className="truncate text-[12px] font-semibold text-white">{candidate.label}</p>
            {active && (
              <span className="shrink-0 rounded border border-neon-mint/30 bg-neon-mint/10 px-1 text-[7px] font-bold uppercase tracking-wider text-neon-mint">
                aktif
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[9.5px] text-fog-400">{candidate.hint}</p>
        </div>
        <span className="num shrink-0 rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-fog-300">
          {profileName}
        </span>
      </header>

      <div className="grid grid-cols-3 gap-1.5 px-4 py-2.5">
        <Stat label="Saflık" value={`${m.harmonicPurity}%`} good={m.harmonicPurity >= 90} />
        <Stat label="Ort. geçiş" value={String(m.averageScore)} good={m.averageScore >= 80} />
        <Stat label="Enerji" value={`${m.energyAccuracy}%`} good={m.energyAccuracy >= 85} />
      </div>

      <div className="px-4">
        <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
          {(['S', 'A', 'B', 'C', 'D'] as TransitionGrade[]).map((g) => {
            const count = m.gradeCounts[g];
            if (count === 0) return null;
            return (
              <span
                key={g}
                title={`${g}: ${count}`}
                style={{ width: `${(count / gradeTotal) * 100}%` }}
                className={cn(
                  'h-full',
                  g === 'S' && 'bg-neon-mint',
                  g === 'A' && 'bg-neon-cyan',
                  g === 'B' && 'bg-amber-400',
                  g === 'C' && 'bg-orange-500',
                  g === 'D' && 'bg-rose-500',
                )}
              />
            );
          })}
        </div>
        <div className="mt-1 flex items-center justify-between text-[8.5px] text-fog-400">
          <span className="num">
            S{m.gradeCounts.S} · A{m.gradeCounts.A} · B{m.gradeCounts.B} · C{m.gradeCounts.C} · D
            {m.gradeCounts.D}
          </span>
          <span>
            {m.trackCount} şarkı · {formatSetLength(m.totalDurationMs)}
          </span>
        </div>
      </div>

      <div className="mt-2.5 px-4">
        <RouteStrip plan={candidate.plan} />
      </div>

      <div className="mt-2.5 flex items-center gap-2 border-t border-white/[0.06] px-4 py-2.5">
        <span className="num flex items-center gap-1 text-[9px] text-fog-400">
          <IconZap className="h-2.5 w-2.5" />
          {m.bpmMin}–{m.bpmMax} BPM · drift {m.bpmDrift}
        </span>
        <span className="num text-[9px] text-fog-400">
          {m.keySpread} anahtar
        </span>
        <button
          onClick={onApply}
          disabled={active}
          className={cn(
            'ml-auto flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition',
            active
              ? 'cursor-default border-neon-mint/30 bg-neon-mint/10 text-neon-mint'
              : 'border-white/10 bg-white/[0.04] text-fog-100 hover:border-neon-mint/40 hover:bg-neon-mint/10 hover:text-neon-mint',
          )}
        >
          {active ? <IconCheck className="h-3 w-3" /> : <IconRefresh className="h-3 w-3" />}
          {active ? 'Aktif' : 'Bu rotayı kullan'}
        </button>
      </div>
    </section>
  );
}

/** Compact 24-key occupancy strip for the first N slots. */
function RouteStrip({ plan }: { plan: PlanResult }) {
  const slots = plan.slots.slice(0, 24);
  return (
    <div className="flex items-end gap-[2px]">
      {slots.map((slot) => {
        const color = keyColor(slot.track.camelot);
        return (
          <button
            key={slot.uid}
            onClick={() => playSlot(plan.slots.indexOf(slot))}
            title={`${slot.track.title} · ${slot.track.camelotId ?? '?'} · ${Math.round(slot.track.features.tempo)} BPM`}
            className="group flex-1 rounded-sm transition hover:brightness-125"
            style={{
              height: 8 + slot.track.features.energy * 26,
              background: keyColorAlpha(slot.track.camelot, 0.75),
              boxShadow: `inset 0 0 0 1px ${color}20`,
            }}
          />
        );
      })}
      {plan.slots.length > 24 && (
        <span className="num ml-1 shrink-0 text-[8px] text-fog-400">
          +{plan.slots.length - 24}
        </span>
      )}
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.055] bg-white/[0.025] px-2 py-1.5">
      <p className="text-[7.5px] uppercase tracking-[0.12em] text-fog-400">{label}</p>
      <p
        className={cn(
          'num mt-0.5 text-[12px] font-semibold leading-none',
          good ? 'text-neon-mint' : 'text-amber-300',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function sameOrder(a: PlanResult, b: PlanResult): boolean {
  if (a.slots.length !== b.slots.length) return false;
  return a.slots.every((slot, i) => slot.track.id === b.slots[i]?.track.id);
}

function alternateProfile(profile: FlowProfile): FlowProfile {
  const order: FlowProfile[] = ['steady-climb', 'wave', 'peak-time', 'warm-up', 'sunrise'];
  const idx = order.indexOf(profile);
  return order[(idx + 1) % order.length];
}
