import { readCache, writeCache } from '@/services/cache';

/**
 * Preview resolution.
 *
 * Spotify removed `preview_url` from the Web API for third-party apps in
 * November 2024: every track in `/playlists/{id}/items` comes back with
 * `preview_url: null`. The preview engine therefore always fell through to its
 * procedural synth, which is why real playlist tracks still "played" as a demo
 * pad.
 *
 * Deezer's public API still serves 30s previews and — crucially — is queryable
 * by **ISRC**, which Spotify still returns in `external_ids`. ISRC is a global
 * recording identifier, so `GET /track/isrc:{isrc}` resolves the exact same
 * recording rather than a fuzzy title/artist search.
 *
 * But `api.deezer.com` sends **no CORS header**, so this path cannot work in a
 * browser at all: every `fetch` fails with `TypeError: Failed to fetch` (the
 * old code swallowed that and fell through to the synth, which is the bug this
 * file exists to fix). The exact-ISRC lookup is therefore kept as a
 * best-effort path for desktop proxies only, and the real work is done by the
 * Apple iTunes Search API below, which is CORS-enabled end to end.
 *
 * Lookups are cached for a week because a ISRC→URL mapping does not change;
 * the CDN URL itself carries a signed expiry, so a resolved track is
 * re-checked when playback actually fails (see `markPreviewStale`).
 */

const DEEZER_BASE = 'https://api.deezer.com';
const ITUNES_BASE = 'https://itunes.apple.com';
const PREVIEW_TTL = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL = 24 * 60 * 60 * 1000;
/** A search that found nothing is cheap to retry; do not hide it for a day. */
const ITUNES_NEGATIVE_TTL = 6 * 60 * 60 * 1000;
const ITUNES_TIMEOUT_MS = 7000;

/**
 * Deezer's JSON API sends **no** `Access-Control-Allow-Origin`, so a browser
 * `fetch` always fails with a CORS error. It is therefore **off by default**:
 * the first play would otherwise log two red console errors and wait for a
 * doomed request before iTunes runs.
 *
 * Desktop builds that proxy requests through Rust (bypassing CORS) can call
 * `setDeezerAvailable(true)` at boot to re-enable the exact-ISRC path.
 */
let deezerAvailable = false;

export function setDeezerAvailable(available: boolean): void {
  deezerAvailable = available;
}

export function isDeezerAvailable(): boolean {
  return deezerAvailable;
}

/**
 * Storefront used for the iTunes search. Configurable because Apple's catalogue
 * differs per country: a track released only in Germany is missing from `TR`.
 */
export const ITUNES_COUNTRY =
  (import.meta.env.VITE_ITUNES_COUNTRY as string | undefined)?.trim().toUpperCase() || 'TR';

export interface ResolvedPreview {
  url: string;
  /** Provider that produced the URL. */
  source?: 'deezer' | 'itunes';
  /** Deezer's own track id, useful for debugging a mismatch. */
  deezerId?: number;
  /** Apple's `trackId`, useful for debugging a mismatch. */
  itunesId?: number;
  title: string;
  artist: string;
  /** Seconds; both providers serve 30s previews. */
  duration: number;
}

interface DeezerTrack {
  id?: number;
  title?: string;
  preview?: string;
  duration?: number;
  readable?: boolean;
  artist?: { name?: string };
  isrc?: string;
  error?: { type?: string; message?: string; code?: number };
}

function isDeezerError(json: DeezerTrack): boolean {
  return Boolean(json.error);
}

/**
 * Looks up a 30s preview by ISRC.
 *
 * Returns `null` when Deezer does not know the ISRC (common for promos,
 * unreleased edits and DJ-only whites) — the caller must treat that as "no
 * preview", not as a failure worth showing to the user.
 */
