import type {
  CustomSpatialProfile,
  EqualizerSettingsRecord,
  SpatialAudioMode,
  SpatialAudioSettings,
} from '../types/music';

export interface SpatialModeDefinition {
  id: SpatialAudioMode;
  label: string;
  shortLabel: string;
  description: string;
  roomCharacter: 'dry' | 'studio' | 'cinema' | 'hall' | 'ambient';
  settings: Omit<SpatialAudioSettings, 'enabled' | 'mode' | 'limiterEnabled'>;
}

export const DEFAULT_SPATIAL_AUDIO_SETTINGS: SpatialAudioSettings = {
  enabled: false,
  mode: 'stereo',
  headphoneMode: true,
  spatialWidth: 1.0,
  balance: 0,
  depth: 0,
  distance: 0,
  reverbIntensity: 0,
  surroundIntensity: 0,
  bassEnhanceDb: 0,
  midGainDb: 0,
  trebleEnhanceDb: 0,
  azimuthDeg: 0,
  elevationDeg: 0,
  limiterEnabled: true,
};

export const SPATIAL_MODE_DEFINITIONS: SpatialModeDefinition[] = [
  {
    id: 'stereo',
    label: 'Stereo',
    shortLabel: 'Stereo',
    description: 'Original bit-transparent stereo signal without spatial widening or reverb.',
    roomCharacter: 'dry',
    settings: {
      headphoneMode: false,
      spatialWidth: 1.0,
      balance: 0,
      depth: 0,
      distance: 0,
      reverbIntensity: 0,
      surroundIntensity: 0,
      bassEnhanceDb: 0,
      midGainDb: 0,
      trebleEnhanceDb: 0,
      azimuthDeg: 0,
      elevationDeg: 0,
    },
  },
  {
    id: 'wide_stereo',
    label: 'Wide Stereo',
    shortLabel: 'Wide',
    description: 'Mid/Side stereo expansion that opens up stage width while keeping vocals centered.',
    roomCharacter: 'studio',
    settings: {
      headphoneMode: false,
      spatialWidth: 1.55,
      balance: 0,
      depth: 0.22,
      distance: 0.1,
      reverbIntensity: 0.14,
      surroundIntensity: 0.35,
      bassEnhanceDb: 1.5,
      midGainDb: -0.5,
      trebleEnhanceDb: 1.5,
      azimuthDeg: 0,
      elevationDeg: 4,
    },
  },
  {
    id: 'virtual_surround',
    label: 'Virtual Surround',
    shortLabel: 'Surround',
    description: 'Multi-tap acoustic side/rear projection simulating an enveloping surround field.',
    roomCharacter: 'ambient',
    settings: {
      headphoneMode: true,
      spatialWidth: 1.65,
      balance: 0,
      depth: 0.55,
      distance: 0.28,
      reverbIntensity: 0.36,
      surroundIntensity: 0.8,
      bassEnhanceDb: 2.5,
      midGainDb: 0,
      trebleEnhanceDb: 2.0,
      azimuthDeg: 0,
      elevationDeg: 10,
    },
  },
  {
    id: '3d_spatial',
    label: '3D Spatial Audio',
    shortLabel: '3D Spatial',
    description: 'Web Audio HRTF 3D positioning with adjustable azimuth, elevation, and depth.',
    roomCharacter: 'ambient',
    settings: {
      headphoneMode: true,
      spatialWidth: 1.5,
      balance: 0,
      depth: 0.65,
      distance: 0.38,
      reverbIntensity: 0.32,
      surroundIntensity: 0.72,
      bassEnhanceDb: 2.0,
      midGainDb: 0.5,
      trebleEnhanceDb: 2.5,
      azimuthDeg: 12,
      elevationDeg: 14,
    },
  },
  {
    id: 'cinema',
    label: 'Cinema Mode',
    shortLabel: 'Cinema',
    description: 'Sub-bass warmth, clear dialogue mids, and expansive theatrical room ambience.',
    roomCharacter: 'cinema',
    settings: {
      headphoneMode: false,
      spatialWidth: 1.6,
      balance: 0,
      depth: 0.6,
      distance: 0.32,
      reverbIntensity: 0.44,
      surroundIntensity: 0.78,
      bassEnhanceDb: 4.5,
      midGainDb: 1.5,
      trebleEnhanceDb: 1.0,
      azimuthDeg: 0,
      elevationDeg: 8,
    },
  },
  {
    id: 'concert_hall',
    label: 'Concert Hall',
    shortLabel: 'Hall',
    description: 'Rich acoustic hall convolution reflections and deep live-stage spaciousness.',
    roomCharacter: 'hall',
    settings: {
      headphoneMode: false,
      spatialWidth: 1.72,
      balance: 0,
      depth: 0.75,
      distance: 0.48,
      reverbIntensity: 0.68,
      surroundIntensity: 0.7,
      bassEnhanceDb: 2.5,
      midGainDb: -0.5,
      trebleEnhanceDb: 1.5,
      azimuthDeg: 0,
      elevationDeg: 12,
    },
  },
  {
    id: 'studio',
    label: 'Studio Mode',
    shortLabel: 'Studio',
    description: 'Focused nearfield control-room clarity with tight reflections and crisp detail.',
    roomCharacter: 'studio',
    settings: {
      headphoneMode: false,
      spatialWidth: 1.18,
      balance: 0,
      depth: 0.16,
      distance: 0.08,
      reverbIntensity: 0.1,
      surroundIntensity: 0.22,
      bassEnhanceDb: 0.5,
      midGainDb: 0.5,
      trebleEnhanceDb: 1.2,
      azimuthDeg: 0,
      elevationDeg: 0,
    },
  },
  {
    id: 'headphone_spatial',
    label: 'Headphone Spatial',
    shortLabel: 'Headphones',
    description: 'Binaural HRTF + subtle natural crossfeed tuned for wired & Bluetooth headphones.',
    roomCharacter: 'studio',
    settings: {
      headphoneMode: true,
      spatialWidth: 1.42,
      balance: 0,
      depth: 0.48,
      distance: 0.24,
      reverbIntensity: 0.24,
      surroundIntensity: 0.64,
      bassEnhanceDb: 2.5,
      midGainDb: 0.5,
      trebleEnhanceDb: 2.0,
      azimuthDeg: 0,
      elevationDeg: 8,
    },
  },
  {
    id: 'custom',
    label: 'Custom Spatial',
    shortLabel: 'Custom',
    description: 'User-customized 3D width, surround, depth, reverb, balance, and tone shaping.',
    roomCharacter: 'ambient',
    settings: {
      headphoneMode: true,
      spatialWidth: 1.4,
      balance: 0,
      depth: 0.4,
      distance: 0.25,
      reverbIntensity: 0.28,
      surroundIntensity: 0.55,
      bassEnhanceDb: 2.0,
      midGainDb: 0,
      trebleEnhanceDb: 1.5,
      azimuthDeg: 0,
      elevationDeg: 6,
    },
  },
];

