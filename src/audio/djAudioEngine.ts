import { sonoraDb } from '../db/sonoraDb';
import type {
  DjPresetConfig,
  DjPresetEffectState,
  SpatialAudioMode,
  SpatialAudioSettings,
  Track,
} from '../types/music';
import {
  analyzeAudioBufferBpmAndKey,
  computeCrossfaderGains,
  extractWaveformPeaks,
  reverseAudioBuffer,
} from '../utils/bpmAnalyzer';
import {
  createDefaultEffectsMap,
  type DjEffectId,
} from '../utils/djPresets';
import {
  DEFAULT_SPATIAL_AUDIO_SETTINGS,
  getSpatialPresetSettings,
} from '../utils/spatialAudioPresets';
import { audioEngine } from './audioEngine';
import {
  computeSpatialCoordinates,
  SpatialAudioGraph,
} from './spatialAudioProcessor';

export type DeckId = 'A' | 'B';
export type AutoLoopBeats = 4 | 8 | 16;

export interface DeckSpatialSettings {
  enabled: boolean;
  azimuthDeg: number; // -90 to +90
  depth: number; // 0 to 1
  ambience: number; // 0 to 1
}

export interface DeckSnapshot {
  id: DeckId;
  track: Track | null;
  isLoading: boolean;
  error: string | null;
  isPlaying: boolean;
  isScratching: boolean;
  reverse: boolean;
  position: number;
  duration: number;
  bpm: number;
  effectiveBpm: number;
  bpmConfidence: number;
  beatOffsetSeconds: number;
  estimatedKey: string;
  playbackRate: number;
  volume: number;
  gain: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  filter: number;
  balance: number;
  spatial: DeckSpatialSettings;
  cueMonitor: boolean;
  cuePoint: number;
  hotCues: (number | null)[];
  loopEnabled: boolean;
  loopStart: number | null;
  loopEnd: number | null;
  autoLoopBeats: AutoLoopBeats | null;
  waveformPeaks: number[];
  peakLevel: number;
}

export interface RecordedDjMix {
  id: string;
  name: string;
  createdAt: number;
  durationSeconds: number;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  blob: Blob;
  url: string;
}

export interface DjEngineSnapshot {
  deckA: DeckSnapshot;
  deckB: DeckSnapshot;
  crossfader: number;
  masterVolume: number;
  cueVolume: number;
  masterPeakLevel: number;
  activePresetId: string | null;
  effects: Record<DjEffectId, DjPresetEffectState>;
  masterSpatial: SpatialAudioSettings;
  spatialTransitionEnabled: boolean;
  spatialTransitionAmbience: number;
  autoMixEnabled: boolean;
  autoMixPlaylistIds: string[];
  autoMixCurrentIndex: number;
  autoMixTransitionSeconds: number;
  autoMixSyncBpm: boolean;
  autoMixTransitioning: boolean;
  recordingSupported: boolean;
  recordingUnsupportedReason: string | null;
  recordingStatus: 'idle' | 'recording' | 'paused';
  recordingDurationSeconds: number;
  recordedMixes: RecordedDjMix[];
}

interface InternalDeckState {
  id: DeckId;
  track: Track | null;
  buffer: AudioBuffer | null;
  reversedBuffer: AudioBuffer | null;
  isLoading: boolean;
  error: string | null;
  isPlaying: boolean;
  isScratching: boolean;
  wasPlayingBeforeScratch: boolean;
  scratchTimer: number | null;
  reverse: boolean;
  offsetSeconds: number; // position in forward timeline [0..duration]
  startedAtCtxTime: number;
  duration: number;
  bpm: number;
  bpmConfidence: number;
  beatOffsetSeconds: number;
  estimatedKey: string;
  tapTimestamps: number[];
  playbackRate: number;
  pitchBendDelta: number;
  volume: number;
  gain: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  filter: number;
  balance: number;
  spatial: DeckSpatialSettings;
  cueMonitor: boolean;
  cuePoint: number;
  hotCues: (number | null)[];
  loopEnabled: boolean;
  loopStart: number | null;
  loopEnd: number | null;
  autoLoopBeats: AutoLoopBeats | null;
  waveformPeaks: number[];
  peakLevel: number;
  source: AudioBufferSourceNode | null;
  // Per-deck audio nodes
  trimGain?: GainNode;
  eqLowNode?: BiquadFilterNode;
  eqMidNode?: BiquadFilterNode;
  eqHighNode?: BiquadFilterNode;
  filterNode?: BiquadFilterNode;
  spatialDryGain?: GainNode;
  spatialWetGain?: GainNode;
  spatialPannerNode?: PannerNode;
  spatialDepthDelay?: DelayNode;
  spatialAmbienceGain?: GainNode;
  pannerNode?: StereoPannerNode;
  faderNode?: GainNode;
  analyserNode?: AnalyserNode;
  crossGainNode?: GainNode;
  cueSendGain?: GainNode;
}

function createInitialDeck(id: DeckId): InternalDeckState {
  return {
    id,
    track: null,
    buffer: null,
    reversedBuffer: null,
    isLoading: false,
    error: null,
    isPlaying: false,
    isScratching: false,
    wasPlayingBeforeScratch: false,
    scratchTimer: null,
    reverse: false,
    offsetSeconds: 0,
    startedAtCtxTime: 0,
    duration: 0,
    bpm: 120,
    bpmConfidence: 0,
    beatOffsetSeconds: 0,
    estimatedKey: '--',
    tapTimestamps: [],
    playbackRate: 1,
    pitchBendDelta: 0,
    volume: 0.9,
    gain: 1,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    filter: 0,
    balance: 0,
    spatial: {
      enabled: false,
      azimuthDeg: id === 'A' ? -18 : 18,
      depth: 0.35,
      ambience: 0.25,
    },
    cueMonitor: false,
    cuePoint: 0,
    hotCues: [null, null, null, null],
    loopEnabled: false,
    loopStart: null,
    loopEnd: null,
    autoLoopBeats: null,
    waveformPeaks: [],
    peakLevel: 0,
    source: null,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function createImpulseResponse(ctx: AudioContext, durationSec = 2.1, decay = 2.6): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, decay);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return impulse;
}

function createSoftClipCurve(): Float32Array<ArrayBuffer> {
  const n = 2048;
  const buf = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buf);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    // Gentle analog-style tanh soft saturation to guard against digital clipping
    curve[i] = Math.tanh(x * 1.1) / Math.tanh(1.1);
  }
  return curve;
}

class DjAudioEngine {
  private ctx: AudioContext | null = null;
  private deckA: InternalDeckState = createInitialDeck('A');
  private deckB: InternalDeckState = createInitialDeck('B');

  private crossfader = 0;
  private masterVolume = 0.9;
  private cueVolume = 0.75;
  private masterPeakLevel = 0;
  private activePresetId: string | null = 'custom-dj-setup';
  private effects: Record<DjEffectId, DjPresetEffectState> = createDefaultEffectsMap();
  private masterSpatialSettings: SpatialAudioSettings = {
    ...DEFAULT_SPATIAL_AUDIO_SETTINGS,
  };
  private spatialTransitionEnabled = false;
  private spatialTransitionAmbience = 0.55;

  // Master & FX Graph Nodes
  private fxBusInput: GainNode | null = null;
  private masterSpatialGraph: SpatialAudioGraph | null = null;
  private masterGainNode: GainNode | null = null;
  private cueMonitorNode: GainNode | null = null;
  private limiterNode: DynamicsCompressorNode | null = null;
  private softClipperNode: WaveShaperNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private recordStreamDest: MediaStreamAudioDestinationNode | null = null;

  // 10 Real-Time FX Nodes
  private fxBassBoost: BiquadFilterNode | null = null;
  private fxLpfDry: GainNode | null = null;
  private fxLpfWet: GainNode | null = null;
  private fxLpfFilter: BiquadFilterNode | null = null;
  private fxHpfDry: GainNode | null = null;
  private fxHpfWet: GainNode | null = null;
  private fxHpfFilter: BiquadFilterNode | null = null;
  private fxEchoDelay: DelayNode | null = null;
  private fxEchoFb: GainNode | null = null;
  private fxEchoWet: GainNode | null = null;
  private fxEchoTone: BiquadFilterNode | null = null;
  private fxDelayNode: DelayNode | null = null;
  private fxDelayFb: GainNode | null = null;
  private fxDelayWet: GainNode | null = null;
  private fxReverbConv: ConvolverNode | null = null;
  private fxReverbWet: GainNode | null = null;
  private fxFlangerDelay: DelayNode | null = null;
  private fxFlangerFb: GainNode | null = null;
  private fxFlangerWet: GainNode | null = null;
  private fxFlangerLfo: OscillatorNode | null = null;
  private fxFlangerDepth: GainNode | null = null;
  private fxPhaserFilters: BiquadFilterNode[] = [];
  private fxPhaserFb: GainNode | null = null;
  private fxPhaserWet: GainNode | null = null;
  private fxPhaserLfo: OscillatorNode | null = null;
  private fxPhaserDepth: GainNode | null = null;
  private fxRepeatInputGain: GainNode | null = null;
  private fxRepeatDelay: DelayNode | null = null;
  private fxRepeatFb: GainNode | null = null;
  private fxRepeatDry: GainNode | null = null;
  private fxRepeatWet: GainNode | null = null;
  private fxStutterDry: GainNode | null = null;
  private fxStutterWet: GainNode | null = null;
  private fxStutterGate: GainNode | null = null;
  private fxStutterPhase = 0;

  // Worklet soft-clipper flag
  private workletLoaded = false;
  private workletNode: AudioWorkletNode | null = null;

  // Auto Mix state
  private autoMixEnabled = false;
  private autoMixPlaylistIds: string[] = [];
  private autoMixCurrentIndex = 0;
  private autoMixTransitionSeconds = 5;
  private autoMixSyncBpm = true;
  private autoMixTransitioning = false;
  private autoMixActiveFromDeck: DeckId = 'A';
  private autoMixFadeStartTime = 0;
  private autoMixFromValue = -1;
  private autoMixToValue = 1;
  private autoMixTrackResolver: ((id: string) => Track | undefined) | null = null;

