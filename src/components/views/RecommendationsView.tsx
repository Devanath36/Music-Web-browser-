import React, { useMemo, useState } from 'react';
import {
  ListPlus,
  Play,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import {
  generateTrackRecommendations,
  type RecommendationMood,
} from '../../utils/recommendationEngine';
import { ArtworkThumb } from '../library/ArtworkThumb';

const MOOD_TABS: Array<{ id: RecommendationMood; label: string }> = [
  { id: 'all', label: 'All Picks' },
  { id: 'workout', label: 'Workout' },
  { id: 'chill', label: 'Chill' },
  { id: 'focus', label: 'Focus' },
  { id: 'party', label: 'Party' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'night_drive', label: 'Night Drive' },
];

export const RecommendationsView: React.FC = () => {
  const tracks = useLibraryStore((s) => s.tracks);
  const favoriteIds = useLibraryStore((s) => s.favoriteIds);
  const listeningEvents = useLibraryStore((s) => s.listeningEvents);
  const feedback = useLibraryStore((s) => s.recommendationFeedback);
  const setRecommendationFeedback = useLibraryStore((s) => s.setRecommendationFeedback);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const addTrackToPlaylist = useLibraryStore((s) => s.addTrackToPlaylist);

  const playTrackList = usePlayerStore((s) => s.playTrackList);

  const [mood, setMood] = useState<RecommendationMood>('all');
  const [seedOffset, setSeedOffset] = useState(0);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const feedbackMap = useMemo(
    () => new Map(feedback.map((f) => [f.trackId, f.feedback])),
    [feedback]
  );

  const recs = useMemo(
    () =>
      generateTrackRecommendations({
        tracks,
        favoriteIds,
        listeningEvents,
        feedback,
        mood,
        seedOffset,
        limit: 24,
      }),
    [tracks, favoriteIds, listeningEvents, feedback, mood, seedOffset]
  );

  const handleSaveAsPlaylist = async () => {
    if (recs.length === 0) return;
    const label = MOOD_TABS.find((m) => m.id === mood)?.label || 'Recommended';
    const pl = await createPlaylist(
      `SONORA Picks — ${label}`,
      `Generated offline from your listening patterns (${new Date().toLocaleDateString()})`
    );
    for (const r of recs) {
      await addTrackToPlaylist(pl.id, r.track.id);
    }
    setSavedNotice(`Saved ${recs.length} recommended songs into "${pl.name}".`);
    setTimeout(() => setSavedNotice(null), 4000);
  };

  return (
    <section className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-5 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            For You · Recommendations
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Offline taste engine scoring artist/genre affinity, play balance, favorites, skip avoidance, and feedback
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSeedOffset((v) => v + 1)}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-200 hover:bg-white/5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          {recs.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleSaveAsPlaylist}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-200 hover:bg-white/5"
              >
                <ListPlus className="w-3.5 h-3.5" />
                <span>Save as Playlist</span>
              </button>
              <button
                type="button"
                onClick={() => playTrackList(recs.map((r) => r.track.id), 0)}
                className="inline-flex items-center gap-2 min-h-[38px] px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play All</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mood Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {MOOD_TABS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMood(m.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
              mood === m.id
                ? 'border-red-500/60 bg-red-600/20 text-white'
                : 'border-white/10 bg-[#111216] text-gray-400 hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {savedNotice && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200">
          {savedNotice}
        </div>
      )}

      {tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-white/[0.08] rounded-2xl bg-[#0B0C10]/80">
          <Sparkles className="w-10 h-10 text-gray-600 mb-3" />
          <p className="font-display text-lg font-semibold text-white">Import music to unlock recommendations</p>
          <p className="mt-1.5 max-w-md text-sm text-gray-400">
            SONORA builds tailored mixes completely offline once you add songs to your library.
          </p>
        </div>
      ) : recs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-[#0B0C10]/80 p-10 text-center text-sm text-gray-400">
          No tracks matched the selected mood filter yet. Switch back to All Picks or tag track genres in Metadata Editor.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {recs.map((rec, idx) => {
            const fb = feedbackMap.get(rec.track.id);
            return (
              <div
                key={rec.track.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-[#111216] p-3.5 hover:border-red-500/35 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => playTrackList(recs.map((r) => r.track.id), idx)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left"
                >
                  <ArtworkThumb
                    artworkId={rec.track.artworkId}
                    alt={rec.track.album}
                    sizeClass="w-12 h-12"
                    sourceType={rec.track.sourceType}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">
                        {rec.track.title}
                      </p>
                      <span className="text-[10px] font-mono text-red-400 shrink-0">
                        {rec.category}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{rec.track.artist}</p>
                    <p className="text-[11px] text-gray-500 truncate mt-1">
                      {rec.reasons[0]}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label={`Love ${rec.track.title}`}
                    onClick={() =>
                      setRecommendationFeedback(rec.track.id, fb === 'liked' ? null : 'liked')
                    }
                    className={`p-2 rounded-lg transition-colors ${
                      fb === 'liked'
                        ? 'text-emerald-400 bg-emerald-500/10'
                        : 'text-gray-500 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Hide ${rec.track.title}`}
                    onClick={() =>
                      setRecommendationFeedback(rec.track.id, fb === 'disliked' ? null : 'disliked')
                    }
                    className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <ThumbsDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
