import React, { useState } from 'react';
import { Headphones, Orbit, Plus, ShieldCheck, Trash2, Volume2 } from 'lucide-react';
import { djAudioEngine, type DjEngineSnapshot } from '../../audio/djAudioEngine';
import { useLibraryStore } from '../../store/useLibraryStore';
import type { SpatialAudioMode } from '../../types/music';
import { computeCrossfaderGains } from '../../utils/bpmAnalyzer';
import { BUILTIN_DJ_PRESETS } from '../../utils/djPresets';
import { SPATIAL_MODE_DEFINITIONS } from '../../utils/spatialAudioPresets';

interface DjMixerConsoleProps {
  snapshot: DjEngineSnapshot;
}

export const DjMixerConsole: React.FC<DjMixerConsoleProps> = ({ snapshot }) => {
  const customPresets = useLibraryStore((s) => s.settings.customDjPresets) ?? [];
  const saveCustomDjPreset = useLibraryStore((s) => s.saveCustomDjPreset);
  const deleteCustomDjPreset = useLibraryStore((s) => s.deleteCustomDjPreset);

  const [newPresetName, setNewPresetName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);

  const { gainA, gainB } = computeCrossfaderGains(snapshot.crossfader);
  const allPresets = [...BUILTIN_DJ_PRESETS, ...customPresets];

  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newPresetName.trim();
    if (!clean) return;
    const id = `custom-${Date.now()}`;
    const exported = djAudioEngine.exportCurrentAsPreset(id, clean);
    await saveCustomDjPreset(exported);
    djAudioEngine.applyPreset(exported);
    setNewPresetName('');
    setShowSaveForm(false);
  };

  return (
    <section
      aria-label="Central DJ Mixer"
      className="flex flex-col rounded-2xl border border-white/[0.08] bg-[#0B0C10]/95 p-3.5 sm:p-4 space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Central Mixer</h3>
          <p className="text-[11px] text-gray-400">Equal-power bus &amp; presets</p>
        </div>
        <span
          title="Master Limiter & Soft Clipper active"
          className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Limiter</span>
        </span>
      </div>

      {/* Master Peak Meter */}
      <div className="rounded-xl border border-white/[0.06] bg-[#07080B] p-2.5 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-400 font-medium">Master Output Level</span>
          <span className="font-mono text-gray-300 tabular-nums">
            {Math.round(snapshot.masterPeakLevel * 100)}%
          </span>
        </div>
        <div className="grid grid-cols-16 gap-1 h-2.5">
          {Array.from({ length: 16 }).map((_, idx) => {
            const threshold = (idx + 1) / 16;
            const lit = snapshot.masterPeakLevel >= threshold * 0.85;
            const color =
              idx >= 13 ? 'bg-red-500' : idx >= 10 ? 'bg-amber-400' : 'bg-emerald-400';
            return (
              <div
                key={idx}
                className={`rounded-sm transition-colors ${lit ? color : 'bg-white/[0.08]'}`}
              />
            );
          })}
        </div>
      </div>

      {/* Master & Cue Headphone Volumes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
        <label className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-gray-300">
              <Volume2 className="w-3.5 h-3.5 text-red-400" />
              <span>Master Volume</span>
            </span>
            <span className="font-mono text-gray-200 tabular-nums">
              {Math.round(snapshot.masterVolume * 100)}%
            </span>
          </div>
          <input
            type="range"
            aria-label="Master Volume"
            min={0}
            max={1.15}
            step={0.01}
            value={snapshot.masterVolume}
            onChange={(e) => djAudioEngine.setMasterVolume(parseFloat(e.target.value))}
            className="sonora-range w-full h-1.5 rounded-full bg-white/10"
          />
        </label>

        <label className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-gray-300">
              <Headphones className="w-3.5 h-3.5 text-sky-400" />
              <span>Headphone Cue PFL</span>
            </span>
            <span className="font-mono text-gray-200 tabular-nums">
              {Math.round(snapshot.cueVolume * 100)}%
            </span>
          </div>
          <input
            type="range"
            aria-label="Headphone Cue Volume"
            min={0}
            max={1}
            step={0.01}
            value={snapshot.cueVolume}
            onChange={(e) => djAudioEngine.setCueVolume(parseFloat(e.target.value))}
            className="sonora-range w-full h-1.5 rounded-full bg-white/10"
          />
        </label>
      </div>

      {/* Equal-Power Crossfader */}
      <div className="rounded-xl border border-white/[0.07] bg-[#08090C] p-3 space-y-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-mono font-semibold text-red-400">
            DECK A {Math.round(gainA * 100)}%
          </span>
          <span className="text-gray-400 font-semibold">CROSSFADER</span>
          <span className="font-mono font-semibold text-orange-400">
            {Math.round(gainB * 100)}% DECK B
          </span>
        </div>

        <input
          type="range"
          aria-label="DJ Crossfader"
          min={-1}
          max={1}
          step={0.01}
          value={snapshot.crossfader}
          onChange={(e) => djAudioEngine.setCrossfader(parseFloat(e.target.value), true)}
          className="sonora-range w-full h-2.5 rounded-full bg-gradient-to-r from-red-600/40 via-white/20 to-orange-500/40"
        />

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => djAudioEngine.setCrossfader(-1, true)}
            className={`py-1 rounded-lg text-[11px] font-mono font-semibold border ${
              snapshot.crossfader <= -0.9
                ? 'border-red-500 bg-red-600/20 text-red-300'
                : 'border-white/[0.08] bg-white/[0.04] text-gray-300 hover:text-white'
            }`}
          >
            Cut A
          </button>
          <button
            type="button"
            onClick={() => djAudioEngine.setCrossfader(0, true)}
            className={`py-1 rounded-lg text-[11px] font-mono font-semibold border ${
              Math.abs(snapshot.crossfader) < 0.08
                ? 'border-white/30 bg-white/15 text-white'
                : 'border-white/[0.08] bg-white/[0.04] text-gray-300 hover:text-white'
            }`}
          >
            Mix 50/50
          </button>
          <button
            type="button"
            onClick={() => djAudioEngine.setCrossfader(1, true)}
            className={`py-1 rounded-lg text-[11px] font-mono font-semibold border ${
              snapshot.crossfader >= 0.9
                ? 'border-orange-500 bg-orange-500/20 text-orange-300'
                : 'border-white/[0.08] bg-white/[0.04] text-gray-300 hover:text-white'
            }`}
          >
            Cut B
          </button>
        </div>
      </div>

      {/* Master Spatial Audio & Crossfade Transition Ambience */}
      <div className="rounded-xl border border-white/[0.07] bg-[#08090C] p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-200">
            <Orbit className="w-3.5 h-3.5 text-red-400" />
            <span>Master Spatial</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={snapshot.masterSpatial.enabled}
            onClick={() =>
              djAudioEngine.updateMasterSpatial({
                enabled: !snapshot.masterSpatial.enabled,
                mode:
                  !snapshot.masterSpatial.enabled && snapshot.masterSpatial.mode === 'stereo'
                    ? '3d_spatial'
                    : snapshot.masterSpatial.mode,
              })
            }
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
              snapshot.masterSpatial.enabled
                ? 'bg-red-600 text-white'
                : 'bg-white/[0.07] text-gray-400 hover:text-white'
            }`}
          >
            {snapshot.masterSpatial.enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <select
          aria-label="Master DJ Spatial Audio Mode"
          value={snapshot.masterSpatial.mode}
          onChange={(e) =>
            djAudioEngine.selectMasterSpatialMode(e.target.value as SpatialAudioMode)
          }
          className="w-full rounded-lg border border-white/10 bg-[#050507] px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-red-500"
        >
          {SPATIAL_MODE_DEFINITIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>

        <div className="pt-1 border-t border-white/[0.06] space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-400">Fade Spatial Ambience</span>
            <button
              type="button"
              role="switch"
              aria-checked={snapshot.spatialTransitionEnabled}
              onClick={() =>
                djAudioEngine.setSpatialTransitionConfig({
                  enabled: !snapshot.spatialTransitionEnabled,
                })
              }
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                snapshot.spatialTransitionEnabled
                  ? 'bg-red-600/80 text-white'
                  : 'bg-white/[0.06] text-gray-400'
              }`}
            >
              {snapshot.spatialTransitionEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          {snapshot.spatialTransitionEnabled && (
            <input
              type="range"
              aria-label="Crossfade spatial ambience depth"
              min={0.1}
              max={1}
              step={0.05}
              value={snapshot.spatialTransitionAmbience}
              onChange={(e) =>
                djAudioEngine.setSpatialTransitionConfig({
                  ambience: parseFloat(e.target.value),
                })
              }
              className="sonora-range w-full h-1 rounded-full bg-white/10"
            />
          )}
        </div>
      </div>

      {/* DJ Presets */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-300">DJ Presets</span>
          <button
            type="button"
            onClick={() => setShowSaveForm((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-red-400 hover:text-red-300"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Save Preset</span>
          </button>
        </div>

        {showSaveForm && (
          <form onSubmit={handleSavePreset} className="flex items-center gap-1.5">
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="Preset name..."
              className="flex-1 min-w-0 rounded-lg border border-white/15 bg-[#07080B] px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-red-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
            >
              Save
            </button>
          </form>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          {allPresets.map((preset) => {
            const active = snapshot.activePresetId === preset.id;
            const isCustom = !BUILTIN_DJ_PRESETS.some((b) => b.id === preset.id);
            return (
              <div key={preset.id} className="relative flex items-center">
                <button
                  type="button"
                  onClick={() => djAudioEngine.applyPreset(preset)}
                  className={`w-full px-2.5 py-2 rounded-lg text-left text-[11px] font-medium border transition-colors truncate ${
                    active
                      ? 'bg-red-600/20 border-red-500/50 text-red-200'
                      : 'bg-white/[0.04] border-white/[0.07] text-gray-300 hover:text-white hover:bg-white/[0.08]'
                  } ${isCustom ? 'pr-7' : ''}`}
                >
                  {preset.name}
                </button>
                {isCustom && (
                  <button
                    type="button"
                    aria-label={`Delete preset ${preset.name}`}
                    onClick={() => void deleteCustomDjPreset(preset.id)}
                    className="absolute right-1.5 p-1 text-gray-400 hover:text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
