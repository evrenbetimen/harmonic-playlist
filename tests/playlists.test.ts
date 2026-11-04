import { describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for the playlist payload.
 *
 * Spotify stopped returning the nested `tracks` object from `/me/playlists`
 * (every entry came back with `tracks: null`), and the picker read
 * `p.tracks.total` directly — one `undefined` access took down the whole render
 * tree. These tests pin the defensive normalisation so it cannot regress.
 *
 * `getUserPlaylists` is exercised through a stubbed `fetch` so the real
 * response shape (including `tracks: null`) is what gets parsed.
 */

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function withPlaylistsPayload(payload: unknown, run: () => Promise<void>) {
  vi.resetModules();
  const store = new Map<string, string>([
    [
      'harmonic-playlist.spotify.token',
      JSON.stringify({
        access_token: 'test-access',
        token_type: 'Bearer',
        scope: 'user-read-private playlist-read-private',
        expires_at: Date.now() + 3_600_000,
      }),
    ],
  ]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  });
  const mock: FetchMock = async () => json(payload);
  vi.stubGlobal('fetch', mock);
  try {
    await run();
  } finally {
    vi.unstubAllGlobals();
  }
}

const page = (items: unknown[]) => ({ items, next: null, total: items.length });

describe('getUserPlaylists normalisation', () => {
  it('reads `items.total` — the current field — for the track count', async () => {
    await withPlaylistsPayload(
      page([
        {
          id: 'abc',
          name: 'EVREN HAVUZ 4',
          owner: { id: 'user-1', display_name: 'Trueness' },
          items: { total: 154 },
          tracks: null,
          images: [{ url: 'https://example.test/cover.jpg', width: 300, height: 300 }],
          public: false,
        },
      ]),
      async () => {
        const { getUserPlaylists } = await import('@/services/spotify/client');
        const result = await getUserPlaylists();
        expect(result).toHaveLength(1);
        expect(result[0].trackCount).toBe(154);
        expect(result[0].name).toBe('EVREN HAVUZ 4');
        expect(result[0].isPublic).toBe(false);
        expect(result[0].images[0].url).toContain('cover.jpg');
      },
    );
  });

  it('survives `tracks: null` and reports an unknown count', async () => {
    await withPlaylistsPayload(
      page([{ id: 'abc', name: 'X', owner: { id: 'u' }, tracks: null, items: null }]),
      async () => {
        const { getUserPlaylists } = await import('@/services/spotify/client');
        expect((await getUserPlaylists())[0].trackCount).toBeNull();
      },
    );
  });

  it('still understands the legacy `tracks.total` shape', async () => {
    await withPlaylistsPayload(
      page([{ id: 'abc', name: 'Set', owner: { id: 'u' }, tracks: { total: 42 } }]),
      async () => {
        const { getUserPlaylists } = await import('@/services/spotify/client');
        expect((await getUserPlaylists())[0].trackCount).toBe(42);
      },
    );
  });

  it('drops entries without an id instead of throwing', async () => {
    await withPlaylistsPayload(
      page([null, { name: 'no id' }, { id: 'ok', name: 'Fine', owner: { id: 'u' } }]),
      async () => {
        const { getUserPlaylists } = await import('@/services/spotify/client');
        const result = await getUserPlaylists();
        expect(result.map((p) => p.id)).toEqual(['ok']);
      },
    );
  });

  it('fills safe defaults for missing name, owner, images and visibility', async () => {
    await withPlaylistsPayload(page([{ id: 'bare' }]), async () => {
      const { getUserPlaylists } = await import('@/services/spotify/client');
      const [p] = await getUserPlaylists();
      expect(p.name).toBe('İsimsiz liste');
      expect(p.owner).toEqual({ id: '', display_name: null });
      expect(p.images).toEqual([]);
      expect(p.trackCount).toBeNull();
      expect(p.isPublic).toBe(true);
      expect(p.collaborative).toBe(false);
    });
  });

  it('treats a missing items array as an empty page', async () => {
    await withPlaylistsPayload({ items: null, next: null }, async () => {
      const { getUserPlaylists } = await import('@/services/spotify/client');
      await expect(getUserPlaylists()).resolves.toEqual([]);
    });
  });
});

