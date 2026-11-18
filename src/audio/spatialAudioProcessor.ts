import type { SpatialAudioSettings } from '../types/music';
import {
  DEFAULT_SPATIAL_AUDIO_SETTINGS,
  SPATIAL_MODE_DEFINITIONS,
} from '../utils/spatialAudioPresets';

export interface Spatial3DCoordinates {
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface MidSideMatrixGains {
  midGain: number;
  sideGain: number;
}

export interface StereoChannelActivity {
  leftLevel: number;
  rightLevel: number;
  spread: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Converts spherical azimuth (-180..180 deg), elevation (-45..45 deg),
 * and normalized distance (0..1) into Web Audio PannerNode coordinates.
 * Listener faces -Z, +X is right, +Y is up.
 */
export function computeSpatialCoordinates(
  azimuthDeg: number,
  elevationDeg: number,
  distance: number
): Spatial3DCoordinates {
  const azRad = (clamp(azimuthDeg, -180, 180) * Math.PI) / 180;
  const elRad = (clamp(elevationDeg, -45, 45) * Math.PI) / 180;
  const radius = 1 + clamp(distance, 0, 1) * 3.2;

  const cosEl = Math.cos(elRad);
  const x = Math.sin(azRad) * cosEl * radius;
  const y = Math.sin(elRad) * radius;
  const z = -Math.cos(azRad) * cosEl * radius;

  return { x, y, z, radius };
}

export function computeMidSideMatrixGains(spatialWidth: number): MidSideMatrixGains {
  const w = clamp(spatialWidth, 0, 2);
  // Subtle mid attenuation when widening heavily to protect overall loudness & headroom
  const midGain = w > 1.2 ? Math.max(0.76, 1 - (w - 1.2) * 0.24) : 1;
  return {
    midGain,
    sideGain: w,
  };
}

function createRoomImpulse(
  ctx: AudioContext,
  character: 'dry' | 'studio' | 'cinema' | 'hall' | 'ambient'
): AudioBuffer {
  const specs = {
    dry: { duration: 0.35, decay: 5.0, preDelayRatio: 0.02 },
    studio: { duration: 0.75, decay: 4.2, preDelayRatio: 0.015 },
    cinema: { duration: 1.55, decay: 2.7, preDelayRatio: 0.025 },
    hall: { duration: 2.45, decay: 2.0, preDelayRatio: 0.032 },
    ambient: { duration: 1.85, decay: 2.4, preDelayRatio: 0.022 },
  }[character];

  const len = Math.max(256, Math.floor(ctx.sampleRate * specs.duration));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const preSamples = Math.floor(len * specs.preDelayRatio);

  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      if (i < preSamples) {
        data[i] = 0;
        continue;
      }
      const norm = (i - preSamples) / Math.max(1, len - preSamples);
      const env = Math.pow(1 - norm, specs.decay);
      const noise = Math.random() * 2 - 1;
      // Gentle high-frequency air damping over reverb tail
      lp += (0.45 - norm * 0.25) * (noise - lp);
      data[i] = lp * env * 0.65;
    }
  }
  return buf;
}

function createLimiterClipCurve(): Float32Array<ArrayBuffer> {
  const n = 1024;
  const buf = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buf);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * 1.05) / Math.tanh(1.05);
  }
  return curve;
}

export class SpatialAudioGraph {
  public readonly input: GainNode;
  public readonly output: GainNode;

  private ctx: AudioContext;
  private settings: SpatialAudioSettings = { ...DEFAULT_SPATIAL_AUDIO_SETTINGS };
  private activeRoomCharacter: 'dry' | 'studio' | 'cinema' | 'hall' | 'ambient' = 'dry';

  // Bypass / Wet routing
  private bypassGain: GainNode;
  private wetBusInput: GainNode;

  // Tone shaping (Bass / Mid / Treble)
  private bassFilter: BiquadFilterNode;
  private midFilter: BiquadFilterNode;
  private trebleFilter: BiquadFilterNode;

