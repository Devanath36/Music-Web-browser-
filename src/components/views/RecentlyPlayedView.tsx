import React, { useMemo } from 'react';
import { Clock, Play, Trash2 } from 'lucide-react';
import { sonoraDb } from '../../db/sonoraDb';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { Track } from '../../types/music';
import { formatDuration, formatRelativeDate } from '../../utils/formatters';
import { ArtworkThumb } from '../library/ArtworkThumb';

export const RecentlyPlayedView: React.FC = () => {
  const tracks = useLibraryStore((s) => s.tracks);
  const recentlyPlayed = useLibraryStore((s) => s.recentlyPlayed);
  const refreshLibrary = useLibraryStore((s) => s.refreshLibrary);

  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const playTrackList = usePlayerStore((s) => s.playTrackList);

  const trackMap = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  const historyItems = useMemo(() => {
    const items: { id: number; track: Track; playedAt: number }[] = [];
    for (const entry of recentlyPlayed) {
      const track = trackMap.get(entry.trackId);
      if (track && entry.id !== undefined) {
        items.push({ id: entry.id, track, playedAt: entry.playedAt });
      }
    }
    return items;
  }, [recentlyPlayed, trackMap]);

  const uniqueRecentTrackIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const item of historyItems) {
      if (!seen.has(item.track.id)) {
        seen.add(item.track.id);
        ids.push(item.track.id);
      }
    }
    return ids;
  }, [historyItems]);

  const handleClearHistory = async () => {
    await sonoraDb.recentlyPlayed.clear();
    await refreshLibrary();
  };

  return (
    <section className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            Recently Played
          </h1>
          <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
            {historyItems.length} {historyItems.length === 1 ? 'play event' : 'play events'} logged locally
          </p>
        </div>

        {historyItems.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClearHistory}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-300 hover:text-red-400 hover:bg-white/5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
            <button
              type="button"
              onClick={() => playTrackList(uniqueRecentTrackIds, 0)}
              className="inline-flex items-center gap-2 min-h-[38px] px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Play Recent</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pt-3">
        {historyItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-white/[0.08] rounded-2xl bg-[#0B0C10]/80">
            <Clock className="w-10 h-10 text-gray-500 mb-3" />
            <p className="font-display text-lg font-semibold text-white">No listening history yet</p>
            <p className="mt-1.5 max-w-md text-sm text-gray-400">
              Tracks you play appear here with timestamps, persisted offline on this device.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {historyItems.map((item) => {
              const isCurrent = item.track.id === currentTrackId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    const idx = uniqueRecentTrackIds.indexOf(item.track.id);
                    playTrackList(uniqueRecentTrackIds, Math.max(0, idx));
                  }}
                  className={`w-full flex items-center justify-between gap-4 px-3 py-3 text-left transition-colors ${
                    isCurrent ? 'bg-red-500/[0.09]' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <ArtworkThumb
                      artworkId={item.track.artworkId}
                      alt={item.track.title}
                      sizeClass="w-11 h-11"
                      sourceType={item.track.sourceType}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-medium truncate ${
                          isCurrent ? 'text-red-400' : 'text-white'
                        }`}
                      >
                        {item.track.title}
                      </p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {item.track.artist} · {item.track.album}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400">{formatRelativeDate(item.playedAt)}</p>
                    <p className="text-[11px] font-mono tabular-nums text-gray-500 mt-0.5">
                      {item.track.duration > 0 ? formatDuration(item.track.duration) : '--:--'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
