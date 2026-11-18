import React from 'react';
import {
  Activity,
  BarChart2,
  Box,
  CircleDot,
  Cpu,
  Disc3,
  Eye,
  EyeOff,
  Orbit,
  Sliders,
  Sparkles,
  Waves,
} from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useLibraryStore } from '../../store/useLibraryStore';
import type { VisualizerSettings, VisualizerStyle } from '../../types/music';
import { DEFAULT_VISUALIZER_SETTINGS } from '../../db/sonoraDb';

export const VISUALIZER_STYLE_OPTIONS: {
  id: VisualizerStyle;
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  {
    id: 'circular',
    label: 'Circular Visualizer',
    description: 'Radial spectrum ring orbiting album artwork',
    icon: CircleDot,
  },
  {
    id: 'waveform',
    label: 'Audio Waveform',
    description: 'Continuous time-domain harmonic wave layers',
    icon: Waves,
  },
  {
    id: 'bars',
    label: 'Frequency Bars',
    description: 'Dynamic frequency bars with peak-hold indicators',
    icon: BarChart2,
  },
  {
    id: 'particles',
    label: 'Particle Visualizer',
    description: 'Beat-accelerated crimson & warm ember field',
    icon: Sparkles,
  },
  {
    id: '3d',
    label: '3D Music Visualizer',
    description: 'Perspective depth-sorted rotating audio towers',
    icon: Box,
  },
  {
    id: 'spatial_3d',
    label: '3D Spatial Sound-Field',
    description: 'Live L/R stereo spread & 3D surround dome',
    icon: Orbit,
  },
  {
    id: 'spectrum',
    label: 'Spectrum Visualizer',
    description: 'Smooth filled frequency contour curve',
    icon: Activity,
  },
  {
    id: 'ambient',
    label: 'Ambient Visualizer',
    description: 'Soft crimson & ember lighting gradients',
    icon: Sliders,
  },
];

interface VisualizerSettingsPanelProps {
  compact?: boolean;
}

