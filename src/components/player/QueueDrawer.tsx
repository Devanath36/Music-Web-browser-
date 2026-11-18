import React, { useMemo } from 'react';
import { ListMusic, ListOrdered, Repeat, Repeat1, Shuffle, Sparkles, Trash2, X } from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { formatDuration } from '../../utils/formatters';
import { ArtworkThumb } from '../library/ArtworkThumb';

export const QueueDrawer: React.FC = () => {
  const isQueueOpen = usePlayerStore((s) => s.isQueueOpen);
  const setQueueOpen = usePlayerStore((s) => s.setQueueOpen);
  const queueTrackIds = usePlayerStore((s) => s.queueTrackIds);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const smartShuffle = usePlayerStore((s) => s.smartShuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const setPlaybackOrder = usePlayerStore((s) => s.setPlaybackOrder);
  const jumpToQueueIndex = usePlayerStore((s) => s.jumpToQueueIndex);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const clearQueue = usePlayerStore((s) => s.clearQueue);

  const tracks = useLibraryStore((s) => s.tracks);

  const trackMap = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  const activeOrderMode = smartShuffle
    ? 'smart_shuffle'
    : shuffle
      ? 'shuffle'
      : repeat === 'one'
        ? 'repeat_one'
        : repeat === 'all'
          ? 'repeat_all'
          : 'sequential';

  if (!isQueueOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-white/[0.08] bg-[#0B0C10] shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
        <div className="flex items-center gap-2.5">
          <ListMusic className="w-5 h-5 text-red-500" />
          <div>
            <h2 className="font-display text-base font-semibold text-white">Playback Queue</h2>
            <p className="text-xs text-gray-500 tabular-nums">
              {queueTrackIds.length} {queueTrackIds.length === 1 ? 'track' : 'tracks'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {queueTrackIds.length > 0 && (
            <button
              type="button"
              onClick={clearQueue}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-red-400 hover:bg-white/5"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setQueueOpen(false)}
            aria-label="Close queue"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-white/[0.06] grid grid-cols-5 gap-1 bg-[#050507]/70">
        <button
          type="button"
          onClick={() => setPlaybackOrder('sequential')}
          className={`inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
            activeOrderMode === 'sequential'
              ? 'bg-white/10 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <ListOrdered className="w-3 h-3" />
          <span>Seq</span>
        </button>
        <button
          type="button"
          onClick={() => setPlaybackOrder('shuffle')}
          className={`inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
            activeOrderMode === 'shuffle'
              ? 'bg-red-600/20 text-red-300'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Shuffle className="w-3 h-3" />
          <span>Shuf</span>
        </button>
        <button
          type="button"
          onClick={() => setPlaybackOrder('smart_shuffle')}
          className={`inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
            activeOrderMode === 'smart_shuffle'
              ? 'bg-red-600 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          <span>Smart</span>
        </button>
        <button
          type="button"
          onClick={() => setPlaybackOrder('repeat_all')}
          className={`inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
            activeOrderMode === 'repeat_all'
              ? 'bg-red-600/20 text-red-300'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Repeat className="w-3 h-3" />
          <span>All</span>
        </button>
        <button
          type="button"
          onClick={() => setPlaybackOrder('repeat_one')}
          className={`inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
            activeOrderMode === 'repeat_one'
              ? 'bg-red-600/20 text-red-300'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Repeat1 className="w-3 h-3" />
          <span>One</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
        {queueTrackIds.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-gray-300">Queue is empty</p>
            <p className="mt-1 text-xs text-gray-500">Play any song or album to populate your queue.</p>
          </div>
        ) : (
          queueTrackIds.map((id, idx) => {
            const track = trackMap.get(id);
            if (!track) return null;
            const isActive = idx === queueIndex;

            return (
              <div
                key={`${id}-${idx}`}
                className={`flex items-center justify-between gap-2 px-4 py-2.5 ${
                  isActive ? 'bg-red-500/[0.10]' : 'hover:bg-white/[0.03]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => jumpToQueueIndex(idx)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left"
                >
                  <span
                    className={`w-5 text-center text-xs font-mono tabular-nums ${
                      isActive ? 'text-red-400 font-semibold' : 'text-gray-500'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <ArtworkThumb
                    artworkId={track.artworkId}
                    alt={track.title}
                    sizeClass="w-9 h-9"
                    sourceType={track.sourceType}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-medium truncate ${
                        isActive ? 'text-red-400' : 'text-gray-100'
                      }`}
                    >
                      {track.title}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {track.artist} · {track.duration > 0 ? formatDuration(track.duration) : '--:--'}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => removeFromQueue(idx)}
                  aria-label={`Remove ${track.title} from queue`}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-white/5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
