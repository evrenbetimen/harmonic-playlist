import { useEffect, useRef, useState } from 'react';
import { useSetStore } from '@/state/useSetStore';
import { useAuthStore } from '@/state/useAuthStore';
import { usePlaybackBridge } from '@/state/usePlaybackBridge';
import { useUiStore, type ViewId } from '@/state/useUiStore';
import { handleAuthCallback } from '@/services/spotify/auth';
import { cn } from '@/lib/format';
import { TopBar } from '@/components/layout/TopBar';
import { SideRail } from '@/components/layout/SideRail';
import { SetBuilder } from '@/components/builder/SetBuilder';
import { CamelotWheel } from '@/components/wheel/CamelotWheel';
import { EnergyTimeline } from '@/components/timeline/EnergyTimeline';
import { TrackList } from '@/components/playlist/TrackList';
import { NowPlaying } from '@/components/player/NowPlaying';
import { TransitionPanel } from '@/components/player/TransitionPanel';
import { QcPanel } from '@/components/player/QcPanel';
import { TransportBar } from '@/components/player/TransportBar';
import { SpotifyModal } from '@/components/spotify/SpotifyModal';
import { CrateView } from '@/components/views/CrateView';
import { RoutesView } from '@/components/views/RoutesView';
import { AnalyticsView } from '@/components/views/AnalyticsView';
import {
  IconAlert,
  IconChart,
  IconDisc,
  IconGrid,
  IconRoute,
  IconX,
} from '@/components/ui/icons';

const VIEW_TABS: Array<{ id: ViewId; label: string; icon: typeof IconGrid }> = [
  { id: 'builder', label: 'Set Builder', icon: IconGrid },
  { id: 'crate', label: 'Krate', icon: IconDisc },
  { id: 'routes', label: 'Rotalar', icon: IconRoute },
  { id: 'analytics', label: 'Analitik', icon: IconChart },
];

export default function App() {
  usePlaybackBridge();

  const plan = useSetStore((s) => s.plan);
  const selected = useSetStore((s) => s.selectedSlot);
  const status = useSetStore((s) => s.status);
  const error = useSetStore((s) => s.error);
  const selectSlot = useSetStore((s) => s.selectSlot);
  const generate = useSetStore((s) => s.generate);
  const insertBridge = useSetStore((s) => s.insertBridge);
  const reset = useSetStore((s) => s.reset);

  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);

  const [query, setQuery] = useState('');
  const [spotifyOpen, setSpotifyOpen] = useState(false);
  const booted = useRef(false);
  const authBooted = useRef(false);
  const checkAuth = useAuthStore((s) => s.check);

  // First paint: generate a set so the app never opens empty.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    if (!plan && status === 'idle') void generate();
  }, [plan, status, generate]);

  // OAuth callback (?code=…) + hydrate the top bar from the stored token.
  // The ref prevents React StrictMode from exchanging the same code twice.
  useEffect(() => {
    if (authBooted.current) return;
    authBooted.current = true;

    void (async () => {
      try {
        const logged = await handleAuthCallback();
        if (logged) setSpotifyOpen(true);
      } catch {
        setSpotifyOpen(true);
      }
      await checkAuth();
    })();
  }, [checkAuth]);

  // ⌘/Ctrl + Enter → regenerate; 1–4 → switch view.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target != null &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void generate();
        return;
      }
      if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const index = Number(event.key) - 1;
        if (index >= 0 && index < VIEW_TABS.length) setView(VIEW_TABS[index].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [generate, setView]);

  const openBridge = (index: number) => {
    selectSlot(index);
    if (!plan || index <= 0) return;
    const from = plan.slots[index - 1];
    const to = plan.slots[index];
    const bridge = plan.bridges.find(
      (b) => b.fromId === from.track.id && b.toId === to.track.id,
    );
    const option = bridge?.options[0];
    if (option) insertBridge(index - 1, option.track);
  };

  return (
    <div className="app-bg flex h-full w-full flex-col overflow-hidden">
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <TopBar query={query} onQuery={setQuery} onOpenSpotify={() => setSpotifyOpen(true)} />

        <div className="flex min-h-0 flex-1">
          <SideRail onSpotify={() => setSpotifyOpen(true)} />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Compact switcher for widths where the rail is hidden. */}
            <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-3 pt-3 xl:hidden">
              {VIEW_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setView(tab.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10.5px] font-medium transition',
                    view === tab.id
                      ? 'border-neon-mint/35 bg-neon-mint/[0.1] text-neon-mint'
                      : 'border-white/[0.06] text-fog-400 hover:text-fog-100',
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {view === 'builder' && (
              <main className="grid min-h-0 flex-1 grid-cols-[250px_minmax(0,1fr)] gap-3 overflow-hidden p-3 lg:grid-cols-[250px_minmax(0,1fr)_290px] xl:grid-cols-[262px_minmax(0,1fr)_300px] 2xl:grid-cols-[276px_minmax(0,1fr)_318px]">
                <SetBuilder />

                <section className="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(132px,1fr)] gap-3 overflow-hidden">
                  {error && (
                    <div className="flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/[0.08] px-3 py-2 text-[10.5px] text-rose-200">
                      <IconAlert className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                      <span className="flex-1">{error}</span>
                      <button
                        className="rounded p-0.5 hover:bg-white/10"
                        onClick={reset}
                        aria-label="Kapat"
                      >
                        <IconX className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  <CamelotWheel
                    plan={plan}
                    selected={selected}
                    onSelect={(index) => selectSlot(index)}
                  />

                  <EnergyTimeline plan={plan} selected={selected} onSelect={selectSlot} />

                  <TrackList
                    query={query}
                    selected={selected}
                    onSelect={selectSlot}
                    onOpenBridge={openBridge}
                  />
                </section>

                <aside className="scroll-slim hidden min-h-0 flex-col gap-3 overflow-y-auto pb-1 pr-0.5 lg:flex">
                  <NowPlaying />
                  <TransitionPanel plan={plan} selected={selected} />
                  <QcPanel plan={plan} />
                </aside>
              </main>
            )}

            {view === 'crate' && (
              <main className="flex min-h-0 flex-1 gap-3 p-3">
                <CrateView />
              </main>
            )}

            {view === 'routes' && (
              <main className="flex min-h-0 flex-1 gap-3 p-3">
                <RoutesView />
              </main>
            )}

            {view === 'analytics' && (
              <main className="flex min-h-0 flex-1 gap-3 p-3">
                <AnalyticsView />
              </main>
            )}
          </div>
        </div>

        <TransportBar />
      </div>

      <SpotifyModal open={spotifyOpen} onClose={() => setSpotifyOpen(false)} />
    </div>
  );
}
