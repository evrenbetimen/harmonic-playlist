import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * iTunes Search preview resolver.
 *
 * Context: Spotify returns `preview_url: null` for every third-party app, and
 * Deezer's JSON API sends no CORS header, so a browser `fetch` fails and the
 * engine used to fall through to the synthetic pad silently. iTunes is the
 * provider that actually works in a browser, but Apple exposes **no ISRC**
 * (`lookup?isrc=` returns 0 results), so correctness rests entirely on the
 * title+artist matcher. A wrong preview is worse than the synth pad, so these
 * tests pin the rejection cases as hard as the happy path.
 */

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installLocalStorage(): void {
  const store = new Map<string, string>();
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
}

/** Loads a fresh copy of the module with `handler` as the network. */
async function loadResolver(handler: FetchMock) {
  vi.resetModules();
  installLocalStorage();
  vi.stubGlobal('fetch', handler);
  return import('@/services/previews');
}

const DOWNFALL = {
  trackId: 1721442017,
  kind: 'song',
  trackName: 'Downfall',
  artistName: 'Innellea, Colyn & braev',
  previewUrl: 'https://audio-ssl.itunes.apple.com/preview/downfall.m4p',
  trackTimeMillis: 364_000,
  collectionName: 'Downfall - Single',
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('resolvePreviewByItunes — matching', () => {
  it('accepts an exact title + artist match and returns the previewUrl', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => json({ resultCount: 1, results: [DOWNFALL] }));
    const { resolvePreviewByItunes } = await loadResolver(fetchMock);

    const match = await resolvePreviewByItunes('Downfall', 'Innellea');

    expect(match).not.toBeNull();
    expect(match?.url).toBe(DOWNFALL.previewUrl);
    expect(match?.itunesId).toBe(DOWNFALL.trackId);

    // Request shape: song entity, limit 5, configurable country.
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('itunes.apple.com/search');
    expect(url).toContain('entity=song');
    expect(url).toContain('limit=5');
    expect(url).toMatch(/country=[A-Z]{2}/);
  });

  it('returns null when nothing matches (nonsense query)', async () => {
    const { resolvePreviewByItunes } = await loadResolver(async () =>
      json({ resultCount: 0, results: [] }),
    );
    await expect(resolvePreviewByItunes('zzzz nonexistent', 'nobody')).resolves.toBeNull();
  });

  it('rejects a result by a different artist with the same title', async () => {
    // What Apple actually returns for "Downfall Taylor Swift": her songs, none
    // named Downfall. Even if one were, the artist gate must reject it.
    const wrongArtist = {
      ...DOWNFALL,
      trackId: 1,
      trackName: 'Downfall',
      artistName: 'Taylor Swift',
    };
    const { resolvePreviewByItunes } = await loadResolver(async () =>
      json({ resultCount: 1, results: [wrongArtist] }),
    );

    await expect(resolvePreviewByItunes('Downfall', 'Innellea')).resolves.toBeNull();
  });

  it('accepts a multi-artist Apple credit when one artist matches', async () => {
    // Spotify says "Marten Lou"; Apple says "Marten Lou & CamelPhat".
    const { resolvePreviewByItunes } = await loadResolver(async () =>
      json({
        resultCount: 1,
        results: [{ ...DOWNFALL, trackName: 'Save Me', artistName: 'Marten Lou & CamelPhat' }],
      }),
    );

    const match = await resolvePreviewByItunes('Save Me', 'Marten Lou');
    expect(match?.url).toBe(DOWNFALL.previewUrl);
  });

  it('ignores remix/remodel candidates when Spotify has the original', async () => {
    const remix = {
      ...DOWNFALL,
      trackId: 2,
      trackName: 'Downfall (Kevin de Vries Remix)',
    };
    const { resolvePreviewByItunes } = await loadResolver(async () =>
      json({ resultCount: 1, results: [remix] }),
    );

    await expect(resolvePreviewByItunes('Downfall', 'Innellea')).resolves.toBeNull();
  });

  it('skips results that have no previewUrl', async () => {
    const { resolvePreviewByItunes } = await loadResolver(async () =>
      json({ resultCount: 1, results: [{ ...DOWNFALL, previewUrl: undefined }] }),
    );

    await expect(resolvePreviewByItunes('Downfall', 'Innellea')).resolves.toBeNull();
  });

  it('ignores non-song results (music videos, podcasts)', async () => {
    const { resolvePreviewByItunes } = await loadResolver(async () =>
      json({ resultCount: 1, results: [{ ...DOWNFALL, kind: 'music-video' }] }),
    );

    await expect(resolvePreviewByItunes('Downfall', 'Innellea')).resolves.toBeNull();
  });

  it('matches Turkish titles across case and diacritics', async () => {
    const { resolvePreviewByItunes } = await loadResolver(async () =>
      json({
        resultCount: 1,
        results: [{ ...DOWNFALL, trackName: 'Sevdigim', artistName: 'Sertab Erener' }],
      }),
    );

    const match = await resolvePreviewByItunes('SEVDİĞİM', 'Sertab Erener');
    expect(match?.url).toBe(DOWNFALL.previewUrl);
  });
});

