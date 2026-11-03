import { camelotId, spotifyToCamelot } from './camelot';
import type { AudioFeatures, Track, TrackWithKey } from './types';

/** Derive the Camelot key once, at the boundary between API and domain. */
export function toTrackWithKey(track: Track): TrackWithKey {
  const camelot = spotifyToCamelot(track.features.key, track.features.mode);
  return {
    ...track,
    camelot,
    camelotId: camelotId(camelot),
  };
}

export function toTracksWithKey(tracks: Track[]): TrackWithKey[] {
  return tracks.map(toTrackWithKey);
}

/** Test / fixture helper — fills in sane defaults. */
export function makeTrack(
  overrides: Omit<Partial<Track>, 'features'> & { features?: Partial<AudioFeatures> },
): TrackWithKey {
  const id = overrides.id ?? `track-${Math.random().toString(36).slice(2, 9)}`;
  const base: Track = {
    id,
    uri: `spotify:track:${id}`,
    title: overrides.title ?? 'Untitled',
    artist: overrides.artist ?? 'Unknown Artist',
    artists: overrides.artists ?? [overrides.artist ?? 'Unknown Artist'],
    album: overrides.album ?? 'Single',
    artworkUrl: overrides.artworkUrl ?? null,
    previewUrl: overrides.previewUrl ?? null,
    durationMs: overrides.durationMs ?? 6 * 60 * 1000,
    popularity: overrides.popularity ?? 60,
    explicit: overrides.explicit ?? false,
    genres: overrides.genres ?? ['afro-house'],
    releaseYear: overrides.releaseYear ?? 2025,
    features: {
      energy: 0.6,
      danceability: 0.75,
      valence: 0.5,
      acousticness: 0.1,
      speechiness: 0.05,
      instrumentalness: 0.8,
      tempo: 122,
      key: 9, // A
      mode: 0, // minor → 8A
      source: 'demo',
      ...overrides.features,
    },
  };
  return toTrackWithKey(base);
}
