import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Spotify session = the smallest useful contract for the top bar and the
 * playlist picker:
 *   · a token from an older build lacks the playlist-read scopes,
 *   · `missingPlaylistScopes()` must notice and the UI must offer a re-login,
 *   · `getToken()` must survive a corrupt payload instead of throwing.
 *
 * `auth.ts` reads `window.location` and `localStorage` at import time, so the
 * module is imported lazily after the DOM shim is in place.
 */

const TOKEN_KEY = 'harmonic-playlist.spotify.token';

function installStorage() {
  const store = new Map<string, string>();
  const localStorageShim = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal('localStorage', localStorageShim);
  vi.stubGlobal('sessionStorage', {
    ...localStorageShim,
  });
  return store;
}

function token(scope: string) {
  return JSON.stringify({
    access_token: 'test-access',
    token_type: 'Bearer',
    scope,
    expires_at: Date.now() + 3_600_000,
  });
}

const SCOPE_WITH_READ =
  'user-read-private user-read-email user-library-read playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private';
const SCOPE_LEGACY =
  'user-read-private user-read-email user-library-read playlist-modify-public playlist-modify-private';

describe('spotify session scopes', () => {
  beforeEach(() => {
    vi.resetModules();
    installStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports no missing scopes when the token was granted after the upgrade', async () => {
    localStorage.setItem(TOKEN_KEY, token(SCOPE_WITH_READ));
    const { missingPlaylistScopes } = await import('@/services/spotify/auth');
    expect(missingPlaylistScopes()).toEqual([]);
  });

  it('flags a session that predates playlist reading', async () => {
    localStorage.setItem(TOKEN_KEY, token(SCOPE_LEGACY));
    const { missingPlaylistScopes } = await import('@/services/spotify/auth');
    expect(missingPlaylistScopes()).toEqual([
      'playlist-read-private',
      'playlist-read-collaborative',
    ]);
  });

  it('reports nothing when there is no session at all', async () => {
    const { missingPlaylistScopes, isLoggedIn } = await import('@/services/spotify/auth');
    expect(missingPlaylistScopes()).toEqual([]);
    expect(isLoggedIn()).toBe(false);
  });

  it('returns null for a corrupt token instead of crashing the boot', async () => {
    localStorage.setItem(TOKEN_KEY, 'not-json{');
    const { getToken } = await import('@/services/spotify/auth');
    expect(getToken()).toBeNull();
  });

  it('requests both read scopes in the authorize URL', async () => {
    const { spotifyConfig } = await import('@/services/spotify/auth');
    expect(spotifyConfig.scopes).toContain('playlist-read-private');
    expect(spotifyConfig.scopes).toContain('playlist-read-collaborative');
  });
});
