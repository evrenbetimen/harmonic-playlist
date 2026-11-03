/**
 * Runtime platform detection.
 *
 * The same web bundle ships three ways:
 *   · `npm run dev` / `npm run preview`  → browser, loopback `127.0.0.1:5199`
 *   · Tauri desktop (`npm run tauri dev|build`) → native window, `tauri://` origin
 *   · static hosting → public HTTPS origin
 *
 * Spotify's redirect rules differ per target, so every OAuth decision funnels
 * through this module instead of reading `window.location` ad hoc.
 */

/** Loopback port the Rust side listens on for the desktop OAuth callback. */
export const DESKTOP_OAUTH_PORT = 8888;

/** Must match `bundle` registration in the Spotify dashboard for desktop builds. */
export const DESKTOP_REDIRECT_URI = `http://127.0.0.1:${DESKTOP_OAUTH_PORT}/auth/callback`;

export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  // Tauri 2 injects `__TAURI_INTERNALS__`; the older key is kept as a fallback.
  return '__TAURI_INTERNALS__' in w || '__TAURI__' in w;
}

/** Origin the app is actually running on, normalised for display/logging. */
export function currentOrigin(): string {
  if (isDesktop()) return 'tauri://localhost';
  return window.location.origin;
}

/**
 * True when the current origin needs the desktop loopback listener rather than
 * a browser redirect back into the page.
 */
export function usesLoopbackListener(): boolean {
  return isDesktop();
}