  // Mid/Side Stereo Width Matrix
  private msSplitter: ChannelSplitterNode;
  private lToMid: GainNode;
  private rToMid: GainNode;
  private lToSide: GainNode;
  private rToSide: GainNode;
  private midNode: GainNode;
  private sideNode: GainNode;
  private midToL: GainNode;
  private midToR: GainNode;
  private sideToL: GainNode;
  private sideToR: GainNode;
  private msMerger: ChannelMergerNode;

  // 3D HRTF Panner & Direct vs 3D Cross-mix
  private directStageGain: GainNode;
  private pannerStageGain: GainNode;
  private panner3D: PannerNode;

  // Virtual Surround + Depth + Headphone Crossfeed
  private surroundSplitter: ChannelSplitterNode;
  private surroundMerger: ChannelMergerNode;
  private surroundDelayL: DelayNode;
  private surroundDelayR: DelayNode;
  private surroundGain: GainNode;
  private crossfeedDelayL: DelayNode;
  private crossfeedDelayR: DelayNode;
  private crossfeedFilterL: BiquadFilterNode;
  private crossfeedFilterR: BiquadFilterNode;
  private crossfeedGain: GainNode;

  // Room Reverb + Depth Ambience
  private convolver: ConvolverNode;
  private reverbDamp: BiquadFilterNode;
  private reverbWetGain: GainNode;

  // Balance + Output Volume Protection Limiter + L/R Channel Analyser
  private balanceNode: StereoPannerNode;
  private headroomTrim: GainNode;
  private limiter: DynamicsCompressorNode;
  private softClipper: WaveShaperNode;
  private lrSplitter: ChannelSplitterNode;
  private analyserL: AnalyserNode;
  private analyserR: AnalyserNode;
  private timeBufL = new Float32Array(64);
  private timeBufR = new Float32Array(64);

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.bypassGain = ctx.createGain();
    this.wetBusInput = ctx.createGain();

    // Tone filters
    this.bassFilter = ctx.createBiquadFilter();
    this.bassFilter.type = 'lowshelf';
    this.bassFilter.frequency.value = 95;

    this.midFilter = ctx.createBiquadFilter();
    this.midFilter.type = 'peaking';
    this.midFilter.frequency.value = 1150;
    this.midFilter.Q.value = 0.8;

    this.trebleFilter = ctx.createBiquadFilter();
    this.trebleFilter.type = 'highshelf';
    this.trebleFilter.frequency.value = 7500;

    // Mid/Side Matrix
    this.msSplitter = ctx.createChannelSplitter(2);
    this.msMerger = ctx.createChannelMerger(2);
    this.lToMid = ctx.createGain();
    this.rToMid = ctx.createGain();
    this.lToSide = ctx.createGain();
    this.rToSide = ctx.createGain();
    this.lToMid.gain.value = 0.5;
    this.rToMid.gain.value = 0.5;
    this.lToSide.gain.value = 0.5;
    this.rToSide.gain.value = -0.5;

    this.midNode = ctx.createGain();
    this.sideNode = ctx.createGain();
    this.midToL = ctx.createGain();
    this.midToR = ctx.createGain();
    this.sideToL = ctx.createGain();
    this.sideToR = ctx.createGain();
    this.midToL.gain.value = 1;
    this.midToR.gain.value = 1;
    this.sideToL.gain.value = 1;
    this.sideToR.gain.value = -1;

    // 3D HRTF Panner
    this.directStageGain = ctx.createGain();
    this.pannerStageGain = ctx.createGain();
    this.panner3D = ctx.createPanner();
    this.panner3D.panningModel = 'HRTF';
    this.panner3D.distanceModel = 'inverse';
    this.panner3D.refDistance = 1;
    this.panner3D.maxDistance = 12;
    this.panner3D.rolloffFactor = 0.85;