export async function resolvePreviewByIsrc(isrc: string): Promise<ResolvedPreview | null> {
  // See `deezerAvailable`: in a browser this can only fail, so do not even try.
  if (!deezerAvailable) return null;

  const key = `preview:isrc:${isrc}`;
  const cached = readCache<ResolvedPreview | null>(key);
  if (cached !== null) return cached;

  try {
    const res = await fetch(`${DEEZER_BASE}/track/isrc:${encodeURIComponent(isrc)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      // A 5xx is transient; do not poison the cache with a permanent "missing".
      if (res.status >= 500) return null;
      writeCache(key, null, NEGATIVE_TTL);
      return null;
    }

    const json = (await res.json()) as DeezerTrack;
    if (isDeezerError(json) || !json.preview || json.readable === false) {
      writeCache(key, null, NEGATIVE_TTL);
      return null;
    }

    const resolved: ResolvedPreview = {
      url: json.preview,
      deezerId: json.id ?? 0,
      title: json.title ?? '',
      artist: json.artist?.name ?? '',
      duration: json.duration ?? 30,
    };
    writeCache(key, resolved, PREVIEW_TTL);
    return resolved;
  } catch {
    // No CORS header from api.deezer.com → this can never work in a browser.
    // Disable the provider so later plays go straight to iTunes instead of
    // logging a CORS error per track.
    deezerAvailable = false;
    return null;
  }
}

/**
 * Title/artist fallback for tracks whose ISRC is missing.
 *
 * Deliberately conservative: the first result is only accepted when the artist
 * name matches loosely, because a wrong preview is worse than the synth pad —
 * it makes the whole app feel untrustworthy. `confidence` is exposed so the UI
 * can label an approximate match differently.
 */
export async function resolvePreviewBySearch(
  title: string,
  artist: string,
): Promise<ResolvedPreview | null> {
  const key = `preview:q:${title.toLowerCase()}|${artist.toLowerCase()}`;
  const cached = readCache<ResolvedPreview | null>(key);
  if (cached !== null) return cached;
  if (!deezerAvailable) return null;

  try {
    const query = encodeURIComponent(`${title} ${artist}`.trim());
    const res = await fetch(`${DEEZER_BASE}/search?q=${query}&limit=5`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: DeezerTrack[] };
    const candidate = (json.data ?? []).find(
      (t) => t.preview && t.readable !== false && artistMatches(artist, t.artist?.name),
    );
    if (!candidate?.preview) {
      writeCache(key, null, NEGATIVE_TTL);
      return null;
    }
    const resolved: ResolvedPreview = {
      url: candidate.preview,
      deezerId: candidate.id ?? 0,
      title: candidate.title ?? '',
      artist: candidate.artist?.name ?? '',
      duration: candidate.duration ?? 30,
    };
    writeCache(key, resolved, PREVIEW_TTL);
    return resolved;
  } catch {
    deezerAvailable = false;
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Apple iTunes Search API
 *
 * Deezer's JSON API sends no `Access-Control-Allow-Origin`, so every
 * browser `fetch` fails with `TypeError: Failed to fetch` and the engine
 * silently fell back to the synth. iTunes accepts cross-origin requests
 * (`access-control-allow-origin: *`) and its preview CDN
 * (`audio-ssl.itunes.apple.com`) is CORS-enabled too, returning a 30s
 * `audio/x-m4p` file that `decodeAudioData` handles natively.
 *
 * Apple does **not** expose ISRC: `lookup?isrc=` returns `resultCount: 0`
 * for mainstream ISRCs, and search results carry no `isrc` key at all.
 * Matching therefore has to be title + artist — so it is deliberately
 * strict. A wrong preview is worse than the synth pad.
 * ------------------------------------------------------------------ */

interface ItunesTrack {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  kind?: string;
}

export interface ItunesMatch {
  url: string;
  itunesId: number;
  title: string;
  artist: string;
  duration: number;
}

const TR_MAP: Record<string, string> = {
  İ: 'i', I: 'i', ı: 'i',
  Ş: 's', ş: 's',
  Ğ: 'g', ğ: 'g',
  Ü: 'u', ü: 'u',
  Ö: 'o', ö: 'o',
  Ç: 'c', ç: 'c',
};

/** Accent-, case- and punctuation-insensitive comparison key. */
function fold(input: string): string {
  return input
    .replace(/[İIıŞşĞğÜüÖöÇç]/g, (c) => TR_MAP[c] ?? c)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Removes the parts of a title that do not identify the recording:
 * `(feat. X)`, `[Remix]`, ` - Radio Edit`, and a leading/trailing `feat. X`.
 */
function coreTitle(title: string): string {
  return fold(
    title
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\s[-–—]\s.*$/, ' ')
      .replace(/\bfeat\.?\b.*$/i, ' ')
      .replace(/\bft\.?\b.*$/i, ' '),
  );
}

/** Markers that mean the candidate is a *different recording*, not a variant. */
const ALT_VERSION = /\b(remix|remixed|edit|vip|bootleg|mashup|flip|rework|dub|instrumental|acapella|sped up|slowed)\b/i;

function primaryArtist(artist: string): string {
  return fold(artist.split(/\s*(?:&|,|\bfeat\.?\b|\bft\.?\b|\bx\b|\bwith\b|\bvs\.?\b)\s*/i)[0] ?? artist);
}

/**
 * Strict, symmetric artist check.
 *
 * `wanted` may be a list (Spotify track artists); matching any one of them is
 * enough. "Marten Lou & CamelPhat" ≈ "Marten Lou" because both primaries are
 * the same, but "Taylor Swift" never matches "Innellea".
 */
function itunesArtistMatches(wanted: string[], found: string | undefined): boolean {
  if (!found) return false;
  const foundPrimary = primaryArtist(found);
  if (!foundPrimary) return false;
  return wanted.some((w) => {
    const wantedPrimary = primaryArtist(w);
    return Boolean(wantedPrimary) && wantedPrimary === foundPrimary;
  });
}

/** True when the candidate is the same recording by title + artist. */
export function isTrustedItunesMatch(
  wanted: { title: string; artists: string[] },
  candidate: ItunesTrack,
): boolean {
  if (!candidate.previewUrl || candidate.kind !== 'song') return false;
  if (!itunesArtistMatches(wanted.artists, candidate.artistName)) return false;

  const wantedTitle = coreTitle(wanted.title);
  const foundTitle = coreTitle(candidate.trackName ?? '');
  if (!wantedTitle || wantedTitle !== foundTitle) return false;

  // Same title and artist, but Apple answered with a remix/edit while the
  // Spotify track is the original: that is a different recording.
  const wantedAlt = ALT_VERSION.test(wanted.title);
  const foundAlt = ALT_VERSION.test(candidate.trackName ?? '');
  if (foundAlt && !wantedAlt) return false;

  return true;
}

/**
 * Picks the best trusted candidate from an iTunes result set.
 *
 * Sorted by how close the title is to the raw Spotify title (so the original
 * wins over a remix that happens to share the core title), then by duration
 * proximity. Exported for tests.
 */
export function pickItunesMatch(
  wanted: { title: string; artists: string[]; durationMs?: number },
  results: ItunesTrack[],
): ItunesTrack | null {
  const trusted = results.filter((r) => isTrustedItunesMatch(wanted, r));
  if (trusted.length === 0) return null;

  const rawTitle = fold(wanted.title);
  const score = (r: ItunesTrack): number => {
    let s = fold(r.trackName ?? '') === rawTitle ? 10 : 0;
    if (wanted.durationMs && r.trackTimeMillis) {
      const delta = Math.abs(wanted.durationMs - r.trackTimeMillis);
      s -= Math.min(delta / 1000, 90) / 10;
    }
    return s;
  };

  return trusted.sort((a, b) => score(b) - score(a))[0] ?? null;
}

async function fetchItunes(url: string): Promise<ItunesTrack[]> {
  // One retry: Apple throttles bursts and a single 429/5xx should not turn a
  // playable track into a synth pad.
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ITUNES_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
        return [];
      }
      if (!res.ok) return [];
      const json = (await res.json()) as { results?: ItunesTrack[] };
      return json.results ?? [];
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
  return [];
}

/** In-flight lookups, so double-clicking a track searches iTunes only once. */
const inFlight = new Map<string, Promise<ItunesMatch | null>>();

/**
 * Resolves a 30s preview from the iTunes Search API.
 *
 * `country` is configurable (`VITE_ITUNES_COUNTRY`, default `TR`) because
 * storefront catalogues differ. Returns `null` when nothing passes the
 * title+artist check — never a best-effort guess.
 */
export async function resolvePreviewByItunes(
  title: string,
  artist: string,
  options: { artists?: string[]; durationMs?: number; country?: string } = {},
): Promise<ItunesMatch | null> {
  const artists = options.artists?.length ? options.artists : [artist];
  const country = (options.country ?? ITUNES_COUNTRY).toUpperCase();
  const cacheKey = `preview:itunes:${country}:${fold(title)}|${fold(artists[0] ?? '')}`;

  // `null` from readCache means "no entry"; a cached miss is wrapped so a
  // known-missing track is not re-queried on every play.
  const cached = readCache<{ match: ItunesMatch | null }>(cacheKey);
  if (cached !== null) return cached.match;

  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const task = (async (): Promise<ItunesMatch | null> => {
    const term = encodeURIComponent(`${title} ${artists[0] ?? artist}`.trim());
    const results = await fetchItunes(
      `${ITUNES_BASE}/search?term=${term}&entity=song&limit=5&country=${country}`,
    );

    const match = pickItunesMatch({ title, artists, durationMs: options.durationMs }, results);
    if (!match) {
      writeCache(cacheKey, { match: null }, ITUNES_NEGATIVE_TTL);
      return null;
    }

    const resolved: ItunesMatch = {
      url: match.previewUrl!,
      itunesId: match.trackId ?? 0,
      title: match.trackName ?? '',
      artist: match.artistName ?? '',
      duration: match.trackTimeMillis ? match.trackTimeMillis / 1000 : 30,
    };
    writeCache(cacheKey, { match: resolved }, PREVIEW_TTL);
    return resolved;
  })();

  inFlight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inFlight.delete(cacheKey);
  }
}

/** Drops a cached iTunes URL that stopped working. */
function markItunesStale(title: string, artist: string): void {
  // Negative TTL = already expired, so the `Date.now() > expires` check in
  // `readCache` drops it even within the same millisecond.
  writeCache(`preview:itunes:${ITUNES_COUNTRY}:${fold(title)}|${fold(artist)}`, { match: null }, -1);
}

/** Loose bidirectional containment: "Marten Lou & CamelPhat" ≈ "Marten Lou". */
function artistMatches(wanted: string, found: string | undefined): boolean {
  if (!found) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const a = norm(wanted).split(/\s+/).filter(Boolean);
  const b = norm(found).split(/\s+/).filter(Boolean);
  if (a.length === 0 || b.length === 0) return false;
  const bJoined = b.join(' ');
  const aJoined = a.join(' ');
  return bJoined.includes(a[0]) || aJoined.includes(b[0]);
}

/** Drops a cached URL that stopped working (signed URLs expire). */
export function markPreviewStale(isrc: string | null, title: string, artist: string): void {
  if (isrc) writeCache(`preview:isrc:${isrc}`, null, NEGATIVE_TTL);
  writeCache(`preview:q:${title.toLowerCase()}|${artist.toLowerCase()}`, null, NEGATIVE_TTL);
  markItunesStale(title, artist);
}

/**
 * Forgets every cached result for one track so the next play re-queries the
 * providers. Backs the UI's "Tekrar dene" action — without it a transient
 * network failure would look permanent until the TTL expired.
 */
export function clearPreviewCache(isrc: string | null, title: string, artist: string): void {
  const keys = [
    isrc ? `preview:isrc:${isrc}` : null,
    `preview:q:${title.toLowerCase()}|${artist.toLowerCase()}`,
    `preview:itunes:${ITUNES_COUNTRY}:${fold(title)}|${fold(artist)}`,
  ].filter((k): k is string => Boolean(k));
  for (const key of keys) writeCache(key, null, -1);
}
