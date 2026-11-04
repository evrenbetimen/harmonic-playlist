import { getToken, refreshToken } from './auth';
import type { FeatureSource, PitchClass, SpotifyMode } from '@/core/types';

const API = 'https://api.spotify.com/v1';

export interface SpotifyImage {
  url: string;
  width: number;
  height: number;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  genres?: string[];
}

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: SpotifyArtist[];
  album: { name: string; images: SpotifyImage[]; release_date?: string };
  preview_url: string | null;
  duration_ms: number;
  popularity: number;
  explicit: boolean;
  /** Spotify still returns this even though it dropped `preview_url`. */
  external_ids?: { isrc?: string | null } | null;
  /** `track` (default) or `episode` when the playlist contains podcasts. */
  type?: 'track' | 'episode';
}

export interface SpotifyAudioFeatures {
  id: string;
  danceability: number;
  energy: number;
  key: number;
  mode: number;
  speechiness: number;
  acousticness: number;
  instrumentalness: number;
  valence: number;
  tempo: number;
  duration_ms: number;
}

export class SpotifyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SpotifyError';
    this.status = status;
  }
}

async function authHeader(): Promise<string> {
  const token = getToken();
  if (!token) throw new SpotifyError(401, 'Spotify oturumu yok. Lütfen yeniden bağlan.');

  if (Date.now() >= token.expires_at) {
    const refreshed = await refreshToken();
    if (!refreshed) throw new SpotifyError(401, 'Token yenilenemedi. Lütfen yeniden giriş yap.');
    return `Bearer ${refreshed.access_token}`;
  }
  return `Bearer ${token.access_token}`;
}

/**
 * Fetch with 401 refresh + 429 Retry-After handling.
 * Spotify's rolling window is 30s; we retry at most 3 times.
 */
async function spotifyFetch<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', await authHeader());
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${API}${path}`, { ...init, headers });

  if (res.status === 401 && attempt === 0) {
    const refreshed = await refreshToken();
    if (refreshed) return spotifyFetch<T>(path, init, attempt + 1);
  }

  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get('Retry-After') ?? 1) * 1000 + 150;
    await new Promise((r) => setTimeout(r, Math.min(wait, 8000)));
    return spotifyFetch<T>(path, init, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new SpotifyError(res.status, `Spotify ${res.status}: ${text.slice(0, 240)}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface SpotifyMe {
  id: string;
  display_name: string | null;
  email?: string;
  country?: string;
  product?: string;
  images?: Array<{ url: string; width?: number; height?: number }>;
}

export async function getMe(): Promise<SpotifyMe> {
  return spotifyFetch('/me');
}

export async function searchTracks(query: string, limit = 20): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({
    q: query,
    type: 'track',
    limit: String(Math.min(50, limit)),
    market: 'TR',
  });
  const data = await spotifyFetch<{ tracks: { items: SpotifyTrack[] } }>(`/search?${params}`);
  return data.tracks.items;
}

export async function getTracks(ids: string[]): Promise<SpotifyTrack[]> {
  const out: SpotifyTrack[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await spotifyFetch<{ tracks: SpotifyTrack[] }>(
      `/tracks?ids=${chunk.join(',')}`,
    );
    out.push(...data.tracks.filter(Boolean));
  }
  return out;
}

/**
 * ⚠️ Spotify restricted /v1/audio-features for apps created after
 * 2024-11-27. This function is kept for legacy apps and returns null when the
 * endpoint is blocked; the FeatureProvider falls back to ReccoBeats or local
 * DSP analysis. See docs/ARCHITECTURE.md ("Audio features are the risk").
 */
export async function getAudioFeatures(
  ids: string[],
): Promise<SpotifyAudioFeatures[] | null> {
  try {
    const out: SpotifyAudioFeatures[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const data = await spotifyFetch<{ audio_features: Array<SpotifyAudioFeatures | null> }>(
        `/audio-features?ids=${chunk.join(',')}`,
      );
      out.push(...data.audio_features.filter(Boolean) as SpotifyAudioFeatures[]);
    }
    return out;
  } catch (error) {
    if (error instanceof SpotifyError && (error.status === 403 || error.status === 404)) {
      return null;
    }
    throw error;
  }
}

/**
 * A playlist as the UI needs it — every field the picker renders is guaranteed
 * to exist. Spotify omits or nulls several of them (notably `tracks` for some
 * podcast / owned-by-someone-else entries), and an unguarded `p.tracks.total`
 * used to crash the whole app inside the error boundary.
 */
export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  images: SpotifyImage[];
  owner: { id: string; display_name: string | null };
  /**
   * `null` when the API omits the count. Spotify stopped returning the nested
   * `tracks` object from `/me/playlists` in 2024, so this is usually unknown
   * until the playlist is actually opened — showing `0` would be a lie.
   */
  trackCount: number | null;
  isPublic: boolean;
  collaborative: boolean;
  externalUrl: string | null;
}