  // Recording state
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: BlobPart[] = [];
  private recordingMimeType = 'audio/webm';
  private recordingStatus: 'idle' | 'recording' | 'paused' = 'idle';
  private recordingStartedMs = 0;
  private recordingAccumulatedMs = 0;
  private recordedMixes: RecordedDjMix[] = [];

  // Runtime polling & listeners
  private tickTimer: number | null = null;
  private lastTickMs = 0;
  private listeners = new Set<(snap: DjEngineSnapshot) => void>();
  private deckTimeBuf = new Float32Array(256);
  private masterTimeBuf = new Float32Array(256);

  private ensureContext(): AudioContext {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    this.ctx = ctx;

    // Build Master & Effects Chain
    this.fxBusInput = ctx.createGain();
    this.fxBusInput.gain.value = 1;

    // 1. Bass Boost (inline shelf)
    this.fxBassBoost = ctx.createBiquadFilter();
    this.fxBassBoost.type = 'lowshelf';
    this.fxBassBoost.frequency.value = 95;
    this.fxBassBoost.gain.value = 0;

    // 2. Resonant LPF stage
    const postLpf = ctx.createGain();
    this.fxLpfDry = ctx.createGain();
    this.fxLpfWet = ctx.createGain();
    this.fxLpfFilter = ctx.createBiquadFilter();
    this.fxLpfFilter.type = 'lowpass';
    this.fxLpfFilter.frequency.value = 18000;
    this.fxLpfFilter.Q.value = 1.2;
    this.fxLpfDry.gain.value = 1;
    this.fxLpfWet.gain.value = 0;

    // 3. Resonant HPF stage
    const postHpf = ctx.createGain();
    this.fxHpfDry = ctx.createGain();
    this.fxHpfWet = ctx.createGain();
    this.fxHpfFilter = ctx.createBiquadFilter();
    this.fxHpfFilter.type = 'highpass';
    this.fxHpfFilter.frequency.value = 25;
    this.fxHpfFilter.Q.value = 1.2;
    this.fxHpfDry.gain.value = 1;
    this.fxHpfWet.gain.value = 0;

    // 4. Stutter / Beat Repeat Bus Stage
    const postTimeFx = ctx.createGain();
    this.fxRepeatDry = ctx.createGain();
    this.fxRepeatWet = ctx.createGain();
    this.fxRepeatInputGain = ctx.createGain();
    this.fxRepeatDelay = ctx.createDelay(2.0);
    this.fxRepeatFb = ctx.createGain();
    this.fxRepeatDelay.delayTime.value = 0.25;
    this.fxRepeatFb.gain.value = 0;
    this.fxRepeatDry.gain.value = 1;
    this.fxRepeatWet.gain.value = 0;
    this.fxRepeatInputGain.gain.value = 0;

    // 5. Stutter Gate stage
    const postStutter = ctx.createGain();
    this.fxStutterDry = ctx.createGain();
    this.fxStutterWet = ctx.createGain();
    this.fxStutterGate = ctx.createGain();
    this.fxStutterDry.gain.value = 1;
    this.fxStutterWet.gain.value = 0;
    this.fxStutterGate.gain.value = 1;

    // 6. Send-based spatial/modulation effects summing into fxSumBus
    const fxSumBus = ctx.createGain();

    // Echo
    this.fxEchoDelay = ctx.createDelay(2.0);
    this.fxEchoDelay.delayTime.value = 0.375;
    this.fxEchoTone = ctx.createBiquadFilter();
    this.fxEchoTone.type = 'lowpass';
    this.fxEchoTone.frequency.value = 2800;
    this.fxEchoFb = ctx.createGain();
    this.fxEchoFb.gain.value = 0.45;
    this.fxEchoWet = ctx.createGain();
    this.fxEchoWet.gain.value = 0;

    // Delay
    this.fxDelayNode = ctx.createDelay(2.0);
    this.fxDelayNode.delayTime.value = 0.25;
    this.fxDelayFb = ctx.createGain();
    this.fxDelayFb.gain.value = 0.4;
    this.fxDelayWet = ctx.createGain();
    this.fxDelayWet.gain.value = 0;

    // Reverb
    this.fxReverbConv = ctx.createConvolver();
    this.fxReverbConv.buffer = createImpulseResponse(ctx, 2.2, 2.5);
    this.fxReverbWet = ctx.createGain();
    this.fxReverbWet.gain.value = 0;

    // Flanger
    this.fxFlangerDelay = ctx.createDelay(0.05);
    this.fxFlangerDelay.delayTime.value = 0.005;
    this.fxFlangerFb = ctx.createGain();
    this.fxFlangerFb.gain.value = 0.45;
    this.fxFlangerWet = ctx.createGain();
    this.fxFlangerWet.gain.value = 0;
    this.fxFlangerLfo = ctx.createOscillator();
    this.fxFlangerLfo.type = 'sine';
    this.fxFlangerLfo.frequency.value = 0.7;
    this.fxFlangerDepth = ctx.createGain();
    this.fxFlangerDepth.gain.value = 0.003;
    this.fxFlangerLfo.connect(this.fxFlangerDepth);
    this.fxFlangerDepth.connect(this.fxFlangerDelay.delayTime);
    this.fxFlangerLfo.start();

    // Phaser (4 cascaded allpass)
    this.fxPhaserFilters = Array.from({ length: 4 }, () => {
      const f = ctx.createBiquadFilter();
      f.type = 'allpass';
      f.frequency.value = 950;
      f.Q.value = 1.2;
      return f;
    });
    this.fxPhaserFb = ctx.createGain();
    this.fxPhaserFb.gain.value = 0.38;
    this.fxPhaserWet = ctx.createGain();
    this.fxPhaserWet.gain.value = 0;
    this.fxPhaserLfo = ctx.createOscillator();
    this.fxPhaserLfo.type = 'sine';
    this.fxPhaserLfo.frequency.value = 0.9;
    this.fxPhaserDepth = ctx.createGain();
    this.fxPhaserDepth.gain.value = 600;
    this.fxPhaserLfo.connect(this.fxPhaserDepth);
    for (const pf of this.fxPhaserFilters) {
      this.fxPhaserDepth.connect(pf.frequency);
    }
    this.fxPhaserLfo.start();

    // Wire series core path: fxBusInput -> bassBoost -> LPF -> HPF -> BeatRepeat -> Stutter -> fxSumBus
    this.fxBusInput.connect(this.fxBassBoost);

    this.fxBassBoost.connect(this.fxLpfDry);
    this.fxBassBoost.connect(this.fxLpfFilter);
    this.fxLpfDry.connect(postLpf);
    this.fxLpfFilter.connect(this.fxLpfWet);
    this.fxLpfWet.connect(postLpf);

    postLpf.connect(this.fxHpfDry);
    postLpf.connect(this.fxHpfFilter);
    this.fxHpfDry.connect(postHpf);
    this.fxHpfFilter.connect(this.fxHpfWet);
    this.fxHpfWet.connect(postHpf);

    // Beat Repeat send/loop
    postHpf.connect(this.fxRepeatDry);
    this.fxRepeatDry.connect(postTimeFx);
    postHpf.connect(this.fxRepeatInputGain);
    this.fxRepeatInputGain.connect(this.fxRepeatDelay);
    this.fxRepeatDelay.connect(this.fxRepeatFb);
    this.fxRepeatFb.connect(this.fxRepeatDelay);
    this.fxRepeatDelay.connect(this.fxRepeatWet);
    this.fxRepeatWet.connect(postTimeFx);

    // Stutter gate
    postTimeFx.connect(this.fxStutterDry);
    this.fxStutterDry.connect(postStutter);
    postTimeFx.connect(this.fxStutterGate);
    this.fxStutterGate.connect(this.fxStutterWet);
    this.fxStutterWet.connect(postStutter);

    // Dry to fxSumBus
    postStutter.connect(fxSumBus);

    // Send FX branches from postStutter -> fxSumBus
    postStutter.connect(this.fxEchoDelay);
    this.fxEchoDelay.connect(this.fxEchoTone);
    this.fxEchoTone.connect(this.fxEchoFb);
    this.fxEchoFb.connect(this.fxEchoDelay);
    this.fxEchoTone.connect(this.fxEchoWet);
    this.fxEchoWet.connect(fxSumBus);

    postStutter.connect(this.fxDelayNode);
    this.fxDelayNode.connect(this.fxDelayFb);
    this.fxDelayFb.connect(this.fxDelayNode);
    this.fxDelayNode.connect(this.fxDelayWet);
    this.fxDelayWet.connect(fxSumBus);

    postStutter.connect(this.fxReverbConv);
    this.fxReverbConv.connect(this.fxReverbWet);
    this.fxReverbWet.connect(fxSumBus);

    postStutter.connect(this.fxFlangerDelay);
    this.fxFlangerDelay.connect(this.fxFlangerFb);
    this.fxFlangerFb.connect(this.fxFlangerDelay);
    this.fxFlangerDelay.connect(this.fxFlangerWet);
    this.fxFlangerWet.connect(fxSumBus);

    postStutter.connect(this.fxPhaserFilters[0]);
    for (let i = 0; i < this.fxPhaserFilters.length - 1; i++) {
      this.fxPhaserFilters[i].connect(this.fxPhaserFilters[i + 1]);
    }
    const lastPhaser = this.fxPhaserFilters[this.fxPhaserFilters.length - 1];
    lastPhaser.connect(this.fxPhaserFb);
    this.fxPhaserFb.connect(this.fxPhaserFilters[0]);
    lastPhaser.connect(this.fxPhaserWet);
    this.fxPhaserWet.connect(fxSumBus);

    // Master Gain + Limiter + Soft Clipper + Analyser + Outputs
    this.masterGainNode = ctx.createGain();
    this.masterGainNode.gain.value = this.masterVolume;

    this.limiterNode = ctx.createDynamicsCompressor();
    this.limiterNode.threshold.value = -2;
    this.limiterNode.knee.value = 6;
    this.limiterNode.ratio.value = 12;
    this.limiterNode.attack.value = 0.003;
    this.limiterNode.release.value = 0.14;

    this.softClipperNode = ctx.createWaveShaper();
    this.softClipperNode.curve = createSoftClipCurve();
    this.softClipperNode.oversample = '2x';

    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 256;

    this.cueMonitorNode = ctx.createGain();
    this.cueMonitorNode.gain.value = this.cueVolume;
    this.cueMonitorNode.connect(ctx.destination);

    try {
      this.recordStreamDest = ctx.createMediaStreamDestination();
    } catch {
      this.recordStreamDest = null;
    }

    this.masterSpatialGraph = new SpatialAudioGraph(ctx);

    fxSumBus.connect(this.masterSpatialGraph.input);
    this.masterSpatialGraph.output.connect(this.masterGainNode);
    this.masterGainNode.connect(this.limiterNode);
    this.limiterNode.connect(this.softClipperNode);
    this.softClipperNode.connect(this.masterAnalyser);
    this.masterAnalyser.connect(ctx.destination);
    if (this.recordStreamDest) {
      this.masterAnalyser.connect(this.recordStreamDest);
    }

    // Attempt optional AudioWorklet anti-clip safety processor without breaking fallback
    void this.tryInstallSoftClipWorklet(ctx);

    this.initDeckNodes(this.deckA, ctx);
    this.initDeckNodes(this.deckB, ctx);
    this.applyCrossfaderNodes();
    this.applyAllEffectsNodes();
    this.applyMasterSpatialNodes();
    this.ensureTickLoop();

    return ctx;
  }

