import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ChevronDown,
  Heart,
  ListMusic,
  Orbit,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { audioEngine } from '../../audio/audioEngine';
import { DEFAULT_SPATIAL_AUDIO_SETTINGS, DEFAULT_VISUALIZER_SETTINGS } from '../../db/sonoraDb';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { formatBitrate, formatBytes, formatDuration } from '../../utils/formatters';
import { SPATIAL_MODE_DEFINITIONS } from '../../utils/spatialAudioPresets';
import { ArtworkThumb } from '../library/ArtworkThumb';
import { AudioReactiveCanvas } from '../visualizer/AudioReactiveCanvas';
import {
  VISUALIZER_STYLE_OPTIONS,
  VisualizerSettingsPanel,
} from '../visualizer/VisualizerSettingsPanel';

export const ExpandedPlayer: React.FC = () => {
  const isExpandedOpen = usePlayerStore((s) => s.isExpandedOpen);
  const setExpandedOpen = usePlayerStore((s) => s.setExpandedOpen);
  const setQueueOpen = usePlayerStore((s) => s.setQueueOpen);

  const tracks = useLibraryStore((s) => s.tracks);
  const favoriteIds = useLibraryStore((s) => s.favoriteIds);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const settings = useLibraryStore((s) => s.settings);
  const updateVisualizerSettings = useLibraryStore((s) => s.updateVisualizerSettings);
  const setActiveView = useLibraryStore((s) => s.setActiveView);

  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const smartShuffle = usePlayerStore((s) => s.smartShuffle);
  const repeat = usePlayerStore((s) => s.repeat);

  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrevious = usePlayerStore((s) => s.playPrevious);
  const seek = usePlayerStore((s) => s.seek);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const toggleSmartShuffle = usePlayerStore((s) => s.toggleSmartShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);

  const [showVisSettings, setShowVisSettings] = useState(false);
  const reducedMotion = useReducedMotion();
  const artworkFrameRef = useRef<HTMLDivElement | null>(null);
  const artworkGlowRef = useRef<HTMLDivElement | null>(null);

  const vis = useMemo(
    () => ({
      ...DEFAULT_VISUALIZER_SETTINGS,
      ...(settings.visualizer || {}),
    }),
    [settings.visualizer]
  );

  const spatial = useMemo(
    () => ({
      ...DEFAULT_SPATIAL_AUDIO_SETTINGS,
      ...(settings.spatialAudio || {}),
    }),
    [settings.spatialAudio]
  );
  const spatialActive = spatial.enabled && spatial.mode !== 'stereo';
  const spatialLabel =
    SPATIAL_MODE_DEFINITIONS.find((m) => m.id === spatial.mode)?.shortLabel ?? 'Spatial';

  const currentTrack = useMemo(
    () => tracks.find((t) => t.id === currentTrackId) || null,
    [tracks, currentTrackId]
  );

  // Smooth GPU-composited 3D artwork tilt, gentle rotation & bass-reactive crimson glow
  useEffect(() => {
    if (!isExpandedOpen || !currentTrack) return;

    const frameEl = artworkFrameRef.current;
    const glowEl = artworkGlowRef.current;
    if (!frameEl) return;

    if (!vis.enabled || reducedMotion || (!vis.threeDEnabled && !vis.albumRotationEnabled)) {
      frameEl.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg) scale(1)';
      if (glowEl) {
        glowEl.style.opacity = '0.18';
        glowEl.style.transform = 'scale(1)';
      }
      return;
    }

    let rafId = 0;
    let angle = 0;
    let smoothBass = 0;
    let smoothMid = 0;
    let smoothBeat = 0;
    let lastTs = 0;

    const tick = (ts: number) => {
      rafId = requestAnimationFrame(tick);
      const minStep = vis.performanceMode ? 33 : 16;
      if (ts - lastTs < minStep) return;
      lastTs = ts;

      const sample = audioEngine.sampleAudioAnalysis();
      const lerp = sample.active ? 0.25 : 0.08;
      smoothBass += (sample.bass - smoothBass) * lerp;
      smoothMid += (sample.mid - smoothMid) * lerp;
      smoothBeat += (sample.beatPulse - smoothBeat) * 0.35;

      if (sample.active) {
        angle += (0.014 + smoothMid * 0.025) * vis.animationIntensity;
      }

      const spatialAzBias = spatialActive ? Math.max(-10, Math.min(10, (spatial.azimuthDeg / 180) * 10)) : 0;
      const spatialDepthScale = spatialActive ? 1 - spatial.distance * 0.035 + spatial.depth * 0.025 : 1;

      const rotX = vis.threeDEnabled
        ? Math.sin(angle * 0.9) * (4 + smoothBass * 7) * vis.animationIntensity +
          (spatialActive ? (spatial.elevationDeg / 45) * 4 : 0)
        : 0;
      const rotY = vis.albumRotationEnabled
        ? Math.cos(angle * 0.7) * (6 + smoothMid * 9) * vis.animationIntensity + spatialAzBias
        : spatialAzBias;
      const rotZ = vis.albumRotationEnabled && vis.style === 'circular'
        ? Math.sin(angle * 0.5) * 3.5 * vis.animationIntensity
        : 0;
      const scale =
        spatialDepthScale + (vis.threeDEnabled ? smoothBass * 0.03 + smoothBeat * 0.025 : 0);

      frameEl.style.transform = `perspective(1100px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) rotateZ(${rotZ.toFixed(2)}deg) scale(${scale.toFixed(4)})`;

      if (glowEl) {
        const glowAlpha = Math.min(0.82, 0.16 + smoothBass * 0.45 + smoothBeat * 0.3);
        const glowScale = 0.96 + smoothBass * 0.16 + smoothBeat * 0.08;
        glowEl.style.opacity = glowAlpha.toFixed(3);
        glowEl.style.transform = `scale(${glowScale.toFixed(3)})`;
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [
    isExpandedOpen,
    currentTrack,
    vis.enabled,
    vis.threeDEnabled,
    vis.albumRotationEnabled,
    vis.animationIntensity,
    vis.performanceMode,
    vis.style,
    spatialActive,
    spatial.azimuthDeg,
    spatial.elevationDeg,
    spatial.distance,
    spatial.depth,
    reducedMotion,
  ]);

  if (!isExpandedOpen || !currentTrack) return null;

  const isFav = favoriteIds.has(currentTrack.id);
  const maxDuration = duration > 0 ? duration : currentTrack.duration || 0;
  const progressPct = maxDuration > 0 ? Math.min(100, (currentTime / maxDuration) * 100) : 0;

  const techSpecs = [
    currentTrack.sourceType === 'remote'
      ? 'Online Stream'
      : currentTrack.storageSection === 'storage2'
        ? 'Storage 2'
        : 'Storage 1',
    currentTrack.format,
    currentTrack.bitrate ? formatBitrate(currentTrack.bitrate) : null,
    currentTrack.sampleRate ? `${(currentTrack.sampleRate / 1000).toFixed(1)} kHz` : null,
    currentTrack.fileSize > 0 ? formatBytes(currentTrack.fileSize) : null,
  ].filter(Boolean);

  const isCircular = vis.enabled && vis.style === 'circular';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#050507] text-white overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing"
    >
      {/* Dynamic Audio-Reactive Background Layer */}
      {vis.enabled && vis.backgroundIntensity > 0 && (
        <div className="pointer-events-none fixed inset-0 z-0">
          <AudioReactiveCanvas
            variant="background"
            style={vis.style}
            enabled={vis.enabled}
            isPlaying={isPlaying}
            animationIntensity={vis.animationIntensity}
            backgroundIntensity={vis.backgroundIntensity}
            threeDEnabled={vis.threeDEnabled}
            performanceMode={vis.performanceMode}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050507]/70 via-[#050507]/35 to-[#050507]/85" />
        </div>
      )}

      {/* Non-circular background/stage visualizer layer */}
      {vis.enabled && !isCircular && (
        <div className="pointer-events-none fixed inset-x-0 top-16 bottom-36 z-0 opacity-85">
          <AudioReactiveCanvas
            variant="stage"
            style={vis.style}
            enabled={vis.enabled}
            isPlaying={isPlaying}
            animationIntensity={vis.animationIntensity}
            backgroundIntensity={vis.backgroundIntensity}
            threeDEnabled={vis.threeDEnabled}
            performanceMode={vis.performanceMode}
          />
        </div>
      )}

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-4 border-b border-white/[0.06] bg-[#050507]/60 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setExpandedOpen(false)}
          aria-label="Minimize Now Playing"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-gray-300 hover:text-white hover:bg-white/5"
        >
          <ChevronDown className="w-6 h-6" />
        </button>

        <div className="text-center min-w-0 px-4">
          <p className="text-xs font-medium text-gray-400 truncate">Now Playing</p>
          <p className="text-xs font-medium text-gray-200 truncate">{currentTrack.album}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setExpandedOpen(false);
              setActiveView('spatial');
            }}
            aria-label="Open Spatial Audio settings"
            title="Spatial Audio & Formats"
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
              spatialActive
                ? 'text-red-400 bg-red-500/15'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Orbit className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowVisSettings((v) => !v)}
            aria-label="Visualizer settings"
            aria-expanded={showVisSettings}
            title="Visualizer settings"
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
              showVisSettings
                ? 'text-red-400 bg-red-500/15'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              setExpandedOpen(false);
              setQueueOpen(true);
            }}
            aria-label="Open queue"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-gray-300 hover:text-white hover:bg-white/5"
          >
            <ListMusic className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Collapsible Visualizer Settings Panel */}
      {showVisSettings && (
        <div className="relative z-20 mx-auto w-full max-w-3xl px-4 sm:px-6 pt-4">
          <div className="rounded-2xl border border-white/10 bg-[#0B0C10]/95 backdrop-blur-xl p-4 sm:p-5 shadow-2xl">
            <VisualizerSettingsPanel compact />
          </div>
        </div>
      )}

      {/* Main Stage + Controls */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-6 max-w-2xl mx-auto w-full gap-6">
        {/* Quick Visualizer Mode Bar */}
        <div className="w-full flex items-center justify-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => updateVisualizerSettings({ enabled: !vis.enabled })}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
              !vis.enabled
                ? 'bg-white/15 text-white'
                : 'bg-black/40 text-gray-400 hover:text-white border border-white/[0.06]'
            }`}
          >
            <Activity className="w-3 h-3 text-red-400" />
            <span>{vis.enabled ? 'Effects On' : 'Effects Off'}</span>
          </button>

          {VISUALIZER_STYLE_OPTIONS.map((opt) => {
            const active = vis.enabled && vis.style === opt.id;
            const shortLabel = opt.label.replace(' Visualizer', '').replace(' Music', '');
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateVisualizerSettings({ enabled: true, style: opt.id })}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-red-600 text-white'
                    : 'bg-black/40 text-gray-400 hover:text-white border border-white/[0.06]'
                }`}
              >
                {shortLabel}
              </button>
            );
          })}
        </div>

        {/* 3D Album Artwork + Circular Orbit Visualizer Container */}
        <div
          key={currentTrack.id}
          className="relative flex items-center justify-center w-72 h-72 sm:w-[360px] sm:h-[360px] sonora-track-enter"
        >
          {isCircular && (
            <div className="pointer-events-none absolute -inset-6 sm:-inset-8 z-0">
              <AudioReactiveCanvas
                variant="stage"
                style="circular"
                enabled={vis.enabled}
                isPlaying={isPlaying}
                animationIntensity={vis.animationIntensity}
                backgroundIntensity={vis.backgroundIntensity}
                threeDEnabled={vis.threeDEnabled}
                performanceMode={vis.performanceMode}
              />
            </div>
          )}

          {/* Music-Reactive Crimson Depth Aura */}
          {vis.enabled && (
            <div
              ref={artworkGlowRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-4 rounded-3xl bg-red-600/35 blur-2xl transition-opacity duration-200"
            />
          )}

          {/* 3D Animated Album Artwork */}
          <div
            ref={artworkFrameRef}
            className="relative z-10 will-change-transform transition-transform duration-150 ease-out"
          >
            <ArtworkThumb
              artworkId={currentTrack.artworkId}
              alt={currentTrack.album || currentTrack.title}
              sizeClass={isCircular ? 'w-48 h-48 sm:w-56 sm:h-56 shadow-2xl' : 'w-60 h-60 sm:w-72 sm:h-72 shadow-2xl'}
              roundedClass={isCircular ? 'rounded-full ring-2 ring-red-500/35' : 'rounded-2xl ring-1 ring-white/10'}
              sourceType={currentTrack.sourceType}
              iconSizeClass="w-20 h-20"
            />
          </div>
        </div>

        {/* Track Title, Artist, Technical Specs & Favorite */}
        <div className="w-full flex items-start justify-between gap-4 rounded-2xl bg-[#050507]/55 backdrop-blur-sm px-4 py-3 border border-white/[0.06]">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white truncate">
              {currentTrack.title}
            </h2>
            <p className="mt-1 text-base text-gray-300 truncate">{currentTrack.artist}</p>
            <p className="mt-1.5 text-xs font-mono text-gray-400 truncate">
              {techSpecs.join(' · ')}
              {spatialActive && (
                <span className="text-red-300"> · Spatial: {spatialLabel}</span>
              )}
              {smartShuffle && (
                <span className="text-red-400"> · Smart Shuffle Active</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleFavorite(currentTrack.id)}
            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
              isFav ? 'text-red-500 bg-red-500/15' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Heart className={`w-6 h-6 ${isFav ? 'fill-red-500' : ''}`} />
          </button>
        </div>

        {/* Seek Bar */}
        <div className="w-full space-y-2">
          <input
            type="range"
            aria-label="Seek track position"
            min={0}
            max={maxDuration > 0 ? maxDuration : 100}
            step={0.5}
            value={maxDuration > 0 ? Math.min(currentTime, maxDuration) : 0}
            disabled={maxDuration <= 0}
            onChange={(e) => seek(parseFloat(e.target.value))}
            style={{
              background: `linear-gradient(to right, #EF4444 ${progressPct}%, rgba(255,255,255,0.14) ${progressPct}%)`,
            }}
            className="sonora-range w-full h-1.5 rounded-full"
          />
          <div className="flex items-center justify-between text-xs font-mono tabular-nums text-gray-400">
            <span>{formatDuration(currentTime)}</span>
            <span>{maxDuration > 0 ? formatDuration(maxDuration) : '0:00'}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="w-full flex items-center justify-between max-w-md">
          <button
            type="button"
            onClick={toggleShuffle}
            aria-label={shuffle && !smartShuffle ? 'Disable shuffle' : 'Enable shuffle'}
            aria-pressed={shuffle && !smartShuffle}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl ${
              shuffle && !smartShuffle ? 'text-red-400 bg-red-500/15' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={toggleSmartShuffle}
            aria-label={smartShuffle ? 'Disable Smart Shuffle' : 'Enable Smart Shuffle'}
            aria-pressed={smartShuffle}
            title="Smart Shuffle"
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl ${
              smartShuffle ? 'text-red-400 bg-red-500/15' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={playPrevious}
            aria-label="Previous track"
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white hover:bg-white/5"
          >
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          <button
            type="button"
            onClick={togglePlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="w-16 h-16 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500 active:scale-95 transition-all shadow-xl"
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current ml-1" />
            )}
          </button>

          <button
            type="button"
            onClick={() => playNext(true)}
            aria-label="Next track"
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white hover:bg-white/5"
          >
            <SkipForward className="w-7 h-7 fill-current" />
          </button>

          <button
            type="button"
            onClick={cycleRepeat}
            aria-label={`Repeat mode: ${repeat}`}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl ${
              repeat !== 'off' ? 'text-red-400 bg-red-500/15' : 'text-gray-400 hover:text-white'
            }`}
          >
            {repeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
          </button>
        </div>

        {/* Volume */}
        <div className="w-full max-w-xs flex items-center gap-3">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white"
          >
            {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.02}
            value={muted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            style={{
              background: `linear-gradient(to right, #E5E7EB ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.14) ${(muted ? 0 : volume) * 100}%)`,
            }}
            className="sonora-range flex-1 h-1 rounded-full"
          />
        </div>
      </div>
    </div>
  );
};