    // Surround & Headphone Crossfeed
    this.surroundSplitter = ctx.createChannelSplitter(2);
    this.surroundMerger = ctx.createChannelMerger(2);
    this.surroundDelayL = ctx.createDelay(0.15);
    this.surroundDelayR = ctx.createDelay(0.15);
    this.surroundDelayL.delayTime.value = 0.014;
    this.surroundDelayR.delayTime.value = 0.021;
    this.surroundGain = ctx.createGain();
    this.surroundGain.gain.value = 0;

    this.crossfeedDelayL = ctx.createDelay(0.05);
    this.crossfeedDelayR = ctx.createDelay(0.05);
    this.crossfeedDelayL.delayTime.value = 0.00032;
    this.crossfeedDelayR.delayTime.value = 0.00032;
    this.crossfeedFilterL = ctx.createBiquadFilter();
    this.crossfeedFilterL.type = 'lowpass';
    this.crossfeedFilterL.frequency.value = 1600;
    this.crossfeedFilterR = ctx.createBiquadFilter();
    this.crossfeedFilterR.type = 'lowpass';
    this.crossfeedFilterR.frequency.value = 1600;
    this.crossfeedGain = ctx.createGain();
    this.crossfeedGain.gain.value = 0;

    // Room Reverb
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = createRoomImpulse(ctx, 'studio');
    this.activeRoomCharacter = 'studio';
    this.reverbDamp = ctx.createBiquadFilter();
    this.reverbDamp.type = 'lowpass';
    this.reverbDamp.frequency.value = 6500;
    this.reverbWetGain = ctx.createGain();
    this.reverbWetGain.gain.value = 0;

    // Balance & Output Volume Protection
    this.balanceNode = ctx.createStereoPanner();
    this.headroomTrim = ctx.createGain();
    this.headroomTrim.gain.value = 1;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2.5;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.14;

    this.softClipper = ctx.createWaveShaper();
    this.softClipper.curve = createLimiterClipCurve();
    this.softClipper.oversample = '2x';

    // L/R Analysis
    this.lrSplitter = ctx.createChannelSplitter(2);
    this.analyserL = ctx.createAnalyser();
    this.analyserL.fftSize = 64;
    this.analyserR = ctx.createAnalyser();
    this.analyserR.fftSize = 64;

