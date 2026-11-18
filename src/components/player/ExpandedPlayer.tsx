import React, { useMemo } from 'react';
import {
  ChevronDown,
  Heart,
  ListMusic,
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
import { formatBitrate, formatBytes, formatDuration } from '../../utils/formatters';
import { ArtworkThumb } from '../library/ArtworkThumb';

export const ExpandedPlayer: React.FC = () => {
  const isExpandedOpen = usePlayerStore((s) => s.isExpandedOpen);
  const setExpandedOpen = usePlayerStore((s) => s.setExpandedOpen);
  const setQueueOpen = usePlayerStore((s) => s.setQueueOpen);

  const tracks = useLibraryStore((s) => s.tracks);
  const favoriteIds = useLibraryStore((s) => s.favoriteIds);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);

  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);

  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrevious = usePlayerStore((s) => s.playPrevious);
  const seek = usePlayerStore((s) => s.seek);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);

  const currentTrack = useMemo(
    () => tracks.find((t) => t.id === currentTrackId) || null,
    [tracks, currentTrackId]
  );

  if (!isExpandedOpen || !currentTrack) return null;

  const isFav = favoriteIds.has(currentTrack.id);
  const maxDuration = duration > 0 ? duration : currentTrack.duration || 0;
  const progressPct = maxDuration > 0 ? Math.min(100, (currentTime / maxDuration) * 100) : 0;

  const techSpecs = [
    currentTrack.sourceType === 'remote'
      ? 'Online Stream'
      : currentTrack.storageSection === 'storage2'
        ? 'Storage 2'
        : 'Storage 1',
    currentTrack.format,
    currentTrack.bitrate ? formatBitrate(currentTrack.bitrate) : null,
    currentTrack.sampleRate ? `${(currentTrack.sampleRate / 1000).toFixed(1)} kHz` : null,
    currentTrack.fileSize > 0 ? formatBytes(currentTrack.fileSize) : null,
  ].filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#050507] text-white overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing"
    >
      <div className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-white/[0.06]">
        <button
          type="button"
          onClick={() => setExpandedOpen(false)}
          aria-label="Minimize Now Playing"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-gray-300 hover:text-white hover:bg-white/5"
        >
          <ChevronDown className="w-6 h-6" />
        </button>

        <div className="text-center min-w-0 px-4">
          <p className="text-xs font-medium text-gray-400 truncate">Now Playing</p>
          <p className="text-xs font-medium text-gray-200 truncate">{currentTrack.album}</p>
        </div>

        <button
          type="button"
          onClick={() => {
            setExpandedOpen(false);
            setQueueOpen(true);
          }}
          aria-label="Open queue"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-gray-300 hover:text-white hover:bg-white/5"
        >
          <ListMusic className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-2xl mx-auto w-full gap-8">
        <ArtworkThumb
          artworkId={currentTrack.artworkId}
          alt={currentTrack.album || currentTrack.title}
          sizeClass="w-64 h-64 sm:w-80 sm:h-80 shadow-2xl"
          roundedClass="rounded-2xl"
          sourceType={currentTrack.sourceType}
          iconSizeClass="w-20 h-20"
        />

        <div className="w-full flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white truncate">
              {currentTrack.title}
            </h2>
            <p className="mt-1 text-base text-gray-400 truncate">{currentTrack.artist}</p>
            <p className="mt-2 text-xs font-mono text-gray-500 truncate">
              {techSpecs.join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleFavorite(currentTrack.id)}
            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
              isFav ? 'text-red-500 bg-red-500/15' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Heart className={`w-6 h-6 ${isFav ? 'fill-red-500' : ''}`} />
          </button>
        </div>

        <div className="w-full space-y-2">
          <input
            type="range"
            aria-label="Seek track position"
            min={0}
            max={maxDuration > 0 ? maxDuration : 100}
            step={0.5}
            value={maxDuration > 0 ? Math.min(currentTime, maxDuration) : 0}
            disabled={maxDuration <= 0}
            onChange={(e) => seek(parseFloat(e.target.value))}
            style={{
              background: `linear-gradient(to right, #EF4444 ${progressPct}%, rgba(255,255,255,0.14) ${progressPct}%)`,
            }}
            className="sonora-range w-full h-1.5 rounded-full"
          />
          <div className="flex items-center justify-between text-xs font-mono tabular-nums text-gray-400">
            <span>{formatDuration(currentTime)}</span>
            <span>{maxDuration > 0 ? formatDuration(maxDuration) : '0:00'}</span>
          </div>
        </div>

        <div className="w-full flex items-center justify-between max-w-sm">
          <button
            type="button"
            onClick={toggleShuffle}
            aria-label="Toggle shuffle"
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl ${
              shuffle ? 'text-red-400 bg-red-500/15' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={playPrevious}
            aria-label="Previous track"
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white hover:bg-white/5"
          >
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          <button
            type="button"
            onClick={togglePlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="w-16 h-16 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500 active:scale-95 transition-all shadow-xl"
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current ml-1" />
            )}
          </button>

          <button
            type="button"
            onClick={() => playNext(true)}
            aria-label="Next track"
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white hover:bg-white/5"
          >
            <SkipForward className="w-7 h-7 fill-current" />
          </button>

          <button
            type="button"
            onClick={cycleRepeat}
            aria-label={`Repeat mode: ${repeat}`}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl ${
              repeat !== 'off' ? 'text-red-400 bg-red-500/15' : 'text-gray-400 hover:text-white'
            }`}
          >
            {repeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
          </button>
        </div>

        <div className="w-full max-w-xs flex items-center gap-3">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white"
          >
            {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
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
              background: `linear-gradient(to right, #E5E7EB ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.14) ${(muted ? 0 : volume) * 100}%)`,
            }}
            className="sonora-range flex-1 h-1 rounded-full"
          />
        </div>
      </div>
    </div>
  );
};