/** Raw shape from `/me/playlists`; everything except `id` is optional. */
interface RawPlaylist {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  images?: Array<SpotifyImage | null> | null;
  owner?: { id?: string | null; display_name?: string | null } | null;
  /** Pre-2024 name for the track collection. */
  tracks?: { total?: number | null } | null;
  /** Current name; `/me/playlists` returns `items.total`, not `tracks.total`. */
  items?: { total?: number | null } | null;
  public?: boolean | null;
  collaborative?: boolean | null;
  external_urls?: { spotify?: string | null } | null;
}

function normalisePlaylist(raw: RawPlaylist | null | undefined): SpotifyPlaylist | null {
  // A playlist without an id cannot be opened or imported.
  if (!raw?.id) return null;
  const total = raw.items?.total ?? raw.tracks?.total;
  return {
    id: raw.id,
    name: raw.name?.trim() || 'İsimsiz liste',
    description: raw.description ?? null,
    images: (raw.images ?? []).filter((img): img is SpotifyImage => Boolean(img?.url)),
    owner: {
      id: raw.owner?.id ?? '',
      display_name: raw.owner?.display_name ?? null,
    },
    trackCount: typeof total === 'number' ? total : null,
    isPublic: raw.public !== false,
    collaborative: Boolean(raw.collaborative),
    externalUrl: raw.external_urls?.spotify ?? null,
  };
}

/**
 * Whether this app can read a playlist's items.
 *
 * Spotify's `Get Playlist Items` doc is explicit: the endpoint "is only
 * accessible for playlists owned by the current user or playlists the user is a
 * collaborator of", and returns 403 otherwise. Verified against a real library:
 * 40/40 own playlists opened, 10/10 playlists owned by others returned 403.
 *
 * Following the playlist does not help, and neither does Premium — so the UI
 * labels these entries instead of letting the user click into a dead end.
 */
export function canReadPlaylistItems(
  playlist: Pick<SpotifyPlaylist, 'owner' | 'collaborative'>,
  myUserId: string | null | undefined,
): boolean {
  if (playlist.collaborative) return true;
  if (!myUserId) return true; // Unknown self → do not pre-emptively lock.
  return playlist.owner.id === myUserId;
}

export async function getUserPlaylists(limit = 50): Promise<SpotifyPlaylist[]> {
  const out: SpotifyPlaylist[] = [];
  let offset = 0;
  // One page is enough for the picker; the modal says so if there are more.
  while (out.length < limit) {
    const params = new URLSearchParams({
      limit: String(Math.min(50, limit - out.length)),
      offset: String(offset),
    });
    const data = await spotifyFetch<{ items: Array<RawPlaylist | null>; next: string | null }>(
      `/me/playlists?${params}`,
    );
    const items = data.items ?? [];
    for (const raw of items) {
      const playlist = normalisePlaylist(raw);
      if (playlist) out.push(playlist);
    }
    // Advance by the raw page size, not the filtered count, or the offset
    // drifts once a broken entry is dropped.
    if (!data.next || items.length === 0) break;
    offset += items.length;
  }
  return out;
}

/** Reads a playlist's tracks. `limit` caps API pages (100 tracks each). */
export async function getPlaylistTracks(
  playlistId: string,
  limit = 300,
): Promise<SpotifyTrack[]> {
  const out: SpotifyTrack[] = [];
  let offset = 0;
  // Spotify renamed `/playlists/{id}/tracks` → `/playlists/{id}/items`; the old
  // path now answers 403 Forbidden. The payload also moved the track from
  // `item.track` to `item.item`, so both keys are read for compatibility with
  // cached/older responses.
  while (out.length < limit) {
    const params = new URLSearchParams({
      limit: '100',
      offset: String(offset),
      additional_types: 'track,episode',
    });
    const data = await spotifyFetch<{
      items?: Array<{
        track?: SpotifyTrack | null;
        item?: SpotifyTrack | null;
        is_local?: boolean;
      } | null> | null;
      next: string | null;
    }>(`/playlists/${playlistId}/items?${params}`);

    const items = data.items ?? [];
    for (const entry of items) {
      if (!entry) continue;
      const track = entry.item ?? entry.track ?? null;
      if (!track) continue;
      // Local files have no Spotify id and cannot be enriched or re-published.
      // Podcast episodes share the shape but are filtered by `type`.
      if (entry.is_local || track.type === 'episode' || !track.id) continue;
      out.push(track);
    }
    if (!data.next || items.length === 0) break;
    offset += items.length;
  }
  return out.slice(0, limit);
}

