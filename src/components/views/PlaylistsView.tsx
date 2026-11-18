import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Edit3,
  ListMusic,
  Play,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  generatePlaylistM3U,
  generatePlaylistM3U8,
  generatePlaylistsJson,
  importPlaylistsJsonIntoDb,
  triggerTextDownload,
} from '../../db/exportBackup';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { Playlist, Track } from '../../types/music';
import { ArtworkThumb } from '../library/ArtworkThumb';
import { ConfirmDialog } from '../library/ConfirmDialog';
import { PlaylistModal } from '../library/PlaylistModal';
import { TrackList } from '../library/TrackList';

export const PlaylistsView: React.FC = () => {
  const playlists = useLibraryStore((s) => s.playlists);
  const playlistTracks = useLibraryStore((s) => s.playlistTracks);
  const tracks = useLibraryStore((s) => s.tracks);
  const selectedPlaylistId = useLibraryStore((s) => s.selectedPlaylistId);
  const setSelectedPlaylistId = useLibraryStore((s) => s.setSelectedPlaylistId);
  const renamePlaylist = useLibraryStore((s) => s.renamePlaylist);
  const deletePlaylist = useLibraryStore((s) => s.deletePlaylist);
  const removeTrackFromPlaylist = useLibraryStore((s) => s.removeTrackFromPlaylist);
  const refreshLibrary = useLibraryStore((s) => s.refreshLibrary);

  const playTrackList = usePlayerStore((s) => s.playTrackList);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmDeletePl, setConfirmDeletePl] = useState<Playlist | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [importReport, setImportReport] = useState<{
    message: string;
    missingTracks: string[];
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const trackMap = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  const selectedPlaylist = useMemo(
    () => playlists.find((p) => p.id === selectedPlaylistId) || null,
    [playlists, selectedPlaylistId]
  );

  const selectedTracks = useMemo(() => {
    if (!selectedPlaylist) return [];
    return playlistTracks
      .filter((pt) => pt.playlistId === selectedPlaylist.id)
      .sort((a, b) => a.position - b.position)
      .map((pt) => trackMap.get(pt.trackId))
      .filter((t): t is Track => !!t);
  }, [selectedPlaylist, playlistTracks, trackMap]);

  const handleImportJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const res = await importPlaylistsJsonIntoDb(text);
      await refreshLibrary();
      setImportReport({
        message: `Imported ${res.importedPlaylists} playlist(s) with ${res.matchedTracks} matched track(s).`,
        missingTracks: res.missingTracks,
      });
    } catch (err) {
      setImportReport({
        message: err instanceof Error ? err.message : 'Failed to import playlist JSON file.',
        missingTracks: [],
      });
    }
  };

  if (selectedPlaylist) {
    return (
      <section className="flex flex-col flex-1 min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSelectedPlaylistId(null)}
              aria-label="Back to playlists"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/5"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              {editingId === selectedPlaylist.id ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await renamePlaylist(selectedPlaylist.id, editingName);
                    setEditingId(null);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    autoFocus
                    className="rounded-lg border border-red-500 bg-[#050507] px-2.5 py-1 text-lg font-display font-bold text-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1 rounded-lg bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
                  >
                    Save
                  </button>
                </form>
              ) : (
                <h1 className="font-display text-2xl font-bold text-white truncate">
                  {selectedPlaylist.name}
                </h1>
              )}
              <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
                {selectedTracks.length} {selectedTracks.length === 1 ? 'track' : 'tracks'}
                {selectedPlaylist.description ? ` · ${selectedPlaylist.description}` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingId(selectedPlaylist.id);
                setEditingName(selectedPlaylist.name);
              }}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-300 hover:bg-white/5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Rename</span>
            </button>
            {selectedTracks.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const m3u = generatePlaylistM3U(selectedPlaylist.name, selectedTracks);
                    triggerTextDownload(
                      `${selectedPlaylist.name.replace(/[^a-z0-9_-]/gi, '_')}.m3u`,
                      m3u,
                      'audio/x-mpegurl'
                    );
                  }}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-300 hover:bg-white/5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>M3U</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const m3u8 = generatePlaylistM3U8(selectedPlaylist.name, selectedTracks);
                    triggerTextDownload(
                      `${selectedPlaylist.name.replace(/[^a-z0-9_-]/gi, '_')}.m3u8`,
                      m3u8,
                      'application/vnd.apple.mpegurl'
                    );
                  }}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-300 hover:bg-white/5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>M3U8</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const json = generatePlaylistsJson([selectedPlaylist], playlistTracks, tracks);
                    triggerTextDownload(
                      `${selectedPlaylist.name.replace(/[^a-z0-9_-]/gi, '_')}.sonora-playlist.json`,
                      json,
                      'application/json'
                    );
                  }}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-300 hover:bg-white/5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => playTrackList(selectedTracks.map((t) => t.id), 0)}
                  className="inline-flex items-center gap-2 min-h-[38px] px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play Playlist</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 pt-2 flex flex-col">
          <TrackList
            tracks={selectedTracks}
            playlistId={selectedPlaylist.id}
            onRemoveFromPlaylist={(trackId) =>
              removeTrackFromPlaylist(selectedPlaylist.id, trackId)
            }
            emptyTitle="Playlist is empty"
            emptySubtitle="Open the action menu on any song in your library to add tracks to this playlist."
          />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">Playlists</h1>
          <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
            {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportJsonFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-200 hover:bg-white/5 transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import JSON</span>
          </button>

          {playlists.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const json = generatePlaylistsJson(playlists, playlistTracks, tracks);
                triggerTextDownload(
                  `sonora-all-playlists-${new Date().toISOString().slice(0, 10)}.json`,
                  json,
                  'application/json'
                );
              }}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-200 hover:bg-white/5 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export All</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New Playlist</span>
          </button>
        </div>
      </div>

      {importReport && (
        <div className="mt-4 rounded-xl border border-white/10 bg-[#111216] p-3.5 text-xs space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-white">{importReport.message}</p>
            <button
              type="button"
              onClick={() => setImportReport(null)}
              className="text-gray-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
          {importReport.missingTracks.length > 0 && (
            <div className="text-amber-300 space-y-1">
              <p>
                {importReport.missingTracks.length} track(s) not currently in this browser&apos;s local library:
              </p>
              <ul className="list-disc pl-5 text-[11px] text-amber-200/80 max-h-24 overflow-y-auto">
                {importReport.missingTracks.slice(0, 12).map((label, idx) => (
                  <li key={idx}>{label}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto pt-5">
        {playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-white/[0.08] rounded-2xl bg-[#0B0C10]/80">
            <ListMusic className="w-10 h-10 text-gray-500 mb-3" />
            <p className="font-display text-lg font-semibold text-white">No playlists created</p>
            <p className="mt-1.5 max-w-md text-sm text-gray-400">
              Organize your personal music into custom playlists stored offline in IndexedDB.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-5 inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-500"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Playlist</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {playlists.map((pl) => {
              const items = playlistTracks
                .filter((pt) => pt.playlistId === pl.id)
                .sort((a, b) => a.position - b.position)
                .map((pt) => trackMap.get(pt.trackId))
                .filter((t): t is Track => !!t);
              const coverArtworkId = items.find((t) => t.artworkId)?.artworkId || null;

              return (
                <div
                  key={pl.id}
                  className="group flex flex-col rounded-2xl border border-white/[0.07] bg-[#111216] p-4 hover:border-red-500/30 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedPlaylistId(pl.id)}
                    className="flex items-center gap-4 text-left flex-1 min-w-0"
                  >
                    <ArtworkThumb
                      artworkId={coverArtworkId}
                      alt={pl.name}
                      sizeClass="w-16 h-16"
                      roundedClass="rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-base font-semibold text-white truncate group-hover:text-red-400 transition-colors">
                        {pl.name}
                      </h3>
                      <p className="text-xs text-gray-400 mt-1 tabular-nums">
                        {items.length} {items.length === 1 ? 'track' : 'tracks'}
                      </p>
                    </div>
                  </button>

                  <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={items.length === 0}
                      onClick={() => playTrackList(items.map((t) => t.id), 0)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-30"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Play</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeletePl(pl)}
                      aria-label={`Delete playlist ${pl.name}`}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-white/5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PlaylistModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />

      <ConfirmDialog
        open={!!confirmDeletePl}
        title="Delete Playlist"
        message={
          confirmDeletePl
            ? `Delete playlist "${confirmDeletePl.name}"? Your imported audio tracks will stay safe in your library.`
            : ''
        }
        confirmLabel="Delete Playlist"
        onCancel={() => setConfirmDeletePl(null)}
        onConfirm={async () => {
          if (confirmDeletePl) {
            const id = confirmDeletePl.id;
            setConfirmDeletePl(null);
            await deletePlaylist(id);
          }
        }}
      />
    </section>
  );
};