describe('getPlaylistTracks guards', () => {
  it('reads the track from `item` (current API) and skips local files', async () => {
    await withPlaylistsPayload(
      {
        items: [
          { item: { id: 't1', name: 'Real', type: 'track' } },
          { item: { id: 'local1', name: 'Local', type: 'track' }, is_local: true },
          { item: null },
          null,
          { item: { id: 't2', name: 'Also real', type: 'track' } },
        ],
        next: null,
      },
      async () => {
        const { getPlaylistTracks } = await import('@/services/spotify/client');
        const tracks = await getPlaylistTracks('abc');
        expect(tracks.map((t) => t.id)).toEqual(['t1', 't2']);
      },
    );
  });

  it('still accepts the legacy `item.track` shape', async () => {
    await withPlaylistsPayload(
      {
        items: [{ track: { id: 'old', name: 'Legacy', type: 'track' } }],
        next: null,
      },
      async () => {
        const { getPlaylistTracks } = await import('@/services/spotify/client');
        expect((await getPlaylistTracks('abc')).map((t) => t.id)).toEqual(['old']);
      },
    );
  });

  it('filters out podcast episodes that share the track shape', async () => {
    await withPlaylistsPayload(
      {
        items: [
          { item: { id: 'song', name: 'Song', type: 'track' } },
          { item: { id: 'ep', name: 'Episode', type: 'episode' } },
        ],
        next: null,
      },
      async () => {
        const { getPlaylistTracks } = await import('@/services/spotify/client');
        expect((await getPlaylistTracks('abc')).map((t) => t.id)).toEqual(['song']);
      },
    );
  });

  it('treats a null items array as an empty playlist', async () => {
    await withPlaylistsPayload({ items: null, next: null }, async () => {
      const { getPlaylistTracks } = await import('@/services/spotify/client');
      await expect(getPlaylistTracks('abc')).resolves.toEqual([]);
    });
  });
});

describe('getReccoFeatures id recovery', () => {
  it('maps ReccoBeats UUIDs back to the Spotify id in `href`', async () => {
    // Live shape: `id` is a ReccoBeats UUID, the Spotify id sits in `href`.
    await withPlaylistsPayload(
      {
        content: [
          {
            id: '000e780b-9b22-4fb2-b894-200ae6fded8e',
            href: 'https://open.spotify.com/track/6K9pYyxTDqXWXxGJbzxGAM',
            tempo: 124,
            energy: 0.7,
          },
        ],
      },
      async () => {
        const { getReccoFeatures } = await import('@/services/spotify/client');
        const result = await getReccoFeatures(['6K9pYyxTDqXWXxGJbzxGAM']);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('6K9pYyxTDqXWXxGJbzxGAM');
        expect(result[0].tempo).toBe(124);
      },
    );
  });

  it('drops entries that only carry a non-Spotify UUID', async () => {
    await withPlaylistsPayload(
      { content: [{ id: '000e780b-9b22-4fb2-b894-200ae6fded8e', tempo: 120 }] },
      async () => {
        const { getReccoFeatures } = await import('@/services/spotify/client');
        await expect(getReccoFeatures(['requested-id'])).resolves.toEqual([]);
      },
    );
  });

  it('keeps an `id` that is already a requested Spotify id', async () => {
    await withPlaylistsPayload(
      { content: [{ id: 'requested-id', tempo: 118 }] },
      async () => {
        const { getReccoFeatures } = await import('@/services/spotify/client');
        expect((await getReccoFeatures(['requested-id']))[0].id).toBe('requested-id');
      },
    );
  });
});
