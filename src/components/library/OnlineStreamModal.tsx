import React, { useState } from 'react';
import { Plus, Radio, X } from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';

interface OnlineStreamModalProps {
  open: boolean;
  onClose: () => void;
}

export const OnlineStreamModal: React.FC<OnlineStreamModalProps> = ({ open, onClose }) => {
  const addRemoteStreamTrack = useLibraryStore((s) => s.addRemoteStreamTrack);
  const setNetworkMode = useLibraryStore((s) => s.setNetworkMode);
  const networkMode = useLibraryStore((s) => s.settings.networkMode);

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedUrl = streamUrl.trim();

    try {
      const parsed = new URL(trimmedUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('URL must start with https:// or http://');
      }
    } catch {
      setError('Enter a valid audio stream URL starting with https:// or http://');
      return;
    }

    setSaving(true);
    try {
      await addRemoteStreamTrack({
        title: title.trim() || 'Online Audio Stream',
        artist: artist.trim() || 'Remote Source',
        streamUrl: trimmedUrl,
      });
      if (networkMode === 'offline') {
        await setNetworkMode('online');
      }
      setTitle('');
      setArtist('');
      setStreamUrl('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save stream URL.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="online-stream-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111216] p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Radio className="w-5 h-5 text-red-400" />
            <h3 id="online-stream-title" className="font-display text-lg font-semibold text-white">
              Add Online Audio Stream
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-2 text-xs text-gray-400 leading-relaxed">
          Connect a direct HTTPS audio file URL, personal server stream (e.g. Navidrome / WebDAV), or internet radio stream. Played only in Online Mode.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label htmlFor="stream-url" className="block text-xs font-medium text-gray-300 mb-1.5">
              Stream or Audio URL
            </label>
            <input
              id="stream-url"
              type="url"
              required
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              placeholder="https://example.com/audio/stream.mp3"
              className="w-full min-h-[44px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500 font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="stream-title" className="block text-xs font-medium text-gray-300 mb-1.5">
                Title
              </label>
              <input
                id="stream-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Station or Track Name"
                className="w-full min-h-[44px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label htmlFor="stream-artist" className="block text-xs font-medium text-gray-300 mb-1.5">
                Artist / Source
              </label>
              <input
                id="stream-artist"
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Radio / Personal Server"
                className="w-full min-h-[44px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {error && <p className="text-xs font-medium text-red-400">{error}</p>}

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
              <Plus className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Add Stream'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