    this.wireGraph();
    this.applySettings(DEFAULT_SPATIAL_AUDIO_SETTINGS);
  }

  private wireGraph(): void {
    const postWidthBus = this.ctx.createGain();
    const post3DBus = this.ctx.createGain();

    // Pure bypass branch
    this.input.connect(this.bypassGain);
    this.bypassGain.connect(this.output);

    // Wet spatial DSP branch
    this.input.connect(this.wetBusInput);
    this.wetBusInput.connect(this.bassFilter);
    this.bassFilter.connect(this.midFilter);
    this.midFilter.connect(this.trebleFilter);

    // Mid/Side encoding -> matrix -> decoding
    this.trebleFilter.connect(this.msSplitter);
    this.msSplitter.connect(this.lToMid, 0);
    this.msSplitter.connect(this.rToMid, 1);
    this.msSplitter.connect(this.lToSide, 0);
    this.msSplitter.connect(this.rToSide, 1);

    this.lToMid.connect(this.midNode);
    this.rToMid.connect(this.midNode);
    this.lToSide.connect(this.sideNode);
    this.rToSide.connect(this.sideNode);

    this.midNode.connect(this.midToL);
    this.midNode.connect(this.midToR);
    this.sideNode.connect(this.sideToL);
    this.sideNode.connect(this.sideToR);

    this.midToL.connect(this.msMerger, 0, 0);
    this.sideToL.connect(this.msMerger, 0, 0);
    this.midToR.connect(this.msMerger, 0, 1);
    this.sideToR.connect(this.msMerger, 0, 1);
    this.msMerger.connect(postWidthBus);

    // 3D HRTF Panner blend
    postWidthBus.connect(this.directStageGain);
    this.directStageGain.connect(post3DBus);
    postWidthBus.connect(this.pannerStageGain);
    this.pannerStageGain.connect(this.panner3D);
    this.panner3D.connect(post3DBus);

    // Virtual surround Haas side-projection (L delayed into R, R delayed into L inverted-feel)
    post3DBus.connect(this.surroundSplitter);
    this.surroundSplitter.connect(this.surroundDelayL, 0);
    this.surroundSplitter.connect(this.surroundDelayR, 1);
    this.surroundDelayL.connect(this.surroundMerger, 0, 1);
    this.surroundDelayR.connect(this.surroundMerger, 0, 0);
    this.surroundMerger.connect(this.surroundGain);
    this.surroundGain.connect(this.balanceNode);

    // Headphone natural crossfeed (subtle L->R & R->L lowpassed acoustic ear coupling)
    this.surroundSplitter.connect(this.crossfeedDelayL, 0);
    this.surroundSplitter.connect(this.crossfeedDelayR, 1);
    this.crossfeedDelayL.connect(this.crossfeedFilterL);
    this.crossfeedDelayR.connect(this.crossfeedFilterR);
    const crossMerge = this.ctx.createChannelMerger(2);
    this.crossfeedFilterL.connect(crossMerge, 0, 1);
    this.crossfeedFilterR.connect(crossMerge, 0, 0);
    crossMerge.connect(this.crossfeedGain);
    this.crossfeedGain.connect(this.balanceNode);

    // Direct 3D bus -> Balance
    post3DBus.connect(this.balanceNode);

    // Room Reverb Convolver send from post3DBus -> Balance
    post3DBus.connect(this.convolver);
    this.convolver.connect(this.reverbDamp);
    this.reverbDamp.connect(this.reverbWetGain);
    this.reverbWetGain.connect(this.balanceNode);

    // Output protection limiter chain
    this.balanceNode.connect(this.headroomTrim);
    this.headroomTrim.connect(this.limiter);
    this.limiter.connect(this.softClipper);
    this.softClipper.connect(this.output);

    // L/R Metering on final output
    this.output.connect(this.lrSplitter);
    this.lrSplitter.connect(this.analyserL, 0);
    this.lrSplitter.connect(this.analyserR, 1);
  }

  public applySettings(next: SpatialAudioSettings): void {
    this.settings = { ...next };
    const now = this.ctx.currentTime;
    const isStereoBypass = !next.enabled || next.mode === 'stereo';

    if (isStereoBypass) {
      this.bypassGain.gain.setTargetAtTime(1, now, 0.02);
      this.wetBusInput.gain.setTargetAtTime(0, now, 0.02);
      return;
    }

    this.bypassGain.gain.setTargetAtTime(0, now, 0.02);
    this.wetBusInput.gain.setTargetAtTime(1, now, 0.02);

    // Update impulse response character if mode changed
    const modeDef = SPATIAL_MODE_DEFINITIONS.find((m) => m.id === next.mode);
    const targetChar = modeDef?.roomCharacter ?? 'ambient';
    if (targetChar !== this.activeRoomCharacter) {
      this.activeRoomCharacter = targetChar;
      this.convolver.buffer = createRoomImpulse(this.ctx, targetChar);
    }

    // Tone controls
    this.bassFilter.gain.setTargetAtTime(clamp(next.bassEnhanceDb, -6, 10), now, 0.02);
    this.midFilter.gain.setTargetAtTime(clamp(next.midGainDb, -6, 6), now, 0.02);
    this.trebleFilter.gain.setTargetAtTime(clamp(next.trebleEnhanceDb, -6, 8), now, 0.02);

    // Mid/Side width
    const { midGain, sideGain } = computeMidSideMatrixGains(next.spatialWidth);
    this.midNode.gain.setTargetAtTime(midGain, now, 0.02);
    this.sideNode.gain.setTargetAtTime(sideGain, now, 0.02);

    // 3D HRTF Positioning
    const coords = computeSpatialCoordinates(next.azimuthDeg, next.elevationDeg, next.distance);
    this.panner3D.positionX.setTargetAtTime(coords.x, now, 0.025);
    this.panner3D.positionY.setTargetAtTime(coords.y, now, 0.025);
    this.panner3D.positionZ.setTargetAtTime(coords.z, now, 0.025);

    const use3DWeight =
      next.mode === '3d_spatial' || next.mode === 'headphone_spatial'
        ? 0.72
        : next.mode === 'virtual_surround' || next.mode === 'cinema'
          ? 0.52
          : clamp(next.depth * 0.6 + (Math.abs(next.azimuthDeg) > 2 ? 0.35 : 0), 0.15, 0.75);

    this.directStageGain.gain.setTargetAtTime(1 - use3DWeight * 0.65, now, 0.02);
    this.pannerStageGain.gain.setTargetAtTime(use3DWeight, now, 0.02);

    // Virtual surround & depth delay
    const surr = clamp(next.surroundIntensity, 0, 1);
    const depth = clamp(next.depth, 0, 1);
    this.surroundDelayL.delayTime.setTargetAtTime(0.011 + depth * 0.018, now, 0.025);
    this.surroundDelayR.delayTime.setTargetAtTime(0.016 + depth * 0.022, now, 0.025);
    this.surroundGain.gain.setTargetAtTime(surr * 0.28 + depth * 0.14, now, 0.02);

    // Headphone crossfeed
    this.crossfeedGain.gain.setTargetAtTime(next.headphoneMode ? 0.18 : 0, now, 0.02);

    // Room reverb
    const revWet = clamp(next.reverbIntensity, 0, 1) * (next.headphoneMode ? 0.34 : 0.42);
    this.reverbDamp.frequency.setTargetAtTime(next.headphoneMode ? 5200 : 7200, now, 0.025);
    this.reverbWetGain.gain.setTargetAtTime(revWet, now, 0.02);

    // Left / Right Balance
    this.balanceNode.pan.setTargetAtTime(clamp(next.balance, -1, 1), now, 0.015);

    // Output Volume Protection & Headroom Guard
    const boostSum =
      Math.max(0, next.bassEnhanceDb) * 0.03 +
      Math.max(0, next.trebleEnhanceDb) * 0.02 +
      Math.max(0, next.spatialWidth - 1) * 0.08 +
      revWet * 0.12;
    const trim = next.limiterEnabled ? clamp(0.95 - boostSum * 0.35, 0.68, 0.96) : 0.95;
    this.headroomTrim.gain.setTargetAtTime(trim, now, 0.02);

    this.limiter.threshold.setTargetAtTime(next.limiterEnabled ? -2.5 : -0.1, now, 0.02);
    this.limiter.ratio.setTargetAtTime(next.limiterEnabled ? 12 : 1.5, now, 0.02);
  }

  public sampleStereoActivity(): StereoChannelActivity {
    this.analyserL.getFloatTimeDomainData(this.timeBufL);
    this.analyserR.getFloatTimeDomainData(this.timeBufR);

    let sumL = 0;
    let sumR = 0;
    let diffSum = 0;
    const n = this.timeBufL.length;
    for (let i = 0; i < n; i++) {
      const l = this.timeBufL[i];
      const r = this.timeBufR[i];
      sumL += l * l;
      sumR += r * r;
      diffSum += (l - r) * (l - r);
    }

    const leftLevel = clamp(Math.sqrt(sumL / n) * 2.2, 0, 1);
    const rightLevel = clamp(Math.sqrt(sumR / n) * 2.2, 0, 1);
    const sumEnergy = leftLevel + rightLevel;
    const diffRms = Math.sqrt(diffSum / n) * 2.2;
    const spread = sumEnergy > 0.02 ? clamp(diffRms / sumEnergy, 0, 1) : 0;

    return { leftLevel, rightLevel, spread };
  }
}
