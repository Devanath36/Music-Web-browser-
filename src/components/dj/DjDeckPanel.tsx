import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Disc,
  Headphones,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Search,
  Square,
  X,
} from 'lucide-react';
import {
  djAudioEngine,
  type AutoLoopBeats,
  type DeckId,
  type DeckSnapshot,
} from '../../audio/djAudioEngine';
import type { Track } from '../../types/music';
import { formatDuration } from '../../utils/formatters';
import { ArtworkThumb } from '../library/ArtworkThumb';

interface DjDeckPanelProps {
  deck: DeckSnapshot;
  otherDeckLoaded: boolean;
  tracks: Track[];
  compact?: boolean;
}

const MUSICAL_KEYS = [
  'C', 'Cm', 'C#', 'C#m', 'D', 'Dm', 'D#', 'D#m',
  'E', 'Em', 'F', 'Fm', 'F#', 'F#m', 'G', 'Gm',
  'G#', 'G#m', 'A', 'Am', 'A#', 'A#m', 'B', 'Bm',
];

export const DjDeckPanel: React.FC<DjDeckPanelProps> = ({
  deck,
  otherDeckLoaded,
  tracks,
  compact = false,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmInput, setBpmInput] = useState('');
  const [showStrip, setShowStrip] = useState(!compact);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const platterRef = useRef<HTMLDivElement | null>(null);
  const lastAngleRef = useRef<number | null>(null);

  const deckId: DeckId = deck.id;
  const isDeckA = deckId === 'A';
  const accentHex = isDeckA ? '#EF4444' : '#F97316';

  const localTracks = useMemo(
    () => tracks.filter((t) => t.sourceType === 'local'),
    [tracks]
  );

  const filteredTracks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return localTracks;
    return localTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        t.genre.toLowerCase().includes(q)
    );
  }, [localTracks, search]);

  // Draw waveform + beat grid + loop + cues onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 68;
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#090A0E';
    ctx.fillRect(0, 0, width, height);

    // Center line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const peaks = deck.waveformPeaks;
    const dur = deck.duration > 0 ? deck.duration : 1;
    const playPct = Math.max(0, Math.min(1, deck.position / dur));

    // Loop highlight region
    if (deck.loopStart !== null && deck.loopEnd !== null && deck.loopEnd > deck.loopStart) {
      const lx1 = (deck.loopStart / dur) * width;
      const lx2 = (deck.loopEnd / dur) * width;
      ctx.fillStyle = deck.loopEnabled ? 'rgba(239, 68, 68, 0.22)' : 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(lx1, 0, Math.max(2, lx2 - lx1), height);
    }

    // Beat Grid vertical markers (up to 160 lines cleanly spaced)
    if (deck.duration > 0 && deck.bpm > 0) {
      const beatSec = 60 / deck.bpm;
      const approxBeats = deck.duration / beatSec;
      const stepBeats = approxBeats > 180 ? Math.ceil(approxBeats / 90) : 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      for (
        let t = deck.beatOffsetSeconds;
        t < deck.duration;
        t += beatSec * stepBeats
      ) {
        const x = (t / dur) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // Waveform bars
    if (peaks.length > 0) {
      const barWidth = width / peaks.length;
      const midY = height / 2;
      for (let i = 0; i < peaks.length; i++) {
        const x = i * barWidth;
        const barFrac = i / peaks.length;
        const h = Math.max(3, peaks[i] * (height - 10));
        const played = barFrac <= playPct;
        ctx.fillStyle = played
          ? accentHex
          : isDeckA
            ? 'rgba(239, 68, 68, 0.32)'
            : 'rgba(249, 115, 22, 0.32)';
        ctx.fillRect(x, midY - h / 2, Math.max(1, barWidth - 0.6), h);
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        deck.isLoading ? 'Decoding waveform & BPM...' : 'Load a track to view waveform',
        width / 2,
        height / 2 + 4
      );
    }

    // Cue & Hot Cue markers
    if (deck.duration > 0) {
      const cueX = (deck.cuePoint / dur) * width;
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(cueX - 1, 0, 2, height);

      deck.hotCues.forEach((hc, idx) => {
        if (hc === null) return;
        const hx = (hc / dur) * width;
        ctx.fillStyle = '#38BDF8';
        ctx.fillRect(hx - 1, 0, 2, height);
        ctx.fillStyle = '#0B0C10';
        ctx.fillRect(hx - 6, 2, 12, 12);
        ctx.fillStyle = '#38BDF8';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(idx + 1), hx, 11);
      });
    }

    // Playhead needle
    if (deck.duration > 0) {
      const px = playPct * width;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(px - 1, 0, 2, height);
    }
  }, [
    deck.waveformPeaks,
    deck.position,
    deck.duration,
    deck.bpm,
    deck.beatOffsetSeconds,
    deck.cuePoint,
    deck.hotCues,
    deck.loopEnabled,
    deck.loopStart,
    deck.loopEnd,
    deck.isLoading,
    accentHex,
    isDeckA,
  ]);

  const handleWaveformPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!deck.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    djAudioEngine.seek(deckId, frac * deck.duration);
  };

  // Virtual Turntable Jog Wheel Scratching
  const getPointerAngle = (clientX: number, clientY: number): number => {
    const el = platterRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(clientY - cy, clientX - cx);
  };

  const handleJogDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!deck.track || deck.isLoading) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lastAngleRef.current = getPointerAngle(e.clientX, e.clientY);
    djAudioEngine.scratchStart(deckId);
  };

  const handleJogMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lastAngleRef.current === null || !deck.isScratching) return;
    const nextAngle = getPointerAngle(e.clientX, e.clientY);
    let delta = nextAngle - lastAngleRef.current;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    lastAngleRef.current = nextAngle;
    // 1 full rotation (2π rad) = ~1.8 seconds of vinyl travel
    const deltaSeconds = (delta / (Math.PI * 2)) * 1.8;
    djAudioEngine.scratchMove(deckId, deltaSeconds);
  };

  const handleJogUp = () => {
    if (lastAngleRef.current !== null) {
      lastAngleRef.current = null;
      djAudioEngine.scratchEnd(deckId);
    }
  };

  // Platter visual rotation angle (33.3 RPM style linked directly to position)
  const platterDegrees = ((deck.position * 200) % 360 + 360) % 360;
  const remaining = Math.max(0, deck.duration - deck.position);
  const pitchPct = Math.round((deck.playbackRate - 1) * 1000) / 10;

  return (
    <section
      aria-label={`Deck ${deckId}`}
      className="flex flex-col rounded-2xl border border-white/[0.08] bg-[#0B0C10]/95 p-3.5 sm:p-4 space-y-3"
    >
      {/* Deck Top Header + Track Loader */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
              isDeckA
                ? 'bg-red-600/20 text-red-400 border border-red-500/30'
                : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
            }`}
          >
            {deckId}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">
              {deck.track ? deck.track.title : `Deck ${deckId} Empty`}
            </h3>
            <p className="text-xs text-gray-400 truncate">
              {deck.track ? deck.track.artist : 'Choose a track from your library'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] text-xs font-semibold text-white border border-white/10 transition-colors"
        >
          <span>{deck.track ? 'Load' : 'Load Track'}</span>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>

      {deck.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {deck.error}
        </div>
      )}

      {/* BPM, Key & Time Readouts */}
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/[0.06] bg-[#07080B] px-3 py-2">
        <div>
          <span className="block text-[10px] text-gray-500 uppercase tracking-wider">BPM</span>
          {editingBpm ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = parseFloat(bpmInput);
                if (!Number.isNaN(parsed)) {
                  djAudioEngine.setManualBpm(deckId, parsed);
                }
                setEditingBpm(false);
              }}
              className="flex items-center gap-1 mt-0.5"
            >
              <input
                type="number"
                step="0.1"
                min="45"
                max="220"
                autoFocus
                value={bpmInput}
                onChange={(e) => setBpmInput(e.target.value)}
                onBlur={() => setEditingBpm(false)}
                className="w-16 bg-black border border-red-500/50 rounded px-1 py-0.5 text-xs font-mono text-white"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setBpmInput(String(deck.bpm));
                setEditingBpm(true);
              }}
              title="Click to adjust base BPM manually"
              className="mt-0.5 font-mono text-sm font-bold text-white tabular-nums hover:text-red-400"
            >
              {deck.effectiveBpm.toFixed(1)}
            </button>
          )}
          <div className="flex items-center gap-1 mt-0.5">
            <button
              type="button"
              onClick={() => djAudioEngine.tapBpm(deckId)}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-gray-300"
            >
              TAP
            </button>
            <button
              type="button"
              disabled={!deck.track || !otherDeckLoaded}
              onClick={() => djAudioEngine.syncDeckToOther(deckId)}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 hover:bg-red-600/35 text-red-300 disabled:opacity-35"
            >
              SYNC
            </button>
          </div>
        </div>

        <div>
          <span className="block text-[10px] text-gray-500 uppercase tracking-wider">Key</span>
          <select
            aria-label={`Deck ${deckId} musical key`}
            value={MUSICAL_KEYS.includes(deck.estimatedKey.replace(' (Est)', '')) ? deck.estimatedKey.replace(' (Est)', '') : ''}
            onChange={(e) => djAudioEngine.setManualKey(deckId, e.target.value)}
            className="mt-0.5 bg-transparent font-mono text-xs font-semibold text-gray-200 focus:outline-none cursor-pointer"
          >
            {!MUSICAL_KEYS.includes(deck.estimatedKey.replace(' (Est)', '')) && (
              <option value="" className="bg-[#111216]">
                {deck.estimatedKey}
              </option>
            )}
            {MUSICAL_KEYS.map((k) => (
              <option key={k} value={k} className="bg-[#111216] text-white">
                {k}
              </option>
            ))}
          </select>
          <span className="block text-[10px] text-gray-500 truncate mt-0.5">
            {deck.estimatedKey.includes('(Est)') ? 'Estimated' : 'Manual'}
          </span>
        </div>

        <div className="text-right">
          <span className="block text-[10px] text-gray-500 uppercase tracking-wider">Time</span>
          <p className="mt-0.5 font-mono text-sm font-bold text-white tabular-nums">
            {formatDuration(deck.position)}
          </p>
          <p className="text-[10px] font-mono text-gray-500 tabular-nums">
            -{formatDuration(remaining)} / {formatDuration(deck.duration)}
          </p>
        </div>
      </div>

      {/* Interactive Waveform + Beat Grid Display */}
      <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-[#090A0E]">
        <canvas
          ref={canvasRef}
          onPointerDown={handleWaveformPointer}
          className="w-full h-[66px] block cursor-pointer touch-none"
        />
        {deck.isLoading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-red-400 animate-spin" />
          </div>
        )}
      </div>

      {/* Jog Wheel + Transport & Pitch Control */}
      <div className="flex items-center gap-3">
        {/* Virtual Turntable Jog Wheel */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div
            ref={platterRef}
            onPointerDown={handleJogDown}
            onPointerMove={handleJogMove}
            onPointerUp={handleJogUp}
            onPointerCancel={handleJogUp}
            role="slider"
            aria-label={`Deck ${deckId} virtual turntable jog wheel`}
            aria-valuenow={Math.round(deck.position)}
            aria-valuemin={0}
            aria-valuemax={Math.round(deck.duration)}
            title="Drag to scratch / scrub track"
            className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 select-none touch-none cursor-grab active:cursor-grabbing flex items-center justify-center bg-gradient-to-br from-[#1B1D26] via-[#0B0C10] to-[#171922] shadow-xl ${
              deck.isPlaying
                ? isDeckA
                  ? 'border-red-500/70'
                  : 'border-orange-500/70'
                : 'border-white/15'
            }`}
          >
            {/* Vinyl grooves */}
            <div className="absolute inset-2 rounded-full border border-white/[0.07]" />
            <div className="absolute inset-4 rounded-full border border-white/[0.05]" />
            <div
              style={{ transform: `rotate(${platterDegrees.toFixed(1)}deg)` }}
              className="w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-full overflow-hidden border border-white/20 flex items-center justify-center relative"
            >
              {deck.track ? (
                <ArtworkThumb
                  artworkId={deck.track.artworkId}
                  alt={deck.track.title}
                  sizeClass="w-full h-full"
                  roundedClass="rounded-full"
                  iconSizeClass="w-6 h-6"
                />
              ) : (
                <Disc className="w-7 h-7 text-gray-600" />
              )}
              {/* Spindle + position marker line */}
              <span
                className="absolute top-0.5 left-1/2 -translate-x-1/2 w-1 h-3 rounded-full"
                style={{ backgroundColor: accentHex }}
              />
              <span className="w-2.5 h-2.5 rounded-full bg-[#08080B] border border-white/40 z-10" />
            </div>
          </div>

          {/* Pitch Bend Nudges */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onPointerDown={() => djAudioEngine.setPitchBend(deckId, -0.05)}
              onPointerUp={() => djAudioEngine.setPitchBend(deckId, 0)}
              onPointerLeave={() => djAudioEngine.setPitchBend(deckId, 0)}
              className="px-2 py-1 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[10px] font-mono text-gray-300"
            >
              Bend -
            </button>
            <button
              type="button"
              onPointerDown={() => djAudioEngine.setPitchBend(deckId, 0.05)}
              onPointerUp={() => djAudioEngine.setPitchBend(deckId, 0)}
              onPointerLeave={() => djAudioEngine.setPitchBend(deckId, 0)}
              className="px-2 py-1 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[10px] font-mono text-gray-300"
            >
              Bend +
            </button>
          </div>
        </div>

        {/* Transport + Pitch Slider */}
        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              disabled={!deck.track || deck.isLoading}
              onClick={() => void djAudioEngine.togglePlay(deckId)}
              className={`min-h-[42px] flex items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-40 ${
                deck.isPlaying
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-white/[0.1] text-white hover:bg-white/[0.18]'
              }`}
            >
              {deck.isPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  <span>PAUSE</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>PLAY</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={!deck.track || deck.isLoading}
              onClick={() => djAudioEngine.triggerCue(deckId)}
              className="min-h-[42px] flex items-center justify-center rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 disabled:opacity-40"
            >
              CUE
            </button>

            <button
              type="button"
              disabled={!deck.track || deck.isLoading}
              onClick={() => djAudioEngine.stop(deckId)}
              className="min-h-[42px] flex items-center justify-center gap-1 rounded-xl text-xs font-bold bg-white/[0.06] hover:bg-white/[0.12] text-gray-200 disabled:opacity-40"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>STOP</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!deck.track || deck.isLoading}
              onClick={() => djAudioEngine.toggleReverse(deckId)}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center justify-center gap-1 border transition-colors disabled:opacity-40 ${
                deck.reverse
                  ? 'bg-red-600/25 border-red-500/40 text-red-300'
                  : 'bg-white/[0.04] border-white/[0.07] text-gray-300 hover:text-white'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reverse</span>
            </button>

            <button
              type="button"
              onClick={() => djAudioEngine.toggleDeckCueMonitor(deckId)}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center justify-center gap-1 border transition-colors ${
                deck.cueMonitor
                  ? 'bg-sky-500/20 border-sky-400/40 text-sky-300'
                  : 'bg-white/[0.04] border-white/[0.07] text-gray-300 hover:text-white'
              }`}
            >
              <Headphones className="w-3 h-3" />
              <span>PFL Cue</span>
            </button>
          </div>

          {/* Pitch / Tempo Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-gray-400">Pitch / Tempo</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-gray-200 tabular-nums">
                  {pitchPct >= 0 ? `+${pitchPct.toFixed(1)}%` : `${pitchPct.toFixed(1)}%`}
                </span>
                {deck.playbackRate !== 1 && (
                  <button
                    type="button"
                    onClick={() => djAudioEngine.setPlaybackRate(deckId, 1)}
                    className="text-[10px] text-red-400 hover:text-red-300"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
            <input
              type="range"
              aria-label={`Deck ${deckId} pitch and tempo`}
              min={0.5}
              max={1.5}
              step={0.005}
              value={deck.playbackRate}
              onChange={(e) => djAudioEngine.setPlaybackRate(deckId, parseFloat(e.target.value))}
              className="sonora-range w-full h-1.5 rounded-full bg-white/10"
            />
          </div>
        </div>
      </div>

      {/* Hot Cues (4) & Beat Loops (IN / OUT / 4 / 8 / 16) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/[0.06] bg-[#08090C] p-2 space-y-1.5">
          <span className="block text-[10px] font-semibold text-gray-400">Hot Cues</span>
          <div className="grid grid-cols-4 gap-1">
            {deck.hotCues.map((hc, idx) => (
              <div key={idx} className="relative group">
                <button
                  type="button"
                  disabled={!deck.track}
                  onClick={() => djAudioEngine.triggerHotCue(deckId, idx)}
                  className={`w-full py-1.5 rounded-lg font-mono text-[11px] font-bold border transition-colors disabled:opacity-35 ${
                    hc !== null
                      ? 'bg-sky-500/20 border-sky-400/50 text-sky-200 hover:bg-sky-500/30'
                      : 'bg-white/[0.04] border-white/[0.08] text-gray-400 hover:text-white'
                  }`}
                >
                  {hc !== null ? formatDuration(hc) : `HC${idx + 1}`}
                </button>
                {hc !== null && (
                  <button
                    type="button"
                    aria-label={`Clear Hot Cue ${idx + 1}`}
                    onClick={() => djAudioEngine.clearHotCue(deckId, idx)}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#111216] border border-white/20 text-[9px] text-gray-300 flex items-center justify-center opacity-80 hover:text-red-400"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#08090C] p-2 space-y-1.5">
          <span className="block text-[10px] font-semibold text-gray-400">Loop &amp; Beat Loop</span>
          <div className="grid grid-cols-6 gap-1">
            <button
              type="button"
              disabled={!deck.track}
              onClick={() => djAudioEngine.setLoopIn(deckId)}
              className={`py-1.5 rounded-lg text-[10px] font-bold border disabled:opacity-35 ${
                deck.loopStart !== null
                  ? 'border-red-500/40 bg-red-500/15 text-red-300'
                  : 'border-white/[0.08] bg-white/[0.04] text-gray-300'
              }`}
            >
              IN
            </button>
            <button
              type="button"
              disabled={!deck.track}
              onClick={() => djAudioEngine.setLoopOut(deckId)}
              className={`py-1.5 rounded-lg text-[10px] font-bold border disabled:opacity-35 ${
                deck.loopEnd !== null
                  ? 'border-red-500/40 bg-red-500/15 text-red-300'
                  : 'border-white/[0.08] bg-white/[0.04] text-gray-300'
              }`}
            >
              OUT
            </button>
            <button
              type="button"
              disabled={!deck.track || deck.loopStart === null || deck.loopEnd === null}
              onClick={() => djAudioEngine.toggleLoop(deckId)}
              className={`py-1.5 rounded-lg text-[10px] font-bold border disabled:opacity-35 ${
                deck.loopEnabled
                  ? 'border-red-500 bg-red-600 text-white'
                  : 'border-white/[0.08] bg-white/[0.04] text-gray-300'
              }`}
            >
              ON
            </button>
            {([4, 8, 16] as AutoLoopBeats[]).map((beats) => (
              <button
                key={beats}
                type="button"
                disabled={!deck.track}
                onClick={() => djAudioEngine.setAutoLoop(deckId, beats)}
                className={`py-1.5 rounded-lg font-mono text-[10px] font-bold border disabled:opacity-35 ${
                  deck.loopEnabled && deck.autoLoopBeats === beats
                    ? 'border-red-500 bg-red-600 text-white'
                    : 'border-white/[0.08] bg-white/[0.04] text-gray-300 hover:text-white'
                }`}
              >
                {beats}B
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Collapsible Channel Strip (Volume, Gain, 3-Band EQ, Filter, Balance, Peak Meter) */}
      <div className="rounded-xl border border-white/[0.06] bg-[#08090C] p-2.5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowStrip((v) => !v)}
            className="text-xs font-semibold text-gray-300 hover:text-white flex items-center gap-1.5"
          >
            <span>Channel EQ &amp; Mixer Strip</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showStrip ? 'rotate-180' : ''}`} />
          </button>

          {/* Deck Peak Meter */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-gray-500">LVL</span>
            <div className="w-20 h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                style={{ width: `${Math.min(100, Math.round(deck.peakLevel * 125))}%` }}
                className={`h-full transition-all duration-75 ${
                  deck.peakLevel > 0.85
                    ? 'bg-red-500'
                    : deck.peakLevel > 0.6
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                }`}
              />
            </div>
          </div>
        </div>

        {showStrip && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2.5 text-[11px]">
            <label className="space-y-1">
              <div className="flex justify-between text-gray-400">
                <span>Volume</span>
                <span className="font-mono text-gray-200">{Math.round(deck.volume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={deck.volume}
                onChange={(e) => djAudioEngine.setDeckVolume(deckId, parseFloat(e.target.value))}
                className="sonora-range w-full h-1.5 rounded-full bg-white/10"
              />
            </label>

            <label className="space-y-1">
              <div className="flex justify-between text-gray-400">
                <span>Trim Gain</span>
                <span className="font-mono text-gray-200">{deck.gain.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={1.8}
                step={0.02}
                value={deck.gain}
                onChange={(e) => djAudioEngine.setDeckGain(deckId, parseFloat(e.target.value))}
                className="sonora-range w-full h-1.5 rounded-full bg-white/10"
              />
            </label>

            <label className="space-y-1">
              <div className="flex justify-between text-gray-400">
                <span>Filter</span>
                <span className="font-mono text-gray-200">
                  {Math.abs(deck.filter) < 0.03
                    ? 'OFF'
                    : deck.filter < 0
                      ? `LPF ${Math.round(Math.abs(deck.filter) * 100)}`
                      : `HPF ${Math.round(deck.filter * 100)}`}
                </span>
              </div>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.02}
                value={deck.filter}
                onChange={(e) => djAudioEngine.setDeckFilter(deckId, parseFloat(e.target.value))}
                className="sonora-range w-full h-1.5 rounded-full bg-white/10"
              />
            </label>

            <label className="space-y-1">
              <div className="flex justify-between text-gray-400">
                <span>Balance</span>
                <span className="font-mono text-gray-200">
                  {Math.abs(deck.balance) < 0.05
                    ? 'C'
                    : deck.balance < 0
                      ? `L${Math.round(Math.abs(deck.balance) * 100)}`
                      : `R${Math.round(deck.balance * 100)}`}
                </span>
              </div>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.02}
                value={deck.balance}
                onChange={(e) => djAudioEngine.setDeckBalance(deckId, parseFloat(e.target.value))}
                className="sonora-range w-full h-1.5 rounded-full bg-white/10"
              />
            </label>

            <label className="space-y-1">
              <div className="flex justify-between text-gray-400">
                <span>EQ High</span>
                <span className="font-mono text-gray-200">
                  {deck.eqHigh > 0 ? `+${deck.eqHigh.toFixed(1)}` : deck.eqHigh.toFixed(1)} dB
                </span>
              </div>
              <input
                type="range"
                min={-24}
                max={12}
                step={0.5}
                value={deck.eqHigh}
                onChange={(e) => djAudioEngine.setDeckEq(deckId, 'high', parseFloat(e.target.value))}
                className="sonora-range w-full h-1.5 rounded-full bg-white/10"
              />
            </label>

            <label className="space-y-1">
              <div className="flex justify-between text-gray-400">
                <span>EQ Mid</span>
                <span className="font-mono text-gray-200">
                  {deck.eqMid > 0 ? `+${deck.eqMid.toFixed(1)}` : deck.eqMid.toFixed(1)} dB
                </span>
              </div>
              <input
                type="range"
                min={-24}
                max={12}
                step={0.5}
                value={deck.eqMid}
                onChange={(e) => djAudioEngine.setDeckEq(deckId, 'mid', parseFloat(e.target.value))}
                className="sonora-range w-full h-1.5 rounded-full bg-white/10"
              />
            </label>

            <label className="space-y-1 sm:col-span-2">
              <div className="flex justify-between text-gray-400">
                <span>EQ Low</span>
                <span className="font-mono text-gray-200">
                  {deck.eqLow > 0 ? `+${deck.eqLow.toFixed(1)}` : deck.eqLow.toFixed(1)} dB
                </span>
              </div>
              <input
                type="range"
                min={-24}
                max={12}
                step={0.5}
                value={deck.eqLow}
                onChange={(e) => djAudioEngine.setDeckEq(deckId, 'low', parseFloat(e.target.value))}
                className="sonora-range w-full h-1.5 rounded-full bg-white/10"
              />
            </label>

            {/* Independent Deck Spatial Audio Controls */}
            <div className="col-span-2 sm:col-span-4 mt-1 pt-2.5 border-t border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-300">
                  Deck {deckId} 3D Spatial Audio
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={deck.spatial.enabled}
                  onClick={() =>
                    djAudioEngine.updateDeckSpatial(deckId, { enabled: !deck.spatial.enabled })
                  }
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                    deck.spatial.enabled
                      ? 'bg-red-600 text-white'
                      : 'bg-white/[0.07] text-gray-400 hover:text-white'
                  }`}
                >
                  {deck.spatial.enabled ? '3D ON' : 'OFF'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <div className="flex justify-between text-gray-400">
                    <span>3D Angle</span>
                    <span className="font-mono text-gray-200">{deck.spatial.azimuthDeg}°</span>
                  </div>
                  <input
                    type="range"
                    aria-label={`Deck ${deckId} 3D spatial angle`}
                    min={-90}
                    max={90}
                    step={2}
                    disabled={!deck.spatial.enabled}
                    value={deck.spatial.azimuthDeg}
                    onChange={(e) =>
                      djAudioEngine.updateDeckSpatial(deckId, {
                        azimuthDeg: parseInt(e.target.value, 10),
                      })
                    }
                    className="sonora-range w-full h-1 rounded-full bg-white/10 disabled:opacity-40"
                  />
                </label>

                <label className="space-y-1">
                  <div className="flex justify-between text-gray-400">
                    <span>Depth</span>
                    <span className="font-mono text-gray-200">
                      {Math.round(deck.spatial.depth * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label={`Deck ${deckId} spatial depth`}
                    min={0}
                    max={1}
                    step={0.02}
                    disabled={!deck.spatial.enabled}
                    value={deck.spatial.depth}
                    onChange={(e) =>
                      djAudioEngine.updateDeckSpatial(deckId, {
                        depth: parseFloat(e.target.value),
                      })
                    }
                    className="sonora-range w-full h-1 rounded-full bg-white/10 disabled:opacity-40"
                  />
                </label>

                <label className="space-y-1">
                  <div className="flex justify-between text-gray-400">
                    <span>Ambience</span>
                    <span className="font-mono text-gray-200">
                      {Math.round(deck.spatial.ambience * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label={`Deck ${deckId} spatial ambience`}
                    min={0}
                    max={1}
                    step={0.02}
                    disabled={!deck.spatial.enabled}
                    value={deck.spatial.ambience}
                    onChange={(e) =>
                      djAudioEngine.updateDeckSpatial(deckId, {
                        ambience: parseFloat(e.target.value),
                      })
                    }
                    className="sonora-range w-full h-1 rounded-full bg-white/10 disabled:opacity-40"
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Track Selector Modal */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPickerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111216] p-4 space-y-3 max-h-[80vh] flex flex-col"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-display text-base font-bold text-white">
                Load Track into Deck {deckId}
              </h4>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search local songs by title, artist, album, genre..."
                className="w-full rounded-xl border border-white/10 bg-[#08090C] pl-9 pr-3 py-2 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500/60"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {filteredTracks.length === 0 ? (
                <p className="text-xs text-gray-400 py-8 text-center">
                  No local tracks match your filter. Import songs into SONORA first to mix them.
                </p>
              ) : (
                filteredTracks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setPickerOpen(false);
                      void djAudioEngine.loadTrack(deckId, t);
                    }}
                    className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.06] text-left transition-colors"
                  >
                    <ArtworkThumb artworkId={t.artworkId} alt={t.title} sizeClass="w-9 h-9" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{t.title}</p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {t.artist} · {t.genre || 'Music'}
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-gray-400 shrink-0">
                      {formatDuration(t.duration)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