  private async tryInstallSoftClipWorklet(ctx: AudioContext): Promise<void> {
    if (this.workletLoaded || typeof AudioWorkletNode === 'undefined' || !ctx.audioWorklet) {
      return;
    }
    this.workletLoaded = true;
    try {
      const code = `
        class SonoraLimitingWorklet extends AudioWorkletProcessor {
          process(inputs, outputs) {
            const input = inputs[0];
            const output = outputs[0];
            if (!input || !output) return true;
            for (let ch = 0; ch < output.length; ch++) {
              const inCh = input[ch];
              const outCh = output[ch];
              if (!inCh || !outCh) continue;
              for (let i = 0; i < outCh.length; i++) {
                const s = inCh[i];
                outCh[i] = Math.abs(s) > 0.98 ? Math.tanh(s) : s;
              }
            }
            return true;
          }
        }
        registerProcessor('sonora-limiting-worklet', SonoraLimitingWorklet);
      `;
      const blob = new Blob([code], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      if (this.limiterNode && this.softClipperNode && !this.workletNode) {
        const node = new AudioWorkletNode(ctx, 'sonora-limiting-worklet');
        this.workletNode = node;
        this.limiterNode.disconnect(this.softClipperNode);
        this.limiterNode.connect(node);
        node.connect(this.softClipperNode);
      }
    } catch {
      // WaveShaperNode soft clipper + DynamicsCompressorNode remains active seamlessly
    }
  }

  private initDeckNodes(deck: InternalDeckState, ctx: AudioContext): void {
    deck.trimGain = ctx.createGain();
    deck.trimGain.gain.value = deck.gain;

    deck.eqLowNode = ctx.createBiquadFilter();
    deck.eqLowNode.type = 'lowshelf';
    deck.eqLowNode.frequency.value = 220;
    deck.eqLowNode.gain.value = deck.eqLow;

    deck.eqMidNode = ctx.createBiquadFilter();
    deck.eqMidNode.type = 'peaking';
    deck.eqMidNode.frequency.value = 1000;
    deck.eqMidNode.Q.value = 0.85;
    deck.eqMidNode.gain.value = deck.eqMid;

    deck.eqHighNode = ctx.createBiquadFilter();
    deck.eqHighNode.type = 'highshelf';
    deck.eqHighNode.frequency.value = 3800;
    deck.eqHighNode.gain.value = deck.eqHigh;

    deck.filterNode = ctx.createBiquadFilter();
    this.applyDeckFilterNode(deck);

    // Per-deck spatial positioning + depth delay stage
    deck.spatialDryGain = ctx.createGain();
    deck.spatialWetGain = ctx.createGain();
    deck.spatialPannerNode = ctx.createPanner();
    deck.spatialPannerNode.panningModel = 'HRTF';
    deck.spatialPannerNode.distanceModel = 'inverse';
    deck.spatialPannerNode.refDistance = 1;
    deck.spatialPannerNode.rolloffFactor = 0.85;
    deck.spatialDepthDelay = ctx.createDelay(0.12);
    deck.spatialDepthDelay.delayTime.value = 0.018;
    deck.spatialAmbienceGain = ctx.createGain();
    deck.spatialAmbienceGain.gain.value = 0;

    deck.pannerNode = ctx.createStereoPanner();
    deck.pannerNode.pan.value = deck.balance;

    deck.faderNode = ctx.createGain();
    deck.faderNode.gain.value = deck.volume;

    deck.analyserNode = ctx.createAnalyser();
    deck.analyserNode.fftSize = 256;

    deck.crossGainNode = ctx.createGain();
    deck.cueSendGain = ctx.createGain();
    deck.cueSendGain.gain.value = deck.cueMonitor ? 1 : 0;

    deck.trimGain.connect(deck.eqLowNode);
    deck.eqLowNode.connect(deck.eqMidNode);
    deck.eqMidNode.connect(deck.eqHighNode);
    deck.eqHighNode.connect(deck.filterNode);

    deck.filterNode.connect(deck.spatialDryGain);
    deck.spatialDryGain.connect(deck.pannerNode);

    deck.filterNode.connect(deck.spatialWetGain);
    deck.spatialWetGain.connect(deck.spatialPannerNode);
    deck.spatialPannerNode.connect(deck.pannerNode);
    deck.spatialPannerNode.connect(deck.spatialDepthDelay);
    deck.spatialDepthDelay.connect(deck.spatialAmbienceGain);
    deck.spatialAmbienceGain.connect(deck.pannerNode);

    this.applyDeckSpatialNodes(deck);

    deck.pannerNode.connect(deck.faderNode);
    deck.faderNode.connect(deck.analyserNode);

    if (this.fxBusInput) {
      deck.analyserNode.connect(deck.crossGainNode);
      deck.crossGainNode.connect(this.fxBusInput);
    }
    if (this.cueMonitorNode) {
      deck.analyserNode.connect(deck.cueSendGain);
      deck.cueSendGain.connect(this.cueMonitorNode);
    }
  }

  private getDeck(id: DeckId): InternalDeckState {
    return id === 'A' ? this.deckA : this.deckB;
  }

  private getCurrentPosition(deck: InternalDeckState): number {
    if (!deck.isPlaying || !this.ctx || deck.duration <= 0) {
      return clamp(deck.offsetSeconds, 0, deck.duration || 0);
    }
    const elapsed = Math.max(0, this.ctx.currentTime - deck.startedAtCtxTime);
    const rate = clamp(deck.playbackRate + deck.pitchBendDelta, 0.25, 2.5);
    const delta = elapsed * rate;

    if (!deck.reverse) {
      let pos = deck.offsetSeconds + delta;
      if (
        deck.loopEnabled &&
        deck.loopStart !== null &&
        deck.loopEnd !== null &&
        deck.loopEnd > deck.loopStart + 0.04
      ) {
        const loopLen = deck.loopEnd - deck.loopStart;
        if (pos >= deck.loopStart) {
          pos = deck.loopStart + ((pos - deck.loopStart) % loopLen);
        }
      }
      return clamp(pos, 0, deck.duration);
    } else {
      let pos = deck.offsetSeconds - delta;
      if (
        deck.loopEnabled &&
        deck.loopStart !== null &&
        deck.loopEnd !== null &&
        deck.loopEnd > deck.loopStart + 0.04
      ) {
        const loopLen = deck.loopEnd - deck.loopStart;
        if (pos <= deck.loopEnd) {
          const distFromEnd = deck.loopEnd - pos;
          pos = deck.loopEnd - (distFromEnd % loopLen);
        }
      }
      return clamp(pos, 0, deck.duration);
    }
  }

  private stopDeckSourceOnly(deck: InternalDeckState): void {
    if (deck.source) {
      try {
        deck.source.onended = null;
        deck.source.stop();
        deck.source.disconnect();
      } catch {
        // Ignore already stopped source
      }
      deck.source = null;
    }
  }

  private startDeckSourceAt(deck: InternalDeckState, forwardPos: number): void {
    if (!deck.buffer || deck.duration <= 0) return;
    const ctx = this.ensureContext();
    this.stopDeckSourceOnly(deck);

    if (deck.reverse && !deck.reversedBuffer) {
      deck.reversedBuffer = reverseAudioBuffer(ctx, deck.buffer);
    }

    const activeBuf = deck.reverse && deck.reversedBuffer ? deck.reversedBuffer : deck.buffer;
    const source = ctx.createBufferSource();
    source.buffer = activeBuf;
    const effRate = clamp(deck.playbackRate + deck.pitchBendDelta, 0.25, 2.5);
    source.playbackRate.value = effRate;

    const clampedPos = clamp(forwardPos, 0, Math.max(0, deck.duration - 0.01));
    deck.offsetSeconds = clampedPos;
    deck.startedAtCtxTime = ctx.currentTime;

    const bufStartOffset = deck.reverse ? Math.max(0, deck.duration - clampedPos) : clampedPos;

    if (
      deck.loopEnabled &&
      deck.loopStart !== null &&
      deck.loopEnd !== null &&
      deck.loopEnd > deck.loopStart + 0.05
    ) {
      source.loop = true;
      if (!deck.reverse) {
        source.loopStart = deck.loopStart;
        source.loopEnd = deck.loopEnd;
      } else {
        source.loopStart = Math.max(0, deck.duration - deck.loopEnd);
        source.loopEnd = Math.max(0.05, deck.duration - deck.loopStart);
      }
    }

    if (deck.trimGain) {
      source.connect(deck.trimGain);
    }

    source.onended = () => {
      if (deck.source === source && deck.isPlaying && !deck.loopEnabled && !deck.isScratching) {
        deck.isPlaying = false;
        deck.offsetSeconds = deck.reverse ? 0 : deck.duration;
        deck.source = null;
        this.emit();
      }
    };

    deck.source = source;
    deck.isPlaying = true;
    source.start(0, clamp(bufStartOffset, 0, Math.max(0, deck.duration - 0.01)));
  }

  public async loadTrack(deckId: DeckId, track: Track): Promise<void> {
    const deck = this.getDeck(deckId);
    this.stopDeckSourceOnly(deck);

    deck.track = track;
    deck.buffer = null;
    deck.reversedBuffer = null;
    deck.isPlaying = false;
    deck.isLoading = true;
    deck.error = null;
    deck.offsetSeconds = 0;
    deck.cuePoint = 0;
    deck.hotCues = [null, null, null, null];
    deck.loopEnabled = false;
    deck.loopStart = null;
    deck.loopEnd = null;
    deck.autoLoopBeats = null;
    deck.reverse = false;
    deck.playbackRate = 1;
    deck.pitchBendDelta = 0;
    deck.waveformPeaks = [];
    this.emit();

    try {
      const ctx = this.ensureContext();
      let arrayBuffer: ArrayBuffer | null = null;

      if (track.sourceType === 'local') {
        const blobRec = await sonoraDb.audioBlobs.get(track.id);
        if (!blobRec) {
          throw new Error('Local audio blob missing in IndexedDB.');
        }
        arrayBuffer = await blobRec.blob.arrayBuffer();
      } else if (track.streamUrl) {
        const res = await fetch(track.streamUrl);
        if (!res.ok) {
          throw new Error('Remote stream cannot be decoded cleanly without CORS access.');
        }
        arrayBuffer = await res.arrayBuffer();
      } else {
        throw new Error('Unsupported track source for DJ deck.');
      }

      const decoded = await ctx.decodeAudioData(arrayBuffer);
      // Verify same track is still targeted
      if (deck.track?.id !== track.id) return;

      const peaks = extractWaveformPeaks(decoded, 320);
      const analysis = analyzeAudioBufferBpmAndKey(decoded);

      deck.buffer = decoded;
      deck.duration = decoded.duration;
      deck.waveformPeaks = peaks;
      deck.bpm = analysis.bpm;
      deck.bpmConfidence = analysis.confidence;
      deck.beatOffsetSeconds = analysis.beatOffsetSeconds;
      deck.estimatedKey = analysis.estimatedKey;
      deck.isLoading = false;
      deck.error = null;
      this.emit();
    } catch (err) {
      deck.isLoading = false;
      deck.error =
        err instanceof Error
          ? err.message
          : 'Could not decode this audio track for DJ mixing.';
      this.emit();
    }
  }

  public async play(deckId: DeckId): Promise<void> {
    const deck = this.getDeck(deckId);
    if (!deck.buffer) return;
    if (deck.isPlaying) return;
    // Prevent main player from overlapping DJ Studio mix session
    audioEngine.pause();
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const startAt =
      !deck.reverse && deck.offsetSeconds >= deck.duration - 0.05
        ? 0
        : deck.reverse && deck.offsetSeconds <= 0.05
          ? deck.duration - 0.05
          : deck.offsetSeconds;
    this.startDeckSourceAt(deck, startAt);
    this.emit();
  }

  public pause(deckId: DeckId): void {
    const deck = this.getDeck(deckId);
    if (!deck.isPlaying) return;
    deck.offsetSeconds = this.getCurrentPosition(deck);
    deck.isPlaying = false;
    this.stopDeckSourceOnly(deck);
    this.emit();
  }

  public async togglePlay(deckId: DeckId): Promise<void> {
    const deck = this.getDeck(deckId);
    if (deck.isPlaying) {
      this.pause(deckId);
    } else {
      await this.play(deckId);
    }
  }

  public stop(deckId: DeckId): void {
    const deck = this.getDeck(deckId);
    this.stopDeckSourceOnly(deck);
    deck.isPlaying = false;
    deck.offsetSeconds = 0;
    this.emit();
  }

  public seek(deckId: DeckId, seconds: number): void {
    const deck = this.getDeck(deckId);
    if (!deck.buffer) return;
    const clamped = clamp(seconds, 0, Math.max(0, deck.duration - 0.01));
    deck.offsetSeconds = clamped;
    if (deck.isPlaying) {
      this.startDeckSourceAt(deck, clamped);
    }
    this.emit();
  }

  public triggerCue(deckId: DeckId): void {
    const deck = this.getDeck(deckId);
    if (!deck.buffer) return;
    if (!deck.isPlaying) {
      // When paused, pressing CUE sets the cue marker at the current playhead
      deck.cuePoint = this.getCurrentPosition(deck);
    } else {
      // When playing, pressing CUE jumps back to cuePoint and pauses cleanly
      this.stopDeckSourceOnly(deck);
      deck.isPlaying = false;
      deck.offsetSeconds = deck.cuePoint;
    }
    this.emit();
  }

  public setCueAtCurrent(deckId: DeckId): void {
    const deck = this.getDeck(deckId);
    deck.cuePoint = this.getCurrentPosition(deck);
    this.emit();
  }

  public triggerHotCue(deckId: DeckId, slotIndex: number): void {
    const deck = this.getDeck(deckId);
    if (!deck.buffer || slotIndex < 0 || slotIndex >= 4) return;
    const existing = deck.hotCues[slotIndex];
    if (existing === null) {
      deck.hotCues[slotIndex] = this.getCurrentPosition(deck);
      this.emit();
    } else {
      deck.offsetSeconds = existing;
      if (deck.isPlaying) {
        this.startDeckSourceAt(deck, existing);
      } else {
        void this.play(deckId);
      }
      this.emit();
    }
  }

  public clearHotCue(deckId: DeckId, slotIndex: number): void {
    const deck = this.getDeck(deckId);
    if (slotIndex < 0 || slotIndex >= 4) return;
    deck.hotCues[slotIndex] = null;
    this.emit();
  }

  public setLoopIn(deckId: DeckId): void {
    const deck = this.getDeck(deckId);
    if (!deck.buffer) return;
    const pos = this.getCurrentPosition(deck);
    deck.loopStart = pos;
    deck.autoLoopBeats = null;
    if (deck.loopEnd !== null && deck.loopEnd <= pos + 0.05) {
      deck.loopEnd = null;
      deck.loopEnabled = false;
    }
    this.emit();
  }

  public setLoopOut(deckId: DeckId): void {
    const deck = this.getDeck(deckId);
    if (!deck.buffer) return;
    const pos = this.getCurrentPosition(deck);
    const start = deck.loopStart ?? Math.max(0, pos - 2);
    if (pos > start + 0.08) {
      deck.loopStart = start;
      deck.loopEnd = pos;
      deck.loopEnabled = true;
      deck.autoLoopBeats = null;
      if (deck.isPlaying) {
        this.startDeckSourceAt(deck, this.getCurrentPosition(deck));
      }
    }
    this.emit();
  }

  public toggleLoop(deckId: DeckId): void {
    const deck = this.getDeck(deckId);
    if (!deck.buffer) return;
    if (deck.loopEnabled) {
      deck.loopEnabled = false;
      deck.autoLoopBeats = null;
    } else if (
      deck.loopStart !== null &&
      deck.loopEnd !== null &&
      deck.loopEnd > deck.loopStart + 0.08
    ) {
      deck.loopEnabled = true;
    }
    if (deck.isPlaying) {
      this.startDeckSourceAt(deck, this.getCurrentPosition(deck));
    }
    this.emit();
  }

  public setAutoLoop(deckId: DeckId, beats: AutoLoopBeats): void {
    const deck = this.getDeck(deckId);
    if (!deck.buffer) return;

    if (deck.loopEnabled && deck.autoLoopBeats === beats) {
      deck.loopEnabled = false;
      deck.autoLoopBeats = null;
      if (deck.isPlaying) {
        this.startDeckSourceAt(deck, this.getCurrentPosition(deck));
      }
      this.emit();
      return;
    }

    const pos = this.getCurrentPosition(deck);
    const beatLen = 60 / Math.max(40, deck.bpm);
    const loopDur = beatLen * beats;
    const start = clamp(pos, 0, Math.max(0, deck.duration - 0.1));
    const end = clamp(start + loopDur, start + 0.1, deck.duration);
    deck.loopStart = start;
    deck.loopEnd = end;
    deck.loopEnabled = true;
    deck.autoLoopBeats = beats;
    if (deck.isPlaying) {
      this.startDeckSourceAt(deck, start);
    }
    this.emit();
  }

  public setPlaybackRate(deckId: DeckId, rate: number): void {
    const deck = this.getDeck(deckId);
    const cur = this.getCurrentPosition(deck);
    deck.offsetSeconds = cur;
    if (this.ctx) {
      deck.startedAtCtxTime = this.ctx.currentTime;
    }
    deck.playbackRate = clamp(rate, 0.5, 1.5);
    if (deck.source && this.ctx) {
      deck.source.playbackRate.setTargetAtTime(
        clamp(deck.playbackRate + deck.pitchBendDelta, 0.25, 2.5),
        this.ctx.currentTime,
        0.015
      );
    }
    this.emit();
  }

  public setPitchBend(deckId: DeckId, delta: number): void {
    const deck = this.getDeck(deckId);
    const cur = this.getCurrentPosition(deck);
    deck.offsetSeconds = cur;
    if (this.ctx) {
      deck.startedAtCtxTime = this.ctx.currentTime;
    }
    deck.pitchBendDelta = clamp(delta, -0.15, 0.15);
    if (deck.source && this.ctx) {
      deck.source.playbackRate.setTargetAtTime(
        clamp(deck.playbackRate + deck.pitchBendDelta, 0.25, 2.5),
        this.ctx.currentTime,
        0.015
      );
    }
    this.emit();
  }

  public toggleReverse(deckId: DeckId): void {
    const deck = this.getDeck(deckId);
    if (!deck.buffer) return;
    const cur = this.getCurrentPosition(deck);
    deck.reverse = !deck.reverse;
    deck.offsetSeconds = cur;
    if (deck.isPlaying) {
      this.startDeckSourceAt(deck, cur);
    }
    this.emit();
  }

  // Virtual turntable / jog wheel scratch
  public scratchStart(deckId: DeckId): void {
    const deck = this.getDeck(deckId);
    if (!deck.buffer) return;
    if (deck.scratchTimer !== null) {
      window.clearTimeout(deck.scratchTimer);
      deck.scratchTimer = null;
    }
    deck.wasPlayingBeforeScratch = deck.isPlaying;
    deck.isScratching = true;
    deck.offsetSeconds = this.getCurrentPosition(deck);
    this.stopDeckSourceOnly(deck);
    deck.isPlaying = false;
    this.emit();
  }

  public scratchMove(deckId: DeckId, deltaSeconds: number): void {
    const deck = this.getDeck(deckId);
    if (!deck.buffer) return;
    const nextPos = clamp(deck.offsetSeconds + deltaSeconds, 0, Math.max(0, deck.duration - 0.02));
    deck.offsetSeconds = nextPos;

    // Audible momentary grain snippet during scratch motion
    const ctx = this.ensureContext();
    const absDelta = Math.abs(deltaSeconds);
    if (absDelta > 0.002) {
      try {
        const useReversed = deltaSeconds < 0;
        if (useReversed && !deck.reversedBuffer) {
          deck.reversedBuffer = reverseAudioBuffer(ctx, deck.buffer);
        }
        const buf = useReversed && deck.reversedBuffer ? deck.reversedBuffer : deck.buffer;
        const grain = ctx.createBufferSource();
        grain.buffer = buf;
        const grainRate = clamp(absDelta * 26, 0.45, 2.4);
        grain.playbackRate.value = grainRate;

        const grainEnv = ctx.createGain();
        const now = ctx.currentTime;
        grainEnv.gain.setValueAtTime(0.01, now);
        grainEnv.gain.linearRampToValueAtTime(0.75, now + 0.008);
        grainEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

        if (deck.trimGain) {
          grain.connect(grainEnv);
          grainEnv.connect(deck.trimGain);
          const startInBuf = useReversed ? Math.max(0, deck.duration - nextPos) : nextPos;
          grain.start(now, clamp(startInBuf, 0, Math.max(0, deck.duration - 0.05)), 0.06);
        }
      } catch {
        // Ignore transient decode/grain bounds errors
      }
    }
    this.emit();
  }

  public scratchEnd(deckId: DeckId): void {
    const deck = this.getDeck(deckId);
    deck.isScratching = false;
    if (deck.wasPlayingBeforeScratch && deck.buffer) {
      deck.wasPlayingBeforeScratch = false;
      this.startDeckSourceAt(deck, deck.offsetSeconds);
    }
    this.emit();
  }

  public setManualBpm(deckId: DeckId, bpm: number): void {
    const deck = this.getDeck(deckId);
    deck.bpm = clamp(Math.round(bpm * 10) / 10, 45, 220);
    this.emit();
  }

  public tapBpm(deckId: DeckId): void {
    const deck = this.getDeck(deckId);
    const now = performance.now();
    deck.tapTimestamps = deck.tapTimestamps.filter((t) => now - t < 2400);
    deck.tapTimestamps.push(now);
    if (deck.tapTimestamps.length >= 2) {
      let sumDiff = 0;
      for (let i = 1; i < deck.tapTimestamps.length; i++) {
        sumDiff += deck.tapTimestamps[i] - deck.tapTimestamps[i - 1];
      }
      const avgMs = sumDiff / (deck.tapTimestamps.length - 1);
      if (avgMs > 200) {
        deck.bpm = clamp(Math.round((60000 / avgMs) * 10) / 10, 45, 220);
      }
    }
    this.emit();
  }

  public setManualKey(deckId: DeckId, key: string): void {
    const deck = this.getDeck(deckId);
    deck.estimatedKey = key.trim() || '--';
    this.emit();
  }

  public syncDeckToOther(targetDeckId: DeckId): void {
    const target = this.getDeck(targetDeckId);
    const master = this.getDeck(targetDeckId === 'A' ? 'B' : 'A');
    if (!target.buffer || !master.buffer || target.bpm <= 0 || master.bpm <= 0) return;

    const masterEffectiveBpm = master.bpm * master.playbackRate;
    let newRate = masterEffectiveBpm / target.bpm;
    // Handle half/double tempo match intelligently
    if (newRate > 1.45) newRate /= 2;
    if (newRate < 0.65) newRate *= 2;
    newRate = clamp(newRate, 0.5, 1.5);

    this.setPlaybackRate(targetDeckId, newRate);

    // Beat phase alignment helper: nudge target position onto master's nearest beat fraction
    const masterPos = this.getCurrentPosition(master);
    const masterBeatLen = 60 / master.bpm;
    const masterPhase = ((masterPos - master.beatOffsetSeconds) % masterBeatLen + masterBeatLen) % masterBeatLen;
    const masterFrac = masterPhase / masterBeatLen;

    const targetPos = this.getCurrentPosition(target);
    const targetBeatLen = 60 / target.bpm;
    const targetPhase = ((targetPos - target.beatOffsetSeconds) % targetBeatLen + targetBeatLen) % targetBeatLen;
    const targetFrac = targetPhase / targetBeatLen;

    let fracDiff = masterFrac - targetFrac;
    if (fracDiff > 0.5) fracDiff -= 1;
    if (fracDiff < -0.5) fracDiff += 1;

    const alignedPos = clamp(targetPos + fracDiff * targetBeatLen, 0, Math.max(0, target.duration - 0.02));
    this.seek(targetDeckId, alignedPos);
  }

  // Channel & Mixer Controls
  public setDeckVolume(deckId: DeckId, vol: number): void {
    const deck = this.getDeck(deckId);
    deck.volume = clamp(vol, 0, 1);
    if (deck.faderNode && this.ctx) {
      deck.faderNode.gain.setTargetAtTime(deck.volume, this.ctx.currentTime, 0.015);
    }
    this.emit();
  }

  public setDeckGain(deckId: DeckId, gain: number): void {
    const deck = this.getDeck(deckId);
    deck.gain = clamp(gain, 0, 2);
    if (deck.trimGain && this.ctx) {
      deck.trimGain.gain.setTargetAtTime(deck.gain, this.ctx.currentTime, 0.015);
    }
    this.emit();
  }

  public setDeckEq(deckId: DeckId, band: 'low' | 'mid' | 'high', db: number): void {
    const deck = this.getDeck(deckId);
    const clamped = clamp(db, -24, 12);
    if (band === 'low') {
      deck.eqLow = clamped;
      if (deck.eqLowNode && this.ctx) deck.eqLowNode.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
    } else if (band === 'mid') {
      deck.eqMid = clamped;
      if (deck.eqMidNode && this.ctx) deck.eqMidNode.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
    } else {
      deck.eqHigh = clamped;
      if (deck.eqHighNode && this.ctx) deck.eqHighNode.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
    }
    this.emit();
  }

  private applyDeckFilterNode(deck: InternalDeckState): void {
    if (!deck.filterNode || !this.ctx) return;
    const v = deck.filter;
    const now = this.ctx.currentTime;
    if (Math.abs(v) < 0.025) {
      deck.filterNode.type = 'allpass';
      deck.filterNode.frequency.setTargetAtTime(1000, now, 0.02);
      deck.filterNode.Q.setTargetAtTime(0.7, now, 0.02);
    } else if (v < 0) {
      // LPF sweep from 18000 Hz down to 220 Hz
      const norm = 1 + v; // 0..0.975
      const freq = 220 * Math.pow(18000 / 220, norm);
      deck.filterNode.type = 'lowpass';
      deck.filterNode.frequency.setTargetAtTime(freq, now, 0.02);
      deck.filterNode.Q.setTargetAtTime(1.5 + Math.abs(v) * 4, now, 0.02);
    } else {
      // HPF sweep from 30 Hz up to 6200 Hz
      const freq = 30 * Math.pow(6200 / 30, v);
      deck.filterNode.type = 'highpass';
      deck.filterNode.frequency.setTargetAtTime(freq, now, 0.02);
      deck.filterNode.Q.setTargetAtTime(1.5 + v * 4, now, 0.02);
    }
  }

  public setDeckFilter(deckId: DeckId, value: number): void {
    const deck = this.getDeck(deckId);
    deck.filter = clamp(value, -1, 1);
    this.applyDeckFilterNode(deck);
    this.emit();
  }

  public setDeckBalance(deckId: DeckId, pan: number): void {
    const deck = this.getDeck(deckId);
    deck.balance = clamp(pan, -1, 1);
    if (deck.pannerNode && this.ctx) {
      deck.pannerNode.pan.setTargetAtTime(deck.balance, this.ctx.currentTime, 0.015);
    }
    this.emit();
  }

  public toggleDeckCueMonitor(deckId: DeckId): void {
    const deck = this.getDeck(deckId);
    deck.cueMonitor = !deck.cueMonitor;
    if (deck.cueSendGain && this.ctx) {
      deck.cueSendGain.gain.setTargetAtTime(deck.cueMonitor ? 1 : 0, this.ctx.currentTime, 0.015);
    }
    this.emit();
  }

  private applyDeckSpatialNodes(deck: InternalDeckState): void {
    if (
      !this.ctx ||
      !deck.spatialDryGain ||
      !deck.spatialWetGain ||
      !deck.spatialPannerNode ||
      !deck.spatialDepthDelay ||
      !deck.spatialAmbienceGain
    ) {
      return;
    }
    const now = this.ctx.currentTime;
    const sp = deck.spatial;
    if (!sp.enabled) {
      deck.spatialDryGain.gain.setTargetAtTime(1, now, 0.02);
      deck.spatialWetGain.gain.setTargetAtTime(0, now, 0.02);
      deck.spatialAmbienceGain.gain.setTargetAtTime(0, now, 0.02);
      return;
    }

    const coords = computeSpatialCoordinates(sp.azimuthDeg, 8, sp.depth * 0.65);
    deck.spatialPannerNode.positionX.setTargetAtTime(coords.x, now, 0.025);
    deck.spatialPannerNode.positionY.setTargetAtTime(coords.y, now, 0.025);
    deck.spatialPannerNode.positionZ.setTargetAtTime(coords.z, now, 0.025);
    deck.spatialDryGain.gain.setTargetAtTime(0.32, now, 0.02);
    deck.spatialWetGain.gain.setTargetAtTime(0.78, now, 0.02);
    deck.spatialDepthDelay.delayTime.setTargetAtTime(0.012 + sp.depth * 0.024, now, 0.02);
    deck.spatialAmbienceGain.gain.setTargetAtTime(sp.ambience * 0.3, now, 0.02);
  }

  public updateDeckSpatial(deckId: DeckId, patch: Partial<DeckSpatialSettings>): void {
    const deck = this.getDeck(deckId);
    deck.spatial = { ...deck.spatial, ...patch };
    this.ensureContext();
    this.applyDeckSpatialNodes(deck);
    this.emit();
  }

  private applyMasterSpatialNodes(): void {
    if (!this.masterSpatialGraph) return;
    const crossoverProximity = this.spatialTransitionEnabled
      ? Math.max(0, 1 - Math.abs(this.crossfader)) * this.spatialTransitionAmbience
      : 0;

    if (crossoverProximity > 0.02) {
      const base = this.masterSpatialSettings;
      const effective: SpatialAudioSettings = {
        ...base,
        enabled: true,
        mode: base.enabled && base.mode !== 'stereo' ? base.mode : 'virtual_surround',
        spatialWidth: clamp((base.enabled ? base.spatialWidth : 1.0) + crossoverProximity * 0.55, 0.5, 2.0),
        reverbIntensity: clamp((base.enabled ? base.reverbIntensity : 0) + crossoverProximity * 0.45, 0, 1),
        surroundIntensity: clamp((base.enabled ? base.surroundIntensity : 0.25) + crossoverProximity * 0.4, 0, 1),
      };
      this.masterSpatialGraph.applySettings(effective);
    } else {
      this.masterSpatialGraph.applySettings(this.masterSpatialSettings);
    }
  }

  public updateMasterSpatial(patch: Partial<SpatialAudioSettings>): void {
    this.ensureContext();
    this.masterSpatialSettings = { ...this.masterSpatialSettings, ...patch };
    this.applyMasterSpatialNodes();
    this.emit();
  }

  public selectMasterSpatialMode(mode: SpatialAudioMode): void {
    this.ensureContext();
    this.masterSpatialSettings = getSpatialPresetSettings(mode, this.masterSpatialSettings);
    this.applyMasterSpatialNodes();
    this.emit();
  }

  public setSpatialTransitionConfig(patch: {
    enabled?: boolean;
    ambience?: number;
  }): void {
    this.ensureContext();
    if (typeof patch.enabled === 'boolean') {
      this.spatialTransitionEnabled = patch.enabled;
    }
    if (typeof patch.ambience === 'number') {
      this.spatialTransitionAmbience = clamp(patch.ambience, 0, 1);
    }
    this.applyMasterSpatialNodes();
    this.emit();
  }

  private applyCrossfaderNodes(): void {
    const { gainA, gainB } = computeCrossfaderGains(this.crossfader);
    const now = this.ctx?.currentTime ?? 0;
    if (this.deckA.crossGainNode && this.ctx) {
      this.deckA.crossGainNode.gain.setTargetAtTime(gainA, now, 0.012);
    }
    if (this.deckB.crossGainNode && this.ctx) {
      this.deckB.crossGainNode.gain.setTargetAtTime(gainB, now, 0.012);
    }
    if (this.spatialTransitionEnabled) {
      this.applyMasterSpatialNodes();
    }
  }

  public setCrossfader(value: number, fromUser = true): void {
    this.crossfader = clamp(value, -1, 1);
    if (fromUser && this.autoMixTransitioning) {
      // Allow immediate manual override without fighting automation
      this.autoMixTransitioning = false;
    }
    this.applyCrossfaderNodes();
    this.emit();
  }

  public setMasterVolume(value: number): void {
    this.masterVolume = clamp(value, 0, 1.2);
    if (this.masterGainNode && this.ctx) {
      this.masterGainNode.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.015);
    }
    this.emit();
  }

