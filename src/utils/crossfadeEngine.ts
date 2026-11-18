import type { RepeatMode, TransitionMode } from '../types/music';

export const MIN_CROSSFADE_SECONDS = 0;
export const MAX_CROSSFADE_SECONDS = 20;
export const DEFAULT_CROSSFADE_SECONDS = 5;
export const MIN_TRACK_DURATION_FOR_CROSSFADE = 3;

export function clampCrossfadeSeconds(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_CROSSFADE_SECONDS;
  return Math.max(MIN_CROSSFADE_SECONDS, Math.min(MAX_CROSSFADE_SECONDS, Math.round(num * 10) / 10));
}

export function resolveTransitionConfig(input: {
  transitionMode?: TransitionMode;
  crossfadeEnabled?: boolean;
  crossfadeSeconds?: number;
  gaplessEnabled?: boolean;
}): {
  transitionMode: TransitionMode;
  crossfadeEnabled: boolean;
  crossfadeSeconds: number;
  gaplessEnabled: boolean;
} {
  const crossfadeSeconds =
    typeof input.crossfadeSeconds === 'number'
      ? clampCrossfadeSeconds(input.crossfadeSeconds)
      : DEFAULT_CROSSFADE_SECONDS;

  let crossfadeEnabled: boolean;
  if (typeof input.crossfadeEnabled === 'boolean') {
    crossfadeEnabled = input.crossfadeEnabled;
  } else if (input.transitionMode) {
    crossfadeEnabled = input.transitionMode === 'crossfade';
  } else {
    crossfadeEnabled = false;
  }

  const transitionMode: TransitionMode = crossfadeEnabled ? 'crossfade' : 'gapless';
  const gaplessEnabled = input.gaplessEnabled ?? true;

  return {
    transitionMode,
    crossfadeEnabled,
    crossfadeSeconds,
    gaplessEnabled,
  };
}

/**
 * Prevents crossfades from exceeding short song durations or causing overlapping double-fades.
 */
export function calculateEffectiveCrossfadeDuration(params: {
  configuredSeconds: number;
  currentDuration: number;
  nextDuration?: number | null;
}): number {
  const configured = clampCrossfadeSeconds(params.configuredSeconds);
  if (configured <= 0) return 0;

  const curDur = Number.isFinite(params.currentDuration) ? params.currentDuration : 0;
  if (curDur <= 0) return configured;
  if (curDur < MIN_TRACK_DURATION_FOR_CROSSFADE) return 0;

  let effective = Math.min(configured, Math.max(0.5, curDur * 0.4));

  const nextDur =
    typeof params.nextDuration === 'number' && Number.isFinite(params.nextDuration)
      ? params.nextDuration
      : 0;
  if (nextDur > 0) {
    if (nextDur < MIN_TRACK_DURATION_FOR_CROSSFADE) {
      return 0;
    }
    effective = Math.min(effective, Math.max(0.5, nextDur * 0.45));
  }

  return Math.round(effective * 100) / 100;
}

/**
 * Equal-power fade curves: gainOut^2 + gainIn^2 == 1 at every normalized t in [0, 1].
 * Eliminates the -3 dB mid-fade volume dip compared to linear fades.
 */
export function buildEqualPowerFadeCurves(steps = 64): {
  fadeOutCurve: Float32Array<ArrayBuffer>;
  fadeInCurve: Float32Array<ArrayBuffer>;
} {
  const count = Math.max(8, Math.floor(steps));
  const fadeOutCurve = new Float32Array(new ArrayBuffer(count * 4));
  const fadeInCurve = new Float32Array(new ArrayBuffer(count * 4));

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const theta = t * Math.PI * 0.5;
    fadeOutCurve[i] = i === count - 1 ? 0 : Math.cos(theta);
    fadeInCurve[i] = i === 0 ? 0 : Math.sin(theta);
  }

  return { fadeOutCurve, fadeInCurve };
}

export interface CrossfadeDecisionInput {
  crossfadeEnabled: boolean;
  transitionMode: TransitionMode;
  gaplessEnabled: boolean;
  configuredCrossfadeSeconds: number;
  repeatMode: RepeatMode;
  currentTime: number;
  currentDuration: number;
  nextDuration: number | null;
  hasStandbyTrack: boolean;
  crossfadeInProgress: boolean;
}

export function evaluateCrossfadeDecision(input: CrossfadeDecisionInput): {
  action: 'none' | 'crossfade' | 'gapless';
  effectiveCrossfadeSeconds: number;
} {
  if (input.crossfadeInProgress || !input.hasStandbyTrack) {
    return { action: 'none', effectiveCrossfadeSeconds: 0 };
  }

  // Repeat One must loop cleanly without crossfading into another track
  if (input.repeatMode === 'one') {
    return { action: 'none', effectiveCrossfadeSeconds: 0 };
  }

  const dur = Number.isFinite(input.currentDuration) ? input.currentDuration : 0;
  const pos = Number.isFinite(input.currentTime) ? input.currentTime : 0;
  if (dur <= 0 || pos < 0) {
    return { action: 'none', effectiveCrossfadeSeconds: 0 };
  }

  const remaining = dur - pos;
  if (remaining <= 0) {
    return { action: 'none', effectiveCrossfadeSeconds: 0 };
  }

  const crossfadeActive =
    (input.transitionMode === 'crossfade' || input.crossfadeEnabled) &&
    input.configuredCrossfadeSeconds > 0;

  if (crossfadeActive) {
    const effective = calculateEffectiveCrossfadeDuration({
      configuredSeconds: input.configuredCrossfadeSeconds,
      currentDuration: dur,
      nextDuration: input.nextDuration,
    });
    if (effective > 0 && remaining <= effective && remaining > 0.12) {
      return { action: 'crossfade', effectiveCrossfadeSeconds: effective };
    }
    if (effective === 0 && input.gaplessEnabled && remaining <= 0.16) {
      return { action: 'gapless', effectiveCrossfadeSeconds: 0 };
    }
    return { action: 'none', effectiveCrossfadeSeconds: 0 };
  }

  if (input.gaplessEnabled && remaining <= 0.16) {
    return { action: 'gapless', effectiveCrossfadeSeconds: 0 };
  }

  return { action: 'none', effectiveCrossfadeSeconds: 0 };
}
