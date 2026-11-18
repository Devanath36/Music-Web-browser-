import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Edit3,
  Maximize2,
  Minimize2,
  Mic2,
  Save,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import {
  findActiveLyricIndex,
  formatLrcTimestamp,
  parseLyricsText,
  searchSavedLyrics,
} from '../../utils/lrcParser';

export const LyricsView: React.FC = () => {
  const tracks = useLibraryStore((s) => s.tracks);
  const lyricsRecords = useLibraryStore((s) => s.lyricsRecords);
  const saveLyrics = useLibraryStore((s) => s.saveLyrics);
  const deleteLyrics = useLibraryStore((s) => s.deleteLyrics);

  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const seek = usePlayerStore((s) => s.seek);
  const playTrackById = usePlayerStore((s) => s.playTrackById);

  const [selectedTrackId, setSelectedTrackId] = useState<string>(currentTrackId || tracks[0]?.id || '');
  const [editMode, setEditMode] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [karaokeFullScreen, setKaraokeFullScreen] = useState(false);
  const [lyricSearch, setLyricSearch] = useState('');
  const lrcFileInputRef = useRef<HTMLInputElement>(null);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (currentTrackId) {
      setSelectedTrackId(currentTrackId);
    }
  }, [currentTrackId]);

  const targetTrack = useMemo(
    () => tracks.find((t) => t.id === selectedTrackId) || tracks[0] || null,
    [tracks, selectedTrackId]
  );

  const activeRecord = useMemo(
    () => (targetTrack ? lyricsRecords.find((r) => r.trackId === targetTrack.id) || null : null),
    [lyricsRecords, targetTrack]
  );

  useEffect(() => {
    setDraftText(activeRecord?.rawText || '');
  }, [activeRecord, targetTrack?.id]);

  const activeLineIdx = useMemo(() => {
    if (!activeRecord || activeRecord.format !== 'lrc' || currentTrackId !== targetTrack?.id) {
      return -1;
    }
    return findActiveLyricIndex(activeRecord.lines, currentTime);
  }, [activeRecord, currentTrackId, targetTrack?.id, currentTime]);

  useEffect(() => {
    if (activeLineIdx >= 0 && activeLineRef.current && !editMode) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeLineIdx, editMode]);

  const matchedSearchRecords = useMemo(
    () => (lyricSearch.trim() ? searchSavedLyrics(lyricsRecords, lyricSearch) : []),
    [lyricsRecords, lyricSearch]
  );

  const trackMap = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  const handleSave = async () => {
    if (!targetTrack) return;
    const parsed = parseLyricsText(draftText);
    await saveLyrics({
      trackId: targetTrack.id,
      rawText: draftText,
      format: parsed.format,
      lines: parsed.lines,
      source: 'manual',
      updatedAt: Date.now(),
    });
    setEditMode(false);
  };

  const handleImportLrcFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !targetTrack) return;
    const text = await file.text();
    const parsed = parseLyricsText(text);
    setDraftText(text);
    await saveLyrics({
      trackId: targetTrack.id,
      rawText: text,
      format: parsed.format,
      lines: parsed.lines,
      source: 'imported',
      updatedAt: Date.now(),
    });
    setEditMode(false);
  };

  const handleStampTimestamp = () => {
    const stamp = formatLrcTimestamp(currentTrackId === targetTrack?.id ? currentTime : 0);
    setDraftText((prev) => (prev.trim() ? `${prev.trimEnd()}\n${stamp} ` : `${stamp} `));
  };

  return (
    <section
      className={`${
        karaokeFullScreen
          ? 'fixed inset-0 z-50 bg-[#050507] p-6 sm:p-10'
          : 'flex flex-col flex-1 min-h-0'
      } flex flex-col`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            Lyrics &amp; Karaoke
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Offline LRC synchronized lyrics, click-to-seek lines, timestamp stamper, and library search
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Select track for lyrics"
            value={targetTrack?.id || ''}
            onChange={(e) => setSelectedTrackId(e.target.value)}
            className="max-w-[230px] rounded-xl border border-white/10 bg-[#0B0C10] px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
          >
            {tracks.length === 0 ? (
              <option value="">No tracks imported</option>
            ) : (
              tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} — {t.artist}
                </option>
              ))
            )}
          </select>

          <input
            ref={lrcFileInputRef}
            type="file"
            accept=".lrc,.txt,text/plain"
            onChange={handleImportLrcFile}
            className="hidden"
          />
          <button
            type="button"
            disabled={!targetTrack}
            onClick={() => lrcFileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-200 hover:bg-white/5 disabled:opacity-40"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import .LRC</span>
          </button>

          <button
            type="button"
            disabled={!targetTrack}
            onClick={() => setEditMode((v) => !v)}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-200 hover:bg-white/5 disabled:opacity-40"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{editMode ? 'Preview' : 'Edit Lyrics'}</span>
          </button>

          <button
            type="button"
            onClick={() => setKaraokeFullScreen((v) => !v)}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
          >
            {karaokeFullScreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Exit Karaoke</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Karaoke Mode</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Offline Lyric Search Bar */}
      {!karaokeFullScreen && lyricsRecords.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search inside saved lyrics..."
              value={lyricSearch}
              onChange={(e) => setLyricSearch(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#0B0C10] pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
            />
          </div>
          {lyricSearch.trim() && (
            <div className="flex flex-wrap gap-2">
              {matchedSearchRecords.length === 0 ? (
                <span className="text-xs text-gray-500">No saved lyrics match &ldquo;{lyricSearch}&rdquo;.</span>
              ) : (
                matchedSearchRecords.map((rec) => {
                  const t = trackMap.get(rec.trackId);
                  if (!t) return null;
                  return (
                    <button
                      key={rec.trackId}
                      type="button"
                      onClick={() => {
                        setSelectedTrackId(t.id);
                        setLyricSearch('');
                        void playTrackById(t.id);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-600/10 text-xs text-red-200 hover:bg-red-600/20"
                    >
                      {t.title} — {t.artist}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-y-auto pt-4">
        {!targetTrack ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-white/[0.08] rounded-2xl bg-[#0B0C10]/80">
            <Mic2 className="w-10 h-10 text-gray-600 mb-3" />
            <p className="font-display text-lg font-semibold text-white">No tracks available</p>
            <p className="mt-1.5 max-w-md text-sm text-gray-400">
              Import songs to attach synchronized LRC or plain lyrics saved offline in IndexedDB.
            </p>
          </div>
        ) : editMode ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-300">
                Editing lyrics for <span className="font-semibold text-white">{targetTrack.title}</span> (supports <code className="text-red-400">[mm:ss.xx]</code> LRC timestamps or plain text)
              </p>
              <button
                type="button"
                onClick={handleStampTimestamp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.05] text-xs font-mono text-gray-200 hover:bg-white/[0.1]"
              >
                <Clock className="w-3.5 h-3.5 text-red-400" />
                <span>Insert Current Timestamp</span>
              </button>
            </div>

            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={14}
              placeholder={'[00:12.40] First synchronized lyric line\n[00:16.85] Second synchronized lyric line'}
              className="w-full rounded-xl border border-white/10 bg-[#050507] p-3.5 text-sm font-mono text-gray-100 focus:outline-none focus:border-red-500"
            />

            <div className="flex items-center justify-between gap-3">
              {activeRecord ? (
                <button
                  type="button"
                  onClick={async () => {
                    await deleteLyrics(targetTrack.id);
                    setDraftText('');
                    setEditMode(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/30 text-xs font-medium text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Lyrics</span>
                </button>
              ) : (
                <span />
              )}

              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Lyrics Offline</span>
              </button>
            </div>
          </div>
        ) : !activeRecord || activeRecord.lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-white/[0.08] rounded-2xl bg-[#0B0C10]/80">
            <Mic2 className="w-10 h-10 text-gray-600 mb-3" />
            <p className="font-display text-lg font-semibold text-white">
              No lyrics saved for &ldquo;{targetTrack.title}&rdquo;
            </p>
            <p className="mt-1.5 max-w-md text-sm text-gray-400">
              Import a local <code className="text-red-400">.lrc</code> file or paste/write lyrics manually to enable karaoke sync.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => lrcFileInputRef.current?.click()}
                className="px-4 py-2 rounded-xl border border-white/10 text-xs font-semibold text-gray-200 hover:bg-white/5"
              >
                Import .LRC File
              </button>
              <button
                type="button"
                onClick={() => setEditMode(true)}
                className="px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
              >
                Write Lyrics
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-8 px-4 space-y-3 text-center">
            <div className="mb-6">
              <p className="text-xs font-mono uppercase tracking-widest text-red-400">
                {activeRecord.format === 'lrc' ? 'LRC Time-Synced' : 'Plain Lyrics'}
              </p>
              <h2 className="font-display text-xl font-bold text-white mt-1">
                {targetTrack.title}
              </h2>
              <p className="text-xs text-gray-400">{targetTrack.artist}</p>
            </div>

            {activeRecord.lines.map((line, idx) => {
              const isActive = idx === activeLineIdx;
              const isClickable = line.timeSeconds !== null && currentTrackId === targetTrack.id;
              return (
                <button
                  key={`${idx}-${line.timeSeconds ?? 'p'}`}
                  ref={isActive ? activeLineRef : undefined}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => {
                    if (isClickable && line.timeSeconds !== null) {
                      seek(line.timeSeconds);
                    }
                  }}
                  className={`block w-full text-center transition-all duration-200 rounded-xl px-4 py-2 ${
                    karaokeFullScreen ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'
                  } ${
                    isActive
                      ? 'font-bold text-white scale-[1.03] bg-red-600/15 border border-red-500/30'
                      : idx < activeLineIdx
                        ? 'font-medium text-gray-500 hover:text-gray-300'
                        : 'font-medium text-gray-300 hover:text-white'
                  } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  {line.text}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