  public setCueVolume(value: number): void {
    this.cueVolume = clamp(value, 0, 1);
    if (this.cueMonitorNode && this.ctx) {
      this.cueMonitorNode.gain.setTargetAtTime(this.cueVolume, this.ctx.currentTime, 0.015);
    }
    this.emit();
  }

  // 10 Real-time Web Audio Effects
  public updateEffect(id: DjEffectId, patch: Partial<DjPresetEffectState>): void {
    this.effects[id] = { ...this.effects[id], ...patch };
    this.activePresetId = null;
    this.applyAllEffectsNodes();
    this.emit();
  }

  private applyAllEffectsNodes(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. Bass boost
    const bb = this.effects.bassboost;
    if (this.fxBassBoost) {
      const db = bb.enabled ? bb.intensity * bb.mix * 14 : 0;
      this.fxBassBoost.gain.setTargetAtTime(db, now, 0.025);
    }

    // 2. Low-pass filter
    const lpf = this.effects.lowpass;
    if (this.fxLpfDry && this.fxLpfWet && this.fxLpfFilter) {
      if (lpf.enabled) {
        const freq = 18000 * Math.pow(220 / 18000, clamp(lpf.intensity, 0.05, 1));
        this.fxLpfFilter.frequency.setTargetAtTime(freq, now, 0.02);
        this.fxLpfFilter.Q.setTargetAtTime(1 + lpf.intensity * 6, now, 0.02);
        this.fxLpfDry.gain.setTargetAtTime(1 - lpf.mix, now, 0.02);
        this.fxLpfWet.gain.setTargetAtTime(lpf.mix, now, 0.02);
      } else {
        this.fxLpfDry.gain.setTargetAtTime(1, now, 0.02);
        this.fxLpfWet.gain.setTargetAtTime(0, now, 0.02);
      }
    }

    // 3. High-pass filter
    const hpf = this.effects.highpass;
    if (this.fxHpfDry && this.fxHpfWet && this.fxHpfFilter) {
      if (hpf.enabled) {
        const freq = 35 * Math.pow(5200 / 35, clamp(hpf.intensity, 0.05, 1));
        this.fxHpfFilter.frequency.setTargetAtTime(freq, now, 0.02);
        this.fxHpfFilter.Q.setTargetAtTime(1 + hpf.intensity * 5.5, now, 0.02);
        this.fxHpfDry.gain.setTargetAtTime(1 - hpf.mix, now, 0.02);
        this.fxHpfWet.gain.setTargetAtTime(hpf.mix, now, 0.02);
      } else {
        this.fxHpfDry.gain.setTargetAtTime(1, now, 0.02);
        this.fxHpfWet.gain.setTargetAtTime(0, now, 0.02);
      }
    }

    // 4. Echo
    const echo = this.effects.echo;
    if (this.fxEchoDelay && this.fxEchoFb && this.fxEchoWet && this.fxEchoTone) {
      const delaySec = clamp((echo.timingMs ?? 375) / 1000, 0.06, 1.5);
      this.fxEchoDelay.delayTime.setTargetAtTime(delaySec, now, 0.03);
      this.fxEchoFb.gain.setTargetAtTime(echo.enabled ? 0.18 + echo.intensity * 0.56 : 0, now, 0.02);
      this.fxEchoTone.frequency.setTargetAtTime(3400 - echo.intensity * 1400, now, 0.02);
      this.fxEchoWet.gain.setTargetAtTime(echo.enabled ? echo.mix * 0.85 : 0, now, 0.02);
    }

    // 5. Delay
    const del = this.effects.delay;
    if (this.fxDelayNode && this.fxDelayFb && this.fxDelayWet) {
      const delaySec = clamp((del.timingMs ?? 250) / 1000, 0.04, 1.2);
      this.fxDelayNode.delayTime.setTargetAtTime(delaySec, now, 0.03);
      this.fxDelayFb.gain.setTargetAtTime(del.enabled ? 0.15 + del.intensity * 0.55 : 0, now, 0.02);
      this.fxDelayWet.gain.setTargetAtTime(del.enabled ? del.mix * 0.85 : 0, now, 0.02);
    }

    // 6. Reverb
    const rev = this.effects.reverb;
    if (this.fxReverbWet) {
      this.fxReverbWet.gain.setTargetAtTime(
        rev.enabled ? rev.mix * (0.35 + rev.intensity * 0.85) : 0,
        now,
        0.025
      );
    }

    // 7. Flanger
    const fl = this.effects.flanger;
    if (this.fxFlangerWet && this.fxFlangerLfo && this.fxFlangerDepth && this.fxFlangerFb) {
      this.fxFlangerLfo.frequency.setTargetAtTime(0.2 + fl.intensity * 2.1, now, 0.03);
      this.fxFlangerDepth.gain.setTargetAtTime(0.001 + fl.intensity * 0.0032, now, 0.03);
      this.fxFlangerFb.gain.setTargetAtTime(fl.enabled ? 0.25 + fl.intensity * 0.45 : 0, now, 0.02);
      this.fxFlangerWet.gain.setTargetAtTime(fl.enabled ? fl.mix * 0.75 : 0, now, 0.02);
    }

    // 8. Phaser
    const ph = this.effects.phaser;
    if (this.fxPhaserWet && this.fxPhaserLfo && this.fxPhaserDepth && this.fxPhaserFb) {
      this.fxPhaserLfo.frequency.setTargetAtTime(0.25 + ph.intensity * 2.8, now, 0.03);
      this.fxPhaserDepth.gain.setTargetAtTime(260 + ph.intensity * 550, now, 0.03);
      this.fxPhaserFb.gain.setTargetAtTime(ph.enabled ? 0.2 + ph.intensity * 0.48 : 0, now, 0.02);
      this.fxPhaserWet.gain.setTargetAtTime(ph.enabled ? ph.mix * 0.75 : 0, now, 0.02);
    }

    // 9. Beat Repeat
    const br = this.effects.beatrepeat;
    if (
      this.fxRepeatInputGain &&
      this.fxRepeatDelay &&
      this.fxRepeatFb &&
      this.fxRepeatDry &&
      this.fxRepeatWet
    ) {
      if (br.enabled) {
        const activeDeck = this.crossfader <= 0 ? this.deckA : this.deckB;
        const deckBpm = activeDeck.bpm * activeDeck.playbackRate;
        const syncedMs = clamp((60000 / Math.max(60, deckBpm)) * 0.5, 90, 500);
        const repeatSec = clamp((br.timingMs ?? syncedMs) / 1000, 0.07, 0.8);
        this.fxRepeatDelay.delayTime.setTargetAtTime(repeatSec, now, 0.015);
        this.fxRepeatInputGain.gain.setTargetAtTime(1, now, 0.01);
        this.fxRepeatFb.gain.setTargetAtTime(0.55 + br.intensity * 0.36, now, 0.01);
        this.fxRepeatDry.gain.setTargetAtTime(1 - br.mix * 0.75, now, 0.015);
        this.fxRepeatWet.gain.setTargetAtTime(br.mix, now, 0.015);
      } else {
        this.fxRepeatInputGain.gain.setTargetAtTime(0, now, 0.015);
        this.fxRepeatFb.gain.setTargetAtTime(0, now, 0.015);
        this.fxRepeatDry.gain.setTargetAtTime(1, now, 0.015);
        this.fxRepeatWet.gain.setTargetAtTime(0, now, 0.015);
      }
    }

    // 10. Stutter gate mix
    const st = this.effects.stutter;
    if (this.fxStutterDry && this.fxStutterWet && this.fxStutterGate) {
      if (st.enabled) {
        this.fxStutterDry.gain.setTargetAtTime(1 - st.mix, now, 0.015);
        this.fxStutterWet.gain.setTargetAtTime(st.mix, now, 0.015);
      } else {
        this.fxStutterDry.gain.setTargetAtTime(1, now, 0.015);
        this.fxStutterWet.gain.setTargetAtTime(0, now, 0.015);
        this.fxStutterGate.gain.setTargetAtTime(1, now, 0.015);
      }
    }
  }

