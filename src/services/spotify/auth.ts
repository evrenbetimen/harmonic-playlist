/**
 * Spotify Authorization Code + PKCE.
 *
 * A desktop app must never ship a client secret, so PKCE is the only correct
 * flow. The verifier lives in sessionStorage (per-tab, short-lived); the token
 * lives in localStorage for the demo — in a packaged Tauri/Electron build this
 * module should be swapped for the OS keychain (tauri-plugin-stronghold /
 * safeStorage) behind the same interface.
 */

import {
  DESKTOP_OAUTH_PORT,
  DESKTOP_REDIRECT_URI,
  isDesktop,
  usesLoopbackListener,
} from '@/lib/platform';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-read',
].join(' ');

const KEYS = {
  verifier: 'harmonic-playlist.pkce.verifier',
  state: 'harmonic-playlist.pkce.state',
  token: 'harmonic-playlist.spotify.token',
};

/**
 * Keys used before the project was renamed to Harmonic Playlist.
 * Read once and migrated so an existing Spotify session keeps working.
 */
const LEGACY_KEYS = {
  verifier: 'harmonify.pkce.verifier',
  state: 'harmonify.pkce.state',
  token: 'harmonify.spotify.token',
} as const;

export interface SpotifyToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  token_type: string;
  scope?: string;
}

export const spotifyConfig = {
  clientId: (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) ?? '',
  redirectUri: isDesktop()
    ? DESKTOP_REDIRECT_URI
    : ((import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined) ??
      `${window.location.origin}/auth/callback`),
  scopes: SCOPES,
};

export function isSpotifyConfigured(): boolean {
  return spotifyConfig.clientId.trim().length > 0;
}

/**
 * Scopes that were added after the first release. An old session keeps working
 * for reading /me, but playlist browsing silently 403s — so the UI asks for a
 * re-login instead of showing an empty list with no explanation.
 */
const PLAYLIST_READ_SCOPES = ['playlist-read-private', 'playlist-read-collaborative'];

export function missingPlaylistScopes(): string[] {
  const token = getToken();
  const granted = new Set((token?.scope ?? '').split(/\s+/).filter(Boolean));
  if (!token) return [];
  return PLAYLIST_READ_SCOPES.filter((scope) => !granted.has(scope));
}

/**
 * The stored scope string is only a hint: Spotify returns the *currently*
 * granted scopes on refresh, and a refresh token minted after the upgrade can
 * already carry them even though the cached `scope` says otherwise. Refresh
 * once and re-read before sending the user through OAuth again.
 */
export async function ensurePlaylistScopes(): Promise<string[]> {
  if (missingPlaylistScopes().length === 0) return [];
  const refreshed = await refreshToken();
  if (!refreshed) return missingPlaylistScopes();
  return missingPlaylistScopes();
}

/** The URI to paste into the Spotify dashboard for the current build/target. */
export function recommendedRedirectUri(): string {
  if (usesLoopbackListener()) return DESKTOP_REDIRECT_URI;
  const { protocol, hostname, port } = window.location;
  if (hostname === 'localhost') {
    // Spotify rejects `localhost`; a loopback literal is the supported form.
    return `http://127.0.0.1:${port || '5199'}/auth/callback`;
  }
  return `${protocol}//${window.location.host}/auth/callback`;
}

/**
 * Spotify's redirect URI rules (enforced since April 2025):
 *   · HTTPS is mandatory, except for loopback IP literals.
 *   · `localhost` is explicitly rejected — use `127.0.0.1` or `[::1]`.
 *
 * PKCE also ties the verifier to the browser origin, so the app must be
 * opened on the same host that is registered in the dashboard. Opening the
 * dev server on `localhost` while the redirect points at `127.0.0.1` would
 * lose the verifier between the two origins.
 */
export interface RedirectCheck {
  ok: boolean;
  message?: string;
  /** Suggested URL the user should open instead (same path, registered origin). */
  fixUrl?: string;
}

export function checkRedirectConfig(): RedirectCheck {
  const uri = spotifyConfig.redirectUri;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return {
      ok: false,
      message: 'VITE_SPOTIFY_REDIRECT_URI geçerli bir URL değil.',
    };
  }

  const loopback =
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]' ||
    url.hostname === '::1';

  if (url.hostname === 'localhost') {
    return {
      ok: false,
      message:
        'Spotify artık "localhost" adresini kabul etmiyor. Redirect URI olarak http://127.0.0.1:5199/auth/callback kullan ve uygulamayı da aynı adresten aç.',
      fixUrl: `http://127.0.0.1:${url.port || '5199'}${url.pathname}${url.search}`,
    };
  }

  if (url.protocol !== 'https:' && !loopback) {
    return {
      ok: false,
      message: `Spotify yalnızca HTTPS veya loopback IP (127.0.0.1 / [::1]) kabul ediyor. "${url.origin}" reddedilir.`,
    };
  }

  if (url.pathname !== '/auth/callback') {
    return {
      ok: false,
      message: `Redirect URI yolu "/auth/callback" olmalı; şu an "${url.pathname}".`,
    };
  }

  // Desktop builds never share an origin with the loopback listener: the OS
  // opens the system browser and Rust hands the code back over IPC.
  if (!usesLoopbackListener() && url.host !== window.location.host) {
    return {
      ok: false,
      message: `Redirect URI (${url.host}) ile uygulamanın açık adresi (${window.location.host}) farklı. PKCE doğrulayıcısı origin'e bağlı olduğu için giriş tamamlanmaz — uygulamayı ${url.origin} üzerinden aç.`,
      fixUrl: `${url.origin}${window.location.pathname}${window.location.search}`,
    };
  }

  return { ok: true };
}


function randomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => possible[b % possible.length]).join('');
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function createChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
}

export async function beginLogin(): Promise<void> {
  if (!isSpotifyConfigured()) {
    throw new Error('VITE_SPOTIFY_CLIENT_ID tanımlı değil.');
  }
  const redirectCheck = checkRedirectConfig();
  if (!redirectCheck.ok) {
    throw new Error(redirectCheck.message);
  }
  const verifier = randomString(96);
  const challenge = await createChallenge(verifier);
  const state = randomString(16);

  sessionStorage.setItem(KEYS.verifier, verifier);
  sessionStorage.setItem(KEYS.state, state);

  const params = new URLSearchParams({
    client_id: spotifyConfig.clientId,
    response_type: 'code',
    redirect_uri: spotifyConfig.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: spotifyConfig.scopes,
    show_dialog: 'true',
  });

  const authorizeUrl = `${AUTH_URL}?${params.toString()}`;

  if (usesLoopbackListener()) {
    await beginDesktopLogin(authorizeUrl, state);
    return;
  }

  window.location.href = authorizeUrl;
}

/**
 * Desktop OAuth: the system browser performs the login and Spotify redirects to
 * the loopback listener in the Rust process. No webview navigation happens, so
 * the PKCE verifier in `sessionStorage` survives.
 */
async function beginDesktopLogin(authorizeUrl: string, state: string): Promise<void> {
  const [{ invoke }, { openUrl }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/plugin-opener'),
  ]);

  // Start listening *before* opening the browser so a fast redirect is not lost.
  const listener = invoke<string>('oauth_callback_listener', { port: DESKTOP_OAUTH_PORT });
  await openUrl(authorizeUrl);

  const query = await listener;
  const result = new URLSearchParams(query);
  const error = result.get('error');

  if (error) {
    sessionStorage.removeItem(KEYS.verifier);
    sessionStorage.removeItem(KEYS.state);
    throw new Error(
      error === 'access_denied'
        ? 'Spotify girişi iptal edildi.'
        : `Spotify yetkilendirmesi reddedildi: ${error}`,
    );
  }

  const code = result.get('code');
  const returnedState = result.get('state') ?? '';
  if (!code) throw new Error('Spotify yanıtında yetkilendirme kodu yok.');
  if (returnedState !== state) throw new Error('OAuth state uyuşmuyor.');

  await completeLogin(code, returnedState);
}

function readSession(which: 'verifier' | 'state'): string | null {
  const value = sessionStorage.getItem(KEYS[which]);
  if (value !== null) return value;
  const legacy = sessionStorage.getItem(LEGACY_KEYS[which]);
  if (legacy === null) return null;
  sessionStorage.setItem(KEYS[which], legacy);
  sessionStorage.removeItem(LEGACY_KEYS[which]);
  return legacy;
}

export async function completeLogin(code: string, state: string): Promise<SpotifyToken> {
  const verifier = readSession('verifier');
  const expectedState = readSession('state');
  sessionStorage.removeItem(KEYS.verifier);
  sessionStorage.removeItem(KEYS.state);

  if (!verifier) throw new Error('PKCE verifier bulunamadı (sayfa yeniden yüklendi mi?).');
  if (expectedState && state !== expectedState) throw new Error('OAuth state uyuşmuyor.');

  const body = new URLSearchParams({
    client_id: spotifyConfig.clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: spotifyConfig.redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token alınamadı (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as Omit<SpotifyToken, 'expires_at'>;
  return persistToken(json);
}

export async function refreshToken(): Promise<SpotifyToken | null> {
  const current = getToken();
  if (!current?.refresh_token) return null;

  const body = new URLSearchParams({
    client_id: spotifyConfig.clientId,
    grant_type: 'refresh_token',
    refresh_token: current.refresh_token,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    logout();
    return null;
  }
  const json = (await res.json()) as Omit<SpotifyToken, 'expires_at'>;
  return persistToken({ ...json, refresh_token: json.refresh_token ?? current.refresh_token });
}

function persistToken(raw: Omit<SpotifyToken, 'expires_at'>): SpotifyToken {
  const expiresIn = (raw as unknown as { expires_in?: number }).expires_in ?? 3600;
  const token: SpotifyToken = {
    ...raw,
    expires_at: Date.now() + expiresIn * 1000 - 30_000,
  };
  localStorage.setItem(KEYS.token, JSON.stringify(token));
  return token;
}

export function getToken(): SpotifyToken | null {
  try {
    const raw = localStorage.getItem(KEYS.token) ?? migrateLegacyToken();
    if (!raw) return null;
    return JSON.parse(raw) as SpotifyToken;
  } catch {
    return null;
  }
}

function migrateLegacyToken(): string | null {
  const legacy = localStorage.getItem(LEGACY_KEYS.token);
  if (legacy === null) return null;
  localStorage.setItem(KEYS.token, legacy);
  localStorage.removeItem(LEGACY_KEYS.token);
  return legacy;
}

export function isLoggedIn(): boolean {
  return getToken() != null;
}

export function logout(): void {
  localStorage.removeItem(KEYS.token);
  localStorage.removeItem(LEGACY_KEYS.token);
}

/** Handles /auth/callback on boot. Returns true when a login just completed. */
export async function handleAuthCallback(): Promise<boolean> {
  if (window.location.pathname !== '/auth/callback') return false;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (error) {
    history.replaceState({}, '', '/');
    throw new Error(`Spotify yetkilendirmesi reddedildi: ${error}`);
  }
  if (!code || !state) {
    history.replaceState({}, '', '/');
    return false;
  }

  await completeLogin(code, state);
  history.replaceState({}, '', '/');
  return true;
}
