import React, { useEffect, useState } from 'react';
import { ImagePlus, Plus, RotateCcw, Save, Star, Trash2, X } from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import type { Track } from '../../types/music';
import { ArtworkThumb } from './ArtworkThumb';

interface EditMetadataModalProps {
  track: Track | null;
  onClose: () => void;
}

export const EditMetadataModal: React.FC<EditMetadataModalProps> = ({ track, onClose }) => {
  const editTrackMetadata = useLibraryStore((s) => s.editTrackMetadata);
  const undoTrackMetadata = useLibraryStore((s) => s.undoTrackMetadata);

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [albumArtist, setAlbumArtist] = useState('');
  const [genre, setGenre] = useState('');
  const [composer, setComposer] = useState('');
  const [year, setYear] = useState('');
  const [trackNumber, setTrackNumber] = useState('');
  const [discNumber, setDiscNumber] = useState('');
  const [rating, setRating] = useState<number>(0);
  const [customTags, setCustomTags] = useState<Array<{ key: string; value: string }>>([]);
  const [newTagKey, setNewTagKey] = useState('');
  const [newTagValue, setNewTagValue] = useState('');
  const [artworkFile, setArtworkFile] = useState<{ blob: Blob; mimeType: string; previewUrl: string } | null>(
    null
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!track) return;
    setTitle(track.title);
    setArtist(track.artist);
    setAlbum(track.album);
    setAlbumArtist(track.albumArtist);
    setGenre(track.genre || '');
    setComposer(track.composer || '');
    setYear(track.year ? String(track.year) : '');
    setTrackNumber(track.trackNumber ? String(track.trackNumber) : '');
    setDiscNumber(track.discNumber ? String(track.discNumber) : '');
    setRating(track.rating ?? 0);
    setCustomTags(
      Object.entries(track.customTags || {}).map(([key, value]) => ({ key, value }))
    );
    setArtworkFile(null);
  }, [track]);

  useEffect(() => {
    return () => {
      if (artworkFile?.previewUrl) {
        URL.revokeObjectURL(artworkFile.previewUrl);
      }
    };
  }, [artworkFile]);

  if (!track) return null;

  const handleArtworkSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (artworkFile?.previewUrl) {
      URL.revokeObjectURL(artworkFile.previewUrl);
    }
    setArtworkFile({
      blob: file,
      mimeType: file.type || 'image/jpeg',
      previewUrl: URL.createObjectURL(file),
    });
  };

  const handleAddCustomTag = () => {
    const k = newTagKey.trim();
    const v = newTagValue.trim();
    if (!k) return;
    setCustomTags((prev) => {
      const filtered = prev.filter((item) => item.key.toLowerCase() !== k.toLowerCase());
      return [...filtered, { key: k, value: v }];
    });
    setNewTagKey('');
    setNewTagValue('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const parsedYear = year.trim() ? parseInt(year.trim(), 10) : null;
      const parsedNum = trackNumber.trim() ? parseInt(trackNumber.trim(), 10) : null;
      const parsedDisc = discNumber.trim() ? parseInt(discNumber.trim(), 10) : null;
      const customTagsObj: Record<string, string> = {};
      for (const pair of customTags) {
        if (pair.key.trim()) customTagsObj[pair.key.trim()] = pair.value.trim();
      }

      await editTrackMetadata(track.id, {
        title,
        artist,
        album,
        albumArtist,
        genre,
        composer,
        year: parsedYear && Number.isFinite(parsedYear) ? parsedYear : null,
        trackNumber: parsedNum && Number.isFinite(parsedNum) ? parsedNum : null,
        discNumber: parsedDisc && Number.isFinite(parsedDisc) ? parsedDisc : null,
        rating: rating > 0 ? rating : null,
        customTags: customTagsObj,
        artworkFile: artworkFile
          ? { blob: artworkFile.blob, mimeType: artworkFile.mimeType }
          : undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    setSaving(true);
    try {
      const ok = await undoTrackMetadata(track.id);
      if (ok) onClose();
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
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#111216] p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 id="edit-meta-title" className="font-display text-lg font-semibold text-white">
              Edit Track Metadata
            </h3>
            <p className="mt-0.5 text-xs font-mono text-gray-500 truncate max-w-md">
              {track.fileName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close metadata editor"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-2 text-[11px] text-gray-400 border border-white/[0.06] bg-[#0B0C10] rounded-lg px-3 py-2">
          Edits update SONORA&apos;s offline IndexedDB catalog and cover cache immediately without altering the original source audio file bytes on your device.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="flex flex-col items-center gap-2 shrink-0">
              {artworkFile ? (
                <img
                  src={artworkFile.previewUrl}
                  alt="New cover preview"
                  className="w-24 h-24 rounded-xl object-cover border border-white/10"
                />
              ) : (
                <ArtworkThumb
                  artworkId={track.artworkId}
                  alt={track.album}
                  sizeClass="w-24 h-24"
                  roundedClass="rounded-xl"
                />
              )}
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs text-gray-200">
                <ImagePlus className="w-3.5 h-3.5 text-red-400" />
                <span>Replace Cover</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleArtworkSelect}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex-1 w-full space-y-3">
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
                  className="w-full min-h-[40px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm text-white focus:outline-none focus:border-red-500"
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
                    className="w-full min-h-[40px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm text-white focus:outline-none focus:border-red-500"
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
                    className="w-full min-h-[40px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="meta-album-artist" className="block text-xs font-medium text-gray-300 mb-1">
                Album Artist
              </label>
              <input
                id="meta-album-artist"
                type="text"
                value={albumArtist}
                onChange={(e) => setAlbumArtist(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
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
                className="w-full min-h-[40px] rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label htmlFor="meta-composer" className="block text-xs font-medium text-gray-300 mb-1">
                Composer
              </label>
              <input
                id="meta-composer"
                type="text"
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
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
                className="w-full min-h-[40px] rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label htmlFor="meta-track-num" className="block text-xs font-medium text-gray-300 mb-1">
                Track #
              </label>
              <input
                id="meta-track-num"
                type="number"
                min={1}
                max={999}
                value={trackNumber}
                onChange={(e) => setTrackNumber(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label htmlFor="meta-disc-num" className="block text-xs font-medium text-gray-300 mb-1">
                Disc #
              </label>
              <input
                id="meta-disc-num"
                type="number"
                min={1}
                max={99}
                value={discNumber}
                onChange={(e) => setDiscNumber(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <span className="block text-xs font-medium text-gray-300 mb-1.5">Rating</span>
              <div className="flex items-center gap-1 min-h-[40px]">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    aria-label={`Rate ${star} stars`}
                    onClick={() => setRating(rating === star ? 0 : star)}
                    className="p-1 text-gray-500 hover:text-amber-400 transition-colors"
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

          {/* Custom Tags */}
          <div className="rounded-xl border border-white/[0.07] bg-[#0B0C10] p-3 space-y-2.5">
            <span className="block text-xs font-medium text-gray-300">Custom Tags</span>
            {customTags.length > 0 && (
              <div className="space-y-1.5">
                {customTags.map((pair, idx) => (
                  <div key={`${pair.key}-${idx}`} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-gray-400 min-w-[90px] truncate">{pair.key}:</span>
                    <span className="text-gray-100 flex-1 truncate">{pair.value}</span>
                    <button
                      type="button"
                      onClick={() => setCustomTags((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label={`Remove tag ${pair.key}`}
                      className="p-1 text-gray-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <input
                type="text"
                placeholder="Tag key (e.g. Mood)"
                value={newTagKey}
                onChange={(e) => setNewTagKey(e.target.value)}
                className="flex-1 min-w-[120px] rounded-lg border border-white/10 bg-[#050507] px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-red-500"
              />
              <input
                type="text"
                placeholder="Value (e.g. Late Night)"
                value={newTagValue}
                onChange={(e) => setNewTagValue(e.target.value)}
                className="flex-1 min-w-[120px] rounded-lg border border-white/10 bg-[#050507] px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-red-500"
              />
              <button
                type="button"
                onClick={handleAddCustomTag}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] text-xs font-medium text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06]">
            <div>
              {track.previousMetadataSnapshot && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleUndo}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Undo Last Edit</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
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
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
