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

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  images: SpotifyImage[] | null;
  owner: { id: string; display_name: string | null };
  tracks: { total: number; href?: string };
  public: boolean | null;
  collaborative?: boolean;
  external_urls: { spotify: string };
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
    const data = await spotifyFetch<{ items: SpotifyPlaylist[]; next: string | null }>(
      `/me/playlists?${params}`,
    );
    out.push(...data.items.filter(Boolean));
    if (!data.next || data.items.length === 0) break;
    offset += data.items.length;
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
  while (out.length < limit) {
    const params = new URLSearchParams({
      limit: '100',
      offset: String(offset),
      additional_types: 'track',
    });
    const data = await spotifyFetch<{
      items: Array<{ track: SpotifyTrack | null; is_local?: boolean }>;
      next: string | null;
    }>(`/playlists/${playlistId}/tracks?${params}`);

    for (const item of data.items) {
      // `is_local` entries have no Spotify id, so they cannot be published back
      // or enriched with features. Skip them instead of poisoning the crate.
      if (!item?.track || item.is_local || !item.track.id) continue;
      out.push(item.track);
    }
    if (!data.next || data.items.length === 0) break;
    offset += data.items.length;
  }
  return out.slice(0, limit);
}

export async function createPlaylist(
  userId: string,
  name: string,
  description: string,
): Promise<{ id: string; external_urls: { spotify: string } }> {
  return spotifyFetch(`/users/${userId}/playlists`, {
    method: 'POST',
    body: JSON.stringify({ name, description, public: false }),
  });
}

export async function addTracksToPlaylist(playlistId: string, uris: string[]): Promise<void> {
  for (let i = 0; i < uris.length; i += 100) {
    await spotifyFetch(`/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    });
  }
}

export interface ReccoAudioFeatures {
  id: string;
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
 * ReccoBeats exposes Spotify-compatible features for a track id. Used as the
 * first fallback when the legacy Spotify endpoint is unavailable.
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
    out.push(...(json.content ?? []));
  }
  return out;
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