  public applyPreset(preset: DjPresetConfig): void {
    this.ensureContext();
    this.activePresetId = preset.id;
    this.setCrossfader(preset.crossfader, false);
    this.setMasterVolume(preset.masterVolume);

    // Apply preset EQ & filter to both decks gently
    for (const id of ['A', 'B'] as DeckId[]) {
      this.setDeckEq(id, 'low', preset.eqLow);
      this.setDeckEq(id, 'mid', preset.eqMid);
      this.setDeckEq(id, 'high', preset.eqHigh);
      this.setDeckFilter(id, preset.filterValue);
    }

    const baseFx = createDefaultEffectsMap();
    for (const key of Object.keys(baseFx) as DjEffectId[]) {
      if (preset.effects[key]) {
        baseFx[key] = { ...baseFx[key], ...preset.effects[key] };
      }
    }
    this.effects = baseFx;
    this.applyAllEffectsNodes();
    this.emit();
  }

  public exportCurrentAsPreset(id: string, name: string): DjPresetConfig {
    const activeDeck = this.crossfader <= 0 ? this.deckA : this.deckB;
    return {
      id,
      name,
      crossfader: this.crossfader,
      masterVolume: this.masterVolume,
      eqLow: activeDeck.eqLow,
      eqMid: activeDeck.eqMid,
      eqHigh: activeDeck.eqHigh,
      filterValue: activeDeck.filter,
      effects: JSON.parse(JSON.stringify(this.effects)) as Record<string, DjPresetEffectState>,
    };
  }

