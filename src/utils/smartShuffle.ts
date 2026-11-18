import type { Track } from '../types/music';

export interface SmartShufflePreferences {
  artistAffinity: Map<string, number>;
  genreAffinity: Map<string, number>;
}

function normalizeKey(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase();
}

/**
 * Derives normalized artist and genre preference weights from play counts,
 * favorites, and recent listening history.
 */
export function computeUserPreferences(
  tracks: Track[],
  favoriteIds: Set<string>,
  recentTrackIds: string[] = []
): SmartShufflePreferences {
  const rawArtist = new Map<string, number>();
  const rawGenre = new Map<string, number>();
  const recentSet = new Set(recentTrackIds.slice(0, 30));

  for (const track of tracks) {
    const artist = normalizeKey(track.artist);
    const genre = normalizeKey(track.genre);
    const plays = Math.max(0, track.playCount || 0);
    const favBonus = favoriteIds.has(track.id) ? 3 : 0;
    const recentBonus = recentSet.has(track.id) ? 1.5 : 0;
    const weight = plays + favBonus + recentBonus;

    if (weight <= 0) continue;

    if (artist && artist !== 'unknown artist') {
      rawArtist.set(artist, (rawArtist.get(artist) || 0) + weight);
    }
    if (genre && genre !== 'unknown' && genre !== 'stream') {
      rawGenre.set(genre, (rawGenre.get(genre) || 0) + weight);
    }
  }

  const maxArtist = Math.max(1, ...rawArtist.values());
  const maxGenre = Math.max(1, ...rawGenre.values());

  const artistAffinity = new Map<string, number>();
  for (const [k, v] of rawArtist.entries()) {
    artistAffinity.set(k, v / maxArtist);
  }

  const genreAffinity = new Map<string, number>();
  for (const [k, v] of rawGenre.entries()) {
    genreAffinity.set(k, v / maxGenre);
  }

  return { artistAffinity, genreAffinity };
}

/**
 * Scores a candidate track for Smart Shuffle:
 * - Strongly prioritizes tracks with lower playCount / not recently heard.
 * - Boosts tracks matching the user's preferred artists and genres.
 */
export function scoreTrackForSmartShuffle(
  track: Track,
  prefs: SmartShufflePreferences,
  favoriteIds: Set<string>,
  recentSet: Set<string>,
  now: number
): number {
  const plays = Math.max(0, track.playCount || 0);

  // Novelty decay: 0 plays -> 1.0, 1 play -> 0.43, 5 plays -> 0.13, 15 plays -> 0.047
  const novelty = 1 / (1 + plays * 1.3);

  // Recency cooldown: avoid tracks heard just minutes ago
  let recencyFactor = 1.15;
  if (recentSet.has(track.id)) {
    recencyFactor = 0.25;
  } else if (track.lastPlayedAt) {
    const minutesSince = Math.max(0, (now - track.lastPlayedAt) / 60000);
    if (minutesSince < 30) {
      recencyFactor = 0.2;
    } else if (minutesSince < 240) {
      recencyFactor = 0.65;
    } else {
      recencyFactor = 1.05;
    }
  }

  const artistKey = normalizeKey(track.artist);
  const genreKey = normalizeKey(track.genre);
  const artistScore = prefs.artistAffinity.get(artistKey) || 0;
  const genreScore = prefs.genreAffinity.get(genreKey) || 0;
  const unplayedFavBoost = favoriteIds.has(track.id) && plays <= 1 ? 0.35 : 0;

  const preferenceMultiplier = 1 + artistScore * 1.15 + genreScore * 0.9 + unplayedFavBoost;
  return Math.max(0.01, novelty * recencyFactor * preferenceMultiplier);
}

export function pickNextSmartShuffleIndex(params: {
  queueTrackIds: string[];
  currentIndex: number;
  tracksById: Map<string, Track>;
  allTracks: Track[];
  favoriteIds: Set<string>;
  recentTrackIds?: string[];
  now?: number;
  randomFn?: () => number;
}): number {
  const {
    queueTrackIds,
    currentIndex,
    tracksById,
    allTracks,
    favoriteIds,
    recentTrackIds = [],
    now = Date.now(),
    randomFn = Math.random,
  } = params;

  if (queueTrackIds.length <= 1) return 0;

  const prefs = computeUserPreferences(allTracks, favoriteIds, recentTrackIds);
  const recentSet = new Set(recentTrackIds.slice(0, 12));

  const candidates: { index: number; weight: number }[] = [];
  let totalWeight = 0;

  for (let i = 0; i < queueTrackIds.length; i++) {
    if (i === currentIndex) continue;
    const track = tracksById.get(queueTrackIds[i]);
    const weight = track
      ? scoreTrackForSmartShuffle(track, prefs, favoriteIds, recentSet, now)
      : 0.1;
    candidates.push({ index: i, weight });
    totalWeight += weight;
  }

  if (candidates.length === 0) return 0;
  if (totalWeight <= 0) {
    return candidates[Math.floor(randomFn() * candidates.length)].index;
  }

  let threshold = randomFn() * totalWeight;
  for (const item of candidates) {
    threshold -= item.weight;
    if (threshold <= 0) {
      return item.index;
    }
  }

  return candidates[candidates.length - 1].index;
}
