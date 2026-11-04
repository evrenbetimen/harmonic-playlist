import { useEffect, useRef } from 'react';
import { cn } from '@/lib/format';
import { isDesktop } from '@/lib/platform';
import { useSetStore } from '@/state/useSetStore';
import { useAuthStore } from '@/state/useAuthStore';
import { IconSearch, IconSettings, IconSpotify, IconKeyboard } from '@/components/ui/icons';

interface Props {
  query: string;
  onQuery: (value: string) => void;
  onOpenSpotify: () => void;
}

export function TopBar({ query, onQuery, onOpenSpotify }: Props) {
  const source = useSetStore((s) => s.source);
  const trackCount = useSetStore((s) => s.allTracks.length);
  const loadDemo = useSetStore((s) => s.loadDemo);
  const authStatus = useAuthStore((s) => s.status);
  const profile = useAuthStore((s) => s.profile);
  const connected = authStatus === 'connected';
  const checking = authStatus === 'checking';
  const desktop = isDesktop();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header
      className={cn(
        'relative z-30 flex h-14 shrink-0 items-center gap-4 border-b border-white/[0.06] bg-ink-950/55 px-4 backdrop-blur-2xl',
        // macOS overlay title bar draws the traffic lights on top of the header.
        desktop && 'pl-[86px]',
      )}
      data-tauri-drag-region={desktop ? '' : undefined}
    >
      <div className="flex items-center gap-3" data-tauri-drag-region={desktop ? '' : undefined}>
        <LogoMark />
        <div className="flex items-baseline gap-2" data-tauri-drag-region={desktop ? '' : undefined}>
          <span
            className="display whitespace-nowrap text-[13px] font-semibold tracking-[0.14em] text-white"
            data-tauri-drag-region={desktop ? '' : undefined}
          >
            HARMONIC <span className="text-neon-mint">PLAYLIST</span>
          </span>
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-fog-400">
            2027
          </span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[440px]">
        <div className="group relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fog-400 transition group-focus-within:text-neon-mint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Şarkı, sanatçı veya ton ara…"
            className="h-9 w-full rounded-xl border border-white/[0.07] bg-white/[0.035] pl-9 pr-16 text-[12.5px] text-fog-100 placeholder:text-fog-400/70 outline-none transition focus:border-neon-mint/40 focus:bg-white/[0.055] focus:ring-2 focus:ring-neon-mint/10"
          />
          <div className="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-fog-400">
            <IconKeyboard className="h-3 w-3" />K
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/*
          The demo crate is a fallback, not a trap: boot prefers the last real
          Spotify crate, so the user needs an explicit way back to the offline
          pool (e.g. to demo the app without a connection).
        */}
        <button
          type="button"
          onClick={() => {
            if (source === 'spotify') {
              loadDemo();
              // A fresh crate needs a plan, otherwise the builder looks broken.
              void useSetStore.getState().generate();
            }
          }}
          disabled={source === 'demo'}
          title={
            source === 'demo'
              ? 'Demo krate etkin — 190 çevrimdışı örnek parça'
              : 'Demo krate’e dön (190 çevrimdışı parça)'
          }
          className={cn(
            'hidden items-center gap-2 rounded-lg border px-2.5 py-1.5 transition lg:flex',
            source === 'demo'
              ? 'border-neon-mint/20 bg-neon-mint/[0.06]'
              : 'border-[#1DB954]/30 bg-[#1DB954]/10 hover:border-neon-mint/35 hover:bg-neon-mint/[0.08]',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              source === 'demo' ? 'bg-neon-mint' : 'bg-[#1DB954]',
            )}
          />
          <span className="text-[10px] font-semibold tracking-wide text-fog-200">
            {source === 'demo' ? 'DEMO CRATE' : 'SPOTIFY'}
          </span>
          <span className="num text-[10px] text-fog-400">{trackCount}</span>
        </button>

        <button className="btn-ghost h-8 shrink-0 whitespace-nowrap" onClick={onOpenSpotify}>
          <IconSpotify className="h-3.5 w-3.5 text-[#1DB954]" />
          <span className="hidden sm:inline">
            {connected ? 'Spotify bağlı' : checking ? 'Spotify…' : 'Spotify Bağla'}
          </span>
          {connected && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#1DB954] shadow-[0_0_6px_#1DB954]" />
          )}
        </button>

        <button className="icon-btn" aria-label="Ayarlar">
          <IconSettings className="h-4 w-4" />
        </button>

        <button
          className={cn(
            'ml-1 flex h-8 shrink-0 items-center gap-2 rounded-full text-[10px] font-bold ring-1 transition',
            connected
              ? 'bg-gradient-to-br from-[#1DB954]/80 to-neon-cyan/60 pl-1 pr-2.5 text-ink-950 ring-[#1DB954]/40'
              : 'w-8 justify-center bg-gradient-to-br from-neon-mint/80 to-neon-cyan/60 text-ink-950 ring-white/20',
          )}
          onClick={onOpenSpotify}
          aria-label={connected ? 'Spotify hesabı' : 'Spotify hesabına bağlan'}
          title={profile?.display_name ?? (connected ? 'Spotify bağlı' : 'Spotify Bağla')}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-950/20">
            {profile?.images?.[0]?.url ? (
              <img
                src={profile.images[0].url}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              initials(profile?.display_name, connected)
            )}
          </span>
          {connected && profile?.display_name && (
            <span className="hidden max-w-[110px] truncate text-[10px] font-semibold tracking-tight text-ink-950 xl:inline">
              {profile.display_name}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

function initials(name: string | null | undefined, connected: boolean): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return connected ? 'SP' : 'DJ';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function LogoMark() {
  return (
    <div className="relative h-8 w-8">
      <svg viewBox="0 0 40 40" className="h-8 w-8">
        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3DFFB0" />
            <stop offset="55%" stopColor="#00E5FF" />
            <stop offset="100%" stopColor="#FF2D9B" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="17.5" fill="none" stroke="url(#logoGrad)" strokeWidth="1.4" opacity="0.75" />
        <circle cx="20" cy="20" r="11" fill="none" stroke="url(#logoGrad)" strokeWidth="1" opacity="0.5" />
        <circle cx="20" cy="20" r="3.2" fill="#3DFFB0" />
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <line
            key={deg}
            x1="20"
            y1="2.8"
            x2="20"
            y2="6.2"
            stroke="url(#logoGrad)"
            strokeWidth="1.4"
            strokeLinecap="round"
            transform={`rotate(${deg} 20 20)`}
            opacity="0.9"
          />
        ))}
      </svg>
      <span className="absolute inset-0 -z-10 rounded-full bg-neon-mint/30 blur-xl" />
    </div>
  );
}
