import { useEffect, useRef, useState } from 'react';
import { cn, formatDuration } from '@/lib/format';
import { useSetStore } from '@/state/useSetStore';
import { useAuthStore } from '@/state/useAuthStore';
import { useUiStore } from '@/state/useUiStore';
import { TrackList } from '@/components/playlist/TrackList';
import { ensurePlaylistScopes, isSpotifyConfigured } from '@/services/spotify/auth';
import { listUserPlaylists, loadPlaylistCrate } from '@/services/spotify/library';
import { canReadPlaylistItems, type SpotifyPlaylist } from '@/services/spotify/client';
import {
  IconAlert,
  IconCheck,
  IconDisc,
  IconList,
  IconLock,
  IconMusic,
  IconRefresh,
  IconSearch,
  IconSpotify,
  IconX,
} from '@/components/ui/icons';

type Tab = 'sources' | 'set';

/**
 * Playlist — one place for both halves of the playlist story.
 *
 * The left rail used to jump straight from Set Builder to the crate, so the
 * user's own Spotify library was only reachable from a modal and the set itself
 * was only visible inside the builder. This view pairs them:
 *
 *   · Kaynak listelerim — the Spotify playlists a crate can be imported from
 *   · Aktif set         — the generated set, full height, with the same
 *                         drag-to-reorder tracklist as the builder
 */
