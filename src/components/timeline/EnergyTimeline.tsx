import { useEffect, useRef } from 'react';
import type { PlanResult } from '@/core/types';
import { keyColor } from '@/core/camelot';
import { cn, formatSetLength } from '@/lib/format';

interface Props {
  plan: PlanResult | null;
  selected: number | null;
  onSelect: (index: number) => void;
}

const H = 132;
const X0 = 22;
const STEP = 46;
const ENERGY_TOP = 14;
const ENERGY_BOTTOM = 82;
const BLOCK_Y = 94;
const BLOCK_H = 17;

export function EnergyTimeline({ plan, selected, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = plan?.slots.length ?? 0;
  const width = Math.max(420, X0 * 2 + Math.max(0, count - 1) * STEP);

  useEffect(() => {
    if (selected == null || !scrollRef.current) return;
    const x = X0 + selected * STEP;
    const el = scrollRef.current;
    const left = el.scrollLeft;
    const right = left + el.clientWidth;
    if (x < left + 40 || x > right - 40) {
      el.scrollTo({ left: x - el.clientWidth / 2, behavior: 'smooth' });
    }
  }, [selected]);

  const xFor = (i: number) => X0 + i * STEP;
  const yForEnergy = (e: number) => ENERGY_BOTTOM - e * (ENERGY_BOTTOM - ENERGY_TOP);

  const bpmBounds = plan
    ? {
        min: Math.min(...plan.slots.map((s) => s.track.features.tempo)),
        max: Math.max(...plan.slots.map((s) => s.track.features.tempo)),
      }
    : { min: 0, max: 1 };
  const bpmSpan = Math.max(1, bpmBounds.max - bpmBounds.min);
  const yForBpm = (bpm: number) =>
    ENERGY_BOTTOM - 6 - ((bpm - bpmBounds.min) / bpmSpan) * (ENERGY_BOTTOM - ENERGY_TOP - 18);

  const energyPath = plan
    ? plan.slots
        .map((s, i) => {
          const x = xFor(i);
          const y = yForEnergy(s.track.features.energy);
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ')
    : '';

  const areaPath = plan
    ? `${energyPath} L ${xFor(count - 1)} ${ENERGY_BOTTOM + 2} L ${xFor(0)} ${ENERGY_BOTTOM + 2} Z`
    : '';

  const targetPath = plan
    ? plan.slots
        .map((s, i) => {
          const x = xFor(i);
          const y = yForEnergy(s.targetEnergy);
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ')
    : '';

  const bpmPath = plan
    ? plan.slots
        .map((s, i) => {
          const x = xFor(i);
          const y = yForBpm(s.track.features.tempo);
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ')
    : '';

  return (
    <div className="glass grain shrink-0 overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <div className="flex items-baseline gap-3">
          <p className="label-xs">Set Timeline</p>
          {plan && (
            <span className="text-[9px] text-fog-400">
              {plan.slots.length} şarkı · {formatSetLength(plan.metrics.totalDurationMs)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[9px] text-fog-400">
          <span className="flex items-center gap-1">
            <span className="h-[2px] w-4 rounded bg-neon-mint" /> Enerji
          </span>
          <span className="flex items-center gap-1">
            <span className="h-[2px] w-4 rounded border-t border-dashed border-neon-cyan/70" /> BPM
          </span>
          <span className="flex items-center gap-1">
            <span className="h-[2px] w-4 rounded border-t border-dashed border-white/35" /> Hedef
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="scroll-slim overflow-x-auto overflow-y-hidden px-1 pb-2"
      >
        {plan && count > 0 ? (
          <svg width={width} height={H} className="block">
            <defs>
              <linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3DFFB0" stopOpacity="0.34" />
                <stop offset="70%" stopColor="#3DFFB0" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#3DFFB0" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="energyStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#00E5FF" />
                <stop offset="55%" stopColor="#3DFFB0" />
                <stop offset="100%" stopColor="#FF2D9B" />
              </linearGradient>
            </defs>

            {Array.from({ length: Math.floor(count / 5) + 1 }, (_, i) => i * 5).map((i) => (
              <g key={i}>
                <line
                  x1={xFor(i)}
                  y1={8}
                  x2={xFor(i)}
                  y2={BLOCK_Y + BLOCK_H + 4}
                  stroke="rgba(255,255,255,0.05)"
                  strokeDasharray="2 4"
                />
                <text x={xFor(i)} y={H - 3} fontSize={7.5} fill="#4f4f62" textAnchor="middle" className="num">
                  {i + 1}
                </text>
              </g>
            ))}

            <path d={areaPath} fill="url(#energyFill)" />
            <path d={targetPath} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeDasharray="3 4" />
            <path d={bpmPath} fill="none" stroke="rgba(0,229,255,0.55)" strokeWidth={1} strokeDasharray="1 3" />
            <path d={energyPath} fill="none" stroke="url(#energyStroke)" strokeWidth={1.9} strokeLinejoin="round" />

            {plan.slots.map((slot, i) => {
              const x = xFor(i);
              const color = keyColor(slot.track.camelot);
              const isSel = selected === i;
              const t = slot.transition;
              return (
                <g key={slot.uid} onClick={() => onSelect(i)} style={{ cursor: 'pointer' }}>
                  <title>
                    {`${i + 1}. ${slot.track.title} — ${slot.track.artist}\n${slot.track.camelotId ?? '?'} · ${slot.track.features.tempo} BPM${t ? `\nGeçiş: ${t.grade} (${t.score})` : ''}`}
                  </title>
                  {isSel && (
                    <rect x={x - 17} y={6} width={34} height={BLOCK_Y + BLOCK_H - 2} rx={7} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.14)" />
                  )}
                  <circle cx={x} cy={yForEnergy(slot.track.features.energy)} r={isSel ? 3.4 : 2.2} fill={color} stroke="#0b0b10" strokeWidth={1} />
                  <rect
                    x={x - 15}
                    y={BLOCK_Y}
                    width={30}
                    height={BLOCK_H}
                    rx={4}
                    fill={color}
                    opacity={isSel ? 1 : 0.72}
                    stroke={isSel ? '#fff' : 'transparent'}
                    strokeWidth={1}
                  />
                  <text
                    x={x}
                    y={BLOCK_Y + 11.5}
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight={600}
                    fill="#07070a"
                    className="num"
                    style={{ pointerEvents: 'none' }}
                  >
                    {slot.track.camelotId ?? '–'}
                  </text>
                  {t && i > 0 && (
                    <circle
                      cx={(xFor(i - 1) + x) / 2}
                      cy={BLOCK_Y + BLOCK_H + 6}
                      r={2.4}
                      fill={t.key.clash ? '#FF4D5E' : t.compatible ? '#3DFFB0' : '#FFB020'}
                      opacity={0.9}
                    />
                  )}
                </g>
              );
            })}

            {selected != null && (
              <line
                x1={xFor(selected)}
                y1={4}
                x2={xFor(selected)}
                y2={BLOCK_Y + BLOCK_H + 10}
                stroke="#fff"
                strokeWidth={0.7}
                opacity={0.35}
              />
            )}
          </svg>
        ) : (
          <div className="flex h-[120px] items-center justify-center gap-3 text-[11px] text-fog-400">
            <div className="flex h-6 items-end gap-[3px] opacity-40">
              {[6, 14, 9, 20, 12, 17, 8].map((h, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-sm bg-neon-mint"
                  style={{ height: h, animationDelay: `${i * 90}ms` }}
                />
              ))}
            </div>
            Set üretildiğinde enerji eğrisi burada görünecek.
          </div>
        )}
      </div>
    </div>
  );
}

/* small helper kept local to avoid a dependency on the timeline internals */
export function timelineAccentClass(grade: string): string {
  return cn(
    grade === 'S' && 'text-neon-mint',
    grade === 'A' && 'text-neon-cyan',
    grade === 'B' && 'text-amber-300',
    grade === 'C' && 'text-orange-400',
    grade === 'D' && 'text-rose-400',
  );
}
