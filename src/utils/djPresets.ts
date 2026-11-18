import type { DjPresetConfig, DjPresetEffectState } from '../types/music';

export type DjEffectId =
  | 'echo'
  | 'reverb'
  | 'delay'
  | 'flanger'
  | 'phaser'
  | 'lowpass'
  | 'highpass'
  | 'bassboost'
  | 'beatrepeat'
  | 'stutter';

export interface DjEffectDefinition {
  id: DjEffectId;
  name: string;
  shortLabel: string;
  description: string;
  hasTiming: boolean;
  defaultState: DjPresetEffectState;
}

export const DJ_EFFECT_DEFINITIONS: DjEffectDefinition[] = [
  {
    id: 'echo',
    name: 'Echo',
    shortLabel: 'Echo',
    description: 'Warm damped tape echo tail',
    hasTiming: true,
    defaultState: { enabled: false, intensity: 0.45, mix: 0.35, timingMs: 375 },
  },
  {
    id: 'reverb',
    name: 'Reverb',
    shortLabel: 'Reverb',
    description: 'Club hall impulse convolution reverb',
    hasTiming: false,
    defaultState: { enabled: false, intensity: 0.5, mix: 0.28 },
  },
  {
    id: 'delay',
    name: 'Delay',
    shortLabel: 'Delay',
    description: 'Crisp rhythmic stereo feedback delay',
    hasTiming: true,
    defaultState: { enabled: false, intensity: 0.4, mix: 0.32, timingMs: 250 },
  },
  {
    id: 'flanger',
    name: 'Flanger',
    shortLabel: 'Flanger',
    description: 'LFO jet sweep comb modulation',
    hasTiming: false,
    defaultState: { enabled: false, intensity: 0.55, mix: 0.45 },
  },
  {
    id: 'phaser',
    name: 'Phaser',
    shortLabel: 'Phaser',
    description: '4-stage all-pass phase sweep',
    hasTiming: false,
    defaultState: { enabled: false, intensity: 0.55, mix: 0.45 },
  },
  {
    id: 'lowpass',
    name: 'Low-Pass',
    shortLabel: 'LPF',
    description: 'Resonant low-pass build-up filter',
    hasTiming: false,
    defaultState: { enabled: false, intensity: 0.5, mix: 1 },
  },
  {
    id: 'highpass',
    name: 'High-Pass',
    shortLabel: 'HPF',
    description: 'Resonant high-pass drop sweep',
    hasTiming: false,
    defaultState: { enabled: false, intensity: 0.45, mix: 1 },
  },
  {
    id: 'bassboost',
    name: 'Bass Boost',
    shortLabel: 'Bass+',
    description: 'Sub-bass punch shelf boost',
    hasTiming: false,
    defaultState: { enabled: false, intensity: 0.55, mix: 0.8 },
  },
  {
    id: 'beatrepeat',
    name: 'Beat Repeat',
    shortLabel: 'Repeat',
    description: 'Tempo-synced micro-loop repeater',
    hasTiming: true,
    defaultState: { enabled: false, intensity: 0.65, mix: 0.85, timingMs: 250 },
  },
  {
    id: 'stutter',
    name: 'Stutter',
    shortLabel: 'Stutter',
    description: 'Rhythmic trance gate chopper',
    hasTiming: true,
    defaultState: { enabled: false, intensity: 0.65, mix: 0.9, timingMs: 125 },
  },
];

export function createDefaultEffectsMap(): Record<DjEffectId, DjPresetEffectState> {
  const map = {} as Record<DjEffectId, DjPresetEffectState>;
  for (const def of DJ_EFFECT_DEFINITIONS) {
    map[def.id] = { ...def.defaultState };
  }
  return map;
}

function buildPresetEffects(
  overrides: Partial<Record<DjEffectId, Partial<DjPresetEffectState>>>
): Record<string, DjPresetEffectState> {
  const base = createDefaultEffectsMap();
  for (const [id, patch] of Object.entries(overrides)) {
    const key = id as DjEffectId;
    if (base[key] && patch) {
      base[key] = { ...base[key], ...patch };
    }
  }
  return base;
}

export const BUILTIN_DJ_PRESETS: DjPresetConfig[] = [
  {
    id: 'club-mix',
    name: 'Club Mix',
    crossfader: 0,
    masterVolume: 0.9,
    eqLow: 3.5,
    eqMid: -0.5,
    eqHigh: 2.5,
    filterValue: 0,
    effects: buildPresetEffects({
      bassboost: { enabled: true, intensity: 0.45, mix: 0.7 },
      reverb: { enabled: true, intensity: 0.4, mix: 0.18 },
    }),
  },
  {
    id: 'deep-bass',
    name: 'Deep Bass',
    crossfader: 0,
    masterVolume: 0.9,
    eqLow: 6,
    eqMid: -2,
    eqHigh: 1,
    filterValue: -0.06,
    effects: buildPresetEffects({
      bassboost: { enabled: true, intensity: 0.8, mix: 0.9 },
    }),
  },
  {
    id: 'house-mix',
    name: 'House Mix',
    crossfader: 0,
    masterVolume: 0.9,
    eqLow: 2.5,
    eqMid: 1,
    eqHigh: 3,
    filterValue: 0,
    effects: buildPresetEffects({
      echo: { enabled: true, intensity: 0.35, mix: 0.22, timingMs: 360 },
      phaser: { enabled: true, intensity: 0.35, mix: 0.25 },
    }),
  },
  {
    id: 'electronic',
    name: 'Electronic',
    crossfader: 0,
    masterVolume: 0.9,
    eqLow: 3,
    eqMid: 0,
    eqHigh: 4,
    filterValue: 0.04,
    effects: buildPresetEffects({
      delay: { enabled: true, intensity: 0.45, mix: 0.28, timingMs: 240 },
      flanger: { enabled: true, intensity: 0.45, mix: 0.25 },
    }),
  },
  {
    id: 'hip-hop',
    name: 'Hip-Hop',
    crossfader: 0,
    masterVolume: 0.92,
    eqLow: 5,
    eqMid: 1.5,
    eqHigh: 2,
    filterValue: 0,
    effects: buildPresetEffects({
      bassboost: { enabled: true, intensity: 0.6, mix: 0.75 },
      echo: { enabled: true, intensity: 0.3, mix: 0.16, timingMs: 310 },
    }),
  },
  {
    id: 'chill-mix',
    name: 'Chill Mix',
    crossfader: 0,
    masterVolume: 0.86,
    eqLow: 1,
    eqMid: 0.5,
    eqHigh: -1.5,
    filterValue: -0.08,
    effects: buildPresetEffects({
      reverb: { enabled: true, intensity: 0.65, mix: 0.34 },
      delay: { enabled: true, intensity: 0.3, mix: 0.2, timingMs: 420 },
    }),
  },
  {
    id: 'custom-dj-setup',
    name: 'Custom DJ Setup',
    crossfader: 0,
    masterVolume: 0.9,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    filterValue: 0,
    effects: buildPresetEffects({}),
  },
];
