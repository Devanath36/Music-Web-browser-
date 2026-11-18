import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Circle,
  Download,
  Pause,
  Play,
  Plus,
  Radio,
  Save,
  Square,
  Trash2,
} from 'lucide-react';
import { djAudioEngine, type DjEngineSnapshot } from '../../audio/djAudioEngine';
import { useLibraryStore } from '../../store/useLibraryStore';
import type { Track } from '../../types/music';
import { formatBytes, formatDuration } from '../../utils/formatters';

interface DjAutoMixRecorderPanelProps {
  snapshot: DjEngineSnapshot;
  tracks: Track[];
}

export const DjAutoMixRecorderPanel: React.FC<DjAutoMixRecorderPanelProps> = ({
  snapshot,
  tracks,
}) => {
  const [selectedAddTrackId, setSelectedAddTrackId] = useState('');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const saveDjMix = useLibraryStore((s) => s.saveDjMix);
  const storedMixes = useLibraryStore((s) => s.djMixes);

  const localTracks = useMemo(
    () => tracks.filter((t) => t.sourceType === 'local'),
    [tracks]
  );

  const trackMap = useMemo(
    () => new Map(localTracks.map((t) => [t.id, t])),
    [localTracks]
  );

  const storedIdsSet = useMemo(() => {
    const s = new Set(storedMixes.map((m) => m.id));
    for (const id of savedIds) s.add(id);
    return s;
  }, [storedMixes, savedIds]);

  const handleLoadTopTracks = () => {
    const sampleIds = localTracks.slice(0, 8).map((t) => t.id);
    if (sampleIds.length > 0) {
      djAudioEngine.setAutoMixPlaylist(sampleIds);
    }
  };

  const handleAddSelected = () => {
    const id = selectedAddTrackId || localTracks[0]?.id;
    if (id) {
      djAudioEngine.addToAutoMixPlaylist(id);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Auto Mix Mode Panel */}
      <section
        aria-label="DJ Auto Mix Mode"
        className="rounded-2xl border border-white/[0.08] bg-[#0B0C10]/95 p-4 space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-red-400" />
            <div>
              <h3 className="text-sm font-semibold text-white">Auto Mix Mode</h3>
              <p className="text-[11px] text-gray-400">
                Automated Deck A ↔ Deck B crossfades with manual override anytime
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              djAudioEngine.setAutoMixConfig({ enabled: !snapshot.autoMixEnabled })
            }
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              snapshot.autoMixEnabled
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'bg-white/[0.07] text-gray-200 hover:bg-white/[0.14]'
            }`}
          >
            {snapshot.autoMixEnabled ? 'Auto Mix ON' : 'Auto Mix OFF'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 rounded-xl border border-white/[0.06] bg-[#08090C] p-3 text-xs">
          <label className="space-y-1 sm:col-span-2">
            <div className="flex justify-between text-gray-400">
              <span>Crossfade Duration (0–20s)</span>
              <span className="font-mono tabular-nums text-white">
                {snapshot.autoMixTransitionSeconds === 0
                  ? '0s (Cut)'
                  : `${snapshot.autoMixTransitionSeconds}s`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={snapshot.autoMixTransitionSeconds}
              onChange={(e) =>
                djAudioEngine.setAutoMixConfig({
                  transitionSeconds: parseInt(e.target.value, 10),
                })
              }
              className="sonora-range w-full h-1.5 rounded-full bg-white/10"
            />
            <p className="text-[10px] text-gray-500">
              {snapshot.autoMixTransitioning
                ? 'Auto Mix curve active — move Deck A/B crossfader anytime for manual control.'
                : snapshot.autoMixEnabled
                  ? 'Automatic crossfade armed; independent deck faders preserved.'
                  : 'Manual crossfader mode active; Auto Mix ready on demand.'}
            </p>
          </label>

          <div className="flex flex-col justify-between gap-1.5">
            <label className="inline-flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={snapshot.autoMixSyncBpm}
                onChange={(e) => djAudioEngine.setAutoMixConfig({ syncBpm: e.target.checked })}
                className="accent-red-600"
              />
              <span>BPM Sync</span>
            </label>
            <button
              type="button"
              onClick={() => void djAudioEngine.triggerAutoMixTransitionNow()}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-[11px] font-semibold text-white whitespace-nowrap"
            >
              {snapshot.autoMixTransitioning ? 'Fading...' : 'Transition Now'}
            </button>
          </div>
        </div>

        {/* Auto Mix Playlist Builder */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Select track to add to Auto Mix playlist"
              value={selectedAddTrackId || localTracks[0]?.id || ''}
              onChange={(e) => setSelectedAddTrackId(e.target.value)}
              className="flex-1 min-w-0 rounded-xl border border-white/10 bg-[#07080B] px-3 py-2 text-xs text-white"
            >
              {localTracks.length === 0 ? (
                <option value="">No local songs imported</option>
              ) : (
                localTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} — {t.artist}
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              disabled={localTracks.length === 0}
              onClick={handleAddSelected}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-xs font-semibold text-white disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>

            <button
              type="button"
              disabled={localTracks.length === 0}
              onClick={handleLoadTopTracks}
              className="px-3 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-300 hover:text-white disabled:opacity-40"
            >
              Fill 8
            </button>
          </div>

          <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
            {snapshot.autoMixPlaylistIds.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center">
                Add local songs above to build an Auto Mix setlist.
              </p>
            ) : (
              snapshot.autoMixPlaylistIds.map((id, idx) => {
                const tr = trackMap.get(id);
                const isCurrent = idx === snapshot.autoMixCurrentIndex;
                return (
                  <div
                    key={`${id}-${idx}`}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs border ${
                      isCurrent
                        ? 'border-red-500/40 bg-red-600/10 text-white'
                        : 'border-white/[0.05] bg-[#08090C] text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[10px] text-gray-500 w-4 shrink-0">
                        {idx + 1}
                      </span>
                      <span className="truncate font-medium">
                        {tr ? `${tr.title} — ${tr.artist}` : 'Missing Track'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={idx === 0}
                        onClick={() => djAudioEngine.moveAutoMixItem(idx, idx - 1)}
                        className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={idx === snapshot.autoMixPlaylistIds.length - 1}
                        onClick={() => djAudioEngine.moveAutoMixItem(idx, idx + 1)}
                        className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove from Auto Mix"
                        onClick={() => djAudioEngine.removeFromAutoMixPlaylist(idx)}
                        className="p-1 text-gray-400 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* DJ Session Recording Panel */}
      <section
        aria-label="DJ Session Recording"
        className="rounded-2xl border border-white/[0.08] bg-[#0B0C10]/95 p-4 space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-red-400" />
            <div>
              <h3 className="text-sm font-semibold text-white">DJ Session Recording</h3>
              <p className="text-[11px] text-gray-400">
                Records live DJ Web Audio master mix directly (no microphone needed)
              </p>
            </div>
          </div>

          <span className="font-mono text-sm font-bold text-white tabular-nums">
            {formatDuration(snapshot.recordingDurationSeconds)}
          </span>
        </div>

        {!snapshot.recordingSupported && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            Web Audio output recording is unavailable in this browser:{' '}
            {snapshot.recordingUnsupportedReason || 'MediaRecorder unsupported.'}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {snapshot.recordingStatus === 'idle' ? (
            <button
              type="button"
              disabled={!snapshot.recordingSupported}
              onClick={() => djAudioEngine.startRecording()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white disabled:opacity-40"
            >
              <Circle className="w-3.5 h-3.5 fill-current" />
              <span>Start Recording</span>
            </button>
          ) : (
            <>
              {snapshot.recordingStatus === 'recording' ? (
                <button
                  type="button"
                  onClick={() => djAudioEngine.pauseRecording()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-xs font-bold text-amber-200 hover:bg-amber-500/30"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => djAudioEngine.resumeRecording()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Resume</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => djAudioEngine.stopRecording()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.1] hover:bg-white/[0.18] text-xs font-bold text-white"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop &amp; Save Mix</span>
              </button>
            </>
          )}
        </div>

        {/* Recorded Mixes List */}
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {snapshot.recordedMixes.length === 0 ? (
            <p className="text-xs text-gray-500 py-5 text-center">
              Recorded DJ mixes appear here for playback and download.
            </p>
          ) : (
            snapshot.recordedMixes.map((mix) => (
              <div
                key={mix.id}
                className="rounded-xl border border-white/[0.07] bg-[#08090C] p-2.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{mix.name}</p>
                    <p className="text-[11px] font-mono text-gray-400">
                      {formatDuration(mix.durationSeconds)} · {formatBytes(mix.sizeBytes)} ·{' '}
                      {mix.extension.toUpperCase()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={storedIdsSet.has(mix.id)}
                      onClick={async () => {
                        await saveDjMix({
                          id: mix.id,
                          title: mix.name,
                          createdAt: mix.createdAt,
                          durationSec: mix.durationSeconds,
                          mimeType: mix.mimeType,
                          byteSize: mix.sizeBytes,
                          blob: mix.blob,
                        });
                        setSavedIds((prev) => new Set([...prev, mix.id]));
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                        storedIdsSet.has(mix.id)
                          ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-white/[0.08] border-white/10 text-white hover:bg-white/[0.15]'
                      }`}
                    >
                      <Save className="w-3 h-3" />
                      <span>{storedIdsSet.has(mix.id) ? 'Saved' : 'Save Mix'}</span>
                    </button>
                    <a
                      href={mix.url}
                      download={`${mix.name.replace(/\s+/g, '_')}.${mix.extension}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600/20 border border-red-500/40 text-[11px] font-semibold text-red-200 hover:bg-red-600/35"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </a>
                    <button
                      type="button"
                      aria-label={`Delete ${mix.name}`}
                      onClick={() => djAudioEngine.deleteRecordedMix(mix.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <audio controls src={mix.url} className="w-full h-8" />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
