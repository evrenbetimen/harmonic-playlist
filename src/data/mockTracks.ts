import { mulberry32 } from '@/core/sequencer';
import { toTracksWithKey } from '@/core/track';
import type { FeatureSource, PitchClass, SpotifyMode, Track } from '@/core/types';

/**
 * Demo crate — 190 procedurally generated tracks that behave like a real
 * Afro House / Melodic House library (BPM distribution, keys, durations).
 *
 * Preview URLs are null on purpose: the demo player falls back to the
 * procedural synth engine, so the whole app is usable with zero credentials
 * and zero network. The generation is seeded — the crate is identical on
 * every reload, which keeps screenshots and tests stable.
 */

const ARTISTS = [
  ['Black Coffee', 'afro-house'],
  ['&ME', 'afro-house'],
  ['Rampa', 'afro-house'],
  ['Adam Port', 'afro-house'],
  ['Keinemusik', 'afro-house'],
  ['Da Capo', 'afro-house'],
  ['Culoe De Song', 'afro-house'],
  ['Enoo Napa', 'afro-house'],
  ['Sun-El Musician', 'afro-house'],
  ['Zakes Bantwini', 'afro-house'],
  ['Caiiro', 'afro-house'],
  ['Kususa', 'afro-house'],
  ['Dwson', 'deep-house'],
  ['Jimpster', 'deep-house'],
  ['Sebo K', 'deep-house'],
  ['Cinthie', 'deep-house'],
  ['Kerri Chandler', 'deep-house'],
  ['Folamour', 'deep-house'],
  ['Solomun', 'melodic-house'],
  ['Âme', 'melodic-house'],
  ['Dixon', 'melodic-house'],
  ['Trikk', 'melodic-house'],
  ['Chaim', 'melodic-house'],
  ['Guy Gerber', 'melodic-house'],
  ['Adriatique', 'melodic-house'],
  ['Colyn', 'melodic-house'],
  ['Monolink', 'melodic-house'],
  ['Mind Against', 'melodic-house'],
  ['Tale Of Us', 'melodic-house'],
  ['Mathame', 'melodic-house'],
  ['Fideles', 'melodic-house'],
  ['Massano', 'melodic-house'],
  ['Anyma', 'melodic-house'],
  ['Kevin de Vries', 'melodic-house'],
  ['ARTBAT', 'progressive-house'],
  ['CamelPhat', 'progressive-house'],
  ['Hot Since 82', 'progressive-house'],
  ['Yotto', 'progressive-house'],
  ['Marsh', 'progressive-house'],
  ['Nora En Pure', 'progressive-house'],
  ['Ben Böhmer', 'progressive-house'],
  ['Lane 8', 'progressive-house'],
  ['Tinlicker', 'progressive-house'],
  ['Peggy Gou', 'tech-house'],
  ['Mochakk', 'tech-house'],
  ['Michael Bibi', 'tech-house'],
  ['Chris Stussy', 'tech-house'],
  ['Prunk', 'tech-house'],
  ['Sidney Charles', 'tech-house'],
  ['Franky Rizardo', 'tech-house'],
  ['Rossi.', 'tech-house'],
  ['Dennis Quin', 'tech-house'],
  ['Honey Dijon', 'tech-house'],
  ['The Martinez Brothers', 'tech-house'],
  ['Eli Brown', 'tech-house'],
  ['Biscits', 'tech-house'],
  ['Westend', 'tech-house'],
  ['Sosa', 'tech-house'],
  ['Cloonee', 'tech-house'],
  ['John Summit', 'tech-house'],
  ['Dom Dolla', 'tech-house'],
  ['Mau P', 'tech-house'],
  ['San Pacho', 'tech-house'],
  ['Matroda', 'tech-house'],
  ['Charlotte de Witte', 'techno'],
  ['Amelie Lens', 'techno'],
  ['Nina Kraviz', 'techno'],
  ['Enrico Sangiuliano', 'techno'],
  ['Joseph Capriati', 'techno'],
  ['Marco Carola', 'techno'],
  ['Indira Paganotto', 'techno'],
  ['Sara Landry', 'techno'],
  ['Anfisa Letyago', 'techno'],
  ['Reinier Zonneveld', 'techno'],
  ['Maceo Plex', 'techno'],
  ['Gorgon City', 'bass-house'],
  ['Majestic', 'bass-house'],
  ['Chris Lake', 'bass-house'],
  ['Fisher', 'bass-house'],
  ['Tchami', 'bass-house'],
  ['Malaa', 'bass-house'],
  ['Disclosure', 'uk-garage'],
  ['Interplanetary Criminal', 'uk-garage'],
  ['Sammy Virji', 'uk-garage'],
  ['Salute', 'uk-garage'],
  ['TSHA', 'indie-dance'],
  ['Bicep', 'indie-dance'],
  ['Ross from Friends', 'indie-dance'],
  ['Jungle', 'indie-dance'],
  ['Fred again..', 'indie-dance'],
  ['Overmono', 'indie-dance'],
  ['Bonobo', 'organic-house'],
  ['Four Tet', 'organic-house'],
  ['Kiasmos', 'organic-house'],
  ['Romare', 'organic-house'],
  ['Nu', 'organic-house'],
  ['Bedouin', 'organic-house'],
  ['Satori', 'organic-house'],
  ['Acid Pauli', 'organic-house'],
  ['Nicola Cruz', 'organic-house'],
  ['Chancha Vía Circuito', 'organic-house'],
  ['Busta Rhymes', 'hip-hop'], // filtered out by speechiness in the demo crate
] as const;

