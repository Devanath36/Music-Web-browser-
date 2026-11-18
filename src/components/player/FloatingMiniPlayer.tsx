import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Maximize2,
  Move,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { formatDuration } from '../../utils/formatters';
import { ArtworkThumb } from '../library/ArtworkThumb';

export const FloatingMiniPlayer: React.FC = () => {
  const isMiniPlayerOpen = usePlayerStore((s) => s.isMiniPlayerOpen);
  const setMiniPlayerOpen = usePlayerStore((s) => s.setMiniPlayerOpen);
  const setExpandedOpen = usePlayerStore((s) => s.setExpandedOpen);
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const muted = usePlayerStore((s) => s.muted);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrevious = usePlayerStore((s) => s.playPrevious);
  const seek = usePlayerStore((s) => s.seek);
  const toggleMute = usePlayerStore((s) => s.toggleMute);

  const tracks = useLibraryStore((s) => s.tracks);
  const currentTrack = useMemo(
    () => tracks.find((t) => t.id === currentTrackId) || null,
    [tracks, currentTrackId]
  );

  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 24, y: 24 };
    return {
      x: Math.max(16, window.innerWidth - 360),
      y: Math.max(16, window.innerHeight - 230),
    };
  });

  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragOffset.current) return;
      const nextX = Math.max(8, Math.min(window.innerWidth - 340, e.clientX - dragOffset.current.dx));
      const nextY = Math.max(8, Math.min(window.innerHeight - 160, e.clientY - dragOffset.current.dy));
      setPos({ x: nextX, y: nextY });
    };
    const onUp = () => {
      dragOffset.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  if (!isMiniPlayerOpen) return null;

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <aside
      aria-label="Floating Mini Player"
      style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` }}
      className="fixed top-0 left-0 z-50 w-[332px] rounded-2xl border border-white/15 bg-[#0C0D12]/95 backdrop-blur-xl shadow-2xl overflow-hidden select-none"
    >
      {/* Drag Handle Header */}
      <div
        onPointerDown={(e) => {
          dragOffset.current = {
            dx: e.clientX - pos.x,
            dy: e.clientY - pos.y,
          };
        }}
        className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.07] bg-white/[0.03] cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400">
          <Move className="w-3.5 h-3.5 text-red-400" />
          <span>SONORA Mini Player</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setMiniPlayerOpen(false);
              setExpandedOpen(true);
            }}
            aria-label="Expand to full player"
            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMiniPlayerOpen(false)}
            aria-label="Close mini player"
            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3.5 space-y-3">
        <div className="flex items-center gap-3 min-w-0">
          <ArtworkThumb
            artworkId={currentTrack?.artworkId || null}
            alt={currentTrack?.title || 'No track'}
            sizeClass="w-12 h-12"
            roundedClass="rounded-xl"
            sourceType={currentTrack?.sourceType}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">
              {currentTrack ? currentTrack.title : 'No Track Active'}
            </p>
            <p className="text-xs text-gray-400 truncate mt-0.5">
              {currentTrack ? currentTrack.artist : 'Select a song to play'}
            </p>
          </div>
        </div>

        {/* Scrubber */}
        <div className="space-y-1">
          <input
            type="range"
            aria-label="Mini player seekbar"
            min={0}
            max={duration > 0 ? duration : 1}
            step={0.5}
            value={Math.min(currentTime, duration > 0 ? duration : 1)}
            disabled={!currentTrack}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="sonora-range w-full h-1.5 rounded-full bg-white/10"
            style={{
              background: `linear-gradient(to right, #dc2626 ${progressPct}%, rgba(255,255,255,0.12) ${progressPct}%)`,
            }}
          />
          <div className="flex justify-between text-[10px] font-mono tabular-nums text-gray-500">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        {/* Transport */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
          >
            {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!currentTrack}
              onClick={() => void playPrevious()}
              aria-label="Previous track"
              className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-40"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={() => void togglePlayPause()}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              disabled={!currentTrack}
              onClick={() => void playNext(true)}
              aria-label="Next track"
              className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-40"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>
          </div>

          <span className="w-8" />
        </div>
      </div>
    </aside>
  );
};
