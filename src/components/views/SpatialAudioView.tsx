import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BookmarkPlus,
  CheckCircle2,
  Headphones,
  Info,
  Orbit,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Volume2,
  XCircle,
} from 'lucide-react';
import { audioEngine } from '../../audio/audioEngine';
import { DEFAULT_SPATIAL_AUDIO_SETTINGS } from '../../db/sonoraDb';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { SpatialAudioMode, SpatialAudioSettings } from '../../types/music';
import { formatBitrate } from '../../utils/formatters';
import { SPATIAL_MODE_DEFINITIONS } from '../../utils/spatialAudioPresets';
import {
  detectBrowserSpatialCodecSupport,
  inspectTrackSpatialMetadata,
} from '../../utils/spatialCompatibility';

export const SpatialAudioView: React.FC = () => {
  const tracks = useLibraryStore((s) => s.tracks);
  const settings = useLibraryStore((s) => s.settings);
  const updateSpatialAudioSettings = useLibraryStore((s) => s.updateSpatialAudioSettings);
  const selectSpatialAudioMode = useLibraryStore((s) => s.selectSpatialAudioMode);
  const saveCustomSpatialProfile = useLibraryStore((s) => s.saveCustomSpatialProfile);
  const applyCustomSpatialProfile = useLibraryStore((s) => s.applyCustomSpatialProfile);
  const deleteCustomSpatialProfile = useLibraryStore((s) => s.deleteCustomSpatialProfile);
  const updateVisualizerSettings = useLibraryStore((s) => s.updateVisualizerSettings);
  const setActiveView = useLibraryStore((s) => s.setActiveView);

  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const [profileNameInput, setProfileNameInput] = useState('');
  const [includeEqSnapshot, setIncludeEqSnapshot] = useState(true);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);

  const customProfiles = settings.customSpatialProfiles || [];

  const spatial: SpatialAudioSettings = {
    ...DEFAULT_SPATIAL_AUDIO_SETTINGS,
    ...(settings.spatialAudio || {}),
  };

  const currentTrack = useMemo(
    () => tracks.find((t) => t.id === currentTrackId) || null,
    [tracks, currentTrackId]
  );

  const codecs = useMemo(() => detectBrowserSpatialCodecSupport(), []);
  const trackInspection = useMemo(
    () => inspectTrackSpatialMetadata(currentTrack, codecs),
    [currentTrack, codecs]
  );

  const libraryStats = useMemo(() => {
    let atmosTagged = 0;
    let multichannelTagged = 0;
    let standardStereo = 0;
    for (const t of tracks) {
      const report = inspectTrackSpatialMetadata(t, codecs);
      if (report.isAtmosContainer) atmosTagged += 1;
      else if (report.hasSpatialMetadata) multichannelTagged += 1;
      else standardStereo += 1;
    }
    return { atmosTagged, multichannelTagged, standardStereo };
  }, [tracks, codecs]);

  // Live L/R Stereo Channel Energy Meter
  const [stereoMeter, setStereoMeter] = useState({ left: 0, right: 0, spread: 0 });
  useEffect(() => {
    if (!isPlaying) {
      setStereoMeter({ left: 0, right: 0, spread: 0 });
      return;
    }
    let timer = 0;
    const sample = () => {
      const frame = audioEngine.sampleAudioAnalysis();
      setStereoMeter({
        left: frame.leftLevel,
        right: frame.rightLevel,
        spread: frame.stereoSpread,
      });
      timer = window.setTimeout(sample, 65);
    };
    timer = window.setTimeout(sample, 65);
    return () => window.clearTimeout(timer);
  }, [isPlaying]);

  // Interactive 3D Sound-Field Positioning Pad
  const padRef = useRef<HTMLDivElement | null>(null);
  const draggingPadRef = useRef(false);

  const updatePositionFromPointer = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = Math.max(10, Math.min(rect.width, rect.height) * 0.44);

    const dx = clientX - cx;
    const dy = clientY - cy;
    // Angle: 0 deg = top (front), +90 = right, -90 = left, +/-180 = rear
    const angleRad = Math.atan2(dx, -dy);
    const azimuthDeg = Math.round((angleRad * 180) / Math.PI);
    const dist = Math.min(1, Math.hypot(dx, dy) / maxR);

    void updateSpatialAudioSettings({
      enabled: true,
      mode: 'custom',
      azimuthDeg,
      distance: Number(dist.toFixed(2)),
    });
  };

  const patchCustom = (patch: Partial<SpatialAudioSettings>) => {
    void updateSpatialAudioSettings({
      enabled: true,
      mode: 'custom',
      ...patch,
    });
  };

  const toggleMaster = () => {
    if (!spatial.enabled) {
      if (spatial.mode === 'stereo') {
        void selectSpatialAudioMode('3d_spatial');
      } else {
        void updateSpatialAudioSettings({ enabled: true });
      }
    } else {
      void updateSpatialAudioSettings({ enabled: false });
    }
  };

  const resetToStereo = () => {
    void selectSpatialAudioMode('stereo');
  };

  // Orb position in SVG percentage coordinates (0..100)
  const azRad = (spatial.azimuthDeg * Math.PI) / 180;
  const radiusPct = 8 + spatial.distance * 36;
  const orbX = 50 + Math.sin(azRad) * radiusPct;
  const orbY = 50 - Math.cos(azRad) * radiusPct;

  const isProcessingActive = spatial.enabled && spatial.mode !== 'stereo';

  return (
    <div className="flex-1 overflow-y-auto pr-1 pb-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Orbit className="w-6 h-6 text-red-500 shrink-0" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Spatial Audio &amp; Formats
            </h1>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Web Audio HRTF 3D positioning, Mid/Side stage width, virtual surround, room reverb, and honest Atmos format compatibility.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={spatial.headphoneMode}
            onClick={() =>
              updateSpatialAudioSettings({
                headphoneMode: !spatial.headphoneMode,
              })
            }
            className={`inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-medium transition-colors ${
              spatial.headphoneMode
                ? 'border-red-500/50 bg-red-600/15 text-red-200'
                : 'border-white/10 bg-[#111216] text-gray-300 hover:text-white'
            }`}
          >
            <Headphones className="w-4 h-4 shrink-0 text-red-400" />
            <span>Headphones: {spatial.headphoneMode ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={spatial.limiterEnabled}
            onClick={() =>
              updateSpatialAudioSettings({
                limiterEnabled: !spatial.limiterEnabled,
              })
            }
            className={`inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-medium transition-colors ${
              spatial.limiterEnabled
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-white/10 bg-[#111216] text-gray-300 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>Clip Guard: {spatial.limiterEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={resetToStereo}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl border border-white/10 bg-[#111216] text-xs font-medium text-gray-300 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Stereo Bypass</span>
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={isProcessingActive}
            onClick={toggleMaster}
            className={`inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              isProcessingActive
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'border border-white/15 bg-[#111216] text-gray-200 hover:bg-white/[0.06]'
            }`}
          >
            <Orbit className="w-4 h-4" />
            <span>{isProcessingActive ? 'Spatial Engine Active' : 'Enable Spatial Audio'}</span>
          </button>
        </div>
      </div>

      {/* 9 Spatial Audio Modes */}
      <section aria-labelledby="spatial-modes-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="spatial-modes-heading" className="font-display text-sm font-semibold text-white">
            Spatial Audio Modes
          </h2>
          <span className="text-xs font-mono text-gray-400">
            Active:{' '}
            <span className={isProcessingActive ? 'text-red-400 font-semibold' : 'text-gray-200'}>
              {SPATIAL_MODE_DEFINITIONS.find((m) => m.id === spatial.mode)?.label ?? 'Stereo'}
            </span>
            {' · '}
            {isProcessingActive ? 'Web Audio 3D DSP Engaged' : 'Bit-Transparent Bypass'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {SPATIAL_MODE_DEFINITIONS.map((mode) => {
            const active =
              mode.id === 'stereo'
                ? !spatial.enabled || spatial.mode === 'stereo'
                : spatial.enabled && spatial.mode === mode.id;

            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => selectSpatialAudioMode(mode.id as SpatialAudioMode)}
                className={`rounded-xl border p-3.5 text-left transition-all ${
                  active
                    ? 'border-red-500/75 bg-red-600/15 shadow-lg shadow-red-950/20'
                    : 'border-white/[0.07] bg-[#111216] hover:border-white/20 hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-display text-sm font-semibold ${active ? 'text-white' : 'text-gray-200'}`}>
                    {mode.label}
                  </span>
                  <span className="font-mono text-[11px] uppercase text-gray-400">
                    {mode.id === 'stereo'
                      ? 'Bypass'
                      : `${Math.round(mode.settings.spatialWidth * 100)}% W`}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">{mode.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3D Positioning Stage + Precision Spatial Controls */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(300px,0.95fr)_minmax(340px,1.25fr)] gap-5">
        {/* Left: Interactive 3D Sound-Field Pad + Live L/R Meter */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-white">
                3D Sound-Field Positioning
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Drag or tap around the listener to steer HRTF azimuth &amp; distance.
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-red-400">
              {spatial.azimuthDeg > 0 ? `+${spatial.azimuthDeg}°` : `${spatial.azimuthDeg}°`} ·{' '}
              {Math.round(spatial.distance * 100)}% dist
            </span>
          </div>

          {/* Interactive Radial Pad */}
          <div
            ref={padRef}
            role="application"
            aria-label="3D audio azimuth and distance positioning pad"
            onPointerDown={(e) => {
              draggingPadRef.current = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              updatePositionFromPointer(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (!draggingPadRef.current) return;
              updatePositionFromPointer(e.clientX, e.clientY);
            }}
            onPointerUp={() => {
              draggingPadRef.current = false;
            }}
            onPointerCancel={() => {
              draggingPadRef.current = false;
            }}
            className="relative mx-auto w-full max-w-[300px] aspect-square rounded-2xl border border-white/[0.08] bg-[#050507] touch-none select-none cursor-crosshair overflow-hidden"
          >
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <defs>
                <radialGradient id="spatialFieldGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(239,68,68,0.16)" />
                  <stop offset="65%" stopColor="rgba(127,29,29,0.06)" />
                  <stop offset="100%" stopColor="rgba(5,5,7,0)" />
                </radialGradient>
              </defs>
              <circle cx="50" cy="50" r="46" fill="url(#spatialFieldGrad)" />
              <circle cx="50" cy="50" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.4" />
              <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.4" />
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" strokeDasharray="1.5 1.5" />
              <line x1="50" y1="6" x2="50" y2="94" stroke="rgba(255,255,255,0.06)" strokeWidth="0.4" />
              <line x1="6" y1="50" x2="94" y2="50" stroke="rgba(255,255,255,0.06)" strokeWidth="0.4" />

              {/* Vector beam from listener to 3D source */}
              <line
                x1="50"
                y1="50"
                x2={orbX}
                y2={orbY}
                stroke={isProcessingActive ? 'rgba(239,68,68,0.65)' : 'rgba(156,163,175,0.35)'}
                strokeWidth="0.8"
              />

              {/* Listener Center */}
              <circle cx="50" cy="50" r="4.2" fill="#1F2937" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
              <circle cx="50" cy="50" r="1.4" fill="#F3F4F6" />

              {/* Sound Source Orb */}
              <circle
                cx={orbX}
                cy={orbY}
                r={isProcessingActive ? 4.8 : 3.8}
                fill={isProcessingActive ? '#EF4444' : '#6B7280'}
                stroke="#FCA5A5"
                strokeWidth="0.7"
              />
            </svg>

            <span className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-mono text-gray-500">
              FRONT
            </span>
            <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-mono text-gray-500">
              REAR
            </span>
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-gray-500">
              L
            </span>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-gray-500">
              R
            </span>
          </div>

          {/* Elevation & Quick Center */}
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="spatial-elevation" className="text-gray-300 font-medium">
                  Vertical Elevation (Height)
                </label>
                <span className="font-mono tabular-nums text-red-400">
                  {spatial.elevationDeg > 0 ? `+${spatial.elevationDeg}°` : `${spatial.elevationDeg}°`}
                </span>
              </div>
              <input
                id="spatial-elevation"
                type="range"
                min={-45}
                max={45}
                step={1}
                value={spatial.elevationDeg}
                onChange={(e) => patchCustom({ elevationDeg: parseInt(e.target.value, 10) })}
                style={{
                  background: `linear-gradient(to right, #EF4444 ${((spatial.elevationDeg + 45) / 90) * 100}%, rgba(255,255,255,0.14) ${((spatial.elevationDeg + 45) / 90) * 100}%)`,
                }}
                className="sonora-range w-full h-1.5 rounded-full"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => patchCustom({ azimuthDeg: 0, elevationDeg: 0, distance: 0.2 })}
                className="px-3 py-1.5 rounded-lg border border-white/10 bg-[#050507] text-xs text-gray-300 hover:text-white"
              >
                Center Stage
              </button>
              <button
                type="button"
                onClick={() => {
                  updateVisualizerSettings({ enabled: true, style: 'spatial_3d' });
                  setActiveView('songs');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-600/15 text-xs font-medium text-red-300 hover:bg-red-600/25"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Sync 3D Spatial Visualizer</span>
              </button>
            </div>
          </div>

          {/* Live L / R Output Energy Meter */}
          <div className="rounded-xl border border-white/[0.06] bg-[#050507] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-gray-300 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-red-400" />
                Live L / R Spatial Field Meter
              </span>
              <span className="font-mono tabular-nums text-[11px] text-gray-400">
                Spread {Math.round(stereoMeter.spread * 100)}%
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <span className="w-4 font-mono text-[11px] text-gray-400">L</span>
                <div className="flex-1 h-2 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-700 via-red-500 to-amber-400 transition-[width] duration-75"
                    style={{ width: `${Math.round(stereoMeter.left * 100)}%` }}
                  />
                </div>
                <span className="w-9 text-right font-mono text-[11px] tabular-nums text-gray-400">
                  {Math.round(stereoMeter.left * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="w-4 font-mono text-[11px] text-gray-400">R</span>
                <div className="flex-1 h-2 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-700 via-red-500 to-amber-400 transition-[width] duration-75"
                    style={{ width: `${Math.round(stereoMeter.right * 100)}%` }}
                  />
                </div>
                <span className="w-9 text-right font-mono text-[11px] tabular-nums text-gray-400">
                  {Math.round(stereoMeter.right * 100)}%
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Right: Advanced Spatial Stage & Tone Controls */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-red-400" />
                Stage Width, Surround, Reverb &amp; Tone
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Adjusting any slider switches cleanly into Custom Spatial mode.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SpatialSlider
              id="sp-width"
              label="Spatial Stereo Width"
              valueDisplay={`${Math.round(spatial.spatialWidth * 100)}%`}
              min={0}
              max={2}
              step={0.02}
              value={spatial.spatialWidth}
              pct={(spatial.spatialWidth / 2) * 100}
              onChange={(v) => patchCustom({ spatialWidth: v })}
            />

            <SpatialSlider
              id="sp-surround"
              label="Virtual Surround Projection"
              valueDisplay={`${Math.round(spatial.surroundIntensity * 100)}%`}
              min={0}
              max={1}
              step={0.02}
              value={spatial.surroundIntensity}
              pct={spatial.surroundIntensity * 100}
              onChange={(v) => patchCustom({ surroundIntensity: v })}
            />

            <SpatialSlider
              id="sp-depth"
              label="3D Stage Depth"
              valueDisplay={`${Math.round(spatial.depth * 100)}%`}
              min={0}
              max={1}
              step={0.02}
              value={spatial.depth}
              pct={spatial.depth * 100}
              onChange={(v) => patchCustom({ depth: v })}
            />

            <SpatialSlider
              id="sp-distance"
              label="Source Distance"
              valueDisplay={`${Math.round(spatial.distance * 100)}%`}
              min={0}
              max={1}
              step={0.02}
              value={spatial.distance}
              pct={spatial.distance * 100}
              onChange={(v) => patchCustom({ distance: v })}
            />

            <SpatialSlider
              id="sp-reverb"
              label="Room Reverb &amp; Ambience"
              valueDisplay={`${Math.round(spatial.reverbIntensity * 100)}%`}
              min={0}
              max={1}
              step={0.02}
              value={spatial.reverbIntensity}
              pct={spatial.reverbIntensity * 100}
              onChange={(v) => patchCustom({ reverbIntensity: v })}
            />

            <SpatialSlider
              id="sp-balance"
              label="Left / Right Balance"
              valueDisplay={
                Math.abs(spatial.balance) < 0.02
                  ? 'Center'
                  : spatial.balance < 0
                    ? `${Math.round(Math.abs(spatial.balance) * 100)}% L`
                    : `${Math.round(spatial.balance * 100)}% R`
              }
              min={-1}
              max={1}
              step={0.02}
              value={spatial.balance}
              pct={((spatial.balance + 1) / 2) * 100}
              onChange={(v) => patchCustom({ balance: v })}
            />
          </div>

          <div className="pt-3 border-t border-white/[0.06] space-y-3">
            <h3 className="text-xs font-semibold text-gray-300">
              Spatial Tone Shaping (Protected by Clip Limiter)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <SpatialSlider
                id="sp-bass"
                label="Bass Enhancement"
                valueDisplay={`${spatial.bassEnhanceDb > 0 ? '+' : ''}${spatial.bassEnhanceDb.toFixed(1)} dB`}
                min={-6}
                max={10}
                step={0.5}
                value={spatial.bassEnhanceDb}
                pct={((spatial.bassEnhanceDb + 6) / 16) * 100}
                onChange={(v) => patchCustom({ bassEnhanceDb: v })}
              />

              <SpatialSlider
                id="sp-mid"
                label="Mid Vocal Presence"
                valueDisplay={`${spatial.midGainDb > 0 ? '+' : ''}${spatial.midGainDb.toFixed(1)} dB`}
                min={-6}
                max={6}
                step={0.5}
                value={spatial.midGainDb}
                pct={((spatial.midGainDb + 6) / 12) * 100}
                onChange={(v) => patchCustom({ midGainDb: v })}
              />

              <SpatialSlider
                id="sp-treble"
                label="Treble Air &amp; Detail"
                valueDisplay={`${spatial.trebleEnhanceDb > 0 ? '+' : ''}${spatial.trebleEnhanceDb.toFixed(1)} dB`}
                min={-6}
                max={8}
                step={0.5}
                value={spatial.trebleEnhanceDb}
                pct={((spatial.trebleEnhanceDb + 6) / 14) * 100}
                onChange={(v) => patchCustom({ trebleEnhanceDb: v })}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Custom Spatial Profiles */}
      <section
        aria-labelledby="custom-spatial-profiles-heading"
        className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div>
            <h2
              id="custom-spatial-profiles-heading"
              className="font-display text-base font-semibold text-white flex items-center gap-2"
            >
              <BookmarkPlus className="w-4 h-4 text-red-400" />
              <span>Custom Spatial Profiles</span>
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Save your current Stereo Width, Room Reverb, 3D stage positioning, and EQ curve as named IndexedDB presets.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-gray-400">
            {customProfiles.length} saved {customProfiles.length === 1 ? 'profile' : 'profiles'}
          </span>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const trimmed = profileNameInput.trim();
            if (!trimmed) return;
            const created = await saveCustomSpatialProfile(trimmed, includeEqSnapshot);
            setProfileNameInput('');
            setActiveProfileId(created.id);
            setProfileFeedback(`Saved profile "${created.name}".`);
          }}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-[#050507] p-3.5"
        >
          <input
            type="text"
            value={profileNameInput}
            onChange={(e) => setProfileNameInput(e.target.value)}
            placeholder="Preset name (e.g. Late Night Wide Hall)"
            maxLength={48}
            aria-label="Custom spatial profile name"
            className="flex-1 min-w-[200px] rounded-lg border border-white/10 bg-[#111216] px-3 py-2 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500/60"
          />

          <label className="inline-flex items-center gap-2 text-xs text-gray-300 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={includeEqSnapshot}
              onChange={(e) => setIncludeEqSnapshot(e.target.checked)}
              className="accent-red-600 w-3.5 h-3.5"
            />
            <span>Include 10-Band EQ</span>
          </label>

          <button
            type="submit"
            disabled={!profileNameInput.trim()}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-4 py-1.5 rounded-lg bg-red-600 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-40 whitespace-nowrap"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>Save Preset</span>
          </button>
        </form>

        {profileFeedback && (
          <p className="text-xs text-emerald-400 font-medium">{profileFeedback}</p>
        )}

        {customProfiles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-[#050507]/60 px-4 py-6 text-center text-xs text-gray-500">
            No custom spatial profiles saved yet. Adjust your Width, Room Reverb, and EQ sliders above, then save them as a named preset.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {customProfiles.map((profile) => {
              const isApplied = activeProfileId === profile.id && spatial.mode === 'custom';
              return (
                <div
                  key={profile.id}
                  className={`rounded-xl border p-3.5 space-y-2.5 transition-colors ${
                    isApplied
                      ? 'border-red-500/70 bg-red-600/10'
                      : 'border-white/[0.07] bg-[#050507] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display text-sm font-semibold text-white truncate">
                        {profile.name}
                      </p>
                      <p className="font-mono text-[11px] tabular-nums text-gray-400 mt-0.5">
                        Width {Math.round(profile.spatial.spatialWidth * 100)}% · Reverb{' '}
                        {Math.round(profile.spatial.reverbIntensity * 100)}%
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (activeProfileId === profile.id) setActiveProfileId(null);
                        void deleteCustomSpatialProfile(profile.id);
                      }}
                      aria-label={`Delete spatial profile ${profile.name}`}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-gray-400 border-t border-white/[0.06] pt-2">
                    <span>
                      Tone: {profile.spatial.bassEnhanceDb >= 0 ? '+' : ''}
                      {profile.spatial.bassEnhanceDb.toFixed(1)} /{' '}
                      {profile.spatial.midGainDb >= 0 ? '+' : ''}
                      {profile.spatial.midGainDb.toFixed(1)} /{' '}
                      {profile.spatial.trebleEnhanceDb >= 0 ? '+' : ''}
                      {profile.spatial.trebleEnhanceDb.toFixed(1)} dB
                    </span>
                    <span className={profile.eqSnapshot ? 'text-red-300' : 'text-gray-500'}>
                      {profile.eqSnapshot ? 'EQ+Spatial' : 'Spatial Only'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      await applyCustomSpatialProfile(profile.id);
                      setActiveProfileId(profile.id);
                      setProfileFeedback(`Applied "${profile.name}".`);
                    }}
                    className={`w-full py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      isApplied
                        ? 'bg-red-600 text-white'
                        : 'bg-white/[0.08] text-gray-200 hover:bg-red-600/25 hover:text-white'
                    }`}
                  >
                    {isApplied ? 'Active Profile' : 'Apply Profile'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Dolby Atmos Compatibility & Honest Format Inspector */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-red-400" />
              Dolby Atmos &amp; Audio Format Compatibility
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Transparent codec diagnostics. Standard stereo tracks are never misrepresented as Dolby Atmos — SONORA processes stereo via Web Audio 3D spatial algorithms.
            </p>
          </div>

          <div className="text-right font-mono text-xs text-gray-400 space-y-0.5">
            <p>
              Library: <span className="text-white">{tracks.length}</span> tracks
            </p>
            <p>
              Atmos-tagged: <span className="text-amber-300">{libraryStats.atmosTagged}</span>
              {' · '}Spatial-tagged: <span className="text-red-300">{libraryStats.multichannelTagged}</span>
              {' · '}Stereo: <span className="text-gray-200">{libraryStats.standardStereo}</span>
            </p>
          </div>
        </div>

        {/* Active Track Classification */}
        <div
          className={`rounded-xl border p-4 space-y-2 ${
            trackInspection.kind === 'browser_decodable_atmos'
              ? 'border-emerald-500/35 bg-emerald-500/10'
              : trackInspection.kind === 'unsupported_atmos_codec'
                ? 'border-amber-500/40 bg-amber-500/10'
                : 'border-white/[0.08] bg-[#050507]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-red-400 shrink-0" />
              <span className="font-display text-sm font-semibold text-white">
                {currentTrack ? `${currentTrack.title} — ${currentTrack.artist}` : 'Active Playback Path'}
              </span>
            </div>
            <span className="font-mono text-xs font-semibold text-red-300">
              {trackInspection.badgeLabel}
            </span>
          </div>

          <p className="text-xs font-medium text-gray-200">{trackInspection.headline}</p>
          <p className="text-xs text-gray-400 leading-relaxed">{trackInspection.detail}</p>

          {currentTrack && (
            <p className="pt-1 font-mono text-[11px] text-gray-400">
              Codec: {currentTrack.format}
              {currentTrack.mimeType ? ` · ${currentTrack.mimeType}` : ''}
              {currentTrack.bitrate ? ` · ${formatBitrate(currentTrack.bitrate)}` : ''}
              {currentTrack.sampleRate ? ` · ${(currentTrack.sampleRate / 1000).toFixed(1)} kHz` : ''}
            </p>
          )}
        </div>

        {/* Live Browser Codec Matrix */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-gray-300">
              Browser Native Decoder Probes (HTMLMediaElement.canPlayType)
            </h3>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
              <Info className="w-3.5 h-3.5 text-gray-500" />
              Live browser report on this device
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {codecs.map((codec) => {
              const supported = codec.canPlay !== 'unsupported';
              return (
                <div
                  key={codec.id}
                  className="rounded-xl border border-white/[0.07] bg-[#050507] p-3.5 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-semibold text-white">{codec.label}</p>
                    <p className="font-mono text-[11px] text-gray-500 truncate">{codec.mimeTest}</p>
                    <p className="text-[11px] text-gray-400 leading-snug">{codec.note}</p>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5 font-mono text-[11px]">
                    {supported ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300 capitalize">{codec.canPlay}</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-500">Unsupported</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};

interface SpatialSliderProps {
  id: string;
  label: string;
  valueDisplay: string;
  min: number;
  max: number;
  step: number;
  value: number;
  pct: number;
  onChange: (value: number) => void;
}

const SpatialSlider: React.FC<SpatialSliderProps> = ({
  id,
  label,
  valueDisplay,
  min,
  max,
  step,
  value,
  pct,
  onChange,
}) => {
  const clampedPct = Math.max(0, Math.min(100, pct));
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#050507] p-3.5 space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor={id} className="font-medium text-gray-200 truncate">
          {label}
        </label>
        <span className="font-mono tabular-nums text-red-400 shrink-0">{valueDisplay}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          background: `linear-gradient(to right, #EF4444 ${clampedPct}%, rgba(255,255,255,0.14) ${clampedPct}%)`,
        }}
        className="sonora-range w-full h-1.5 rounded-full"
      />
    </div>
  );
};
