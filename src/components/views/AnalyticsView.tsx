import { useMemo } from 'react';
import { CAMELOT_COLORS, keyColor, keyColorAlpha } from '@/core/camelot';
import { PROFILES } from '@/core/energy';
import type { PlanResult, TransitionGrade } from '@/core/types';
import { cn, formatSetLength } from '@/lib/format';
import { useSetStore } from '@/state/useSetStore';
import {
  IconAlert,
  IconChart,
  IconCheck,
  IconClock,
  IconInfo,
  IconMusic,
  IconWaves,
} from '@/components/ui/icons';

const GRADES: TransitionGrade[] = ['S', 'A', 'B', 'C', 'D'];
const GRADE_STYLE: Record<TransitionGrade, { bar: string; text: string; label: string }> = {
  S: { bar: 'bg-neon-mint', text: 'text-neon-mint', label: 'Kusursuz' },
  A: { bar: 'bg-neon-cyan', text: 'text-neon-cyan', label: 'Akıcı' },
  B: { bar: 'bg-amber-400', text: 'text-amber-300', label: 'Kullanılabilir' },
  C: { bar: 'bg-orange-500', text: 'text-orange-300', label: 'Riskli' },
  D: { bar: 'bg-rose-500', text: 'text-rose-300', label: 'Çakışma' },
};

/**
 * Analitik — turns the QC badge into evidence.
 *
 * Everything here is derived from the active plan (and the crate it came from),
 * so a number on this screen can always be traced back to a transition.
 */
