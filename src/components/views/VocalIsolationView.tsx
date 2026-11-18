import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Mic,
  Music,
  Pause,
  Play,
  Save,
  Sliders,
  Square,
  Trash2,
} from 'lucide-react';
import {
  processVocalIsolationBuffer,
  type StemIsolationMode,
} from '../../audio/vocalIsolation';
import { sonoraDb } from '../../db/sonoraDb';
import { useLibraryStore } from '../../store/useLibraryStore';
import { formatBytes, formatDuration } from '../../utils/formatters';

export const VocalIsolationView: React.FC = () => {
  const tracks = useLibraryStore((s) => s.tracks);
  const processedStems = useLibraryStore((s) => s.processedStems);
  const saveProcessedStem = useLibraryStore((s) => s.saveProcessedStem);
  const deleteProcessedStem = useLibraryStore((s) => s.deleteProcessedStem);

  const localTracks = useMemo(
    () => tracks.filter((t) => t.sourceType === 'local'),
    [tracks]
  );

  const [selectedTrackId, setSelectedTrackId] = useState(localTracks[0]?.id || '');
  const [mode, setMode] = useState<StemIsolationMode>('instrumental');
  const [intensity, setIntensity] = useState(0.85);
  const [processing, setProcessing] = useState(false);
  const [monoWarning, setMonoWarning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [renderedStems, setRenderedStems] = useState<{
    trackId: string;
    vocals?: Blob;
    instrumental?: Blob;
    durationSec: number;
  } | null>(null);

  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewPos, setPreviewPos] = useState(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedTrackId && localTracks.length > 0) {
      setSelectedTrackId(localTracks[0].id);
    }
  }, [localTracks, selectedTrackId]);

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
      if (activeUrlRef.current) URL.revokeObjectURL(activeUrlRef.current);
    };
  }, []);

  const selectedTrack = useMemo(
    () => localTracks.find((t) => t.id === selectedTrackId) || null,
    [localTracks, selectedTrackId]
  );

  const savedStemUrls = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of processedStems) {
      map[s.id] = URL.createObjectURL(s.blob);
    }
    return map;
  }, [processedStems]);

  useEffect(() => {
    return () => {
      for (const u of Object.values(savedStemUrls)) URL.revokeObjectURL(u);
    };
  }, [savedStemUrls]);

  const handleRenderStems = async () => {
    if (!selectedTrack) return;
    setProcessing(true);
    setErrorMsg(null);
    setMonoWarning(false);

    try {
      const rec = await sonoraDb.audioBlobs.get(selectedTrack.id);
      if (!rec?.blob) throw new Error('Audio blob missing from IndexedDB.');
      const arr = await rec.blob.arrayBuffer();

      const [vocRes, instRes] = await Promise.all([
        processVocalIsolationBuffer({
          sourceArrayBuffer: arr,
          mode: 'vocals',
          intensity,
        }),
        processVocalIsolationBuffer({
          sourceArrayBuffer: arr,
          mode: 'instrumental',
          intensity,
        }),
      ]);

      setMonoWarning(vocRes.isMonoWarning || instRes.isMonoWarning);
      setRenderedStems({
        trackId: selectedTrack.id,
        vocals: vocRes.wavBlob,
        instrumental: instRes.wavBlob,
        durationSec: vocRes.buffer.duration,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to separate audio channels for this file.'
      );
    } finally {
      setProcessing(false);
    }
  };

  const loadPreviewBlob = async (targetMode: StemIsolationMode) => {
    if (!selectedTrack) return;
    let blob: Blob | undefined;
    if (targetMode === 'original') {
      const rec = await sonoraDb.audioBlobs.get(selectedTrack.id);
      blob = rec?.blob;
    } else if (renderedStems && renderedStems.trackId === selectedTrack.id) {
      blob = targetMode === 'vocals' ? renderedStems.vocals : renderedStems.instrumental;
    }
    if (!blob) return;

    const resumeAt = previewAudioRef.current?.currentTime || 0;
    const wasPlaying = isPreviewPlaying;

    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
      previewAudioRef.current.addEventListener('timeupdate', () => {
        setPreviewPos(previewAudioRef.current?.currentTime || 0);
      });
      previewAudioRef.current.addEventListener('ended', () => {
        setIsPreviewPlaying(false);
      });
    }

    if (activeUrlRef.current) URL.revokeObjectURL(activeUrlRef.current);
    const url = URL.createObjectURL(blob);
    activeUrlRef.current = url;
    previewAudioRef.current.src = url;
    previewAudioRef.current.currentTime = resumeAt;
    if (wasPlaying) {
      await previewAudioRef.current.play().catch(() => {});
    }
  };

  const handleModeSwitch = async (nextMode: StemIsolationMode) => {
    setMode(nextMode);
    if (renderedStems?.trackId === selectedTrack?.id) {
      await loadPreviewBlob(nextMode);
    }
  };

  const handlePlayToggle = async () => {
    if (!previewAudioRef.current || !previewAudioRef.current.src) {
      await loadPreviewBlob(mode);
    }
    const el = previewAudioRef.current;
    if (!el) return;
    if (isPreviewPlaying) {
      el.pause();
      setIsPreviewPlaying(false);
    } else {
      await el.play();
      setIsPreviewPlaying(true);
    }
  };

  const handleSaveCurrentStem = async (stemType: 'vocals' | 'instrumental') => {
    if (!selectedTrack || !renderedStems || renderedStems.trackId !== selectedTrack.id) return;
    const blob = stemType === 'vocals' ? renderedStems.vocals : renderedStems.instrumental;
    if (!blob) return;
    await saveProcessedStem({
      id: `stem_${selectedTrack.id}_${stemType}_${Date.now()}`,
      trackId: selectedTrack.id,
      mode: stemType,
      title: `${selectedTrack.title} (${stemType === 'vocals' ? 'Vocals Focus' : 'Instrumental'})`,
      mimeType: 'audio/wav',
      durationSec: renderedStems.durationSec,
      byteSize: blob.size,
      blob,
      createdAt: Date.now(),
    });
  };

  return (
    <section className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-5 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            Vocal Isolation &amp; Instrumental Studio
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Offline Web Audio Mid-Side center-channel separation &amp; WAV stem generator (original source files stay untouched)
          </p>
        </div>
      </div>

      {/* Honest DSP capability disclosure */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0B0C10] px-4 py-3 text-xs text-gray-300">
        Uses deterministic stereo Mid-Side phase cancellation (<code className="text-red-400">(L-R)</code> / <code className="text-red-400">(L+R)</code> + vocal band filtering) directly inside your browser without cloud uploads. Works cleanly on standard stereo mixes; mono files or heavily panned reverb vocals have physical stereo separation limits compared to neural ML models.
      </div>

      {/* Setup Card */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Select Local Track
            </label>
            <select
              value={selectedTrackId}
              onChange={(e) => {
                previewAudioRef.current?.pause();
                setIsPreviewPlaying(false);
                setSelectedTrackId(e.target.value);
              }}
              className="w-full rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-red-500"
            >
              {localTracks.length === 0 ? (
                <option value="">No local songs imported</option>
              ) : (
                localTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} — {t.artist} ({t.format})
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="button"
            disabled={!selectedTrack || processing}
            onClick={handleRenderStems}
            className="min-h-[42px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40"
          >
            <Sliders className="w-4 h-4" />
            <span>{processing ? 'Rendering Stems...' : 'Generate Vocal & Instrumental'}</span>
          </button>
        </div>

        <label className="block space-y-1.5 max-w-md text-xs">
          <div className="flex justify-between text-gray-400">
            <span>Isolation Intensity</span>
            <span className="font-mono text-white tabular-nums">
              {Math.round(intensity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={intensity}
            onChange={(e) => setIntensity(parseFloat(e.target.value))}
            className="sonora-range w-full h-1.5 rounded-full bg-white/10"
          />
        </label>

        {monoWarning && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-center gap-2 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              This audio file is Mono (1-channel). Mid-Side stereo vocal cancellation requires stereo L/R channels to separate center vocals from accompaniment.
            </span>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
            {errorMsg}
          </div>
        )}

        {renderedStems && selectedTrack && renderedStems.trackId === selectedTrack.id && (
          <div className="pt-3 border-t border-white/[0.07] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: 'original', label: 'Original Mix', icon: Music },
                    { id: 'vocals', label: 'Vocals Only', icon: Mic },
                    { id: 'instrumental', label: 'Instrumental / Karaoke', icon: Music },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const active = mode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void handleModeSwitch(item.id)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                        active
                          ? 'border-red-500 bg-red-600/20 text-white'
                          : 'border-white/10 bg-[#0B0C10] text-gray-300 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-gray-400 tabular-nums">
                  {formatDuration(previewPos)} / {formatDuration(renderedStems.durationSec)}
                </span>
                <button
                  type="button"
                  onClick={() => void handlePlayToggle()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
                >
                  {isPreviewPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>Pause A/B</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Play A/B</span>
                    </>
                  )}
                </button>
                {isPreviewPlaying && (
                  <button
                    type="button"
                    onClick={() => {
                      previewAudioRef.current?.pause();
                      if (previewAudioRef.current) previewAudioRef.current.currentTime = 0;
                      setIsPreviewPlaying(false);
                      setPreviewPos(0);
                    }}
                    className="p-2 rounded-xl border border-white/10 text-gray-300 hover:text-white"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSaveCurrentStem('vocals')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 text-xs font-medium text-gray-200 hover:bg-white/5"
              >
                <Save className="w-3.5 h-3.5 text-red-400" />
                <span>Save Vocals Stem to Library</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSaveCurrentStem('instrumental')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 text-xs font-medium text-gray-200 hover:bg-white/5"
              >
                <Save className="w-3.5 h-3.5 text-red-400" />
                <span>Save Instrumental Stem to Library</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Saved Stems List */}
      <div className="space-y-2">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          Saved Processed Stems ({processedStems.length})
        </h2>
        {processedStems.length === 0 ? (
          <p className="text-xs text-gray-500 py-4">
            Saved stems appear here as WAV files stored cleanly in IndexedDB without overwriting original songs.
          </p>
        ) : (
          <div className="space-y-2.5">
            {processedStems.map((stem) => {
              const url = savedStemUrls[stem.id];
              return (
                <div
                  key={stem.id}
                  className="rounded-2xl border border-white/[0.08] bg-[#111216] p-3.5 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{stem.title}</p>
                      <p className="text-xs font-mono text-gray-400 tabular-nums">
                        {stem.mode.toUpperCase()} · {formatDuration(stem.durationSec)} ·{' '}
                        {formatBytes(stem.byteSize)} · WAV
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {url && (
                        <a
                          href={url}
                          download={`${stem.title.replace(/\s+/g, '_')}.wav`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600/20 border border-red-500/40 text-xs font-semibold text-red-200 hover:bg-red-600/35"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download WAV</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => void deleteProcessedStem(stem.id)}
                        className="p-2 rounded-xl border border-white/10 text-gray-400 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {url && <audio controls src={url} className="w-full h-8" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