export const VisualizerSettingsPanel: React.FC<VisualizerSettingsPanelProps> = ({
  compact = false,
}) => {
  const settings = useLibraryStore((s) => s.settings);
  const updateVisualizerSettings = useLibraryStore((s) => s.updateVisualizerSettings);
  const reducedMotion = useReducedMotion();

  const vis: VisualizerSettings = {
    ...DEFAULT_VISUALIZER_SETTINGS,
    ...(settings.visualizer || {}),
  };

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      {/* Master Enable / Minimal Mode Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-white">
            Music-Reactive Visualizer &amp; Effects
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Driven in real time by Web Audio API AnalyserNode. Disabling effects never interrupts playback.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={vis.enabled}
          onClick={() => updateVisualizerSettings({ enabled: !vis.enabled })}
          className={`inline-flex items-center gap-2 min-h-[38px] px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            vis.enabled
              ? 'border-red-500/60 bg-red-600 text-white hover:bg-red-500'
              : 'border-white/10 bg-[#050507] text-gray-300 hover:text-white'
          }`}
        >
          {vis.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>{vis.enabled ? 'Visualizer Enabled' : 'Minimal Mode (Off)'}</span>
        </button>
      </div>

      {reducedMotion && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
          Your device prefers reduced motion — rotational and particle motion is automatically toned down.
        </p>
      )}

      {/* Style Selector Grid */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-300">Visualizer Style</p>
        <div
          className={`grid gap-2 ${
            compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          }`}
        >
          {VISUALIZER_STYLE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = vis.style === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={!vis.enabled}
                onClick={() => updateVisualizerSettings({ style: opt.id })}
                className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-45 ${
                  active
                    ? 'border-red-500/70 bg-red-600/15'
                    : 'border-white/[0.08] bg-[#050507] hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-red-400' : 'text-gray-400'}`} />
                  <span className={`text-xs font-semibold truncate ${active ? 'text-white' : 'text-gray-200'}`}>
                    {opt.label}
                  </span>
                </div>
                {!compact && (
                  <p className="text-[11px] text-gray-400 mt-1 leading-snug">{opt.description}</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Intensity Sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/[0.07] bg-[#050507] p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="vis-anim-intensity" className="font-medium text-gray-200">
              Animation Intensity
            </label>
            <span className="font-mono tabular-nums text-red-400">
              {Math.round(vis.animationIntensity * 100)}%
            </span>
          </div>
          <input
            id="vis-anim-intensity"
            type="range"
            min={0.25}
            max={1.5}
            step={0.05}
            disabled={!vis.enabled}
            value={vis.animationIntensity}
            onChange={(e) =>
              updateVisualizerSettings({ animationIntensity: parseFloat(e.target.value) })
            }
            style={{
              background: `linear-gradient(to right, #EF4444 ${((vis.animationIntensity - 0.25) / 1.25) * 100}%, rgba(255,255,255,0.14) ${((vis.animationIntensity - 0.25) / 1.25) * 100}%)`,
            }}
            className="sonora-range w-full h-1.5 rounded-full disabled:opacity-40"
          />
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-[#050507] p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="vis-bg-intensity" className="font-medium text-gray-200">
              Background Effect Intensity
            </label>
            <span className="font-mono tabular-nums text-red-400">
              {Math.round(vis.backgroundIntensity * 100)}%
            </span>
          </div>
          <input
            id="vis-bg-intensity"
            type="range"
            min={0}
            max={1}
            step={0.05}
            disabled={!vis.enabled}
            value={vis.backgroundIntensity}
            onChange={(e) =>
              updateVisualizerSettings({ backgroundIntensity: parseFloat(e.target.value) })
            }
            style={{
              background: `linear-gradient(to right, #EF4444 ${vis.backgroundIntensity * 100}%, rgba(255,255,255,0.14) ${vis.backgroundIntensity * 100}%)`,
            }}
            className="sonora-range w-full h-1.5 rounded-full disabled:opacity-40"
          />
        </div>
      </div>

      {/* Motion & Performance Toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <button
          type="button"
          role="switch"
          aria-checked={vis.threeDEnabled}
          disabled={!vis.enabled}
          onClick={() => updateVisualizerSettings({ threeDEnabled: !vis.threeDEnabled })}
          className={`flex items-center justify-between gap-2 min-h-[44px] px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-colors disabled:opacity-40 ${
            vis.threeDEnabled
              ? 'border-red-500/50 bg-red-600/10 text-white'
              : 'border-white/[0.08] bg-[#050507] text-gray-400'
          }`}
        >
          <span className="flex items-center gap-2">
            <Box className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>3D Depth Effects</span>
          </span>
          <span className="font-mono text-[11px]">{vis.threeDEnabled ? 'ON' : 'OFF'}</span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={vis.albumRotationEnabled}
          disabled={!vis.enabled}
          onClick={() =>
            updateVisualizerSettings({ albumRotationEnabled: !vis.albumRotationEnabled })
          }
          className={`flex items-center justify-between gap-2 min-h-[44px] px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-colors disabled:opacity-40 ${
            vis.albumRotationEnabled
              ? 'border-red-500/50 bg-red-600/10 text-white'
              : 'border-white/[0.08] bg-[#050507] text-gray-400'
          }`}
        >
          <span className="flex items-center gap-2">
            <Disc3 className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>Album 3D Rotation</span>
          </span>
          <span className="font-mono text-[11px]">{vis.albumRotationEnabled ? 'ON' : 'OFF'}</span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={vis.performanceMode}
          onClick={() => updateVisualizerSettings({ performanceMode: !vis.performanceMode })}
          className={`flex items-center justify-between gap-2 min-h-[44px] px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
            vis.performanceMode
              ? 'border-red-500/50 bg-red-600/10 text-white'
              : 'border-white/[0.08] bg-[#050507] text-gray-400'
          }`}
        >
          <span className="flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>Performance Mode</span>
          </span>
          <span className="font-mono text-[11px]">{vis.performanceMode ? 'ON' : 'OFF'}</span>
        </button>
      </div>
    </div>
  );
};
