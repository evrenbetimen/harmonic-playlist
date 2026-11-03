const PREFIX = 'harmonic-playlist.cache.v1:';

interface Entry<T> {
  value: T;
  expires: number;
}

export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (Date.now() > entry.expires) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T, ttlMs: number): void {
  try {
    localStorage.setItem(
      PREFIX + key,
      JSON.stringify({ value, expires: Date.now() + ttlMs } satisfies Entry<T>),
    );
  } catch {
    // Quota exceeded → drop the oldest Harmonic Playlist cache entries.
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys.slice(0, Math.ceil(keys.length / 2))) localStorage.removeItem(k);
  }
}

export function clearCache(prefix?: string): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX + (prefix ?? ''))) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}
