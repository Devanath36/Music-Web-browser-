import React, { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import type { Track } from '../../types/music';

interface EditMetadataModalProps {
  track: Track | null;
  onClose: () => void;
}

export const EditMetadataModal: React.FC<EditMetadataModalProps> = ({ track, onClose }) => {
  const editTrackMetadata = useLibraryStore((s) => s.editTrackMetadata);

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [albumArtist, setAlbumArtist] = useState('');
  const [genre, setGenre] = useState('');
  const [year, setYear] = useState('');
  const [trackNumber, setTrackNumber] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!track) return;
    setTitle(track.title);
    setArtist(track.artist);
    setAlbum(track.album);
    setAlbumArtist(track.albumArtist);
    setGenre(track.genre || '');
    setYear(track.year ? String(track.year) : '');
    setTrackNumber(track.trackNumber ? String(track.trackNumber) : '');
  }, [track]);

  if (!track) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const parsedYear = year.trim() ? parseInt(year.trim(), 10) : null;
      const parsedNum = trackNumber.trim() ? parseInt(trackNumber.trim(), 10) : null;
      await editTrackMetadata(track.id, {
        title,
        artist,
        album,
        albumArtist,
        genre,
        year: parsedYear && Number.isFinite(parsedYear) ? parsedYear : null,
        trackNumber: parsedNum && Number.isFinite(parsedNum) ? parsedNum : null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-meta-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111216] p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <h3 id="edit-meta-title" className="font-display text-lg font-semibold text-white">
            Edit Track Metadata
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close metadata editor"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-1 text-xs font-mono text-gray-500 truncate">{track.fileName}</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label htmlFor="meta-title" className="block text-xs font-medium text-gray-300 mb-1">
              Title
            </label>
            <input
              id="meta-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="meta-artist" className="block text-xs font-medium text-gray-300 mb-1">
                Artist
              </label>
              <input
                id="meta-artist"
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label htmlFor="meta-album" className="block text-xs font-medium text-gray-300 mb-1">
                Album
              </label>
              <input
                id="meta-album"
                type="text"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="meta-album-artist" className="block text-xs font-medium text-gray-300 mb-1">
                Album Artist
              </label>
              <input
                id="meta-album-artist"
                type="text"
                value={albumArtist}
                onChange={(e) => setAlbumArtist(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label htmlFor="meta-genre" className="block text-xs font-medium text-gray-300 mb-1">
                Genre
              </label>
              <input
                id="meta-genre"
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="meta-year" className="block text-xs font-medium text-gray-300 mb-1">
                Year
              </label>
              <input
                id="meta-year"
                type="number"
                min={1900}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label htmlFor="meta-track-num" className="block text-xs font-medium text-gray-300 mb-1">
                Track Number
              </label>
              <input
                id="meta-track-num"
                type="number"
                min={1}
                max={999}
                value={trackNumber}
                onChange={(e) => setTrackNumber(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

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
              disabled={saving}
              className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