const TITLES = [
  'Abiro', 'Kongo', 'Muyè', 'Jaguar', 'Sunset Drive', 'Horizon', 'Nightfall',
  'Amanecer', 'Ritual', 'Distant Voices', 'Osiris', 'Uma', 'Kuar', 'Breathe',
  'Bloom', 'After Dark', 'Fade', 'Sensor', 'Atlas', 'Mirage', 'Nebula',
  'Orion', 'Voyager', 'Reverie', 'Solstice', 'Ember', 'Prism', 'Voodoo',
  'Sirens', 'Eclipse', 'Tides', 'Aurora', 'Cobalt', 'Lumen', 'Talisman',
  'Nomad', 'Cairo', 'Marrakech', 'Lagos', 'Nairobi', 'Addis', 'Zanzibar',
  'Mombasa', 'Dakar', 'Accra', 'Tulum', 'Ibiza', 'Mykonos', 'Goa', 'Sahara',
  'Sahel', 'Kilimanjaro', 'Serengeti', 'Nubia', 'Kemet', 'Ancestral',
  'Mother Tongue', 'Golden Hour', 'Blue Hour', 'First Light', 'Last Light',
  'Slow Motion', 'Gravity', 'Parallel', 'Circles', 'Spiral', 'Undertow',
  'Currents', 'Drift', 'Weightless', 'Deep End', 'Low Orbit', 'High Tide',
  'Glasshouse', 'Rain Dance', 'Dust', 'Clay', 'Amber', 'Obsidian', 'Quartz',
  'Silk Road', 'Bazaar', 'Caravan', 'Oasis', 'Mirage', 'Heatwave', 'Monsoon',
  'Equator', 'Meridian', 'Pole Shift', 'Northern Light', 'Southern Cross',
];

const GENRE_BPM: Record<string, [number, number, number]> = {
  // [min, max, center] — used to give each genre a believable tempo band
  'afro-house': [116, 126, 121],
  'deep-house': [118, 124, 121],
  'melodic-house': [118, 126, 122],
  'progressive-house': [120, 128, 124],
  'tech-house': [123, 130, 126],
  'techno': [128, 136, 132],
  'bass-house': [126, 132, 128],
  'uk-garage': [130, 138, 134],
  'indie-dance': [118, 128, 123],
  'organic-house': [112, 122, 117],
  'hip-hop': [85, 100, 92],
};

const GENRE_WEIGHT: Record<string, number> = {
  'afro-house': 34,
  'melodic-house': 22,
  'progressive-house': 12,
  'tech-house': 12,
  'deep-house': 8,
  'organic-house': 6,
  techno: 4,
  'indie-dance': 4,
  'bass-house': 3,
  'uk-garage': 2,
  'hip-hop': 1,
};

