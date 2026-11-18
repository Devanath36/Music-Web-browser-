import React, { useState } from 'react';
import { Check, ListMusic, Plus, X } from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';

interface PlaylistModalProps {
  open: boolean;
  trackId?: string | null;
  onClose: () => void;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({ open, trackId, onClose }) => {
  const playlists = useLibraryStore((s) => s.playlists);
  const playlistTracks = useLibraryStore((s) => s.playlistTracks);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const addTrackToPlaylist = useLibraryStore((s) => s.addTrackToPlaylist);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!open) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const pl = await createPlaylist(trimmed, newDesc);
    setNewName('');
    setNewDesc('');
    if (trackId) {
      await addTrackToPlaylist(pl.id, trackId);
      setFeedback(`Added to "${pl.name}"`);
      setTimeout(() => {
        setFeedback(null);
        onClose();
      }, 650);
    } else {
      onClose();
    }
  };

  const handlePickPlaylist = async (playlistId: string, playlistName: string) => {
    if (!trackId) return;
    const added = await addTrackToPlaylist(playlistId, trackId);
    setFeedback(added ? `Added to "${playlistName}"` : `Already in "${playlistName}"`);
    setTimeout(() => {
      setFeedback(null);
      if (added) onClose();
    }, 650);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="playlist-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111216] p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <h3 id="playlist-modal-title" className="font-display text-lg font-semibold text-white">
            {trackId ? 'Add to Playlist' : 'New Playlist'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close playlist modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {trackId && playlists.length > 0 && (
          <div className="mt-4 max-h-52 overflow-y-auto divide-y divide-white/[0.06] border border-white/[0.08] rounded-xl bg-[#0B0C10]">
            {playlists.map((pl) => {
              const alreadyIn = playlistTracks.some(
                (pt) => pt.playlistId === pl.id && pt.trackId === trackId
              );
              const count = playlistTracks.filter((pt) => pt.playlistId === pl.id).length;
              return (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => handlePickPlaylist(pl.id, pl.name)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors min-h-[48px]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ListMusic className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{pl.name}</p>
                      <p className="text-xs text-gray-500 tabular-nums">
                        {count} {count === 1 ? 'track' : 'tracks'}
                      </p>
                    </div>
                  </div>
                  {alreadyIn && <Check className="w-4 h-4 text-red-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}

        <form onSubmit={handleCreate} className="mt-5 space-y-3">
          <div>
            <label htmlFor="playlist-name-input" className="block text-xs font-medium text-gray-400 mb-1.5">
              {trackId ? 'Or create a new playlist' : 'Playlist name'}
            </label>
            <input
              id="playlist-name-input"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Late Night Vinyl, Studio Mix..."
              required
              className="w-full min-h-[44px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500"
            />
          </div>
          {!trackId && (
            <div>
              <label htmlFor="playlist-desc-input" className="block text-xs font-medium text-gray-400 mb-1.5">
                Description (optional)
              </label>
              <input
                id="playlist-desc-input"
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Notes about this collection"
                className="w-full min-h-[44px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500"
              />
            </div>
          )}

          {feedback && (
            <p className="text-xs font-medium text-red-400">{feedback}</p>
          )}

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-white/10 text-sm font-medium text-gray-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newName.trim()}
              className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
              <span>{trackId ? 'Create & Add' : 'Create Playlist'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