export async function createPlaylist(
  name: string,
  description: string,
): Promise<{ id: string; external_urls: { spotify: string } }> {
  // `/users/{id}/playlists` now answers 403 for third-party apps; the supported
  // replacement is `POST /me/playlists`.
  return spotifyFetch('/me/playlists', {
    method: 'POST',
    body: JSON.stringify({ name, description, public: false }),
  });
}

export async function addTracksToPlaylist(playlistId: string, uris: string[]): Promise<void> {
  // Same rename as the read path: `/tracks` is now `/items` and answers 403.
  for (let i = 0; i < uris.length; i += 100) {
    await spotifyFetch(`/playlists/${playlistId}/items`, {
      method: 'POST',
      body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    });
  }
}

export interface ReccoAudioFeatures {
  /**
   * ReccoBeats' own UUID, **not** the Spotify id. The Spotify id only appears in
   * `href` (`https://open.spotify.com/track/<id>`), and the old code keyed the
   * result map by this UUID — so every lookup missed and imports came back
   * empty with a misleading "no audio features" error.
   */
  id: string;
  href?: string;
  tempo?: number;
  energy?: number;
  danceability?: number;
  valence?: number;
  acousticness?: number;
  instrumentalness?: number;
  speechiness?: number;
  key?: number;
  mode?: number;
}

/**
 * ReccoBeats exposes Spotify-compatible features for a Spotify track id. Used as
 * the fallback when the legacy Spotify endpoint is unavailable.
 *
 * The response keyed each feature by ReccoBeats' own UUID and puts the Spotify
 * id in `href`, so the id has to be recovered before the map can be matched
 * against playlist tracks.
 */
export async function getReccoFeatures(ids: string[]): Promise<ReccoAudioFeatures[]> {
  const base =
    (import.meta.env.VITE_RECCOBEATS_BASE_URL as string | undefined) ??
    'https://api.reccobeats.com/v1';
  const out: ReccoAudioFeatures[] = [];
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const res = await fetch(`${base}/audio-features?ids=${chunk.join(',')}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new SpotifyError(res.status, `ReccoBeats ${res.status}`);
    const json = (await res.json()) as { content?: ReccoAudioFeatures[] };
    for (const feature of json.content ?? []) {
      const spotifyId = spotifyIdFromTrackHref(feature.href) ?? spotifyIdFallback(feature, chunk);
      // Without a Spotify id the feature cannot be attached to a crate track.
      if (spotifyId) out.push({ ...feature, id: spotifyId });
    }
  }
  return out;
}

/** `https://open.spotify.com/track/<id>` → `<id>`. */
function spotifyIdFromTrackHref(href: string | undefined): string | null {
  if (!href) return null;
  const match = /open\.spotify\.com\/track\/([A-Za-z0-9]+)/.exec(href);
  return match?.[1] ?? null;
}

/**
 * Safety net for responses that already carry a Spotify id in `id` (the shape
 * the API used before it added `href`). Only trusted when it is one of the ids
 * we asked for, so a ReccoBeats UUID is never mistaken for a Spotify id.
 */
function spotifyIdFallback(feature: ReccoAudioFeatures, requested: string[]): string | null {
  return requested.includes(feature.id) ? feature.id : null;
}

export interface NormalisedFeatures {
  id: string;
  energy: number;
  danceability: number;
  valence: number;
  acousticness: number;
  speechiness: number;
  instrumentalness: number;
  tempo: number;
  key: PitchClass | null;
  mode: SpotifyMode | null;
  source: FeatureSource;
}

export function normaliseSpotifyFeatures(f: SpotifyAudioFeatures): NormalisedFeatures {
  return {
    id: f.id,
    energy: f.energy,
    danceability: f.danceability,
    valence: f.valence,
    acousticness: f.acousticness,
    speechiness: f.speechiness,
    instrumentalness: f.instrumentalness,
    tempo: f.tempo,
    key: validKey(f.key) ? (f.key as PitchClass) : null,
    mode: f.mode === 0 || f.mode === 1 ? (f.mode as SpotifyMode) : null,
    source: 'spotify',
  };
}

export function normaliseReccoFeatures(f: ReccoAudioFeatures): NormalisedFeatures {
  return {
    id: f.id,
    energy: f.energy ?? 0.5,
    danceability: f.danceability ?? 0.55,
    valence: f.valence ?? 0.5,
    acousticness: f.acousticness ?? 0.1,
    speechiness: f.speechiness ?? 0.05,
    instrumentalness: f.instrumentalness ?? 0.8,
    tempo: f.tempo ?? 120,
    key: f.key != null && validKey(f.key) ? (f.key as PitchClass) : null,
    mode: f.mode === 0 || f.mode === 1 ? (f.mode as SpotifyMode) : null,
    source: 'reccobeats',
  };
}

function validKey(key: number): boolean {
  return Number.isInteger(key) && key >= 0 && key <= 11;
}