export function PlaylistView({ onOpenSpotify }: { onOpenSpotify?: () => void }) {
  const [tab, setTab] = useState<Tab>('sources');

  const profile = useAuthStore((s) => s.profile);
  const authStatus = useAuthStore((s) => s.status);
  const plan = useSetStore((s) => s.plan);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section className="glass grain shrink-0 rounded-2xl px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-neon-pink/25 bg-neon-pink/[0.08]">
              <IconList className="h-4 w-4 text-neon-pink" />
            </span>
            <div>
              <p className="label-xs">Playlist</p>
              <p className="mt-0.5 text-[12.5px] font-medium text-white">
                Kaynak listeler ve aktif set
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
            <TabButton active={tab === 'sources'} onClick={() => setTab('sources')}>
              <IconMusic className="h-3 w-3" />
              Kaynak listelerim
            </TabButton>
            <TabButton active={tab === 'set'} onClick={() => setTab('set')}>
              <IconDisc className="h-3 w-3" />
              Aktif set
              {plan && (
                <span className="num ml-0.5 text-[9px] text-fog-400">{plan.slots.length}</span>
              )}
            </TabButton>
          </div>
        </div>
      </section>

      {tab === 'sources' ? (
        <SourcePlaylists
          onOpenSpotify={onOpenSpotify}
          connected={authStatus === 'connected'}
          myUserId={profile?.id}
        />
      ) : (
        <ActiveSet />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10.5px] font-medium transition',
        active
          ? 'bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
          : 'text-fog-400 hover:text-fog-100',
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ sources */

function SourcePlaylists({
  connected,
  myUserId,
  onOpenSpotify,
}: {
  connected: boolean;
  myUserId?: string | null;
  onOpenSpotify?: () => void;
}) {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [missingScopes, setMissingScopes] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  const loadTracks = useSetStore((s) => s.loadTracks);
  const setView = useUiStore((s) => s.setView);
  const requested = useRef(false);

  const configured = isSpotifyConfigured();

  const load = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const missing = await ensurePlaylistScopes();
      setMissingScopes(missing);
      if (missing.length > 0) return;
      setPlaylists(await listUserPlaylists(200));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Çalma listeleri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  // Opening the tab with a live session should show the library immediately —
  // making the user press "Listele" first was a pointless step.
  useEffect(() => {
    if (!connected || requested.current) return;
    requested.current = true;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const importPlaylist = async (playlist: SpotifyPlaylist) => {
    setBusyId(playlist.id);
    setError(null);
    setInfo(null);
    try {
      const tracks = await loadPlaylistCrate(playlist.id, 'playlist');
      if (tracks.length === 0) {
        throw new Error(
          'Bu listedeki şarkılar için ses özellikleri bulunamadı. Yerel dosyalar ve podcast bölümleri içe aktarılamaz.',
        );
      }
      loadTracks(tracks, 'spotify');
      setInfo(`${tracks.length} şarkı "${playlist.name}" listesinden krate'e yüklendi.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Çalma listesi yüklenemedi');
    } finally {
      setBusyId(null);
    }
  };

  const visible = (playlists ?? []).filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.owner.display_name ?? '').toLowerCase().includes(q)
    );
  });

  if (!configured || !connected) {
    return (
      <section className="glass grain flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-2xl px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#1DB954]/25 bg-[#1DB954]/[0.08]">
          <IconSpotify className="h-6 w-6 text-[#1DB954]" />
        </span>
        <div>
          <p className="text-[13px] font-medium text-fog-100">
            {configured ? 'Spotify hesabı bağlı değil' : 'Spotify Client ID gerekli'}
          </p>
          <p className="mx-auto mt-1 max-w-[440px] text-[10.5px] leading-relaxed text-fog-400">
            Kendi çalma listelerinden krate oluşturmak için Spotify ile giriş yap. Demo
            krate ile uygulamanın tamamı çalışmaya devam eder.
          </p>
        </div>
        {onOpenSpotify && (
          <button className="btn-neon mt-1" onClick={onOpenSpotify}>
            <IconSpotify className="h-4 w-4" />
            Spotify Bağlantısı
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="glass grain flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-baseline gap-2.5">
          <p className="label-xs">Kaynak listelerim</p>
          {playlists && (
            <span className="num text-[10px] text-fog-400">
              {String(playlists.length).padStart(2, '0')} LİSTE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative min-w-[170px]">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fog-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Liste veya sahip ara…"
              className="h-7 w-full rounded-lg border border-white/[0.07] bg-white/[0.035] pl-8 pr-2.5 text-[10.5px] text-fog-100 placeholder:text-fog-400/70 outline-none focus:border-neon-mint/40 focus:ring-2 focus:ring-neon-mint/10"
            />
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] text-fog-300 transition hover:border-white/15 hover:text-white disabled:opacity-50"
          >
            <IconRefresh className={cn('h-3 w-3', loading && 'animate-spin')} />
            {loading ? 'Yükleniyor…' : 'Yenile'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.08] px-2.5 py-1.5 text-[10px] text-rose-200">
          <IconAlert className="h-3 w-3 shrink-0 text-rose-400" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="rounded p-0.5 hover:bg-white/10" aria-label="Kapat">
            <IconX className="h-3 w-3" />
          </button>
        </div>
      )}

      {info && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-lg border border-neon-mint/20 bg-neon-mint/[0.06] px-2.5 py-1.5 text-[10px] text-neon-mint/90">
          <IconCheck className="h-3 w-3 shrink-0" />
          <span className="flex-1">{info}</span>
          <button
            onClick={() => {
              setInfo(null);
              setView('builder');
            }}
            className="shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-medium text-neon-mint underline underline-offset-2 hover:bg-white/10"
          >
            Set Builder'a git →
          </button>
        </div>
      )}

      {missingScopes.length > 0 && (
        <p className="mx-4 mt-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-2.5 py-2 text-[10px] leading-relaxed text-amber-200">
          Çalma listesi okuma izni yok. Spotify Bağlantısı penceresinden bir kez daha giriş
          yaparak izni yenile.
        </p>
      )}

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto py-1">
        {playlists === null && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-[12px] text-fog-200">Liste yüklenmedi</p>
            <p className="text-[10.5px] text-fog-400">Yenile'ye basarak Spotify kitaplığını çek.</p>
          </div>
        )}

        {loading && playlists === null && (
          <p className="px-4 py-6 text-center text-[10.5px] text-fog-400">
            Çalma listeleri getiriliyor…
          </p>
        )}

        {playlists !== null && visible.length === 0 && (
          <p className="px-4 py-6 text-center text-[10.5px] text-fog-400">
            {playlists.length === 0
              ? 'Bu hesapta çalma listesi bulunamadı.'
              : `"${query}" ile eşleşen liste yok.`}
          </p>
        )}

        {visible.map((playlist) => {
          const locked = !canReadPlaylistItems(playlist, myUserId);
          const busy = busyId === playlist.id;
          return (
            <div
              key={playlist.id}
              className={cn(
                'flex items-center gap-3 border-b border-white/[0.035] px-4 py-2',
                locked ? 'opacity-70' : 'hover:bg-white/[0.028]',
              )}
            >
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.05]">
                {playlist.images[0]?.url ? (
                  <img
                    src={playlist.images[0].url}
                    alt=""
                    loading="lazy"
                    className={cn('h-full w-full object-cover', locked && 'grayscale')}
                  />
                ) : (
                  <IconDisc className="h-4 w-4 text-fog-400" />
                )}
                {locked && (
                  <span className="absolute inset-0 flex items-center justify-center bg-ink-950/55">
                    <IconLock className="h-3.5 w-3.5 text-fog-300" />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate text-[11.5px] font-medium',
                    locked ? 'text-fog-300' : 'text-fog-100',
                  )}
                >
                  {playlist.name}
                </p>
                <p className="num truncate text-[9px] text-fog-400">
                  {locked
                    ? 'kilitli · yalnızca sahibi ve ortak çalışanlar okuyabilir'
                    : playlist.trackCount != null
                      ? `${playlist.trackCount} parça`
                      : 'parça sayısı bilinmiyor'}
                  {playlist.owner.id && playlist.owner.id !== myUserId
                    ? ` · ${playlist.owner.display_name ?? 'başka hesap'}`
                    : ''}
                  {!playlist.isPublic ? ' · özel' : ''}
                  {playlist.collaborative ? ' · ortak' : ''}
                </p>
              </div>

              {locked ? (
                <span className="shrink-0 rounded-md border border-white/[0.06] px-2 py-1 text-[9px] text-fog-400">
                  içe aktarılamaz
                </span>
              ) : (
                <button
                  onClick={() => void importPlaylist(playlist)}
                  disabled={busyId !== null}
                  className="shrink-0 rounded-lg border border-neon-mint/30 bg-neon-mint/[0.08] px-2.5 py-1 text-[10px] font-medium text-neon-mint transition hover:bg-neon-mint/[0.14] disabled:opacity-50"
                >
                  {busy ? 'Yükleniyor…' : "Krate'e al"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-white/[0.05] px-4 py-2 text-[9px] leading-relaxed text-fog-400">
        Spotify API yalnızca senin ve ortak çalıştığın listeleri okur. Başkasının listesi
        için Spotify'da açıp kopyala; kopyası senin olduğu için içe aktarılabilir.
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- active */

function ActiveSet() {
  const plan = useSetStore((s) => s.plan);
  const selected = useSetStore((s) => s.selectedSlot);
  const selectSlot = useSetStore((s) => s.selectSlot);
  const insertBridge = useSetStore((s) => s.insertBridge);
  const [query, setQuery] = useState('');

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

  const metrics = plan?.metrics;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section className="glass grain flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <Metric label="parça" value={metrics ? String(metrics.trackCount) : '—'} />
          <Metric
            label="süre"
            value={metrics ? formatDuration(metrics.totalDurationMs) : '—'}
          />
          <Metric
            label="uyum"
            value={metrics ? `${metrics.harmonicPurity}%` : '—'}
          />
          <Metric
            label="ort. puan"
            value={metrics ? String(metrics.averageScore) : '—'}
          />
          <Metric
            label="BPM"
            value={metrics ? `${metrics.bpmMin}–${metrics.bpmMax}` : '—'}
          />
        </div>

        <div className="relative min-w-[170px]">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fog-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sette ara…"
            className="h-7 w-full rounded-lg border border-white/[0.07] bg-white/[0.035] pl-8 pr-2.5 text-[10.5px] text-fog-100 placeholder:text-fog-400/70 outline-none focus:border-neon-mint/40 focus:ring-2 focus:ring-neon-mint/10"
          />
        </div>
      </section>

      <div className="flex min-h-0 flex-1 flex-col">
        <TrackList
          query={query}
          selected={selected}
          onSelect={selectSlot}
          onOpenBridge={openBridge}
        />
      </div>
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
