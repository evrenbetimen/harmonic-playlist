import { useMemo, useState } from 'react';
import { camelotId, camelotToMusicalName, keyColor, keyColorAlpha } from '@/core/camelot';
import type { CamelotKey, PlanResult } from '@/core/types';
import { cn } from '@/lib/format';

const SIZE = 440;
const CX = SIZE / 2;
const CY = SIZE / 2;

const R = {
  majorOuter: 198,
  majorInner: 168,
  minorOuter: 158,
  minorInner: 128,
  label: 104,
};

const angleFor = (n: number) => ((-90 + n * 30) * Math.PI) / 180;

function polar(r: number, a: number) {
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function annular(rOut: number, rIn: number, a0: number, a1: number) {
  const p1 = polar(rOut, a0);
  const p2 = polar(rOut, a1);
  const p3 = polar(rIn, a1);
  const p4 = polar(rIn, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function arcLeg(r: number, a0: number, a1: number) {
  let d = a1 - a0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) < 0.001) return null;
  const end = a0 + d;
  const p0 = polar(r, a0);
  const p1 = polar(r, end);
  const large = Math.abs(d) > Math.PI ? 1 : 0;
  const sweep = d > 0 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

interface Props {
  plan: PlanResult | null;
  selected: number | null;
  onSelect: (index: number) => void;
}

export function CamelotWheel({ plan, selected, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  const segments = useMemo(() => {
    const out: Array<{
      key: CamelotKey;
      id: string;
      letter: 'A' | 'B';
      n: number;
      path: string;
      lx: number;
      ly: number;
      midR: number;
      angle: number;
    }> = [];

    for (const letter of ['B', 'A'] as const) {
      const outer = letter === 'B';
      const rOut = outer ? R.majorOuter : R.minorOuter;
      const rIn = outer ? R.majorInner : R.minorInner;
      const midR = (rOut + rIn) / 2;
      for (let n = 1; n <= 12; n++) {
        const a = angleFor(n);
        const half = 0.228;
        const p = polar(midR, a);
        out.push({
          key: { number: n, letter },
          id: `${n}${letter}`,
          letter,
          n,
          path: annular(rOut, rIn, a - half, a + half),
          lx: p.x,
          ly: p.y,
          midR,
          angle: a,
        });
      }
    }
    return out;
  }, []);

  const usage = useMemo(() => {
    const map = new Map<string, number[]>();
    plan?.slots.forEach((slot, index) => {
      if (!slot.track.camelotId) return;
      const list = map.get(slot.track.camelotId) ?? [];
      list.push(index);
      map.set(slot.track.camelotId, list);
    });
    return map;
  }, [plan]);

  const selectedSlot = plan && selected != null ? plan.slots[selected] : null;
  const selectedKey = selectedSlot?.track.camelot ?? null;
  const hoveredKey = hovered ? parseKey(hovered) : null;

  const focusKey = hoveredKey ?? selectedKey;
  const neighbours = useMemo(() => {
    if (!focusKey) return null;
    const wrap = (x: number) => ((x - 1 + 12) % 12) + 1;
    const other = focusKey.letter === 'A' ? 'B' : 'A';
    return new Set([
      `${focusKey.number}${focusKey.letter}`,
      `${wrap(focusKey.number + 1)}${focusKey.letter}`,
      `${wrap(focusKey.number - 1)}${focusKey.letter}`,
      `${focusKey.number}${other}`,
      `${wrap(focusKey.number + 2)}${focusKey.letter}`,
      `${wrap(focusKey.number - 2)}${focusKey.letter}`,
    ]);
  }, [focusKey]);

  const route = useMemo(() => {
    if (!plan) return [];
    const legs: Array<{ d: string; color: string; key: string; index: number }> = [];
    for (let i = 1; i < plan.slots.length; i++) {
      const a = plan.slots[i - 1].track.camelot;
      const b = plan.slots[i].track.camelot;
      if (!a || !b) continue;
      const rA = a.letter === 'B' ? (R.majorOuter + R.majorInner) / 2 : (R.minorOuter + R.minorInner) / 2;
      const rB = b.letter === 'B' ? (R.majorOuter + R.majorInner) / 2 : (R.minorOuter + R.minorInner) / 2;
      const aa = angleFor(a.number);
      const ab = angleFor(b.number);
      const d =
        a.letter === b.letter
          ? arcLeg(rA, aa, ab)
          : `M ${polar(rA, aa).x.toFixed(2)} ${polar(rA, aa).y.toFixed(2)} L ${polar(rB, ab).x.toFixed(2)} ${polar(rB, ab).y.toFixed(2)}`;
      if (!d) continue;
      legs.push({ d, color: keyColor(b), key: camelotId(b) ?? '', index: i });
    }
    return legs;
  }, [plan]);

  const selectedPoint =
    selectedSlot?.track.camelot != null
      ? polar(
          selectedSlot.track.camelot.letter === 'B'
            ? (R.majorOuter + R.majorInner) / 2
            : (R.minorOuter + R.minorInner) / 2,
          angleFor(selectedSlot.track.camelot.number),
        )
      : null;

  const routePoints = useMemo(() => {
    if (!plan) return [];
    return plan.slots.flatMap((slot, index) => {
      const key = slot.track.camelot;
      if (!key) return [];
      const p = polar(
        key.letter === 'B'
          ? (R.majorOuter + R.majorInner) / 2
          : (R.minorOuter + R.minorInner) / 2,
        angleFor(key.number),
      );
      return [{ ...p, color: keyColor(key), index }];
    });
  }, [plan]);

  const endpoints = useMemo(() => {
    if (routePoints.length < 2) return null;
    return { start: routePoints[0], end: routePoints[routePoints.length - 1] };
  }, [routePoints]);

  const focusCount = focusKey ? (usage.get(`${focusKey.number}${focusKey.letter}`)?.length ?? 0) : 0;

  return (
    <div className="glass grain relative flex h-[clamp(180px,29vh,330px)] shrink-0 flex-col overflow-hidden rounded-2xl">
      <div className="flex items-start justify-between px-4 pt-3.5">
        <div>
          <p className="label-xs">Harmonic Route</p>
          <h2 className="display mt-1 text-[14px] text-white">Camelot Wheel</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {plan && (
            <>
              <Metric label="Purity" value={`${plan.metrics.harmonicPurity}%`} tone="mint" />
              <Metric label="Avg" value={String(plan.metrics.averageScore)} />
              <Metric label="Keys" value={String(plan.metrics.keySpread)} />
            </>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-1">
        <div className="pointer-events-none absolute left-4 top-1 z-10 flex flex-col gap-1.5 text-[9px] text-fog-400">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-neon-cyan" /> A · minor
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-neon-pink" /> B · major
          </span>
        </div>

        {hoveredKey && (
          <div className="absolute right-4 top-1 z-10 rounded-lg border border-white/10 bg-ink-900/80 px-2.5 py-1.5 text-right backdrop-blur">
            <div className="flex items-center justify-end gap-1.5">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ background: keyColor(hoveredKey) }}
              />
              <span className="num text-[12px] font-semibold text-white">
                {hoveredKey.number}
                {hoveredKey.letter}
              </span>
            </div>
            <div className="text-[9px] text-fog-400">
              {camelotToMusicalName(hoveredKey)} · {focusCount} track
            </div>
          </div>
        )}

        <div className="perspective-1200 flex h-full w-full items-center justify-center">
          <div
            className="relative animate-float"
            style={{ transform: 'rotateX(12deg)', transformStyle: 'preserve-3d' }}
          >
            <div className="absolute left-1/2 top-[104%] h-6 w-[70%] -translate-x-1/2 rounded-[50%] bg-black/60 blur-xl" />
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="h-[min(26vh,300px)] w-auto max-w-full"
              role="img"
              aria-label="Camelot Wheel"
            >
              <defs>
                <radialGradient id="hubGrad" cx="35%" cy="25%">
                  <stop offset="0%" stopColor="#1a1a24" />
                  <stop offset="100%" stopColor="#0b0b10" />
                </radialGradient>
                <filter id="routeGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* outer ticks */}
              <g opacity="0.18">
                {Array.from({ length: 120 }, (_, i) => {
                  const a = (i / 120) * Math.PI * 2;
                  const p1 = polar(i % 5 === 0 ? 207 : 210, a);
                  const p2 = polar(214, a);
                  return (
                    <line
                      key={i}
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke="#fff"
                      strokeWidth={i % 5 === 0 ? 1.2 : 0.6}
                    />
                  );
                })}
              </g>

              {segments.map((seg) => {
                const used = usage.get(seg.id)?.length ?? 0;
                const isFocus = focusKey
                  ? seg.n === focusKey.number && seg.letter === focusKey.letter
                  : false;
                const isNeighbour = neighbours?.has(seg.id) ?? false;
                const dim = focusKey != null && !isNeighbour;
                const color = keyColor(seg.key);

                return (
                  <g
                    key={seg.id}
                    onMouseEnter={() => setHovered(seg.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => {
                      const indices = usage.get(seg.id);
                      if (!indices?.length) return;
                      const current = selected ?? -1;
                      const next = indices.find((i) => i > current) ?? indices[0];
                      onSelect(next);
                    }}
                    style={{ cursor: used ? 'pointer' : 'default', transition: 'opacity .2s' }}
                    opacity={dim ? 0.28 : 1}
                  >
                    <path
                      d={seg.path}
                      fill={keyColorAlpha(seg.key, used > 0 ? 0.34 : 0.1)}
                      stroke={color}
                      strokeWidth={isFocus ? 1.8 : 1}
                      strokeOpacity={used > 0 ? 0.95 : 0.42}
                      style={{
                        filter: used > 0 ? `drop-shadow(0 0 ${isFocus ? 9 : 4}px ${keyColorAlpha(seg.key, 0.55)})` : undefined,
                        transition: 'fill .2s, stroke-width .2s',
                      }}
                    />
                    {used > 0 && (
                      <circle
                        cx={seg.lx}
                        cy={seg.ly + 8}
                        r={1.9}
                        fill="#fff"
                        opacity={0.85}
                      />
                    )}
                    <text
                      x={seg.lx}
                      y={seg.ly + (used > 0 ? -2 : 0)}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="num"
                      fontSize={seg.letter === 'B' ? 10.5 : 10}
                      fontWeight={isFocus ? 700 : 500}
                      fill={isFocus ? '#fff' : color}
                      opacity={0.95}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {seg.n}
                      {seg.letter}
                    </text>
                  </g>
                );
              })}

              {/* route */}
              <g filter="url(#routeGlow)" fill="none" strokeLinecap="round" strokeLinejoin="round">
                {route.map((leg) => {
                  const active =
                    selected != null && (leg.index === selected || leg.index === selected + 1);
                  return (
                    <path
                      key={`${leg.key}-${leg.index}`}
                      d={leg.d}
                      stroke={leg.color}
                      strokeWidth={active ? 3 : 2.2}
                      opacity={active ? 0.95 : 0.62}
                    />
                  );
                })}
                {route.map((leg) => (
                  <path
                    key={`dash-${leg.key}-${leg.index}`}
                    d={leg.d}
                    stroke="#fff"
                    strokeWidth={0.9}
                    strokeDasharray="3 9"
                    opacity={0.55}
                    className="animate-[dash_14s_linear_infinite]"
                    style={{ animation: 'dash 14s linear infinite' }}
                  />
                ))}
              </g>

              {/* one bead per played track, in set order */}
              <g>
                {routePoints.map((point) => {
                  const active = point.index === selected;
                  return (
                    <circle
                      key={`bead-${point.index}`}
                      cx={point.x}
                      cy={point.y}
                      r={active ? 3.4 : 1.7}
                      fill={active ? '#fff' : point.color}
                      stroke="#08080c"
                      strokeWidth={0.9}
                      style={
                        active
                          ? { filter: 'drop-shadow(0 0 7px #fff)' }
                          : undefined
                      }
                    />
                  );
                })}
              </g>

              {endpoints && (
                <g>
                  <circle
                    cx={endpoints.start.x}
                    cy={endpoints.start.y}
                    r={7}
                    fill="none"
                    stroke="#7cf5c8"
                    strokeWidth={1.6}
                    opacity={0.95}
                  />
                  <circle
                    cx={endpoints.start.x}
                    cy={endpoints.start.y}
                    r={2.4}
                    fill="#7cf5c8"
                  />
                  <circle
                    cx={endpoints.end.x}
                    cy={endpoints.end.y}
                    r={7}
                    fill="none"
                    stroke="#fff"
                    strokeWidth={1.4}
                    opacity={0.8}
                  />
                  <circle
                    cx={endpoints.end.x}
                    cy={endpoints.end.y}
                    r={2.4}
                    fill="#fff"
                  />
                </g>
              )}

              {selectedPoint && selectedKey && (
                <g>
                  <circle
                    cx={selectedPoint.x}
                    cy={selectedPoint.y}
                    r={11}
                    fill="none"
                    stroke="#fff"
                    strokeWidth={1.2}
                    opacity={0.5}
                  />
                  <circle
                    cx={selectedPoint.x}
                    cy={selectedPoint.y}
                    r={4.6}
                    fill="#fff"
                    style={{ filter: 'drop-shadow(0 0 8px #fff)' }}
                  />
                </g>
              )}

              {/* hub */}
              <circle cx={CX} cy={CY} r={R.label + 6} fill="url(#hubGrad)" stroke="rgba(255,255,255,0.07)" />
              <circle cx={CX} cy={CY} r={R.label} fill="none" stroke="rgba(255,255,255,0.05)" />

              {selectedSlot?.track.camelot ? (
                <>
                  <text
                    x={CX}
                    y={CY - 6}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="num"
                    fontSize={40}
                    fontWeight={700}
                    fill={keyColor(selectedSlot.track.camelot)}
                    style={{ filter: `drop-shadow(0 0 18px ${keyColorAlpha(selectedSlot.track.camelot, 0.75)})` }}
                  >
                    {selectedSlot.track.camelotId}
                  </text>
                  <text
                    x={CX}
                    y={CY + 26}
                    textAnchor="middle"
                    fontSize={10.5}
                    fill="#a0a0b4"
                    letterSpacing={1.5}
                  >
                    {camelotToMusicalName(selectedSlot.track.camelot).toUpperCase()}
                  </text>
                  <text
                    x={CX}
                    y={CY + 44}
                    textAnchor="middle"
                    className="num"
                    fontSize={8.5}
                    fill="#5c5c70"
                    letterSpacing={1}
                  >
                    TRACK {String((selected ?? 0) + 1).padStart(2, '0')}
                  </text>
                </>
              ) : (
                <>
                  <text x={CX} y={CY - 4} textAnchor="middle" fontSize={13} fill="#7c7c92">
                    Hazır değil
                  </text>
                  <text x={CX} y={CY + 16} textAnchor="middle" fontSize={9} fill="#4f4f62">
                    Set üret → rota
                  </text>
                </>
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'mint' }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-right">
      <div className="text-[8px] uppercase tracking-[0.14em] text-fog-400">{label}</div>
      <div
        className={cn(
          'num text-[11px] font-semibold leading-tight',
          tone === 'mint' ? 'text-neon-mint' : 'text-fog-100',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function parseKey(id: string): CamelotKey | null {
  const m = /^(\d{1,2})([AB])$/.exec(id);
  if (!m) return null;
  return { number: Number(m[1]), letter: m[2] as 'A' | 'B' };
}