export function AnalyticsView() {
  const plan = useSetStore((s) => s.plan);
  const allTracks = useSetStore((s) => s.allTracks);
  const selectSlot = useSetStore((s) => s.selectSlot);
  const selected = useSetStore((s) => s.selectedSlot);

  const metrics = plan?.metrics;

  const keys = useMemo(() => keyHistogram(plan), [plan]);
  const bpmBuckets = useMemo(() => bpmHistogram(plan), [plan]);
  const artists = useMemo(() => artistCounts(plan), [plan]);
  const energySeries = useMemo(() => energyDeltas(plan), [plan]);
  const sources = useMemo(() => featureSources(plan), [plan]);
  const problemTransitions = useMemo(
    () =>
      (plan?.slots ?? [])
        .map((slot, index) => ({ slot, index }))
        .filter(({ slot }) => slot.transition && !slot.transition.compatible),
    [plan],
  );

  if (!plan || !metrics) {
    return (
      <div className="glass grain flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 rounded-2xl px-6 text-center">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
          <IconChart className="h-6 w-6 text-fog-400" />
          <span className="absolute inset-0 rounded-2xl bg-neon-mint/10 blur-xl" />
        </div>
        <div>
          <p className="text-[13px] font-medium text-fog-200">Analitik için set gerekli</p>
          <p className="mt-1 max-w-[380px] text-[10.5px] leading-relaxed text-fog-400">
            Set Builder'da bir set üret; ton dağılımı, BPM histogramı, geçiş notları ve veri
            kaynakları burada kanıtla birlikte listelenir.
          </p>
        </div>
      </div>
    );
  }

  const profileName =
    PROFILES.find((p) => p.id === plan.options.profile)?.name ?? plan.options.profile;
  const transitionCount = Math.max(1, plan.slots.length - 1);
  const totalGrades = GRADES.reduce((sum, g) => sum + metrics.gradeCounts[g], 0);

  return (
    <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-y-auto pb-1 pr-0.5">
      <section className="glass grain rounded-2xl px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-neon-pink/25 bg-neon-pink/[0.08]">
              <IconChart className="h-4 w-4 text-neon-pink" />
            </span>
            <div>
              <p className="label-xs">Analitik</p>
              <p className="mt-0.5 text-[12.5px] font-medium text-white">
                {plan.slots.length} şarkı · {profileName} · {metrics.bpmMin}–{metrics.bpmMax} BPM
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Pill
              tone={metrics.clashRate === 0 ? 'good' : 'bad'}
              icon={metrics.clashRate === 0 ? 'check' : 'alert'}
              label={metrics.clashRate === 0 ? 'Çakışma yok' : `${metrics.clashRate}% çakışma`}
            />
            <Pill
              tone={metrics.harmonicPurity >= 90 ? 'good' : 'warn'}
              icon="waves"
              label={`Saflık ${metrics.harmonicPurity}%`}
            />
            <Pill
              tone="neutral"
              icon="clock"
              label={formatSetLength(metrics.totalDurationMs)}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Harmonik saflık" value={`${metrics.harmonicPurity}%`} tone={metrics.harmonicPurity >= 90 ? 'good' : 'warn'} />
          <Kpi label="Ortalama geçiş" value={String(metrics.averageScore)} tone={metrics.averageScore >= 80 ? 'good' : 'warn'} />
          <Kpi label="Enerji doğruluğu" value={`${metrics.energyAccuracy}%`} tone={metrics.energyAccuracy >= 85 ? 'good' : 'warn'} />
          <Kpi label="En uzun seri" value={`${metrics.longestCompatibleStreak}`} />
          <Kpi label="BPM drift" value={`${metrics.bpmDrift}`} tone={metrics.bpmDrift <= 4 ? 'good' : 'warn'} />
          <Kpi label="Ton yayılımı" value={`${metrics.keySpread}`} />
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Geçiş notları" icon={<IconCheck className="h-3.5 w-3.5 text-neon-mint" />}>
          <div className="space-y-1.5">
            {GRADES.map((g) => {
              const count = metrics.gradeCounts[g];
              return (
                <div key={g} className="flex items-center gap-2">
                  <span className={cn('num w-3 text-[10px] font-bold', GRADE_STYLE[g].text)}>
                    {g}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className={cn('h-full rounded-full', GRADE_STYLE[g].bar)}
                      style={{ width: `${(count / Math.max(1, totalGrades)) * 100}%` }}
                    />
                  </div>
                  <span className="num w-14 text-right text-[9px] text-fog-400">
                    {count} · {GRADE_STYLE[g].label}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 border-t border-white/[0.05] pt-2 text-[9px] leading-relaxed text-fog-400">
            {transitionCount} geçişin {totalGrades}'ü puanlandı. S/A/B oranı "harmonik saflık"
            metriğini oluşturur.
          </p>
        </Panel>

        <Panel title="Ton dağılımı" icon={<IconMusic className="h-3.5 w-3.5 text-neon-cyan" />}>
          <KeyWheelHistogram keys={keys} onSelect={selectSlot} />
        </Panel>

        <Panel title="BPM histogramı" icon={<IconWaves className="h-3.5 w-3.5 text-neon-mint" />}>
          <div className="flex h-[92px] items-end gap-[3px]">
            {bpmBuckets.map((b) => {
              const max = Math.max(...bpmBuckets.map((x) => x.count), 1);
              return (
                <div key={b.bpm} className="group flex flex-1 flex-col items-center gap-1">
                  <span className="num text-[7.5px] text-fog-400 opacity-0 transition group-hover:opacity-100">
                    {b.count}
                  </span>
                  <div
                    className="w-full rounded-sm bg-gradient-to-t from-neon-mint/25 to-neon-mint/80 transition group-hover:brightness-125"
                    style={{ height: `${Math.max(2, (b.count / max) * 70)}px` }}
                    title={`${b.bpm} BPM · ${b.count} parça`}
                  />
                  <span className="num text-[7.5px] text-fog-400">{b.bpm}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[9px] text-fog-400">
            Set içi tempo dağılımı. Hedef aralık {plan.options.bpmRange[0]}–{plan.options.bpmRange[1]} BPM.
          </p>
        </Panel>

        <Panel title="Enerji sapması" icon={<IconWaves className="h-3.5 w-3.5 text-neon-pink" />}>
          <div className="flex h-[92px] items-center gap-[2px]">
            {energySeries.map((d) => {
              const h = Math.min(40, Math.abs(d.delta) * 220);
              const good = Math.abs(d.delta) <= 0.06;
              return (
                <button
                  key={d.index}
                  onClick={() => selectSlot(d.index)}
                  title={`#${d.index + 1} · hedef ${d.target.toFixed(2)} · gerçek ${d.actual.toFixed(2)} · sapma ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(3)}`}
                  className="group flex flex-1 flex-col items-center justify-center"
                  style={{ height: '100%' }}
                >
                  <div className="flex h-full w-full flex-col justify-center">
                    <div
                      className={cn(
                        'w-full rounded-sm transition group-hover:brightness-125',
                        good ? 'bg-neon-mint/70' : d.delta > 0 ? 'bg-amber-400/80' : 'bg-rose-500/75',
                      )}
                      style={{ height: `${Math.max(2, h)}px` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 flex items-center justify-between text-[9px] text-fog-400">
            <span>Yeşil: ±0.06 içinde · sarı: hedefin üstü · kırmızı: altı</span>
            {selected != null && (
              <span className="num">seçili #{selected + 1}</span>
            )}
          </p>
        </Panel>

        <Panel title="Sanatçı tekrarı" icon={<IconInfo className="h-3.5 w-3.5 text-fog-300" />}>
          {artists.length === 0 ? (
            <p className="text-[10px] text-fog-400">Set boş.</p>
          ) : (
            <div className="space-y-1">
              {artists.slice(0, 6).map((a) => {
                const pct = Math.round((a.count / plan.slots.length) * 100);
                return (
                  <div key={a.artist} className="flex items-center gap-2">
                    <span className="w-[38%] truncate text-[10px] text-fog-200">{a.artist}</span>
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          a.count > plan.options.artistCooldown ? 'bg-amber-400' : 'bg-neon-cyan/70',
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="num w-6 text-right text-[9px] text-fog-400">{a.count}</span>
                  </div>
                );
              })}
              {artists.length > 6 && (
                <p className="pt-1 text-[8.5px] text-fog-400">
                  +{artists.length - 6} sanatçı daha · hedef bekleme{' '}
                  {plan.options.artistCooldown} şarkı
                </p>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Veri kaynakları" icon={<IconInfo className="h-3.5 w-3.5 text-fog-300" />}>
          <div className="space-y-1.5">
            {sources.map((s) => (
              <div key={s.source} className="flex items-center gap-2">
                <span className="w-[74px] shrink-0 text-[10px] text-fog-200">{s.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-neon-cyan/70 to-neon-mint/80"
                    style={{ width: `${(s.count / Math.max(1, plan.slots.length)) * 100}%` }}
                  />
                </div>
                <span className="num w-6 text-right text-[9px] text-fog-400">{s.count}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 border-t border-white/[0.05] pt-2 text-[9px] leading-relaxed text-fog-400">
            Krate havuzu {allTracks.length} parça. Özellikler nereden geldiyse burada görünür;
            "local-dsp" ileride tamamen çevrimdışı çalışacak.
          </p>
        </Panel>
      </div>

      <Panel
        title="Sorunlu geçişler"
        icon={<IconAlert className="h-3.5 w-3.5 text-amber-400" />}
        trailing={
          <span className="num text-[9px] text-fog-400">{problemTransitions.length} uyumsuz</span>
        }
      >
        {problemTransitions.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-neon-mint/15 bg-neon-mint/[0.04] px-2.5 py-2">
            <IconCheck className="h-3.5 w-3.5 text-neon-mint" />
            <span className="text-[10px] text-fog-200">
              Tüm geçişler hem tonal hem tempo olarak uyumlu.
            </span>
          </div>
        ) : (
          <div className="space-y-1">
            {problemTransitions.map(({ slot, index }) => (
              <button
                key={slot.uid}
                onClick={() => selectSlot(index)}
                className="flex w-full items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.05] px-2.5 py-1.5 text-left transition hover:bg-rose-500/[0.1]"
              >
                <span className="num w-6 shrink-0 text-[9px] text-fog-400">
                  #{index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] text-fog-100">
                  {plan.slots[index - 1]?.track.title ?? '—'} → {slot.track.title}
                </span>
                <span className="num shrink-0 text-[9px] text-fog-400">
                  {slot.track.camelotId ?? '?'} · {Math.round(slot.track.features.tempo)}
                </span>
                <span className="num shrink-0 rounded border border-rose-500/30 px-1 text-[8px] text-rose-300">
                  {slot.transition?.grade}
                </span>
              </button>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function KeyWheelHistogram({
  keys,
  onSelect,
}: {
  keys: Array<{ camelotId: string; count: number; indices: number[]; color: string }>;
  onSelect: (index: number) => void;
}) {
  if (keys.length === 0) return <p className="text-[10px] text-fog-400">Anahtar verisi yok.</p>;
  const max = Math.max(...keys.map((k) => k.count), 1);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {keys.map((k) => (
          <button
            key={k.camelotId}
            onClick={() => onSelect(k.indices[0])}
            title={`${k.camelotId} · ${k.count} parça · ilk: #${k.indices[0] + 1}`}
            className="num flex h-6 min-w-[38px] items-center justify-center gap-1 rounded-md border px-1.5 text-[9.5px] font-semibold transition hover:brightness-125"
            style={{
              color: k.color,
              borderColor: k.color + '4D',
              background: k.color + '1A',
            }}
          >
            {k.camelotId}
            <span className="text-[8px] font-normal opacity-70">{k.count}</span>
          </button>
        ))}
      </div>
      <div className="flex items-end gap-[2px]">
        {keys.map((k) => (
          <div key={k.camelotId} className="flex-1">
            <div
              className="w-full rounded-sm"
              style={{
                height: `${Math.max(3, (k.count / max) * 34)}px`,
                background: keyColorAlpha(parseKeyId(k.camelotId), 0.7),
              }}
              title={`${k.camelotId} · ${k.count}`}
            />
          </div>
        ))}
      </div>
      <p className="text-[9px] leading-relaxed text-fog-400">
        {keys.length} farklı Camelot anahtarı. Bir hücreye tıkla → o anahtarın ilk geçtiği
        şarkıyı seç.
      </p>
    </div>
  );
}

function Panel({
  title,
  icon,
  trailing,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="glass grain flex flex-col rounded-2xl px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-fog-300">
          {icon}
          {title}
        </p>
        {trailing}
      </div>
      {children}
    </section>
  );
}

function Kpi({
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
          'num mt-0.5 text-[13px] font-semibold leading-none',
          tone === 'good' ? 'text-neon-mint' : tone === 'warn' ? 'text-amber-300' : 'text-fog-100',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Pill({
  tone,
  icon,
  label,
}: {
  tone: 'good' | 'bad' | 'warn' | 'neutral';
  icon: 'check' | 'alert' | 'waves' | 'clock';
  label: string;
}) {
  const Icon =
    icon === 'check' ? IconCheck : icon === 'alert' ? IconAlert : icon === 'waves' ? IconWaves : IconClock;
  return (
    <span
      className={cn(
        'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[8.5px] font-semibold tracking-wider',
        tone === 'good' && 'border-neon-mint/25 bg-neon-mint/[0.08] text-neon-mint',
        tone === 'bad' && 'border-rose-500/30 bg-rose-500/[0.08] text-rose-300',
        tone === 'warn' && 'border-amber-400/25 bg-amber-400/[0.07] text-amber-300',
        tone === 'neutral' && 'border-white/10 bg-white/[0.03] text-fog-300',
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

/* -------------------------------- deriving -------------------------------- */

function keyHistogram(plan: PlanResult | null) {
  if (!plan) return [];
  const map = new Map<string, { count: number; indices: number[] }>();
  plan.slots.forEach((slot, index) => {
    const id = slot.track.camelotId;
    if (!id) return;
    const entry = map.get(id) ?? { count: 0, indices: [] };
    entry.count += 1;
    entry.indices.push(index);
    map.set(id, entry);
  });
  return [...map.entries()]
    .map(([camelotId, v]) => ({
      camelotId,
      count: v.count,
      indices: v.indices,
      color: keyColor(parseKeyId(camelotId)),
    }))
    .sort((a, b) => sortKey(a.camelotId, b.camelotId));
}

function sortKey(a: string, b: string): number {
  const na = Number(a.slice(0, -1));
  const nb = Number(b.slice(0, -1));
  if (na !== nb) return na - nb;
  return a.slice(-1).localeCompare(b.slice(-1));
}

function parseKeyId(id: string) {
  const number = Number(id.slice(0, -1));
  const letter = id.slice(-1) === 'B' ? 'B' : 'A';
  return { number, letter } as { number: number; letter: 'A' | 'B' };
}

function bpmHistogram(plan: PlanResult | null) {
  if (!plan) return [];
  if (plan.slots.length === 0) return [];
  const values = plan.slots.map((s) => Math.round(s.track.features.tempo));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  // Target ~14 buckets regardless of the spread.
  const step = Math.max(1, Math.round(span / 13));
  const buckets = new Map<number, number>();
  for (const v of values) {
    const bucket = Math.floor((v - min) / step) * step + min;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bpm, count]) => ({ bpm, count }));
}

function artistCounts(plan: PlanResult | null) {
  if (!plan) return [];
  const map = new Map<string, number>();
  for (const slot of plan.slots) {
    const key = slot.track.artist;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => b.count - a.count || a.artist.localeCompare(b.artist));
}

function energyDeltas(plan: PlanResult | null) {
  if (!plan) return [];
  return plan.slots.map((slot, index) => {
    const actual = slot.track.features.energy;
    return {
      index,
      actual,
      target: slot.targetEnergy,
      delta: actual - slot.targetEnergy,
    };
  });
}

const SOURCE_LABEL: Record<string, string> = {
  spotify: 'Spotify',
  reccobeats: 'ReccoBeats',
  'local-dsp': 'Yerel DSP',
  manual: 'Manuel',
  demo: 'Demo',
};

function featureSources(plan: PlanResult | null) {
  if (!plan) return [];
  const map = new Map<string, number>();
  for (const slot of plan.slots) {
    const src = slot.track.features.source;
    map.set(src, (map.get(src) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([source, count]) => ({ source, count, label: SOURCE_LABEL[source] ?? source }))
    .sort((a, b) => b.count - a.count);
}

/** Kept for the unused-export guard: colour table is shared with the wheel. */
export const ANALYTICS_KEY_COLORS = CAMELOT_COLORS;
