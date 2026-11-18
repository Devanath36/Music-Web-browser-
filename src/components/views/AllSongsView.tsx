import React, { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ListOrdered,
  Play,
  Plus,
  Radio,
  Repeat,
  Repeat1,
  Shuffle,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { SortDirection, SortField } from '../../types/music';
import { sortTracks } from '../../utils/trackSort';
import { OnlineStreamModal } from '../library/OnlineStreamModal';
import { TrackList } from '../library/TrackList';

type SortPresetId =
  | 'az'
  | 'za'
  | 'addedAt'
  | 'lastPlayedAt'
  | 'playCount'
  | 'artist'
  | 'album'
  | 'duration'
  | 'fileSize';

const SORT_PRESETS: {
  id: SortPresetId;
  label: string;
  field: SortField;
  defaultDir: SortDirection;
  fixedDir?: SortDirection;
}[] = [
  { id: 'az', label: 'A to Z', field: 'title', defaultDir: 'asc', fixedDir: 'asc' },
  { id: 'za', label: 'Z to A', field: 'title', defaultDir: 'desc', fixedDir: 'desc' },
  { id: 'addedAt', label: 'Recently Added', field: 'addedAt', defaultDir: 'desc' },
  { id: 'lastPlayedAt', label: 'Recently Played', field: 'lastPlayedAt', defaultDir: 'desc' },
  { id: 'playCount', label: 'Most Played', field: 'playCount', defaultDir: 'desc' },
  { id: 'artist', label: 'Artist Name', field: 'artist', defaultDir: 'asc' },
  { id: 'album', label: 'Album Name', field: 'album', defaultDir: 'asc' },
  { id: 'duration', label: 'Duration', field: 'duration', defaultDir: 'desc' },
  { id: 'fileSize', label: 'File Size', field: 'fileSize', defaultDir: 'desc' },
];

export const AllSongsView: React.FC = () => {
  const tracks = useLibraryStore((s) => s.tracks);
  const searchQuery = useLibraryStore((s) => s.searchQuery);
  const settings = useLibraryStore((s) => s.settings);
  const setSort = useLibraryStore((s) => s.setSort);
  const setActiveView = useLibraryStore((s) => s.setActiveView);

  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const smartShuffle = usePlayerStore((s) => s.smartShuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const setPlaybackOrder = usePlayerStore((s) => s.setPlaybackOrder);

  const [showStreamModal, setShowStreamModal] = useState(false);

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = q
      ? tracks.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.artist.toLowerCase().includes(q) ||
            t.album.toLowerCase().includes(q) ||
            t.genre.toLowerCase().includes(q)
        )
      : tracks;

    return sortTracks(list, settings.sortBy, settings.sortDir);
  }, [tracks, searchQuery, settings.sortBy, settings.sortDir]);

  const activePresetId: SortPresetId = useMemo(() => {
    if (settings.sortBy === 'title') {
      return settings.sortDir === 'desc' ? 'za' : 'az';
    }
    return settings.sortBy;
  }, [settings.sortBy, settings.sortDir]);

  const handleSortPresetClick = (preset: (typeof SORT_PRESETS)[number]) => {
    if (preset.fixedDir) {
      void setSort(preset.field, preset.fixedDir);
      return;
    }
    if (settings.sortBy === preset.field) {
      void setSort(preset.field, settings.sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      void setSort(preset.field, preset.defaultDir);
    }
  };

  const handlePlayAll = async () => {
    if (filteredAndSorted.length === 0) return;
    await playTrackList(filteredAndSorted.map((t) => t.id), 0);
  };

  const handleShuffleAll = async () => {
    if (filteredAndSorted.length === 0) return;
    if (!shuffle) setPlaybackOrder('shuffle');
    const randomIdx = Math.floor(Math.random() * filteredAndSorted.length);
    await playTrackList(filteredAndSorted.map((t) => t.id), randomIdx);
  };

  const playbackOrderMode = smartShuffle
    ? 'smart_shuffle'
    : shuffle
      ? 'shuffle'
      : repeat === 'one'
        ? 'repeat_one'
        : repeat === 'all'
          ? 'repeat_all'
          : 'sequential';

  return (
    <section className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">All Songs</h1>
          <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
            {filteredAndSorted.length} {filteredAndSorted.length === 1 ? 'track' : 'tracks'}
            {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ' across Storage 1 & 2'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Playback Order Controls */}
          <div
            role="group"
            aria-label="Playback order mode"
            className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#111216] p-1"
          >
            <button
              type="button"
              onClick={() => setPlaybackOrder('sequential')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                playbackOrderMode === 'sequential'
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5 text-red-400" />
              <span>Sequential</span>
            </button>
            <button
              type="button"
              onClick={() => setPlaybackOrder('shuffle')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                playbackOrderMode === 'shuffle'
                  ? 'bg-red-600/20 text-red-300'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Shuffle</span>
            </button>
            <button
              type="button"
              onClick={() => setPlaybackOrder('smart_shuffle')}
              title="Prioritizes less-frequently heard tracks matching your preferred genres and artists"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                playbackOrderMode === 'smart_shuffle'
                  ? 'bg-red-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Smart Shuffle</span>
            </button>
            <button
              type="button"
              onClick={() => setPlaybackOrder('repeat_all')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                playbackOrderMode === 'repeat_all'
                  ? 'bg-red-600/20 text-red-300'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>Repeat All</span>
            </button>
            <button
              type="button"
              onClick={() => setPlaybackOrder('repeat_one')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                playbackOrderMode === 'repeat_one'
                  ? 'bg-red-600/20 text-red-300'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Repeat1 className="w-3.5 h-3.5" />
              <span>Repeat One</span>
            </button>
          </div>

          {settings.networkMode === 'online' && (
            <button
              type="button"
              onClick={() => setShowStreamModal(true)}
              className="inline-flex items-center gap-2 min-h-[38px] px-3.5 py-2 rounded-xl border border-white/10 bg-[#111216] text-xs font-medium text-gray-200 hover:bg-white/10 transition-colors whitespace-nowrap"
            >
              <Radio className="w-3.5 h-3.5 text-red-400" />
              <span>Add Stream</span>
            </button>
          )}

          {filteredAndSorted.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleShuffleAll}
                className="inline-flex items-center gap-2 min-h-[38px] px-3.5 py-2 rounded-xl border border-white/10 bg-[#111216] text-xs font-medium text-gray-200 hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Shuffle Play</span>
              </button>
              <button
                type="button"
                onClick={handlePlayAll}
                className="inline-flex items-center gap-2 min-h-[38px] px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500 transition-colors whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play All</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Comprehensive Library Sort Bar (never alters active playback queue) */}
      <div className="flex flex-wrap items-center gap-1.5 py-2.5 border-b border-white/[0.05]">
        <span className="text-[11px] font-medium text-gray-500 mr-1 whitespace-nowrap">
          Sort by:
        </span>
        {SORT_PRESETS.map((preset) => {
          const active = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSortPresetClick(preset)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-white/12 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <span>{preset.label}</span>
              {active && !preset.fixedDir && (
                <ArrowDownUp className="w-3 h-3 text-red-400" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 pt-1 flex flex-col">
        <TrackList
          tracks={filteredAndSorted}
          emptyTitle={searchQuery ? 'No matching tracks' : 'Your library is empty'}
          emptySubtitle={
            searchQuery
              ? 'Try another search term or clear your filter.'
              : 'Import MP3, FLAC, M4A, AAC, WAV, or OGG files from this device to listen anytime offline.'
          }
          emptyAction={
            !searchQuery ? (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveView('import')}
                  className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-500 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>Import Music</span>
                </button>
                {settings.networkMode === 'online' && (
                  <button
                    type="button"
                    onClick={() => setShowStreamModal(true)}
                    className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl border border-white/10 bg-[#111216] text-sm font-medium text-gray-200 hover:bg-white/10 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Online Stream</span>
                  </button>
                )}
              </div>
            ) : undefined
          }
        />
      </div>

      <OnlineStreamModal open={showStreamModal} onClose={() => setShowStreamModal(false)} />
    </section>
  );
};
