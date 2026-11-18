import React, { useMemo, useState } from 'react';
import { ArrowDownUp, Play, Plus, Radio, Shuffle, Upload } from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { SortField } from '../../types/music';
import { OnlineStreamModal } from '../library/OnlineStreamModal';
import { TrackList } from '../library/TrackList';

export const AllSongsView: React.FC = () => {
  const tracks = useLibraryStore((s) => s.tracks);
  const searchQuery = useLibraryStore((s) => s.searchQuery);
  const settings = useLibraryStore((s) => s.settings);
  const setSort = useLibraryStore((s) => s.setSort);
  const setActiveView = useLibraryStore((s) => s.setActiveView);

  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);

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
      : [...tracks];

    const dir = settings.sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (settings.sortBy) {
        case 'title':
          return a.title.localeCompare(b.title) * dir;
        case 'artist':
          return a.artist.localeCompare(b.artist) * dir;
        case 'album':
          return a.album.localeCompare(b.album) * dir;
        case 'duration':
          return (a.duration - b.duration) * dir;
        case 'lastPlayedAt':
          return ((a.lastPlayedAt || 0) - (b.lastPlayedAt || 0)) * dir;
        case 'addedAt':
        default:
          return (a.addedAt - b.addedAt) * dir;
      }
    });
    return list;
  }, [tracks, searchQuery, settings.sortBy, settings.sortDir]);

  const handleSortChange = (field: SortField) => {
    if (settings.sortBy === field) {
      setSort(field, settings.sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(field, field === 'addedAt' || field === 'lastPlayedAt' ? 'desc' : 'asc');
    }
  };

  const handlePlayAll = async () => {
    if (filteredAndSorted.length === 0) return;
    await playTrackList(filteredAndSorted.map((t) => t.id), 0);
  };

  const handleShuffleAll = async () => {
    if (filteredAndSorted.length === 0) return;
    if (!shuffle) toggleShuffle();
    const randomIdx = Math.floor(Math.random() * filteredAndSorted.length);
    await playTrackList(filteredAndSorted.map((t) => t.id), randomIdx);
  };

  const sortOptions: { field: SortField; label: string }[] = [
    { field: 'addedAt', label: 'Added' },
    { field: 'title', label: 'Title' },
    { field: 'artist', label: 'Artist' },
    { field: 'album', label: 'Album' },
    { field: 'lastPlayedAt', label: 'Played' },
    { field: 'duration', label: 'Duration' },
  ];

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
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-[#111216] p-1">
            {sortOptions.map(({ field, label }) => {
              const active = settings.sortBy === field;
              return (
                <button
                  key={field}
                  type="button"
                  onClick={() => handleSortChange(field)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    active ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span>{label}</span>
                  {active && <ArrowDownUp className="w-3 h-3 text-red-400" />}
                </button>
              );
            })}
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
                <span>Shuffle</span>
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

      <div className="flex-1 min-h-0 pt-2 flex flex-col">
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
