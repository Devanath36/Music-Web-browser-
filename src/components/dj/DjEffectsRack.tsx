import React from 'react';
import { Power, RotateCcw, Sparkles } from 'lucide-react';
import { djAudioEngine, type DjEngineSnapshot } from '../../audio/djAudioEngine';
import {
  createDefaultEffectsMap,
  DJ_EFFECT_DEFINITIONS,
  type DjEffectId,
} from '../../utils/djPresets';

interface DjEffectsRackProps {
  snapshot: DjEngineSnapshot;
}

export const DjEffectsRack: React.FC<DjEffectsRackProps> = ({ snapshot }) => {
  const activeCount = DJ_EFFECT_DEFINITIONS.filter(
    (def) => snapshot.effects[def.id]?.enabled
  ).length;

  const resetAllEffects = () => {
    const defaults = createDefaultEffectsMap();
    for (const def of DJ_EFFECT_DEFINITIONS) {
      djAudioEngine.updateEffect(def.id, defaults[def.id]);
    }
  };

  return (
    <section
      aria-label="DJ Effects Rack"
      className="rounded-2xl border border-white/[0.08] bg-[#0B0C10]/95 p-4 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-red-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">Real-Time Web Audio Effects Rack</h3>
            <p className="text-[11px] text-gray-400">
              10 live DSP processors applied directly to your DJ mix bus ({activeCount} active)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={resetAllEffects}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-gray-300 hover:text-white"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Bypass All</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {DJ_EFFECT_DEFINITIONS.map((def) => {
          const id: DjEffectId = def.id;
          const st = snapshot.effects[id] || def.defaultState;
          return (
            <div
              key={id}
              className={`rounded-xl border p-3 space-y-2.5 transition-colors ${
                st.enabled
                  ? 'border-red-500/45 bg-red-600/[0.08]'
                  : 'border-white/[0.07] bg-[#08090C]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-white truncate">{def.name}</h4>
                  <p className="text-[10px] text-gray-400 truncate">{def.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => djAudioEngine.updateEffect(id, { enabled: !st.enabled })}
                  aria-label={`Toggle ${def.name}`}
                  aria-pressed={st.enabled}
                  className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                    st.enabled
                      ? 'bg-red-600 text-white'
                      : 'bg-white/[0.07] text-gray-300 hover:bg-white/[0.14]'
                  }`}
                >
                  <Power className="w-3 h-3" />
                  <span>{st.enabled ? 'ON' : 'OFF'}</span>
                </button>
              </div>

              <div className="space-y-2 text-[11px]">
                <label className="block space-y-0.5">
                  <div className="flex justify-between text-gray-400">
                    <span>Intensity</span>
                    <span className="font-mono text-gray-200 tabular-nums">
                      {Math.round(st.intensity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label={`${def.name} intensity`}
                    min={0.05}
                    max={1}
                    step={0.02}
                    value={st.intensity}
                    onChange={(e) =>
                      djAudioEngine.updateEffect(id, { intensity: parseFloat(e.target.value) })
                    }
                    className="sonora-range w-full h-1 rounded-full bg-white/10"
                  />
                </label>

                <label className="block space-y-0.5">
                  <div className="flex justify-between text-gray-400">
                    <span>Wet Mix</span>
                    <span className="font-mono text-gray-200 tabular-nums">
                      {Math.round(st.mix * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label={`${def.name} wet mix`}
                    min={0.05}
                    max={1}
                    step={0.02}
                    value={st.mix}
                    onChange={(e) =>
                      djAudioEngine.updateEffect(id, { mix: parseFloat(e.target.value) })
                    }
                    className="sonora-range w-full h-1 rounded-full bg-white/10"
                  />
                </label>

                {def.hasTiming && (
                  <label className="block space-y-0.5">
                    <div className="flex justify-between text-gray-400">
                      <span>Timing</span>
                      <span className="font-mono text-gray-200 tabular-nums">
                        {Math.round(st.timingMs ?? 250)} ms
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label={`${def.name} timing milliseconds`}
                      min={60}
                      max={id === 'stutter' ? 400 : 900}
                      step={10}
                      value={st.timingMs ?? 250}
                      onChange={(e) =>
                        djAudioEngine.updateEffect(id, { timingMs: parseFloat(e.target.value) })
                      }
                      className="sonora-range w-full h-1 rounded-full bg-white/10"
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