describe('resolvePreviewByItunes — failure handling', () => {
  it('returns null on a network error instead of throwing', async () => {
    const { resolvePreviewByItunes } = await loadResolver(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(resolvePreviewByItunes('Downfall', 'Innellea')).resolves.toBeNull();
  });

  it('returns null on a 404/500 body that is not JSON', async () => {
    const { resolvePreviewByItunes } = await loadResolver(
      async () => new Response('<html>nope</html>', { status: 500 }),
    );

    await expect(resolvePreviewByItunes('Downfall', 'Innellea')).resolves.toBeNull();
  });

  it('retries once on 429 and succeeds', async () => {
    let calls = 0;
    const { resolvePreviewByItunes } = await loadResolver(async () => {
      calls += 1;
      if (calls === 1) return new Response('', { status: 429 });
      return json({ resultCount: 1, results: [DOWNFALL] });
    });

    const match = await resolvePreviewByItunes('Downfall', 'Innellea');
    expect(calls).toBe(2);
    expect(match?.url).toBe(DOWNFALL.previewUrl);
  });

  it('caches a hit so a second play does not hit the network', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => json({ resultCount: 1, results: [DOWNFALL] }));
    const { resolvePreviewByItunes } = await loadResolver(fetchMock);

    await resolvePreviewByItunes('Downfall', 'Innellea');
    await resolvePreviewByItunes('Downfall', 'Innellea');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches a miss so a failing track is not re-queried every play', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => json({ resultCount: 0, results: [] }));
    const { resolvePreviewByItunes } = await loadResolver(fetchMock);

    await resolvePreviewByItunes('Unknown', 'Nobody');
    await resolvePreviewByItunes('Unknown', 'Nobody');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clearPreviewCache forces a fresh lookup', async () => {
    let hits = 0;
    const fetchMock = vi.fn<FetchMock>(async () => {
      hits += 1;
      return json({ resultCount: 1, results: [DOWNFALL] });
    });
    const { resolvePreviewByItunes, clearPreviewCache } = await loadResolver(fetchMock);

    await resolvePreviewByItunes('Downfall', 'Innellea');
    clearPreviewCache(null, 'Downfall', 'Innellea');
    await resolvePreviewByItunes('Downfall', 'Innellea');

    expect(hits).toBe(2);
  });

  it('marks a URL stale so an expired signed preview is re-resolved', async () => {
    let hits = 0;
    const fetchMock = vi.fn<FetchMock>(async () => {
      hits += 1;
      return json({ resultCount: 1, results: [DOWNFALL] });
    });
    const { resolvePreviewByItunes, markPreviewStale } = await loadResolver(fetchMock);

    await resolvePreviewByItunes('Downfall', 'Innellea');
    markPreviewStale(null, 'Downfall', 'Innellea');
    const second = await resolvePreviewByItunes('Downfall', 'Innellea');

    expect(hits).toBe(2);
    expect(second?.url).toBe(DOWNFALL.previewUrl);
  });

  it('deduplicates concurrent lookups for the same track', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => json({ resultCount: 1, results: [DOWNFALL] }));
    const { resolvePreviewByItunes } = await loadResolver(fetchMock);

    const [a, b] = await Promise.all([
      resolvePreviewByItunes('Downfall', 'Innellea'),
      resolvePreviewByItunes('Downfall', 'Innellea'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a?.url).toBe(b?.url);
  });

  it('honours an explicit country override', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => json({ resultCount: 1, results: [DOWNFALL] }));
    const { resolvePreviewByItunes } = await loadResolver(fetchMock);

    await resolvePreviewByItunes('Downfall', 'Innellea', { country: 'de' });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('country=DE');
  });
});

describe('pickItunesMatch — selection', () => {
  it('prefers the exact recording over a remix when both pass the artist gate', async () => {
    const { pickItunesMatch } = await loadResolver(async () => json({ results: [] }));

    const picked = pickItunesMatch({ title: 'Downfall', artists: ['Innellea'] }, [
      { ...DOWNFALL, trackId: 9, trackName: 'Downfall (Extended Mix)' },
      DOWNFALL,
    ]);

    expect(picked?.trackId).toBe(DOWNFALL.trackId);
  });

  it('returns null for an empty result set', async () => {
    const { pickItunesMatch } = await loadResolver(async () => json({ results: [] }));
    expect(pickItunesMatch({ title: 'x', artists: ['y'] }, [])).toBeNull();
  });
});
