import type { PlanResult } from '@/core/types';
import { cn, formatSetLength } from '@/lib/format';
import { useSetStore } from '@/state/useSetStore';
import { IconAlert, IconCheck, IconInfo, IconX } from '@/components/ui/icons';

export function QcPanel({ plan }: { plan: PlanResult | null }) {
  const selectSlot = useSetStore((s) => s.selectSlot);
  const selected = useSetStore((s) => s.selectedSlot);

  const m = plan?.metrics;
  const warnings = plan?.warnings ?? [];
  const important = warnings.filter((w) => w.severity !== 'info').slice(0, 3);
  const info = warnings.filter((w) => w.severity === 'info').slice(0, 1);

  return (
    <section className="glass grain shrink-0 overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <p className="label-xs">QC Raporu</p>
        {m && (
          <span
            className={cn(
              'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[8px] font-semibold tracking-wider',
              m.clashRate === 0
                ? 'border-neon-mint/25 bg-neon-mint/[0.08] text-neon-mint'
                : 'border-rose-500/30 bg-rose-500/[0.08] text-rose-300',
            )}
          >
            {m.clashRate === 0 ? <IconCheck className="h-2.5 w-2.5" /> : <IconX className="h-2.5 w-2.5" />}
            {m.clashRate === 0 ? 'PASS' : `${m.clashRate}% CLASH`}
          </span>
        )}
      </div>

      {!m && (
        <p className="px-4 pb-4 text-[10.5px] leading-relaxed text-fog-400">
          Set üretildiğinde 40 geçişin tamamı Camelot kurallarına göre doğrulanır ve burada raporlanır.
        </p>
      )}

      {m && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-2 gap-1.5">
            <Stat label="Harmonik saflık" value={`${m.harmonicPurity}%`} tone={m.harmonicPurity >= 90 ? 'good' : 'warn'} />
            <Stat label="Ort. geçiş" value={String(m.averageScore)} tone={m.averageScore >= 80 ? 'good' : 'warn'} />
            <Stat label="Enerji doğruluğu" value={`${m.energyAccuracy}%`} />
            <Stat label="BPM aralığı" value={`${m.bpmMin}–${m.bpmMax}`} />
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[9px] text-fog-400">
            <span>{m.trackCount} şarkı · {formatSetLength(m.totalDurationMs)}</span>
            <span className="num">S{m.gradeCounts.S} · A{m.gradeCounts.A} · B{m.gradeCounts.B} · C{m.gradeCounts.C} · D{m.gradeCounts.D}</span>
          </div>

          <div className="mt-2.5 space-y-1">
            {important.map((w, i) => (
              <button
                key={`${w.code}-${i}`}
                onClick={() => w.index != null && selectSlot(w.index)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left transition',
                  w.severity === 'error'
                    ? 'border-rose-500/20 bg-rose-500/[0.06] hover:bg-rose-500/[0.1]'
                    : 'border-amber-400/20 bg-amber-400/[0.05] hover:bg-amber-400/[0.09]',
                )}
              >
                <IconAlert
                  className={cn(
                    'mt-[1px] h-3 w-3 shrink-0',
                    w.severity === 'error' ? 'text-rose-400' : 'text-amber-400',
                  )}
                />
                <span className="line-clamp-2 text-[9px] leading-relaxed text-fog-300">{w.message}</span>
              </button>
            ))}
            {info.map((w, i) => (
              <div
                key={`info-${i}`}
                className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2 py-1.5"
              >
                <IconInfo className="mt-[1px] h-3 w-3 shrink-0 text-fog-400" />
                <span className="line-clamp-2 text-[9px] leading-relaxed text-fog-400">{w.message}</span>
              </div>
            ))}
            {important.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-neon-mint/15 bg-neon-mint/[0.04] px-2 py-1.5">
                <IconCheck className="h-3 w-3 text-neon-mint" />
                <span className="text-[9px] text-fog-300">
                  Tüm geçişler harmonik olarak doğrulandı.
                </span>
              </div>
            )}
          </div>

          {selected != null && plan && (
            <div className="mt-2 flex items-center justify-between border-t border-white/[0.05] pt-2 text-[8.5px] text-fog-400">
              <span>Seçili #{selected + 1} · {plan.slots[selected]?.track.camelotId ?? '—'}</span>
              <span className="num">drift {plan.metrics.bpmDrift} BPM</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'warn';
}) {
  return (
    <div className="rounded-lg border border-white/[0.055] bg-white/[0.025] px-2 py-1.5">
      <p className="text-[7.5px] uppercase tracking-[0.12em] text-fog-400">{label}</p>
      <p
        className={cn(
          'num mt-0.5 text-[12px] font-semibold leading-none',
          tone === 'good' ? 'text-neon-mint' : tone === 'warn' ? 'text-amber-300' : 'text-fog-100',
        )}
      >
        {value}
      </p>
    </div>
  );
}
