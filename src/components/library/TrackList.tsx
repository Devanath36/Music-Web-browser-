import React, { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Edit3,
  Heart,
  ListEnd,
  ListPlus,
  MoreVertical,
  Pause,
  Play,
  SkipForward,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { Track } from '../../types/music';
import { formatDuration } from '../../utils/formatters';
import { ArtworkThumb } from './ArtworkThumb';
import { ConfirmDialog } from './ConfirmDialog';
import { EditMetadataModal } from './EditMetadataModal';
import { PlaylistModal } from './PlaylistModal';

interface TrackListProps {
  tracks: Track[];
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyAction?: React.ReactNode;
  playlistId?: string;
  onRemoveFromPlaylist?: (trackId: string) => void;
}

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  emptyTitle = 'No tracks yet',
  emptySubtitle = 'Import local audio files to build your personal offline music library.',
  emptyAction,
  playlistId,
  onRemoveFromPlaylist,
}) => {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const addToQueueNext = usePlayerStore((s) => s.addToQueueNext);
  const addToQueueEnd = usePlayerStore((s) => s.addToQueueEnd);
  const handleTrackDeleted = usePlayerStore((s) => s.handleTrackDeleted);

  const favoriteIds = useLibraryStore((s) => s.favoriteIds);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const removeTrack = useLibraryStore((s) => s.removeTrack);
  const networkMode = useLibraryStore((s) => s.settings.networkMode);

  const [menuTrackId, setMenuTrackId] = useState<string | null>(null);
  const [playlistModalTrackId, setPlaylistModalTrackId] = useState<string | null>(null);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [confirmDeleteTrack, setConfirmDeleteTrack] = useState<Track | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => internalScrollRef.current,
    estimateSize: () => 64,
    overscan: 10,
  });

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-white/[0.08] rounded-2xl bg-[#0B0C10]/80">
        <p className="font-display text-lg font-semibold text-white">{emptyTitle}</p>
        <p className="mt-1.5 max-w-md text-sm text-gray-400">{emptySubtitle}</p>
        {emptyAction && <div className="mt-5">{emptyAction}</div>}
      </div>
    );
  }

  const allTrackIds = tracks.map((t) => t.id);

  const handleRowPlay = async (index: number, track: Track) => {
    if (track.id === currentTrackId) {
      await togglePlayPause();
    } else {
      await playTrackList(allTrackIds, index);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Desktop Column Header */}
      <div className="hidden md:grid grid-cols-[44px_minmax(0,2fr)_minmax(0,1.2fr)_110px_76px_88px] items-center gap-3 px-4 py-2.5 text-xs font-medium text-gray-500 border-b border-white/[0.07]">
        <span className="text-center font-mono">#</span>
        <span>Title</span>
        <span>Album</span>
        <span>Format</span>
        <span className="text-right">Duration</span>
        <span className="sr-only">Actions</span>
      </div>

      {/* Virtualized Scroll Viewport */}
      <div
        ref={internalScrollRef}
        className="flex-1 overflow-y-auto min-h-[260px] pr-1"
        style={{ contain: 'strict' }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const track = tracks[virtualRow.index];
            const isCurrent = track.id === currentTrackId;
            const isFav = favoriteIds.has(track.id);
            const isRemoteUnavailable = track.sourceType === 'remote' && networkMode === 'offline';
            const isMenuOpen = menuTrackId === track.id;
            const secTag = track.sourceType === 'remote' ? 'WEB' : track.storageSection === 'storage2' ? 'S2' : 'S1';

            return (
              <div
                key={track.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={`group flex md:grid md:grid-cols-[44px_minmax(0,2fr)_minmax(0,1.2fr)_110px_76px_88px] items-center justify-between gap-3 px-3 md:px-4 border-b border-white/[0.04] transition-colors ${
                  isCurrent ? 'bg-red-500/[0.10]' : 'hover:bg-white/[0.03]'
                }`}
              >
                {/* Index / Play button (Desktop) */}
                <button
                  type="button"
                  onClick={() => handleRowPlay(virtualRow.index, track)}
                  aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
                  className="hidden md:flex items-center justify-center w-9 h-9 rounded-lg text-xs font-mono tabular-nums text-gray-400 hover:text-white"
                >
                  {isCurrent && isPlaying ? (
                    <Pause className="w-4 h-4 text-red-500 fill-red-500" />
                  ) : isCurrent ? (
                    <Play className="w-4 h-4 text-red-500 fill-red-500" />
                  ) : (
                    <>
                      <span className="group-hover:hidden">{virtualRow.index + 1}</span>
                      <Play className="w-4 h-4 hidden group-hover:block text-white fill-white" />
                    </>
                  )}
                </button>

                {/* Title + Artwork + Artist */}
                <button
                  type="button"
                  onClick={() => handleRowPlay(virtualRow.index, track)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left py-1.5"
                >
                  <ArtworkThumb
                    artworkId={track.artworkId}
                    alt={track.album || track.title}
                    sizeClass="w-11 h-11"
                    sourceType={track.sourceType}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-sm font-medium truncate ${
                          isCurrent ? 'text-red-400' : 'text-gray-100'
                        }`}
                      >
                        {track.title}
                      </span>
                      {isRemoteUnavailable && (
                        <WifiOff
                          className="w-3.5 h-3.5 text-gray-500 shrink-0"
                          aria-label="Requires Online Mode"
                        />
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {track.artist}
                      <span className="md:hidden">
                        {track.album ? ` · ${track.album}` : ''}
                      </span>
                    </p>
                  </div>
                </button>

                {/* Album (Desktop) */}
                <span className="hidden md:block text-xs text-gray-400 truncate">
                  {track.album}
                </span>

                {/* Format + Storage Partition (Desktop) */}
                <span className="hidden md:block text-xs font-mono text-gray-500 truncate">
                  {track.format} · {secTag}
                </span>

                {/* Duration (Desktop) */}
                <span className="hidden md:block text-right text-xs font-mono tabular-nums text-gray-400">
                  {track.duration > 0 ? formatDuration(track.duration) : '--:--'}
                </span>

                {/* Actions */}
                <div className="relative flex items-center justify-end gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleFavorite(track.id)}
                    aria-label={isFav ? `Remove ${track.title} from favorites` : `Add ${track.title} to favorites`}
                    className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg transition-colors ${
                      isFav
                        ? 'text-red-500 hover:bg-red-500/10'
                        : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isFav ? 'fill-red-500' : ''}`} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setMenuTrackId(isMenuOpen ? null : track.id)}
                    aria-label={`More actions for ${track.title}`}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {isMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setMenuTrackId(null)}
                        aria-hidden="true"
                      />
                      <div className="absolute right-0 top-10 z-40 w-52 rounded-xl border border-white/10 bg-[#14151B] py-1.5 shadow-2xl">
                        <button
                          type="button"
                          onClick={() => {
                            addToQueueNext(track.id);
                            setMenuTrackId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-gray-200 hover:bg-white/5 text-left"
                        >
                          <SkipForward className="w-4 h-4 text-gray-400" />
                          <span>Play Next</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            addToQueueEnd(track.id);
                            setMenuTrackId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-gray-200 hover:bg-white/5 text-left"
                        >
                          <ListEnd className="w-4 h-4 text-gray-400" />
                          <span>Add to Queue</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPlaylistModalTrackId(track.id);
                            setMenuTrackId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-gray-200 hover:bg-white/5 text-left"
                        >
                          <ListPlus className="w-4 h-4 text-gray-400" />
                          <span>Add to Playlist</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTrack(track);
                            setMenuTrackId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-gray-200 hover:bg-white/5 text-left"
                        >
                          <Edit3 className="w-4 h-4 text-gray-400" />
                          <span>Edit Metadata</span>
                        </button>

                        {playlistId && onRemoveFromPlaylist && (
                          <button
                            type="button"
                            onClick={() => {
                              onRemoveFromPlaylist(track.id);
                              setMenuTrackId(null);
                            }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-red-300 hover:bg-white/5 text-left"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Remove from Playlist</span>
                          </button>
                        )}

                        <div className="my-1 border-t border-white/[0.06]" />
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteTrack(track);
                            setMenuTrackId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-red-400 hover:bg-red-500/10 text-left"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete from Device</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PlaylistModal
        open={!!playlistModalTrackId}
        trackId={playlistModalTrackId}
        onClose={() => setPlaylistModalTrackId(null)}
      />

      <EditMetadataModal track={editingTrack} onClose={() => setEditingTrack(null)} />

      <ConfirmDialog
        open={!!confirmDeleteTrack}
        title="Remove Track from Device"
        message={
          confirmDeleteTrack
            ? `Delete "${confirmDeleteTrack.title}" by ${confirmDeleteTrack.artist} from your local IndexedDB library? This frees up local browser storage and cannot be undone.`
            : ''
        }
        confirmLabel="Delete Track"
        onCancel={() => setConfirmDeleteTrack(null)}
        onConfirm={async () => {
          if (confirmDeleteTrack) {
            const id = confirmDeleteTrack.id;
            setConfirmDeleteTrack(null);
            handleTrackDeleted(id);
            await removeTrack(id);
          }
        }}
      />
    </div>
  );
};
