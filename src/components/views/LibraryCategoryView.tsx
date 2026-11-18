import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Disc3,
  Download,
  Folder,
  Play,
  Radio,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { Track } from '../../types/music';
import { formatBytes, formatDuration } from '../../utils/formatters';
import { TrackList } from '../library/TrackList';

interface LibraryCategoryViewProps {
  mode: 'genres' | 'folders' | 'most_played' | 'dj_mixes';
}

export const LibraryCategoryView: React.FC<LibraryCategoryViewProps> = ({ mode }) => {
  const tracks = useLibraryStore((s) => s.tracks);
  const djMixes = useLibraryStore((s) => s.djMixes);
  const deleteDjMix = useLibraryStore((s) => s.deleteDjMix);
  const playTrackList = usePlayerStore((s) => s.playTrackList);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mixUrls, setMixUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelectedKey(null);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'dj_mixes') return;
    const urls: Record<string, string> = {};
    for (const mix of djMixes) {
      urls[mix.id] = URL.createObjectURL(mix.blob);
    }
    setMixUrls(urls);
    return () => {
      for (const u of Object.values(urls)) URL.revokeObjectURL(u);
    };
  }, [djMixes, mode]);

  const grouped = useMemo(() => {
    if (mode === 'genres') {
      const map = new Map<string, Track[]>();
      for (const t of tracks) {
        const g = t.genre?.trim() || 'Unspecified Genre';
        const list = map.get(g) || [];
        list.push(t);
        map.set(g, list);
      }
      return Array.from(map.entries())
        .map(([key, items]) => ({ key, items }))
        .sort((a, b) => b.items.length - a.items.length);
    }

    if (mode === 'folders') {
      const map = new Map<string, Track[]>();
      for (const t of tracks) {
        let folder = 'Root Imports';
        if (t.folderPath && t.folderPath.includes('/')) {
          const parts = t.folderPath.split('/');
          parts.pop();
          folder = parts.join('/') || 'Root Imports';
        }
        const list = map.get(folder) || [];
        list.push(t);
        map.set(folder, list);
      }
      return Array.from(map.entries())
        .map(([key, items]) => ({ key, items }))
        .sort((a, b) => a.key.localeCompare(b.key));
    }

    return [];
  }, [mode, tracks]);

  const mostPlayedTracks = useMemo(() => {
    return [...tracks]
      .filter((t) => (t.playCount || 0) > 0)
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
  }, [tracks]);

  if (mode === 'most_played') {
    return (
      <section className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
          <div>
            <h1 className="font-display text-2xl font-bold text-white tracking-tight">
              Most Played
            </h1>
            <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
              {mostPlayedTracks.length} {mostPlayedTracks.length === 1 ? 'track' : 'tracks'} ranked by play count
            </p>
          </div>
          {mostPlayedTracks.length > 0 && (
            <button
              type="button"
              onClick={() => playTrackList(mostPlayedTracks.map((t) => t.id), 0)}
              className="inline-flex items-center gap-2 min-h-[38px] px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Play Top Songs</span>
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 pt-2 flex flex-col">
          <TrackList
            tracks={mostPlayedTracks}
            emptyTitle="No play history yet"
            emptySubtitle="Listen to songs in your library to populate your Most Played ranking."
          />
        </div>
      </section>
    );
  }

  if (mode === 'dj_mixes') {
    return (
      <section className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
          <div>
            <h1 className="font-display text-2xl font-bold text-white tracking-tight">
              Saved DJ Mixes
            </h1>
            <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
              {djMixes.length} {djMixes.length === 1 ? 'recorded mix' : 'recorded mixes'} stored offline
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pt-4 space-y-3">
          {djMixes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-white/[0.08] rounded-2xl bg-[#0B0C10]/80">
              <Radio className="w-10 h-10 text-gray-600 mb-3" />
              <p className="font-display text-lg font-semibold text-white">No saved DJ mixes</p>
              <p className="mt-1.5 max-w-md text-sm text-gray-400">
                Record a live mix in DJ Studio and click Save Mix to store it here permanently for offline playback and export.
              </p>
            </div>
          ) : (
            djMixes.map((mix) => {
              const url = mixUrls[mix.id];
              const ext = mix.mimeType.includes('mp4')
                ? 'm4a'
                : mix.mimeType.includes('ogg')
                  ? 'ogg'
                  : 'webm';
              return (
                <div
                  key={mix.id}
                  className="rounded-2xl border border-white/[0.08] bg-[#111216] p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{mix.title}</h3>
                      <p className="text-xs font-mono text-gray-400 tabular-nums mt-0.5">
                        {formatDuration(mix.durationSec)} · {formatBytes(mix.byteSize)} ·{' '}
                        {new Date(mix.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {url && (
                        <a
                          href={url}
                          download={`${mix.title.replace(/\s+/g, '_')}.${ext}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600/20 border border-red-500/40 text-xs font-semibold text-red-200 hover:bg-red-600/35"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteDjMix(mix.id)}
                        aria-label={`Delete ${mix.title}`}
                        className="p-2 rounded-xl border border-white/10 text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {url && <audio controls src={url} className="w-full h-9" />}
                </div>
              );
            })
          )}
        </div>
      </section>
    );
  }

  // Genres or Folders grouped browser
  const activeGroup = selectedKey
    ? grouped.find((g) => g.key === selectedKey) || null
    : null;

  if (activeGroup) {
    return (
      <section className="flex flex-col flex-1 min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSelectedKey(null)}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/5"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold text-white truncate">
                {activeGroup.key}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
                {activeGroup.items.length} {activeGroup.items.length === 1 ? 'track' : 'tracks'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => playTrackList(activeGroup.items.map((t) => t.id), 0)}
            className="inline-flex items-center gap-2 min-h-[38px] px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Play All</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 pt-2 flex flex-col">
          <TrackList tracks={activeGroup.items} />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            {mode === 'genres' ? 'Genres' : 'Folders'}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
            {grouped.length} {mode === 'genres' ? 'genres' : 'folder groups'}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-4">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-white/[0.08] rounded-2xl bg-[#0B0C10]/80">
            {mode === 'genres' ? (
              <Disc3 className="w-10 h-10 text-gray-600 mb-3" />
            ) : (
              <Folder className="w-10 h-10 text-gray-600 mb-3" />
            )}
            <p className="font-display text-lg font-semibold text-white">
              No {mode === 'genres' ? 'genres' : 'folders'} indexed yet
            </p>
            <p className="mt-1.5 max-w-md text-sm text-gray-400">
              Import songs or folders to organize your library cleanly by {mode}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {grouped.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setSelectedKey(g.key)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-[#111216] p-4 text-left hover:border-red-500/35 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center text-red-400 shrink-0">
                    {mode === 'genres' ? (
                      <Sparkles className="w-4 h-4" />
                    ) : (
                      <Folder className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate group-hover:text-red-400">
                      {g.key}
                    </p>
                    <p className="text-xs text-gray-400 tabular-nums mt-0.5">
                      {g.items.length} {g.items.length === 1 ? 'track' : 'tracks'}
                    </p>
                  </div>
                </div>
                <TrendingUp className="w-4 h-4 text-gray-600 group-hover:text-red-400 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
