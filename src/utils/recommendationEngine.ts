import type {
  ListeningEventRecord,
  RecommendationFeedbackRecord,
  Track,
} from '../types/music';

export type RecommendationMood =
  | 'all'
  | 'workout'
  | 'chill'
  | 'focus'
  | 'party'
  | 'sleep'
  | 'night_drive';

export interface TrackRecommendation {
  track: Track;
  score: number;
  category:
    | 'Favorite Match'
    | 'Hidden Gem'
    | 'Artist Affinity'
    | 'Genre Discovery'
    | 'Mood Fit';
  reasons: string[];
  moodFit: RecommendationMood;
}

const MOOD_KEYWORDS: Record<Exclude<RecommendationMood, 'all'>, string[]> = {
  workout: ['rock', 'metal', 'electronic', 'edm', 'hip', 'rap', 'dance', 'trap', 'bass', 'punk', 'energetic'],
  chill: ['chill', 'lo-fi', 'lofi', 'acoustic', 'indie', 'jazz', 'soul', 'ambient', 'downtempo'],
  focus: ['classical', 'ambient', 'instrumental', 'soundtrack', 'piano', 'study', 'minimal', 'electronic'],
  party: ['pop', 'dance', 'house', 'club', 'disco', 'funk', 'hip-hop', 'reggaeton', 'techno'],
  sleep: ['ambient', 'sleep', 'calm', 'classical', 'acoustic', 'meditation', 'piano', 'soft'],
  night_drive: ['synthwave', 'synth', 'r&b', 'rnb', 'electronic', 'dark', 'pop', 'alt', 'dream'],
};

export function inferTrackMood(track: Track): RecommendationMood {
  const haystack = `${track.genre || ''} ${track.album || ''} ${track.title || ''}`.toLowerCase();
  for (const [mood, terms] of Object.entries(MOOD_KEYWORDS) as Array<
    [Exclude<RecommendationMood, 'all'>, string[]]
  >) {
    if (terms.some((term) => haystack.includes(term))) {
      return mood;
    }
  }
  if (track.duration > 360) return 'focus';
  if ((track.playCount || 0) >= 5) return 'night_drive';
  return 'chill';
}

export function generateTrackRecommendations(params: {
  tracks: Track[];
  favoriteIds: Set<string>;
  listeningEvents: ListeningEventRecord[];
  feedback: RecommendationFeedbackRecord[];
  mood?: RecommendationMood;
  seedOffset?: number;
  limit?: number;
  now?: number;
}): TrackRecommendation[] {
  const {
    tracks,
    favoriteIds,
    listeningEvents,
    feedback,
    mood = 'all',
    seedOffset = 0,
    limit = 24,
    now = Date.now(),
  } = params;

  if (tracks.length === 0) return [];

  const artistWeight = new Map<string, number>();
  const genreWeight = new Map<string, number>();
  const feedbackMap = new Map(feedback.map((f) => [f.trackId, f.feedback]));
  const recentSkipTracks = new Set<string>();

  for (const ev of listeningEvents.slice(0, 400)) {
    if (ev.skipped) recentSkipTracks.add(ev.trackId);
  }

  for (const t of tracks) {
    const isFav = favoriteIds.has(t.id);
    const fb = feedbackMap.get(t.id);
    const baseAffinity =
      (t.playCount || 0) * 1.4 +
      (isFav ? 8 : 0) +
      (fb === 'liked' ? 6 : 0) +
      ((t.rating || 0) >= 4 ? 4 : 0) -
      (t.skipCount || 0) * 1.5;

    if (baseAffinity > 0) {
      const aKey = (t.artist || '').trim().toLowerCase();
      if (aKey && aKey !== 'unknown artist') {
        artistWeight.set(aKey, (artistWeight.get(aKey) || 0) + baseAffinity);
      }
      const gKey = (t.genre || '').trim().toLowerCase();
      if (gKey) {
        genreWeight.set(gKey, (genreWeight.get(gKey) || 0) + baseAffinity);
      }
    }
  }

  const scored: TrackRecommendation[] = [];

  for (let idx = 0; idx < tracks.length; idx++) {
    const track = tracks[idx];
    const fb = feedbackMap.get(track.id);
    if (fb === 'disliked') continue;

    const detectedMood = inferTrackMood(track);
    if (mood !== 'all' && detectedMood !== mood) {
      // Allow partial soft matching if genre includes mood keyword directly
      const haystack = `${track.genre} ${track.title}`.toLowerCase();
      const kwMatch = MOOD_KEYWORDS[mood].some((k) => haystack.includes(k));
      if (!kwMatch) continue;
    }

    const aKey = (track.artist || '').trim().toLowerCase();
    const gKey = (track.genre || '').trim().toLowerCase();
    const aScore = aKey ? Math.min(25, (artistWeight.get(aKey) || 0) * 0.7) : 0;
    const gScore = gKey ? Math.min(20, (genreWeight.get(gKey) || 0) * 0.65) : 0;

    const playCount = track.playCount || 0;
    const skipCount = track.skipCount || 0;
    const isFav = favoriteIds.has(track.id);

    // Reward less-played gems matching user affinity
    const freshnessBonus = playCount === 0 ? 12 : playCount <= 3 ? 7 : Math.max(0, 4 - playCount * 0.25);
    const recencyPenalty =
      track.lastPlayedAt && now - track.lastPlayedAt < 6 * 3_600_000 ? -10 : 0;
    const skipPenalty = skipCount * -3.5 - (recentSkipTracks.has(track.id) ? 4 : 0);
    const likedBonus = fb === 'liked' ? 12 : isFav ? 6 : 0;
    const ratingBonus = track.rating ? track.rating * 1.8 : 0;
    // Slight deterministic rotation on Refresh without inventing fake scores
    const rotationTieBreaker = ((idx * 17 + seedOffset * 31) % 7) * 0.35;

    const totalScore = Math.max(
      0,
      Math.round(
        (aScore + gScore + freshnessBonus + likedBonus + ratingBonus + recencyPenalty + skipPenalty + rotationTieBreaker) *
          10
      ) / 10
    );

    const reasons: string[] = [];
    let category: TrackRecommendation['category'] = 'Hidden Gem';

    if (aScore >= 6) {
      reasons.push(`Artist affinity: ${track.artist}`);
      category = 'Artist Affinity';
    }
    if (gScore >= 5 && track.genre) {
      reasons.push(`Matches your ${track.genre} listening`);
      if (category === 'Hidden Gem') category = 'Genre Discovery';
    }
    if (isFav || fb === 'liked') {
      reasons.push(fb === 'liked' ? 'Marked Loved in recommendations' : 'In your Favorites');
      category = 'Favorite Match';
    }
    if (playCount <= 2) {
      reasons.push(playCount === 0 ? 'Unplayed track ready to rediscover' : `Only ${playCount} plays so far`);
    }
    if (mood !== 'all') {
      reasons.push(`Fits ${mood.replace('_', ' ')} mood`);
      category = 'Mood Fit';
    }
    if (reasons.length === 0) {
      reasons.push(track.genre ? `${track.genre} library selection` : 'Balanced library rotation');
    }

    scored.push({
      track,
      score: totalScore,
      category,
      reasons,
      moodFit: detectedMood,
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
