import { keyColor } from '@/core/camelot';
import type { PlanResult, TransitionGrade } from '@/core/types';
import { cn } from '@/lib/format';
import { useSetStore } from '@/state/useSetStore';
import { IconArrowUpRight, IconLink, IconPlus } from '@/components/ui/icons';

interface Props {
  plan: PlanResult | null;
  selected: number | null;
}

export function TransitionPanel({ plan, selected }: Props) {
  const insertBridge = useSetStore((s) => s.insertBridge);
  const selectSlot = useSetStore((s) => s.selectSlot);

  const slot = plan && selected != null ? plan.slots[selected] : null;
  const index = selected ?? 0;
  const prev = plan && index > 0 ? plan.slots[index - 1] : null;
  const transition = slot?.transition ?? null;

  const gapBridge = plan?.bridges.find(
    (b) => prev && slot && b.fromId === prev.track.id && b.toId === slot.track.id,
  );

  return (
    <section className="glass grain shrink-0 overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <p className="label-xs">Transition</p>
        <span className="num text-[9px] text-fog-400">
          {slot ? `${String(index + 1).padStart(2, '0')} / ${String(plan?.slots.length ?? 0).padStart(2, '0')}` : '—'}
        </span>
      </div>

      {!slot && (
        <div className="px-4 pb-4 text-[10.5px] leading-relaxed text-fog-400">
          Bir şarkı seçildiğinde geçiş analizi, ton ilişkisi ve BPM farkı burada görünür.
        </div>
      )}

      {slot && !prev && (
        <div className="px-4 pb-4">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-widest text-fog-400">Set opener</span>
              <span className="num text-[9px] text-neon-mint">100</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <KeyChip id={slot.track.camelotId} color={keyColor(slot.track.camelot)} />
              <span className="num text-[10px] text-fog-300">
                {Math.round(slot.track.features.tempo)} BPM
              </span>
              <span className="num ml-auto text-[9px] text-fog-400">
                hedef nrg {Math.round(slot.targetEnergy * 100)}
              </span>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-fog-400">
              Açılış şarkısı; enerji eğrisinin başlangıç noktasına en yakın aday olarak seçildi.
            </p>
          </div>
        </div>
      )}

      {slot && prev && transition && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-3">
            <GradeRing grade={transition.grade} score={transition.score} />
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-widest text-fog-400">
                {transition.grade === 'S'
                  ? 'Kusursuz geçiş'
                  : transition.grade === 'A'
                    ? 'Pürüzsüz'
                    : transition.grade === 'B'
                      ? 'Çalışılabilir'
                      : transition.grade === 'C'
                        ? 'Riskli'
                        : 'Geçiş hatası'}
              </p>
              <p className="mt-1 text-[11px] font-medium leading-snug text-fog-100">
                {transition.reason}
              </p>
              <div className="mt-1.5 flex items-center gap-1.5 text-[9px] text-fog-400">
                <KeyChip id={prev.track.camelotId} color={keyColor(prev.track.camelot)} small />
                <span className="opacity-50">→</span>
                <KeyChip id={slot.track.camelotId} color={keyColor(slot.track.camelot)} small />
                <span className="ml-1">{transition.key.label}</span>
                {transition.key.semitoneDelta != null && (
                  <span className="num opacity-60">
                    ({transition.key.semitoneDelta > 0 ? '+' : ''}
                    {transition.key.semitoneDelta} st)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <Meter label="Harmonik" value={transition.key.score} color={keyColor(slot.track.camelot)} />
            <Meter label="Tempo" value={transition.bpm.score} color="#00E5FF" suffix={bpmSuffix(transition)} />
            <Meter label="Enerji" value={transition.energyFit} color="#FF2D9B" />
          </div>

          {gapBridge && (
            <div className="mt-3 rounded-xl border border-neon-pink/25 bg-neon-pink/[0.06] p-2.5">
              <div className="flex items-center gap-1.5">
                <IconLink className="h-3 w-3 text-neon-pink" />
                <span className="text-[8.5px] font-semibold uppercase tracking-widest text-neon-pink">
                  Köprü önerisi
                </span>
              </div>
              <p className="mt-1 truncate text-[10.5px] font-medium text-white">
                {gapBridge.options[0]?.track.title}
              </p>
              <p className="truncate text-[9px] text-fog-400">
                {gapBridge.options[0]?.track.artist} · {gapBridge.options[0]?.track.camelotId} ·{' '}
                {Math.round(gapBridge.options[0]?.track.features.tempo ?? 0)} BPM
              </p>
              <button
                className="btn-ghost mt-2 h-6 w-full text-[9px]"
                onClick={() => {
                  const option = gapBridge.options[0];
                  if (option) insertBridge(index - 1, option.track);
                }}
              >
                <IconPlus className="h-3 w-3" />
                Araya ekle
              </button>
            </div>
          )}

          {!gapBridge && (transition.grade === 'C' || transition.grade === 'D') && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[9.5px] leading-relaxed text-fog-400">
              <IconArrowUpRight className="mt-0.5 h-3 w-3 shrink-0 text-fog-400" />
              Uygun köprü bulunamadı. Katılığı düşürüp yeniden üretmeyi dene veya şarkıyı sürükleyerek sırayı değiştir.
            </div>
          )}

          <button
            onClick={() => selectSlot(index)}
            className="mt-2 flex w-full items-center justify-between rounded-lg px-1 py-1 text-[8.5px] text-fog-400 transition hover:text-fog-200"
          >
            <span>Geçiş skoru ağırlıkları: ton %50 · tempo %32 · enerji %18</span>
            <span className="num">{transition.score}/100</span>
          </button>
        </div>
      )}
    </section>
  );
}

function GradeRing({ grade, score }: { grade: TransitionGrade; score: number }) {
  const color =
    grade === 'S'
      ? '#3DFFB0'
      : grade === 'A'
        ? '#00E5FF'
        : grade === 'B'
          ? '#FFB020'
          : grade === 'C'
            ? '#FF8A3D'
            : '#FF4D5E';
  const dash = (score / 100) * 251.3;

  return (
    <div className="relative h-[74px] w-[74px] shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} 251.3`}
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray .5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-[22px] font-bold leading-none" style={{ color }}>
          {grade}
        </span>
        <span className="num mt-0.5 text-[8px] text-fog-400">{score}</span>
      </div>
    </div>
  );
}

function Meter({
  label,
  value,
  color,
  suffix,
}: {
  label: string;
  value: number;
  color: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-[8.5px] uppercase tracking-wider text-fog-400">{label}</span>
      <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${value}%`, background: color, boxShadow: `0 0 8px ${color}80` }}
        />
      </div>
      <span className="num w-7 text-right text-[9px] text-fog-300">{value}</span>
      {suffix && <span className="num w-[54px] text-right text-[8px] text-fog-400">{suffix}</span>}
    </div>
  );
}

function KeyChip({ id, color, small }: { id: string | null; color: string; small?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded border font-bold',
        small ? 'h-4 min-w-[26px] px-1 text-[8px]' : 'h-6 min-w-[34px] px-1.5 text-[10px]',
      )}
      style={{
        color,
        borderColor: `${color}4D`,
        background: `${color}18`,
      }}
    >
      {id ?? '—'}
    </span>
  );
}

function bpmSuffix(t: NonNullable<PlanResult['slots'][number]['transition']>): string {
  const sign = t.bpm.deltaPercent > 0 ? '+' : '';
  return `${sign}${t.bpm.deltaPercent}%`;
}