  // Auto Mix Engine
  public setAutoMixTrackResolver(resolver: (id: string) => Track | undefined): void {
    this.autoMixTrackResolver = resolver;
  }

  public setAutoMixPlaylist(trackIds: string[]): void {
    this.autoMixPlaylistIds = [...trackIds];
    if (this.autoMixCurrentIndex >= this.autoMixPlaylistIds.length) {
      this.autoMixCurrentIndex = 0;
    }
    this.emit();
  }

  public addToAutoMixPlaylist(trackId: string): void {
    this.autoMixPlaylistIds = [...this.autoMixPlaylistIds, trackId];
    this.emit();
  }

  public removeFromAutoMixPlaylist(index: number): void {
    this.autoMixPlaylistIds = this.autoMixPlaylistIds.filter((_, i) => i !== index);
    if (this.autoMixCurrentIndex >= this.autoMixPlaylistIds.length) {
      this.autoMixCurrentIndex = 0;
    }
    this.emit();
  }

  public moveAutoMixItem(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= this.autoMixPlaylistIds.length ||
      toIndex < 0 ||
      toIndex >= this.autoMixPlaylistIds.length
    ) {
      return;
    }
    const next = [...this.autoMixPlaylistIds];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    this.autoMixPlaylistIds = next;
    this.emit();
  }

  public setAutoMixConfig(patch: {
    enabled?: boolean;
    transitionSeconds?: number;
    syncBpm?: boolean;
  }): void {
    if (typeof patch.transitionSeconds === 'number') {
      this.autoMixTransitionSeconds = clamp(patch.transitionSeconds, 0, 20);
    }
    if (typeof patch.syncBpm === 'boolean') {
      this.autoMixSyncBpm = patch.syncBpm;
    }
    if (typeof patch.enabled === 'boolean') {
      this.autoMixEnabled = patch.enabled;
      if (!patch.enabled) {
        this.autoMixTransitioning = false;
      } else {
        void this.primeAutoMixIdleDeck();
      }
    }
    this.emit();
  }

  private async primeAutoMixIdleDeck(): Promise<void> {
    if (this.autoMixPlaylistIds.length === 0 || !this.autoMixTrackResolver) return;
    const primaryId: DeckId = this.crossfader <= 0 ? 'A' : 'B';
    const primaryDeck = this.getDeck(primaryId);
    const idleId: DeckId = primaryId === 'A' ? 'B' : 'A';
    const idleDeck = this.getDeck(idleId);

    // If neither deck has a track, load first playlist item onto Deck A
    if (!primaryDeck.track && !idleDeck.track) {
      const firstTrack = this.autoMixTrackResolver(this.autoMixPlaylistIds[0]);
      if (firstTrack) {
        this.autoMixCurrentIndex = 0;
        this.setCrossfader(-1, false);
        await this.loadTrack('A', firstTrack);
        await this.play('A');
      }
    }

    // Preload next track into idle deck if needed
    const nextIdx = (this.autoMixCurrentIndex + 1) % this.autoMixPlaylistIds.length;
    const nextTrackId = this.autoMixPlaylistIds[nextIdx];
    const nextTrack = this.autoMixTrackResolver(nextTrackId);
    if (nextTrack && idleDeck.track?.id !== nextTrack.id && !idleDeck.isLoading) {
      await this.loadTrack(idleId, nextTrack);
    }
  }

  public async triggerAutoMixTransitionNow(): Promise<void> {
    if (this.autoMixTransitioning) return;
    const fromId: DeckId = this.crossfader <= 0 ? 'A' : 'B';
    const toId: DeckId = fromId === 'A' ? 'B' : 'A';
    const toDeck = this.getDeck(toId);

    if (!toDeck.buffer && this.autoMixPlaylistIds.length > 0 && this.autoMixTrackResolver) {
      const nextIdx = (this.autoMixCurrentIndex + 1) % this.autoMixPlaylistIds.length;
      const track = this.autoMixTrackResolver(this.autoMixPlaylistIds[nextIdx]);
      if (track) {
        await this.loadTrack(toId, track);
      }
    }

    if (!this.getDeck(toId).buffer) return;
    if (this.autoMixSyncBpm && this.getDeck(fromId).buffer) {
      this.syncDeckToOther(toId);
    }
    if (!this.getDeck(toId).isPlaying) {
      await this.play(toId);
    }

    this.autoMixTransitioning = true;
    this.autoMixActiveFromDeck = fromId;
    this.autoMixFadeStartTime = performance.now();
    this.autoMixFromValue = this.crossfader;
    this.autoMixToValue = toId === 'B' ? 1 : -1;
    this.emit();
  }

  // DJ Session Recording (Web Audio master output only, never mic/system audio)
  private detectRecordingCapability(): { supported: boolean; mimeType: string; extension: string; reason: string | null } {
    if (typeof MediaRecorder === 'undefined') {
      return {
        supported: false,
        mimeType: '',
        extension: 'webm',
        reason: 'MediaRecorder API is not supported in this browser.',
      };
    }
    const candidates = [
      { mime: 'audio/webm;codecs=opus', ext: 'webm' },
      { mime: 'audio/webm', ext: 'webm' },
      { mime: 'audio/mp4', ext: 'm4a' },
      { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(c.mime)) {
        return { supported: true, mimeType: c.mime, extension: c.ext, reason: null };
      }
    }
    return {
      supported: false,
      mimeType: '',
      extension: 'webm',
      reason: 'No supported Web Audio recording codec (WebM/MP4/Ogg) found in this browser.',
    };
  }

  public startRecording(): boolean {
    const ctx = this.ensureContext();
    const cap = this.detectRecordingCapability();
    if (!cap.supported || !this.recordStreamDest) {
      return false;
    }
    if (this.recordingStatus !== 'idle') return false;

    try {
      this.recordedChunks = [];
      this.recordingMimeType = cap.mimeType || 'audio/webm';
      const recorder = new MediaRecorder(this.recordStreamDest.stream, {
        mimeType: this.recordingMimeType,
      });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const finalDurationSec = this.getRecordingDurationSeconds();
        const blob = new Blob(this.recordedChunks, { type: this.recordingMimeType });
        const ext = cap.extension;
        const url = URL.createObjectURL(blob);
        const now = Date.now();
        const labelDate = new Date(now).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        const mix: RecordedDjMix = {
          id: `dj-mix-${now}`,
          name: `SONORA DJ Mix ${labelDate}`,
          createdAt: now,
          durationSeconds: finalDurationSec,
          mimeType: this.recordingMimeType,
          extension: ext,
          sizeBytes: blob.size,
          blob,
          url,
        };
        this.recordedMixes = [mix, ...this.recordedMixes];
        this.recordingStatus = 'idle';
        this.recordingStartedMs = 0;
        this.recordingAccumulatedMs = 0;
        this.mediaRecorder = null;
        this.emit();
      };

      this.mediaRecorder = recorder;
      this.recordingStatus = 'recording';
      this.recordingStartedMs = performance.now();
      this.recordingAccumulatedMs = 0;
      recorder.start(500);
      this.emit();
      return true;
    } catch {
      this.recordingStatus = 'idle';
      this.emit();
      return false;
    }
  }

  public pauseRecording(): void {
    if (this.mediaRecorder && this.recordingStatus === 'recording') {
      try {
        this.mediaRecorder.pause();
        this.recordingAccumulatedMs += performance.now() - this.recordingStartedMs;
        this.recordingStartedMs = 0;
        this.recordingStatus = 'paused';
        this.emit();
      } catch {
        // Ignore
      }
    }
  }

  public resumeRecording(): void {
    if (this.mediaRecorder && this.recordingStatus === 'paused') {
      try {
        this.mediaRecorder.resume();
        this.recordingStartedMs = performance.now();
        this.recordingStatus = 'recording';
        this.emit();
      } catch {
        // Ignore
      }
    }
  }

  public stopRecording(): void {
    if (this.mediaRecorder && this.recordingStatus !== 'idle') {
      try {
        if (this.recordingStatus === 'recording' && this.recordingStartedMs > 0) {
          this.recordingAccumulatedMs += performance.now() - this.recordingStartedMs;
          this.recordingStartedMs = 0;
        }
        this.mediaRecorder.stop();
      } catch {
        this.recordingStatus = 'idle';
        this.emit();
      }
    }
  }

  public deleteRecordedMix(id: string): void {
    const target = this.recordedMixes.find((m) => m.id === id);
    if (target) {
      URL.revokeObjectURL(target.url);
    }
    this.recordedMixes = this.recordedMixes.filter((m) => m.id !== id);
    this.emit();
  }

  private getRecordingDurationSeconds(): number {
    let totalMs = this.recordingAccumulatedMs;
    if (this.recordingStatus === 'recording' && this.recordingStartedMs > 0) {
      totalMs += performance.now() - this.recordingStartedMs;
    }
    return Math.max(0, totalMs / 1000);
  }

  private samplePeak(analyser: AnalyserNode | undefined | null, buf: Float32Array<ArrayBuffer>): number {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(buf);
    let max = 0;
    for (let i = 0; i < buf.length; i++) {
      const a = Math.abs(buf[i]);
      if (a > max) max = a;
    }
    return clamp(max, 0, 1);
  }

  private ensureTickLoop(): void {
    if (this.tickTimer !== null) return;
    this.lastTickMs = performance.now();
    this.tickTimer = window.setInterval(() => {
      const nowMs = performance.now();
      const dtMs = Math.max(10, nowMs - this.lastTickMs);
      this.lastTickMs = nowMs;

      // Update Stutter gate rhythmic modulation
      if (this.effects.stutter.enabled && this.fxStutterGate && this.ctx) {
        const periodMs = clamp(this.effects.stutter.timingMs ?? 125, 45, 450);
        this.fxStutterPhase = (this.fxStutterPhase + dtMs) % periodMs;
        const gateOpen = this.fxStutterPhase < periodMs * 0.48;
        const closedLevel = clamp(1 - this.effects.stutter.intensity, 0.02, 0.95);
        this.fxStutterGate.gain.setTargetAtTime(gateOpen ? 1 : closedLevel, this.ctx.currentTime, 0.004);
      }

      // Update VU peak levels
      this.deckA.peakLevel = this.deckA.isPlaying
        ? this.samplePeak(this.deckA.analyserNode, this.deckTimeBuf)
        : 0;
      this.deckB.peakLevel = this.deckB.isPlaying
        ? this.samplePeak(this.deckB.analyserNode, this.deckTimeBuf)
        : 0;
      this.masterPeakLevel =
        this.deckA.isPlaying || this.deckB.isPlaying
          ? this.samplePeak(this.masterAnalyser, this.masterTimeBuf)
          : 0;

      // Auto Mix monitor & smooth crossfade automation
      if (this.autoMixTransitioning) {
        const elapsedSec = (nowMs - this.autoMixFadeStartTime) / 1000;
        const progress =
          this.autoMixTransitionSeconds <= 0.05
            ? 1
            : clamp(elapsedSec / this.autoMixTransitionSeconds, 0, 1);
        const eased = 0.5 - 0.5 * Math.cos(progress * Math.PI);
        const nextCross =
          this.autoMixFromValue + (this.autoMixToValue - this.autoMixFromValue) * eased;
        this.crossfader = nextCross;
        this.applyCrossfaderNodes();

        if (progress >= 1) {
          this.autoMixTransitioning = false;
          this.pause(this.autoMixActiveFromDeck);
          if (this.autoMixPlaylistIds.length > 0) {
            this.autoMixCurrentIndex =
              (this.autoMixCurrentIndex + 1) % this.autoMixPlaylistIds.length;
            if (this.autoMixEnabled) {
              void this.primeAutoMixIdleDeck();
            }
          }
        }
      } else if (this.autoMixEnabled && this.autoMixPlaylistIds.length > 0) {
        const leadDeckId: DeckId = this.crossfader <= 0 ? 'A' : 'B';
        const leadDeck = this.getDeck(leadDeckId);
        if (leadDeck.isPlaying && leadDeck.duration > 0) {
          const pos = this.getCurrentPosition(leadDeck);
          const remaining = Math.max(0, leadDeck.duration - pos);
          if (remaining <= this.autoMixTransitionSeconds + 0.3) {
            void this.triggerAutoMixTransitionNow();
          }
        }
      }

      const anyActive =
        this.deckA.isPlaying ||
        this.deckB.isPlaying ||
        this.autoMixTransitioning ||
        this.recordingStatus === 'recording';

      if (anyActive) {
        this.emit();
      }
    }, 65);
  }

  private buildDeckSnapshot(deck: InternalDeckState): DeckSnapshot {
    return {
      id: deck.id,
      track: deck.track,
      isLoading: deck.isLoading,
      error: deck.error,
      isPlaying: deck.isPlaying,
      isScratching: deck.isScratching,
      reverse: deck.reverse,
      position: this.getCurrentPosition(deck),
      duration: deck.duration,
      bpm: deck.bpm,
      effectiveBpm: Math.round(deck.bpm * deck.playbackRate * 10) / 10,
      bpmConfidence: deck.bpmConfidence,
      beatOffsetSeconds: deck.beatOffsetSeconds,
      estimatedKey: deck.estimatedKey,
      playbackRate: deck.playbackRate,
      volume: deck.volume,
      gain: deck.gain,
      eqLow: deck.eqLow,
      eqMid: deck.eqMid,
      eqHigh: deck.eqHigh,
      filter: deck.filter,
      balance: deck.balance,
      spatial: { ...deck.spatial },
      cueMonitor: deck.cueMonitor,
      cuePoint: deck.cuePoint,
      hotCues: [...deck.hotCues],
      loopEnabled: deck.loopEnabled,
      loopStart: deck.loopStart,
      loopEnd: deck.loopEnd,
      autoLoopBeats: deck.autoLoopBeats,
      waveformPeaks: deck.waveformPeaks,
      peakLevel: deck.peakLevel,
    };
  }

  public getSnapshot(): DjEngineSnapshot {
    const cap = this.detectRecordingCapability();
    const recordUnsupportedReason = cap.supported
      ? this.ctx && !this.recordStreamDest
        ? 'Browser Web Audio context does not support MediaStreamAudioDestinationNode recording.'
        : null
      : cap.reason;

    return {
      deckA: this.buildDeckSnapshot(this.deckA),
      deckB: this.buildDeckSnapshot(this.deckB),
      crossfader: this.crossfader,
      masterVolume: this.masterVolume,
      cueVolume: this.cueVolume,
      masterPeakLevel: this.masterPeakLevel,
      activePresetId: this.activePresetId,
      effects: { ...this.effects },
      masterSpatial: { ...this.masterSpatialSettings },
      spatialTransitionEnabled: this.spatialTransitionEnabled,
      spatialTransitionAmbience: this.spatialTransitionAmbience,
      autoMixEnabled: this.autoMixEnabled,
      autoMixPlaylistIds: [...this.autoMixPlaylistIds],
      autoMixCurrentIndex: this.autoMixCurrentIndex,
      autoMixTransitionSeconds: this.autoMixTransitionSeconds,
      autoMixSyncBpm: this.autoMixSyncBpm,
      autoMixTransitioning: this.autoMixTransitioning,
      recordingSupported: cap.supported && recordUnsupportedReason === null,
      recordingUnsupportedReason: recordUnsupportedReason,
      recordingStatus: this.recordingStatus,
      recordingDurationSeconds: this.getRecordingDurationSeconds(),
      recordedMixes: [...this.recordedMixes],
    };
  }

  public subscribe(fn: (snap: DjEngineSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.getSnapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const fn of this.listeners) {
      fn(snap);
    }
  }
}

export const djAudioEngine = new DjAudioEngine();
