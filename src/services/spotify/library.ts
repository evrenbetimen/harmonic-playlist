import { toTrackWithKey } from '@/core/track';
import type { Track, TrackWithKey } from '@/core/types';
import { readCache, writeCache } from '@/services/cache';
import {
  addTracksToPlaylist,
  createPlaylist,
  getAudioFeatures,
  getMe,
  getPlaylistTracks,
  getReccoFeatures,
  getTracks,
  getUserPlaylists,
  normaliseReccoFeatures,
  normaliseSpotifyFeatures,
  searchTracks,
  SpotifyError,
  type NormalisedFeatures,
  type SpotifyPlaylist,
  type SpotifyTrack,
} from './client';
import type { PlanResult } from '@/core/types';

const FEATURE_TTL = 30 * 24 * 60 * 60 * 1000;

/**
 * Discovery without /v1/recommendations (also restricted since Nov 2024).
 *
 * We seed the crate with genre phrases + flagship artists, then let the
 * sequencer do the curation. Queries are cheap (search limit 10) and cached
 * for a day, so opening the app twice does not double the API budget.
 */
const GENRE_QUERIES: Record<string, string[]> = {
  'afro-house': [
    'afro house',
    'afro house 2025',
    'afro tech',
    'black coffee',
    'da capo',
    'keinemusik',
    'sun-el musician',
  ],
  'melodic-house': [
    'melodic house',
    'melodic techno',
    'innervisions',
    'solomun',
    'adriatique',
    'tale of us',
  ],
  'tech-house': [
    'tech house',
    'tech house 2025',
    'hot creations',
    'michael bibi',
    'chris stussy',
    'solid grooves',
  ],
  techno: ['techno', 'peak time techno', 'charlotte de witte', 'amelie lens', 'drumcode'],
  'organic-house': ['organic house', 'downtempo', 'bonobo', 'nicola cruz', 'satori'],
  'progressive-house': ['progressive house', 'anjunadeep', 'yotto', 'ben bohmer', 'marsh'],
};

export interface CrateOptions {
  genre: string;
  extraQueries?: string[];
  limit?: number;
}

export async function loadSpotifyCrate({
  genre,
  extraQueries = [],
  limit = 140,
}: CrateOptions): Promise<TrackWithKey[]> {
  const queries = [...(GENRE_QUERIES[genre] ?? [genre.replace('-', ' ')]), ...extraQueries];
  const found = new Map<string, SpotifyTrack>();

  for (const query of queries) {
    const cacheKey = `search:${genre}:${query}`;
    let items = readCache<SpotifyTrack[]>(cacheKey);
    if (!items) {
      items = await searchTracks(query, 10);
      writeCache(cacheKey, items, 12 * 60 * 60 * 1000);
    }
    for (const t of items) {
      if (!t?.id || found.has(t.id)) continue;
      found.set(t.id, t);
    }
    if (found.size >= limit) break;
  }

  const ids = [...found.keys()].slice(0, limit);
  if (ids.length === 0) return [];

  const [tracks, features] = await Promise.all([getTracks(ids), loadFeatures(ids)]);

  return tracks
    .map((t) => {
      const f = features.get(t.id);
      if (!f) return null;
      return toTrackWithKey(mapTrack(t, f, genre));
    })
    .filter((t): t is TrackWithKey => t != null && Number.isFinite(t.features.tempo) && t.features.tempo > 0);
}

async function loadFeatures(ids: string[]): Promise<Map<string, NormalisedFeatures>> {
  const map = new Map<string, NormalisedFeatures>();
  const missing: string[] = [];

  for (const id of ids) {
    const cached = readCache<NormalisedFeatures>(`feature:${id}`);
    if (cached) map.set(id, cached);
    else missing.push(id);
  }
  if (missing.length === 0) return map;

  const spotify = await getAudioFeatures(missing);
  if (spotify) {
    for (const f of spotify) {
      const normalised = normaliseSpotifyFeatures(f);
      map.set(f.id, normalised);
      writeCache(`feature:${f.id}`, normalised, FEATURE_TTL);
    }
    return map;
  }

  // Spotify blocked the endpoint → ReccoBeats fallback.
  try {
    const recco = await getReccoFeatures(missing);
    for (const f of recco) {
      const normalised = normaliseReccoFeatures(f);
      map.set(f.id, normalised);
      writeCache(`feature:${f.id}`, normalised, FEATURE_TTL);
    }
  } catch (error) {
    throw new SpotifyError(
      503,
      `Ses özellikleri alınamadı. Spotify /audio-features yeni uygulamalara kapalı; ReccoBeats de yanıt vermedi (${String(error)}).`,
    );
  }
  return map;
}

function mapTrack(t: SpotifyTrack, f: NormalisedFeatures, genre: string): Track {
  return {
    id: t.id,
    uri: t.uri,
    title: t.name,
    artist: t.artists[0]?.name ?? 'Unknown',
    artists: t.artists.map((a) => a.name),
    album: t.album?.name ?? '',
    artworkUrl: t.album?.images?.[0]?.url ?? null,
    previewUrl: t.preview_url,
    durationMs: t.duration_ms,
    popularity: t.popularity,
    explicit: t.explicit,
    genres: [genre],
    releaseYear: t.album?.release_date ? Number(t.album.release_date.slice(0, 4)) : undefined,
    features: {
      energy: f.energy,
      danceability: f.danceability,
      valence: f.valence,
      acousticness: f.acousticness,
      speechiness: f.speechiness,
      instrumentalness: f.instrumentalness,
      tempo: Math.round(f.tempo * 10) / 10,
      key: f.key,
      mode: f.mode,
      source: f.source,
    },
  };
}

export async function publishPlaylist(name: string, plan: PlanResult): Promise<string> {
  const me = await getMe();
  const description = `Harmonic Playlist ${plan.metrics.harmonicPurity}% harmonic purity · ${plan.metrics.averageScore} avg score · ${plan.options.profile}`;
  const playlist = await createPlaylist(me.id, name, description);
  await addTracksToPlaylist(
    playlist.id,
    plan.slots.filter((s) => !s.track.id.startsWith('demo-')).map((s) => s.track.uri),
  );
  return playlist.external_urls.spotify;
}

/**
 * Loads a crate straight from one of the user's playlists.
 *
 * Unlike the discovery path this does not need `/search`: the tracks are known,
 * only their audio features have to be resolved. Feature failures for individual
 * tracks are dropped (with the rest of the playlist still usable) instead of
 * failing the whole import.
 */
export async function loadPlaylistCrate(
  playlistId: string,
  genre = 'playlist',
): Promise<TrackWithKey[]> {
  const tracks = await getPlaylistTracks(playlistId, 300);
  if (tracks.length === 0) return [];

  const ids = tracks.map((t) => t.id);
  const features = await loadFeatures(ids);

  return tracks
    .map((t) => {
      const f = features.get(t.id);
      if (!f) return null;
      return toTrackWithKey(mapTrack(t, f, genre));
    })
    .filter(
      (t): t is TrackWithKey =>
        t != null && Number.isFinite(t.features.tempo) && t.features.tempo > 0,
    );
}

/** Lightweight playlist summary for the picker (no track hydration). */
export async function listUserPlaylists(limit = 50): Promise<SpotifyPlaylist[]> {
  const playlists = await getUserPlaylists(limit);
  // Spotify returns entries with a null `owner` when a collaborative playlist
  // lost its owner; those cannot be opened reliably.
  return playlists.filter((p) => p?.id && p.owner);
}
