import React from 'react';
import { Info, RotateCcw, Sliders } from 'lucide-react';
import { audioEngine, EQ_FREQUENCIES, EQ_PRESETS } from '../../audio/audioEngine';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { EqualizerPresetId } from '../../types/music';

function formatFreq(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

export const EqualizerView: React.FC = () => {
  const equalizer = useLibraryStore((s) => s.equalizer);
  const setEqualizerEnabled = useLibraryStore((s) => s.setEqualizerEnabled);
  const selectEqualizerPreset = useLibraryStore((s) => s.selectEqualizerPreset);
  const setEqualizerBand = useLibraryStore((s) => s.setEqualizerBand);
  const setEqualizerBass = useLibraryStore((s) => s.setEqualizerBass);
  const setEqualizerTreble = useLibraryStore((s) => s.setEqualizerTreble);
  const resetEqualizer = useLibraryStore((s) => s.resetEqualizer);

  const webAudioActive = usePlayerStore((s) => s.webAudioActive);
  const webAudioSupported = audioEngine.isWebAudioSupported();

  const presetKeys: Exclude<EqualizerPresetId, 'custom'>[] = [
    'flat',
    'bass',
    'treble',
    'pop',
    'rock',
    'classical',
  ];

  return (
    <section className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">Equalizer</h1>
          <p className="text-xs text-gray-400 mt-1">
            10-band Web Audio API acoustic shaping with presets, Bass/Treble shelves, and persistent settings.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={resetEqualizer}
            className="inline-flex items-center gap-2 min-h-[38px] px-3.5 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={equalizer.enabled}
            onClick={() => setEqualizerEnabled(!equalizer.enabled)}
            className={`inline-flex items-center gap-2 min-h-[38px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              equalizer.enabled
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'border border-white/10 bg-[#111216] text-gray-300 hover:bg-white/10'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{equalizer.enabled ? 'EQ Active' : 'EQ Bypassed'}</span>
          </button>
        </div>
      </div>

      {/* Presets */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-white">Presets</h2>
          <span className="text-xs text-gray-400">
            Active: <strong className="text-red-400 capitalize">{equalizer.preset}</strong>
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {presetKeys.map((key) => {
            const active = equalizer.preset === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => selectEqualizerPreset(key)}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-red-600 text-white'
                    : 'border border-white/10 bg-[#050507] text-gray-300 hover:text-white hover:border-white/20'
                }`}
              >
                {EQ_PRESETS[key].label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => selectEqualizerPreset('custom')}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              equalizer.preset === 'custom'
                ? 'bg-red-600 text-white'
                : 'border border-white/10 bg-[#050507] text-gray-300 hover:text-white hover:border-white/20'
            }`}
          >
            Custom
          </button>
        </div>
      </div>

      {/* Bass & Treble Shelves */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-display text-sm font-semibold text-white">Bass Boost (100 Hz)</span>
            <span className="font-mono tabular-nums text-red-400">
              {equalizer.bassGain > 0 ? `+${equalizer.bassGain}` : equalizer.bassGain} dB
            </span>
          </div>
          <input
            type="range"
            aria-label="Bass gain"
            min={-12}
            max={12}
            step={0.5}
            value={equalizer.bassGain}
            onChange={(e) => setEqualizerBass(parseFloat(e.target.value))}
            className="sonora-range w-full h-1.5 rounded-full bg-white/10"
          />
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-display text-sm font-semibold text-white">Treble Boost (8 kHz)</span>
            <span className="font-mono tabular-nums text-red-400">
              {equalizer.trebleGain > 0 ? `+${equalizer.trebleGain}` : equalizer.trebleGain} dB
            </span>
          </div>
          <input
            type="range"
            aria-label="Treble gain"
            min={-12}
            max={12}
            step={0.5}
            value={equalizer.trebleGain}
            onChange={(e) => setEqualizerTreble(parseFloat(e.target.value))}
            className="sonora-range w-full h-1.5 rounded-full bg-white/10"
          />
        </div>
      </div>

      {/* 10-Band Frequency Graphic EQ */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-white">
            10-Band Frequency Equalizer
          </h2>
          <span className="text-[11px] font-mono text-gray-400">Range: -12 dB to +12 dB</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-3">
          {EQ_FREQUENCIES.map((freq, idx) => {
            const val = equalizer.bands[idx] ?? 0;
            return (
              <div
                key={freq}
                className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-[#050507] p-3"
              >
                <span className="font-mono text-[11px] tabular-nums text-red-400">
                  {val > 0 ? `+${val}` : val}
                </span>
                <input
                  type="range"
                  aria-label={`${formatFreq(freq)} Hz band`}
                  min={-12}
                  max={12}
                  step={0.5}
                  value={val}
                  onChange={(e) => setEqualizerBand(idx, parseFloat(e.target.value))}
                  className="sonora-range w-full h-1.5 rounded-full bg-white/10"
                />
                <span className="font-mono text-[11px] text-gray-400">{formatFreq(freq)} Hz</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Compatibility Notice */}
      <div className="rounded-xl border border-white/[0.07] bg-[#0B0C10] p-4 flex items-start gap-3 text-xs text-gray-400">
        <Info className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-gray-200 font-medium">
            Web Audio Status: {webAudioSupported ? (webAudioActive ? 'Graph Connected' : 'Standby (Bypassed for maximum background compatibility)') : 'Unsupported in this browser'}
          </p>
          <p>
            To protect Android background & screen-locked playback stability, SONORA only attaches the Web Audio `AudioContext` filter chain when you enable the Equalizer. If any device experiences audio stutter while screen-locked, switch Equalizer to Bypassed.
          </p>
        </div>
      </div>
    </section>
  );
};
