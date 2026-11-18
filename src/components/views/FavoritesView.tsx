import React, { useMemo } from 'react';
import { Heart, Play, Shuffle } from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { TrackList } from '../library/TrackList';

export const FavoritesView: React.FC = () => {
  const tracks = useLibraryStore((s) => s.tracks);
  const favoriteIds = useLibraryStore((s) => s.favoriteIds);
  const searchQuery = useLibraryStore((s) => s.searchQuery);
  const setActiveView = useLibraryStore((s) => s.setActiveView);

  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);

  const favoriteTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tracks.filter((t) => {
      if (!favoriteIds.has(t.id)) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
      );
    });
  }, [tracks, favoriteIds, searchQuery]);

  return (
    <section className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">Favorites</h1>
          <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
            {favoriteTracks.length} {favoriteTracks.length === 1 ? 'track' : 'tracks'}
          </p>
        </div>

        {favoriteTracks.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!shuffle) toggleShuffle();
                const idx = Math.floor(Math.random() * favoriteTracks.length);
                playTrackList(favoriteTracks.map((t) => t.id), idx);
              }}
              className="inline-flex items-center gap-2 min-h-[38px] px-3.5 py-2 rounded-xl border border-white/10 bg-[#111216] text-xs font-medium text-gray-200 hover:bg-white/10"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Shuffle</span>
            </button>
            <button
              type="button"
              onClick={() => playTrackList(favoriteTracks.map((t) => t.id), 0)}
              className="inline-flex items-center gap-2 min-h-[38px] px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Play All</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 pt-2 flex flex-col">
        <TrackList
          tracks={favoriteTracks}
          emptyTitle="No favorite tracks yet"
          emptySubtitle="Tap the heart icon on any track to collect your favorites here."
          emptyAction={
            <button
              type="button"
              onClick={() => setActiveView('songs')}
              className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl border border-white/10 bg-[#111216] text-sm font-medium text-white hover:bg-white/10"
            >
              <Heart className="w-4 h-4 text-red-500" />
              <span>Browse All Songs</span>
            </button>
          }
        />
      </div>
    </section>
  );
};
