import { useEffect, useState } from 'react';
import { cn } from '@/lib/format';
import {
  isSpotifyConfigured,
  spotifyConfig,
  beginLogin,
  checkRedirectConfig,
  missingPlaylistScopes,
  recommendedRedirectUri,
} from '@/services/spotify/auth';
import {
  listUserPlaylists,
  loadPlaylistCrate,
  loadSpotifyCrate,
  publishPlaylist,
} from '@/services/spotify/library';
import type { SpotifyPlaylist } from '@/services/spotify/client';
import { useSetStore } from '@/state/useSetStore';
import { useAuthStore } from '@/state/useAuthStore';
import { IconCheck, IconDisc, IconSpotify, IconX, IconZap } from '@/components/ui/icons';

interface Props {
  open: boolean;
  onClose: () => void;
}

const GENRES = ['afro-house', 'melodic-house', 'tech-house', 'progressive-house', 'organic-house', 'techno'];

function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SP';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function SpotifyModal({ open, onClose }: Props) {
  const [genre, setGenre] = useState('afro-house');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[] | null>(null);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);

  const loadTracks = useSetStore((s) => s.loadTracks);
  const plan = useSetStore((s) => s.plan);
  const authStatus = useAuthStore((s) => s.status);
  const profile = useAuthStore((s) => s.profile);
  const authError = useAuthStore((s) => s.error);
  const disconnect = useAuthStore((s) => s.disconnect);
  const checkAuth = useAuthStore((s) => s.check);

  useEffect(() => {
    if (open && authStatus === 'idle') void checkAuth();
  }, [open, authStatus, checkAuth]);

  if (!open) return null;

  const configured = isSpotifyConfigured();
  const loggedIn = authStatus === 'connected';
  const redirectCheck = checkRedirectConfig();
  const missingScopes = loggedIn ? missingPlaylistScopes() : [];

  const handleLoad = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const tracks = await loadSpotifyCrate({ genre });
      if (tracks.length < 4) throw new Error('Yeterli şarkı bulunamadı.');
      loadTracks(tracks, 'spotify');
      setInfo(`${tracks.length} şarkı yüklendi. Krate hazır.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bilinmeyen hata');
    } finally {
      setBusy(false);
    }
  };

  const handlePlaylists = async () => {
    setLoadingPlaylists(true);
    setError(null);
    setInfo(null);
    try {
      setPlaylists(await listUserPlaylists());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Playlistler yüklenemedi');
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handleImport = async (playlist: SpotifyPlaylist) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const tracks = await loadPlaylistCrate(playlist.id, 'playlist');
      if (tracks.length === 0) {
        throw new Error(
          'Bu çalma listesindeki şarkılar için ses özellikleri bulunamadı. Yerel dosyalar ve podcast bölümleri içe aktarılamaz.',
        );
      }
      loadTracks(tracks, 'spotify');
      setInfo(`${tracks.length} şarkı "${playlist.name}" listesinden yüklendi.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Çalma listesi yüklenemedi');
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const url = await publishPlaylist('Harmonic Playlist Set', plan);
      setInfo(`Playlist oluşturuldu: ${url}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Playlist oluşturulamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-ink-950/75 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div className="glass-raised relative w-full max-w-[480px] overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1DB954]/15 ring-1 ring-[#1DB954]/30">
              <IconSpotify className="h-4 w-4 text-[#1DB954]" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-white">Spotify Bağlantısı</p>
              <p className="text-[9.5px] text-fog-400">PKCE · tarayıcı tabanlı güvenli oturum</p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Kapat">
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto scroll-slim px-5 py-4">
          {!configured && (
            <>
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                  Client ID gerekli
                </p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-fog-300">
                  Uygulama demo krate ile tam çalışır. Gerçek Spotify verisi için 3 adım:
                </p>
              </div>

              <ol className="space-y-2.5">
                {[
                  ['Developer Dashboard', 'developer.spotify.com/dashboard → Create app.'],
                  [
                    'Redirect URI',
                    <code key="uri" className="rounded bg-black/40 px-1 py-0.5 text-[9px] text-neon-mint">
                      {recommendedRedirectUri()}
                    </code>,
                  ],
                  [
                    '.env dosyası',
                    <code key="env" className="rounded bg-black/40 px-1 py-0.5 text-[9px] text-neon-mint">
                      VITE_SPOTIFY_CLIENT_ID=…
                    </code>,
                  ],
                ].map(([title, body], i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[9px] font-semibold text-fog-300">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-fog-100">{title}</p>
                      <div className="mt-0.5 text-[10px] leading-relaxed text-fog-400">{body}</div>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.07] p-3">
                <p className="text-[9.5px] font-semibold uppercase tracking-wider text-rose-300">
                  localhost kullanma
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-fog-300">
                  Spotify, Nisan 2025'ten beri <code className="text-fog-100">http://localhost</code>{' '}
                  adresini reddediyor. Dashboard'a yukarıdaki{' '}
                  <code className="text-neon-mint">127.0.0.1</code> adresini gir; uygulamayı da{' '}
                  <code className="text-fog-100">http://127.0.0.1:5199</code> üzerinden aç.
                  Aksi halde "This redirect URI is not secure" hatası alırsın.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                <p className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-fog-300">
                  <IconZap className="h-3 w-3 text-neon-pink" />
                  Önemli · Audio Features
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-fog-400">
                  Spotify, 27 Kasım 2024 sonrası oluşturulan uygulamalarda{' '}
                  <code className="text-fog-200">/v1/audio-features</code> ve{' '}
                  <code className="text-fog-200">/v1/recommendations</code> uçlarını kapattı.
                  Harmonic Playlist bu yüzden özellikleri ReccoBeats + yerel DSP ile çözer; krate keşfi
                  arama sorguları ve küratörlü sanatçı tohumlarıyla yapılır.
                </p>
              </div>
            </>
          )}

          {configured && !loggedIn && (
            <div className="space-y-3">
              {!redirectCheck.ok && (
                <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                    Redirect URI uyuşmuyor
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-fog-300">
                    {redirectCheck.message}
                  </p>
                  {redirectCheck.fixUrl && (
                    <a
                      href={redirectCheck.fixUrl}
                      className="mt-2 inline-block text-[10px] font-medium text-neon-mint underline underline-offset-2"
                    >
                      {redirectCheck.fixUrl} adresine geç →
                    </a>
                  )}
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-fog-300">
                Spotify hesabınla giriş yap; Harmonic Playlist krate'ini oluşturmak için yalnızca
                playlist ve kütüphane izinleri ister. Şifren uygulamaya hiçbir zaman girmez.
              </p>
              <div className="rounded-xl border border-white/[0.08] bg-black/25 p-3">
                <p className="text-[9px] font-semibold tracking-wider text-fog-400">
                  Gönderilen redirect_uri
                </p>
                <code className="mt-1 block break-all text-[10px] leading-relaxed text-neon-mint">
                  {spotifyConfig.redirectUri}
                </code>
                <p className="mt-1 text-[9.5px] leading-relaxed text-fog-400">
                  Dashboard'daki değer birebir aynı olmalı. Sonda <code>/</code> olmamalı,
                  protokol <code>http</code> kalmalı ve <code>localhost</code> değil{' '}
                  <code>127.0.0.1</code> yazılmalı.
                </p>
              </div>
              <button
                className="btn-neon w-full disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!redirectCheck.ok}
                onClick={() => {
                  setError(null);
                  beginLogin().catch((e: Error) => setError(e.message));
                }}
              >
                <IconSpotify className="h-4 w-4" />
                Spotify ile Giriş Yap
              </button>
            </div>
          )}

          {configured && loggedIn && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 rounded-xl border border-[#1DB954]/25 bg-[#1DB954]/[0.07] px-3 py-2">
                {profile?.images?.[0]?.url ? (
                  <img
                    src={profile.images[0].url}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/15"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1DB954]/25 text-[10px] font-bold text-[#1DB954]">
                    {initials(profile?.display_name)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[11.5px] font-semibold text-white">
                    {profile?.display_name ?? 'Spotify bağlı'}
                    <IconCheck className="h-3 w-3 shrink-0 text-[#1DB954]" />
                  </p>
                  <p className="truncate text-[9px] text-fog-400">
                    {profile?.email ?? profile?.id ?? 'Bağlantı doğrulanıyor…'}
                    {profile?.product === 'premium' && (
                      <span className="ml-1.5 rounded bg-[#1DB954]/20 px-1 text-[8px] font-semibold uppercase tracking-wide text-[#1DB954]">
                        premium
                      </span>
                    )}
                  </p>
                </div>
                <button
                  className="shrink-0 text-[9px] text-fog-400 underline-offset-2 hover:text-fog-200 hover:underline"
                  onClick={() => {
                    disconnect();
                    setPlaylists(null);
                    setInfo(null);
                    onClose();
                  }}
                >
                  Çıkış
                </button>
              </div>

              {authError && (
                <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3">
                  <p className="text-[9.5px] font-semibold uppercase tracking-wider text-amber-300">
                    Spotify uyarısı
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-fog-300">{authError}</p>
                  <button
                    className="mt-2 text-[10px] font-medium text-neon-mint underline underline-offset-2"
                    onClick={() => void checkAuth()}
                  >
                    Yeniden dene →
                  </button>
                </div>
              )}

              {missingScopes.length > 0 && (
                <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3">
                  <p className="text-[9.5px] font-semibold uppercase tracking-wider text-amber-300">
                    Ek izin gerekli
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-fog-300">
                    Çalma listelerini listelemek için okuma izni gerekiyor. Oturumun eski
                    sürümden kaldığı için bu izin yok — bir kez daha giriş yap.
                  </p>
                  <button
                    className="mt-2 text-[10px] font-medium text-neon-mint underline underline-offset-2"
                    onClick={() => {
                      setError(null);
                      beginLogin().catch((e: Error) => setError(e.message));
                    }}
                  >
                    İzni yenile →
                  </button>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="label-xs">
                    <IconDisc className="mr-1 inline h-3 w-3" />
                    Çalma listelerin
                  </p>
                  <button
                    className="text-[9px] text-fog-400 underline-offset-2 hover:text-neon-mint hover:underline disabled:opacity-50"
                    onClick={() => void handlePlaylists()}
                    disabled={loadingPlaylists || busy || missingScopes.length > 0}
                  >
                    {loadingPlaylists ? 'Yükleniyor…' : playlists ? 'Yenile' : 'Listele'}
                  </button>
                </div>

                {playlists === null && (
                  <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-[10px] leading-relaxed text-fog-400">
                    Çalma listelerini listeleyip içindeki şarkılardan doğrudan krate
                    oluşturabilirsin. Önce "Listele"ye bas.
                  </p>
                )}

                {playlists !== null && playlists.length === 0 && (
                  <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-[10px] text-fog-400">
                    Bu hesapta çalma listesi bulunamadı.
                  </p>
                )}

                {playlists !== null && playlists.length > 0 && (
                  <div className="scroll-slim max-h-[190px] space-y-1 overflow-y-auto pr-0.5">
                    {playlists.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => void handleImport(p)}
                        disabled={busy}
                        className="flex w-full items-center gap-2 rounded-lg border border-white/[0.055] bg-white/[0.025] px-2 py-1.5 text-left transition hover:border-neon-mint/30 hover:bg-neon-mint/[0.06] disabled:opacity-50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-white/[0.05]">
                          {p.images?.[0]?.url ? (
                            <img src={p.images[0].url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <IconDisc className="h-3 w-3 text-fog-400" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[10.5px] font-medium text-fog-100">
                            {p.name}
                          </span>
                          <span className="num block truncate text-[8.5px] text-fog-400">
                            {p.tracks.total} parça
                            {p.owner?.id !== profile?.id ? ` · ${p.owner?.display_name ?? 'başka hesap'}` : ''}
                            {p.public === false ? ' · özel' : ''}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-white/[0.06] pt-3">
                <p className="label-xs mb-2">Janradan keşfet</p>
                <div className="flex flex-wrap gap-1.5">
                  {GENRES.map((g) => (
                    <button
                      key={g}
                      className="chip capitalize"
                      data-active={genre === g}
                      onClick={() => setGenre(g)}
                    >
                      {g.replace('-', ' ')}
                    </button>
                  ))}
                </div>
                <button
                  className="btn-neon mt-2.5 w-full"
                  onClick={handleLoad}
                  disabled={busy}
                >
                  {busy ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-950/30 border-t-ink-950" />
                  ) : (
                    <IconSpotify className="h-4 w-4" />
                  )}
                  Kütüphaneyi Yükle
                </button>
              </div>

              <button
                className="btn-ghost w-full"
                onClick={handlePublish}
                disabled={busy || !plan}
                title={!plan ? 'Önce bir set üret' : 'Spotify’da private playlist oluştur'}
              >
                Seti Spotify Playlist’i Olarak Yayınla
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.08] px-3 py-2 text-[10px] leading-relaxed text-rose-200">
              {error}
            </div>
          )}
          {info && (
            <div
              className={cn(
                'break-all rounded-xl border border-neon-mint/20 bg-neon-mint/[0.06] px-3 py-2 text-[10px] leading-relaxed text-neon-mint/90',
              )}
            >
              {info}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