export const DEMO_GENRES = Object.keys(GENRE_WEIGHT).filter((g) => g !== 'hip-hop');

/** Wheel-friendly key pool: roots that actually appear in these genres. */
const KEY_POOL: Array<[PitchClass, SpotifyMode]> = [
  [9, 0], [9, 0], [9, 0], // A minor (8A) is the genre's home key
  [0, 0], [0, 0], // C minor
  [7, 0], [7, 0], // G minor
  [2, 0], // D minor
  [4, 0], // E minor
  [5, 0], // F minor
  [0, 1], [0, 1], // C major
  [7, 1], // G major
  [2, 1], // D major
  [5, 1], // F major
  [10, 1], // Bb major
  [6, 0], // F# minor
  [1, 0], // C# minor
  [3, 0], // Eb minor
  [10, 0], // Bb minor
];

function pickGenre(rng: () => number): string {
  const entries = Object.entries(GENRE_WEIGHT);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [g, w] of entries) {
    r -= w;
    if (r <= 0) return g;
  }
  return 'afro-house';
}

function build(): Track[] {
  const rng = mulberry32(0x2027);
  const tracks: Track[] = [];
  const usedTitles = new Map<string, number>();

  for (let i = 0; i < 190; i++) {
    const genre = pickGenre(rng);
    const artists = ARTISTS.filter(([, g]) => g === genre);
    const [artist] = artists[Math.floor(rng() * artists.length)] ?? ['Black Coffee'];
    const [minBpm, maxBpm, center] = GENRE_BPM[genre] ?? [118, 128, 123];

    // Nice-number BPMs (121, 122, 124...) like real Beatport metadata
    const jitter = (rng() - 0.5) * (maxBpm - minBpm);
    const tempo = Math.max(minBpm, Math.min(maxBpm, Math.round(center + jitter)));

    const [key, mode] = KEY_POOL[Math.floor(rng() * KEY_POOL.length)];
    const energyBase =
      genre === 'techno' ? 0.86 : genre === 'tech-house' ? 0.78 : genre === 'afro-house' ? 0.62 : 0.55;
    const energy = clamp(energyBase + (tempo - center) * 0.012 + (rng() - 0.5) * 0.22, 0.18, 0.99);

    const baseTitle = TITLES[Math.floor(rng() * TITLES.length)];
    const count = (usedTitles.get(baseTitle) ?? 0) + 1;
    usedTitles.set(baseTitle, count);
    const title = count > 1 ? `${baseTitle} (${roman(count)} Mix)` : baseTitle;

    const durationMs = Math.round((4.2 + rng() * 3.6) * 60_000);
    const popularity = Math.round(38 + rng() * 55);

    tracks.push({
      id: `demo-${String(i + 1).padStart(3, '0')}`,
      uri: `spotify:track:demo${String(i + 1).padStart(3, '0')}`,
      title,
      artist,
      artists: [artist],
      album: rng() > 0.72 ? 'Club Compilation' : rng() > 0.4 ? 'EP' : 'Single',
      artworkUrl: null,
      previewUrl: null,
      durationMs,
      popularity,
      explicit: false,
      genres: [genre],
      releaseYear: 2023 + Math.floor(rng() * 4),
      features: {
        energy: round2(energy),
        danceability: round2(clamp(0.62 + rng() * 0.3, 0, 1)),
        valence: round2(clamp(0.32 + rng() * 0.55, 0, 1)),
        acousticness: round2(clamp(rng() * 0.35, 0, 1)),
        speechiness: round2(clamp(rng() * 0.12, 0, 1)),
        instrumentalness: round2(clamp(0.55 + rng() * 0.45, 0, 1)),
        tempo,
        key,
        mode,
        keyConfidence: round2(0.7 + rng() * 0.29),
        source: 'demo' as FeatureSource,
      },
    });
  }

  return tracks;
}

let cache: Track[] | null = null;

export function getDemoTracks() {
  cache ??= build();
  return toTracksWithKey(cache);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function roman(n: number) {
  return ['I', 'II', 'III', 'IV', 'V'][n - 1] ?? String(n);
}