export function getSpatialPresetSettings(
  mode: SpatialAudioMode,
  existing?: SpatialAudioSettings
): SpatialAudioSettings {
  const found = SPATIAL_MODE_DEFINITIONS.find((m) => m.id === mode);
  if (!found) {
    return { ...DEFAULT_SPATIAL_AUDIO_SETTINGS };
  }
  if (mode === 'custom' && existing) {
    return {
      ...existing,
      enabled: true,
      mode: 'custom',
    };
  }
  return {
    enabled: mode !== 'stereo',
    mode,
    limiterEnabled: existing?.limiterEnabled ?? true,
    ...found.settings,
  };
}

export function createCustomSpatialProfile(params: {
  id?: string;
  name: string;
  spatial: SpatialAudioSettings;
  equalizer?: EqualizerSettingsRecord | null;
  includeEq?: boolean;
}): CustomSpatialProfile {
  const { enabled: _ignoredEnabled, mode: _ignoredMode, ...spatialCore } = params.spatial;
  const trimmedName = params.name.trim() || 'Custom Spatial Profile';

  return {
    id: params.id || `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: trimmedName,
    createdAt: Date.now(),
    spatial: { ...spatialCore },
    eqSnapshot:
      params.includeEq && params.equalizer
        ? {
            enabled: params.equalizer.enabled,
            bassGain: params.equalizer.bassGain,
            trebleGain: params.equalizer.trebleGain,
            bands: [...params.equalizer.bands],
          }
        : undefined,
  };
}

export function applyCustomSpatialProfileSettings(
  profile: CustomSpatialProfile
): SpatialAudioSettings {
  return {
    ...DEFAULT_SPATIAL_AUDIO_SETTINGS,
    ...profile.spatial,
    enabled: true,
    mode: 'custom',
  };
}
