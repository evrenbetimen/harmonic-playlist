import { cn } from '@/lib/format';
import { useUiStore, type ViewId } from '@/state/useUiStore';
import {
  IconChart,
  IconDisc,
  IconGrid,
  IconRoute,
  IconSettings,
  IconSparkles,
} from '@/components/ui/icons';

const NAV: Array<{ id: ViewId; label: string; icon: typeof IconGrid; hint: string }> = [
  { id: 'builder', label: 'Set Builder', icon: IconGrid, hint: 'Set üret ve düzenle' },
  { id: 'crate', label: 'Krate', icon: IconDisc, hint: 'Kaynak parça havuzu' },
  { id: 'routes', label: 'Harmonik Rotalar', icon: IconRoute, hint: 'Alternatif setleri karşılaştır' },
  { id: 'analytics', label: 'Analitik', icon: IconChart, hint: 'Metrikler ve kanıtlar' },
];

export function SideRail({ onSpotify }: { onSpotify?: () => void }) {
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);

  return (
    <nav className="relative z-20 hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-white/[0.05] py-4 xl:flex">
      {NAV.map((item) => (
        <RailButton
          key={item.id}
          label={item.label}
          hint={item.hint}
          active={view === item.id}
          onClick={() => setView(item.id)}
        >
          <item.icon className="h-[18px] w-[18px]" />
        </RailButton>
      ))}

      <div className="my-3 h-px w-7 bg-white/[0.07]" />

      <RailButton label="AI Köprü" hint="Spotify bağlantısı" accent onClick={onSpotify}>
        <IconSparkles className="h-[18px] w-[18px]" />
      </RailButton>

      <div className="mt-auto flex flex-col items-center gap-1">
        <RailButton label="Ayarlar" hint="Yakında" disabled>
          <IconSettings className="h-[18px] w-[18px]" />
        </RailButton>
        <div className="mt-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[9px] font-semibold text-fog-300">
          v1.0
        </div>
      </div>
    </nav>
  );
}

function RailButton({
  children,
  label,
  hint,
  active,
  accent,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  hint?: string;
  active?: boolean;
  accent?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      title={hint ? `${label} — ${hint}` : label}
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={cn(
        'group relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-200',
        active
          ? 'border-white/10 bg-white/[0.07] text-neon-mint shadow-[0_0_20px_-6px_rgba(61,255,176,0.7)]'
          : accent
            ? 'border-neon-pink/20 bg-neon-pink/[0.07] text-neon-pink hover:bg-neon-pink/[0.12]'
            : disabled
              ? 'cursor-not-allowed border-transparent text-fog-400/40'
              : 'border-transparent text-fog-400 hover:border-white/10 hover:bg-white/[0.05] hover:text-white',
      )}
    >
      {children}
      {active && (
        <span className="absolute -left-[13px] top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-neon-mint shadow-[0_0_10px_#3DFFB0]" />
      )}
      <span className="pointer-events-none absolute left-12 z-50 whitespace-nowrap rounded-md border border-white/10 bg-ink-800 px-2 py-1 text-[10px] font-medium text-fog-200 opacity-0 shadow-xl transition group-hover:opacity-100">
        {label}
        {hint && <span className="ml-1.5 text-[9px] text-fog-400">{hint}</span>}
      </span>
    </button>
  );
}
