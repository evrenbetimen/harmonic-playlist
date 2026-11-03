import { create } from 'zustand';
import { getMe, SpotifyError, type SpotifyMe } from '@/services/spotify/client';
import { isLoggedIn, logout as clearToken } from '@/services/spotify/auth';

export type AuthStatus = 'idle' | 'checking' | 'connected' | 'disconnected';

interface AuthState {
  status: AuthStatus;
  profile: SpotifyMe | null;
  error: string | null;
  /** Reads the stored token and hydrates the profile. Safe to call on every boot. */
  check: () => Promise<void>;
  /** Clears the token and the cached profile. */
  disconnect: () => void;
}

/** Turns Spotify's raw HTTP errors into something a DJ can act on. */
export function describeAuthError(error: unknown): string {
  if (error instanceof SpotifyError) {
    if (error.status === 403 && /premium/i.test(error.message)) {
      return 'Spotify, Web API erişimi için uygulama sahibinin hesabında aktif Premium abonelik istiyor. Premium yokken yalnızca demo krate çalışır.';
    }
    if (error.status === 403) {
      return 'Spotify bu isteği reddetti (403). Uygulama Development Mode ise hesabın User Management listesinde olmalı.';
    }
    if (error.status === 429) {
      return 'Spotify hız sınırı (429). Birkaç saniye sonra tekrar dene.';
    }
  }
  return error instanceof Error ? error.message : 'Spotify profili alınamadı.';
}

/**
 * Small reactive wrapper around the token in localStorage.
 *
 * `isLoggedIn()` alone is not enough for the UI: the OAuth callback returns to
 * the same tab without a reload, so the top bar has to learn about the new
 * session through state, not a one-off render.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  profile: null,
  error: null,

  check: async () => {
    if (get().status === 'checking') return;
    if (!isLoggedIn()) {
      set({ status: 'disconnected', profile: null, error: null });
      return;
    }

    set({ status: 'checking', error: null });
    try {
      const profile = await getMe();
      set({ status: 'connected', profile });
    } catch (error) {
      if (error instanceof SpotifyError && error.status === 401) {
        clearToken();
        set({ status: 'disconnected', profile: null, error: null });
        return;
      }
      // Token exists but /me is temporarily unreachable: stay "connected"
      // (the session is still valid) and surface the error where needed.
      set({
        status: 'connected',
        profile: null,
        error: describeAuthError(error),
      });
    }
  },

  disconnect: () => {
    clearToken();
    set({ status: 'disconnected', profile: null, error: null });
  },
}));
