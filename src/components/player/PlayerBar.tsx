import React, { useMemo } from 'react';
import {
  AlertCircle,
  Heart,
  ListMusic,
  Maximize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { formatDuration } from '../../utils/formatters';
import { ArtworkThumb } from '../library/ArtworkThumb';

export const PlayerBar: React.FC = () => {
  const tracks = useLibraryStore((s) => s.tracks);
  const favoriteIds = useLibraryStore((s) => s.favoriteIds);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);

  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const error = usePlayerStore((s) => s.error);
  const isQueueOpen = usePlayerStore((s) => s.isQueueOpen);

  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrevious = usePlayerStore((s) => s.playPrevious);
  const seek = usePlayerStore((s) => s.seek);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const setQueueOpen = usePlayerStore((s) => s.setQueueOpen);
  const setExpandedOpen = usePlayerStore((s) => s.setExpandedOpen);

  const currentTrack = useMemo(
    () => tracks.find((t) => t.id === currentTrackId) || null,
    [tracks, currentTrackId]
  );

  const isFav = currentTrack ? favoriteIds.has(currentTrack.id) : false;
  const maxDuration = duration > 0 ? duration : currentTrack?.duration || 0;
  const progressPct = maxDuration > 0 ? Math.min(100, (currentTime / maxDuration) * 100) : 0;

  return (
    <footer className="relative z-30 border-t border-white/[0.08] bg-[#0B0C10]/95 backdrop-blur-md">
      {error && (
        <div
          role="alert"
          className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium text-red-200 bg-red-500/15 border-b border-red-500/25"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Mobile Compact Mini-Player */}
      <div className="md:hidden">
        <div className="h-[2px] w-full bg-white/[0.08]">
          <div
            className="h-full bg-red-500 transition-[width] duration-150"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <button
            type="button"
            onClick={() => currentTrack && setExpandedOpen(true)}
            disabled={!currentTrack}
            className="flex items-center gap-3 min-w-0 flex-1 text-left"
          >
            <ArtworkThumb
              artworkId={currentTrack?.artworkId}
              alt={currentTrack?.title || 'No track loaded'}
              sizeClass="w-10 h-10"
              sourceType={currentTrack?.sourceType}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">
                {currentTrack ? currentTrack.title : 'Nothing playing'}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {currentTrack ? currentTrack.artist : 'Select a track from your library'}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            {currentTrack && (
              <button
                type="button"
                onClick={() => toggleFavorite(currentTrack.id)}
                aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl ${
                  isFav ? 'text-red-500' : 'text-gray-400'
                }`}
              >
                <Heart className={`w-4 h-4 ${isFav ? 'fill-red-500' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={togglePlayPause}
              disabled={!currentTrack && tracks.length === 0}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-red-600 text-white disabled:opacity-40"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => playNext(true)}
              disabled={!currentTrack}
              aria-label="Next track"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-gray-300 disabled:opacity-30"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Persistent Studio Player Bar */}
      <div className="hidden md:grid grid-cols-[minmax(220px,1fr)_minmax(340px,1.5fr)_minmax(200px,1fr)] items-center gap-6 px-6 h-[84px]">
        <div className="flex items-center gap-3.5 min-w-0">
          <button
            type="button"
            onClick={() => currentTrack && setExpandedOpen(true)}
            disabled={!currentTrack}
            aria-label="Open full player"
            className="group relative shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <ArtworkThumb
              artworkId={currentTrack?.artworkId}
              alt={currentTrack?.title || 'No track loaded'}
              sizeClass="w-13 h-13"
              sourceType={currentTrack?.sourceType}
            />
          </button>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => currentTrack && setExpandedOpen(true)}
              disabled={!currentTrack}
              className="block w-full text-left text-sm font-semibold text-white truncate hover:text-red-400 transition-colors disabled:hover:text-white"
            >
              {currentTrack ? currentTrack.title : 'Ready to Play'}
            </button>
            <p className="text-xs text-gray-400 truncate mt-0.5">
              {currentTrack
                ? `${currentTrack.artist} · ${currentTrack.album}`
                : 'Choose a song or import local music'}
            </p>
          </div>
          {currentTrack && (
            <button
              type="button"
              onClick={() => toggleFavorite(currentTrack.id)}
              aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
              className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg transition-colors shrink-0 ${
                isFav
                  ? 'text-red-500 hover:bg-red-500/10'
                  : 'text-gray-500 hover:text-white hover:bg-white/5'
              }`}
            >
              <Heart className={`w-4 h-4 ${isFav ? 'fill-red-500' : ''}`} />
            </button>
          )}
        </div>

        <div className="flex flex-col items-center gap-1.5 w-full max-w-xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleShuffle}
              aria-label={shuffle ? 'Disable shuffle' : 'Enable shuffle'}
              aria-pressed={shuffle}
              className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg transition-colors ${
                shuffle ? 'text-red-400 bg-red-500/15' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={playPrevious}
              disabled={!currentTrack}
              aria-label="Previous track"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-gray-200 hover:text-white disabled:opacity-30 transition-colors"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            <button
              type="button"
              onClick={togglePlayPause}
              disabled={!currentTrack && tracks.length === 0}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500 active:scale-95 disabled:opacity-40 transition-all shadow-md"
            >
              {isBuffering ? (
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => playNext(true)}
              disabled={!currentTrack}
              aria-label="Next track"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-gray-200 hover:text-white disabled:opacity-30 transition-colors"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            <button
              type="button"
              onClick={cycleRepeat}
              aria-label={`Repeat mode: ${repeat}`}
              className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg transition-colors ${
                repeat !== 'off' ? 'text-red-400 bg-red-500/15' : 'text-gray-400 hover:text-white'
              }`}
            >
              {repeat === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center gap-3 w-full">
            <span className="w-10 text-right text-[11px] font-mono tabular-nums text-gray-400">
              {formatDuration(currentTime)}
            </span>
            <input
              type="range"
              aria-label="Seek playback position"
              min={0}
              max={maxDuration > 0 ? maxDuration : 100}
              step={0.5}
              value={maxDuration > 0 ? Math.min(currentTime, maxDuration) : 0}
              disabled={!currentTrack || maxDuration <= 0}
              onChange={(e) => seek(parseFloat(e.target.value))}
              style={{
                background: `linear-gradient(to right, #EF4444 ${progressPct}%, rgba(255,255,255,0.12) ${progressPct}%)`,
              }}
              className="sonora-range flex-1 h-1 rounded-full disabled:opacity-40"
            />
            <span className="w-10 text-[11px] font-mono tabular-nums text-gray-400">
              {maxDuration > 0 ? formatDuration(maxDuration) : '0:00'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            {muted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-gray-500" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>

          <input
            type="range"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.02}
            value={muted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            style={{
              background: `linear-gradient(to right, #E5E7EB ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.12) ${(muted ? 0 : volume) * 100}%)`,
            }}
            className="sonora-range w-24 h-1 rounded-full"
          />

          <button
            type="button"
            onClick={() => setQueueOpen(!isQueueOpen)}
            aria-label="Toggle playback queue"
            aria-pressed={isQueueOpen}
            className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg transition-colors ${
              isQueueOpen
                ? 'text-red-400 bg-red-500/15'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <ListMusic className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => currentTrack && setExpandedOpen(true)}
            disabled={!currentTrack}
            aria-label="Expand Now Playing view"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </footer>
  );
};
