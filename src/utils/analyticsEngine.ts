import type { ListeningEventRecord, Track } from '../types/music';

export interface AnalyticsSummary {
  totalSeconds: number;
  todaySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
  totalSessions: number;
  streakDays: number;
  topSongs: Array<{ track: Track; plays: number; seconds: number }>;
  topArtists: Array<{ artist: string; plays: number; seconds: number }>;
  topAlbums: Array<{ album: string; artist: string; plays: number; seconds: number }>;
  topGenres: Array<{ genre: string; plays: number; seconds: number }>;
  dailyBars: Array<{ dayKey: string; label: string; minutes: number }>;
  monthlyBars: Array<{ monthKey: string; label: string; minutes: number }>;
}

export function computeListeningAnalytics(params: {
  tracks: Track[];
  events: ListeningEventRecord[];
  now?: number;
}): AnalyticsSummary {
  const { tracks, events, now = Date.now() } = params;
  const trackMap = new Map(tracks.map((t) => [t.id, t]));

  const todayDate = new Date(now);
  const todayKey = todayDate.toISOString().slice(0, 10);
  const monthKeyNow = todayDate.toISOString().slice(0, 7);
  const sevenDaysAgo = now - 6 * 86_400_000;

  let totalSeconds = 0;
  let todaySeconds = 0;
  let weekSeconds = 0;
  let monthSeconds = 0;

  const daySecondsMap = new Map<string, number>();
  const monthSecondsMap = new Map<string, number>();
  const songSecondsMap = new Map<string, number>();

  for (const ev of events) {
    const sec = Math.max(0, ev.durationListenedSec || 0);
    totalSeconds += sec;
    if (ev.dayKey === todayKey) todaySeconds += sec;
    if (ev.startedAt >= sevenDaysAgo) weekSeconds += sec;
    if (ev.monthKey === monthKeyNow) monthSeconds += sec;

    daySecondsMap.set(ev.dayKey, (daySecondsMap.get(ev.dayKey) || 0) + sec);
    monthSecondsMap.set(ev.monthKey, (monthSecondsMap.get(ev.monthKey) || 0) + sec);
    songSecondsMap.set(ev.trackId, (songSecondsMap.get(ev.trackId) || 0) + sec);
  }

  // Fallback if user has playCounts recorded prior to v3 detailed events
  if (totalSeconds === 0) {
    for (const t of tracks) {
      if ((t.playCount || 0) > 0 && (t.duration || 0) > 0) {
        totalSeconds += t.playCount * t.duration;
      }
    }
  }

  // Compute consecutive listening streak ending today or yesterday
  let streakDays = 0;
  for (let offset = 0; offset < 365; offset++) {
    const d = new Date(now - offset * 86_400_000).toISOString().slice(0, 10);
    if ((daySecondsMap.get(d) || 0) > 0) {
      streakDays++;
    } else if (offset > 0) {
      break;
    }
  }

  // Top Songs, Artists, Albums, Genres
  const artistAgg = new Map<string, { plays: number; seconds: number }>();
  const albumAgg = new Map<string, { artist: string; plays: number; seconds: number }>();
  const genreAgg = new Map<string, { plays: number; seconds: number }>();

  const topSongs: AnalyticsSummary['topSongs'] = [];

  for (const t of tracks) {
    const evSecs = songSecondsMap.get(t.id) || 0;
    const plays = t.playCount || 0;
    const effectiveSecs = evSecs > 0 ? evSecs : plays * (t.duration || 0);
    if (plays > 0 || evSecs > 0) {
      topSongs.push({ track: t, plays, seconds: effectiveSecs });

      const a = t.artist || 'Unknown Artist';
      const curA = artistAgg.get(a) || { plays: 0, seconds: 0 };
      artistAgg.set(a, { plays: curA.plays + plays, seconds: curA.seconds + effectiveSecs });

      const alb = t.album || 'Unknown Album';
      const curAlb = albumAgg.get(alb) || { artist: a, plays: 0, seconds: 0 };
      albumAgg.set(alb, {
        artist: curAlb.artist,
        plays: curAlb.plays + plays,
        seconds: curAlb.seconds + effectiveSecs,
      });

      const g = t.genre?.trim() || 'Unspecified';
      const curG = genreAgg.get(g) || { plays: 0, seconds: 0 };
      genreAgg.set(g, { plays: curG.plays + plays, seconds: curG.seconds + effectiveSecs });
    }
  }

  topSongs.sort((a, b) => b.plays - a.plays || b.seconds - a.seconds);

  const topArtists = Array.from(artistAgg.entries())
    .map(([artist, s]) => ({ artist, ...s }))
    .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
    .slice(0, 10);

  const topAlbums = Array.from(albumAgg.entries())
    .map(([album, s]) => ({ album, ...s }))
    .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
    .slice(0, 10);

  const topGenres = Array.from(genreAgg.entries())
    .map(([genre, s]) => ({ genre, ...s }))
    .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
    .slice(0, 10);

  // Daily bars (last 14 days)
  const dailyBars: AnalyticsSummary['dailyBars'] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    dailyBars.push({
      dayKey: key,
      label,
      minutes: Math.round(((daySecondsMap.get(key) || 0) / 60) * 10) / 10,
    });
  }

  // Monthly bars (last 6 months)
  const monthlyBars: AnalyticsSummary['monthlyBars'] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(todayDate.getFullYear(), todayDate.getMonth() - i, 15);
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString([], { month: 'short', year: '2-digit' });
    monthlyBars.push({
      monthKey: key,
      label,
      minutes: Math.round(((monthSecondsMap.get(key) || 0) / 60) * 10) / 10,
    });
  }

  // Ensure referenced trackMap unused lint stays clean
  void trackMap;

  return {
    totalSeconds,
    todaySeconds,
    weekSeconds,
    monthSeconds,
    totalSessions: events.length,
    streakDays,
    topSongs: topSongs.slice(0, 15),
    topArtists,
    topAlbums,
    topGenres,
    dailyBars,
    monthlyBars,
  };
}
