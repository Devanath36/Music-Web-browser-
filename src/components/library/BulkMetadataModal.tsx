import React, { useState } from 'react';
import { Save, Star, X } from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';

interface BulkMetadataModalProps {
  trackIds: string[];
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const BulkMetadataModal: React.FC<BulkMetadataModalProps> = ({
  trackIds,
  open,
  onClose,
  onSuccess,
}) => {
  const bulkEditTracksMetadata = useLibraryStore((s) => s.bulkEditTracksMetadata);

  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [albumArtist, setAlbumArtist] = useState('');
  const [genre, setGenre] = useState('');
  const [composer, setComposer] = useState('');
  const [year, setYear] = useState('');
  const [rating, setRating] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  if (!open || trackIds.length === 0) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const parsedYear = year.trim() ? parseInt(year.trim(), 10) : undefined;
      await bulkEditTracksMetadata(trackIds, {
        artist: artist.trim() || undefined,
        album: album.trim() || undefined,
        albumArtist: albumArtist.trim() || undefined,
        genre: genre.trim() || undefined,
        composer: composer.trim() || undefined,
        year: parsedYear && Number.isFinite(parsedYear) ? parsedYear : undefined,
        rating: rating > 0 ? rating : undefined,
      });
      onSuccess?.();
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
      aria-labelledby="bulk-meta-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111216] p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 id="bulk-meta-title" className="font-display text-lg font-semibold text-white">
              Bulk Edit Metadata
            </h3>
            <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
              Updating {trackIds.length} selected {trackIds.length === 1 ? 'track' : 'tracks'} (leave blank to preserve existing values)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bulk editor"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Artist</label>
              <input
                type="text"
                placeholder="Keep existing"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Album</label>
              <input
                type="text"
                placeholder="Keep existing"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Album Artist</label>
              <input
                type="text"
                placeholder="Keep existing"
                value={albumArtist}
                onChange={(e) => setAlbumArtist(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Genre</label>
              <input
                type="text"
                placeholder="Keep existing"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Composer</label>
              <input
                type="text"
                placeholder="Keep existing"
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Year</label>
              <input
                type="number"
                placeholder="Keep"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <span className="block text-xs font-medium text-gray-300 mb-1.5">Set Rating</span>
              <div className="flex items-center gap-1 min-h-[40px]">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(rating === star ? 0 : star)}
                    className="p-1 text-gray-500 hover:text-amber-400"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        star <= rating ? 'fill-amber-400 text-amber-400' : ''
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-white/10 text-sm font-medium text-gray-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Applying...' : 'Apply to Selected'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
