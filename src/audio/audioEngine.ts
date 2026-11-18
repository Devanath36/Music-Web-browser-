import {
  recordListeningSessionEvent,
  recordTrackPlay,
  recordTrackSkip,
  sonoraDb,
} from '../db/sonoraDb';
import type {
  EqualizerPresetId,
  EqualizerSettingsRecord,
  NetworkMode,
  RepeatMode,
  SpatialAudioSettings,
  Track,
  TransitionMode,
} from '../types/music';
import {
  buildEqualPowerFadeCurves,
  DEFAULT_CROSSFADE_SECONDS,
  evaluateCrossfadeDecision,
  resolveTransitionConfig,
} from '../utils/crossfadeEngine';
import { DEFAULT_SPATIAL_AUDIO_SETTINGS } from '../utils/spatialAudioPresets';
import { SpatialAudioGraph } from './spatialAudioProcessor';

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const EQ_PRESETS: Record<
  Exclude<EqualizerPresetId, 'custom'>,
  { label: string; bass: number; treble: number; bands: number[] }
> = {
  flat: {
    label: 'Flat',
    bass: 0,
    treble: 0,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  bass: {
    label: 'Bass',
    bass: 6,
    treble: -1,
    bands: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  },
  treble: {
    label: 'Treble',
    bass: -1,
    treble: 6,
    bands: [0, 0, 0, 0, 0, 1, 3, 5, 6, 6],
  },
  pop: {
    label: 'Pop',
    bass: 2,
    treble: 3,
    bands: [-1, 1, 3, 4, 3, 0, -1, 1, 3, 4],
  },
  rock: {
    label: 'Rock',
    bass: 4,
    treble: 4,
    bands: [5, 4, 2, 0, -1, 0, 2, 4, 5, 5],
  },
  classical: {
    label: 'Classical',
    bass: 1,
    treble: 3,
    bands: [3, 2, 1, 0, 0, 0, 0, 2, 3, 4],
  },
};

export interface EngineSnapshot {
  currentTrackId: string | null;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  error: string | null;
  webAudioActive: boolean;
  isCrossfading: boolean;
  isPreviewingCrossfade: boolean;
}

export interface AudioAnalysisFrame {
  active: boolean;
  frequencyData: Uint8Array;
  timeDomainData: Uint8Array;
  bass: number;
  mid: number;
  treble: number;
  overall: number;
  beatPulse: number;
  leftLevel: number;
  rightLevel: number;
  stereoSpread: number;
}

const ZERO_FREQ = new Uint8Array(128);
const ZERO_TIME = new Uint8Array(256).fill(128);

type SnapshotListener = (snapshot: EngineSnapshot) => void;
type TrackAdvanceListener = (direction: 'next' | 'prev') => void;
type TrackHandoffListener = (trackId: string) => void;
type TrackDurationResolvedListener = (trackId: string, duration: number) => void;

type HTMLAudioWithSink = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
  sinkId?: string;
};

class PersistentAudioEngine {
  private elements: [HTMLAudioElement, HTMLAudioElement];
  private activeSlot: 0 | 1 = 0;
  private objectUrls: [string | null, string | null] = [null, null];
  private slotTracks: [Track | null, Track | null] = [null, null];

  private listeners = new Set<SnapshotListener>();
  private advanceListeners = new Set<TrackAdvanceListener>();
  private handoffListeners = new Set<TrackHandoffListener>();
  private durationListeners = new Set<TrackDurationResolvedListener>();

  private snapshot: EngineSnapshot = {
    currentTrackId: null,
    isPlaying: false,
    isBuffering: false,
    currentTime: 0,
    duration: 0,
    volume: 0.9,
    muted: false,
    error: null,
    webAudioActive: false,
    isCrossfading: false,
    isPreviewingCrossfade: false,
  };

  private repeatMode: RepeatMode = 'off';
  private networkMode: NetworkMode = 'online';
  private gaplessEnabled = true;
  private transitionMode: TransitionMode = 'gapless';
  private crossfadeEnabled = false;
  private crossfadeSeconds = DEFAULT_CROSSFADE_SECONDS;
  private analyticsEnabled = true;
  private outputDeviceId = '';

  private crossfadeInProgress = false;
  private crossfadeTimer: number | null = null;
  private transitionEpoch = 0;
  private previewTimer: number | null = null;
  private previewCleanup: (() => void) | null = null;
  private lastPositionStateUpdate = 0;
  private lastDbPersistTime = 0;

  // Active listening session timing for analytics
  private sessionTrackId: string | null = null;
  private sessionLastTickMs: number | null = null;
  private sessionAccumulatedSec = 0;

  private getQueueSnapshot:
    | (() => {
        queueTrackIds: string[];
        queueIndex: number;
        shuffle: boolean;
        smartShuffle: boolean;
        repeat: RepeatMode;
      })
    | null = null;

  // Web Audio Equalizer, Spatial Audio & Real-Time Analyser graph
  private audioCtx: AudioContext | null = null;
  private slotSources: [MediaElementAudioSourceNode | null, MediaElementAudioSourceNode | null] = [
    null,
    null,
  ];
  private slotGains: [GainNode | null, GainNode | null] = [null, null];
  private bassFilter: BiquadFilterNode | null = null;
  private trebleFilter: BiquadFilterNode | null = null;
  private bandFilters: BiquadFilterNode[] = [];
  private spatialGraph: SpatialAudioGraph | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private timeData: Uint8Array<ArrayBuffer> | null = null;
  private visualizerDesired = true;
  private rollingBassAvg = 0;
  private eqSettings: EqualizerSettingsRecord = {
    id: 'eq',
    enabled: false,
    preset: 'flat',
    bassGain: 0,
    trebleGain: 0,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    updatedAt: Date.now(),
  };
  private spatialSettings: SpatialAudioSettings = { ...DEFAULT_SPATIAL_AUDIO_SETTINGS };

  constructor() {
    const a0 = new Audio();
    const a1 = new Audio();
    a0.preload = 'auto';
    a1.preload = 'auto';
    a0.volume = this.snapshot.volume;
    a1.volume = 0;
    this.elements = [a0, a1];

    this.bindSlotEvents(0);
    this.bindSlotEvents(1);
    this.bindMediaSessionHandlers();
    this.bindLifecyclePersistence();
  }

  private get audio(): HTMLAudioElement {
    return this.elements[this.activeSlot];
  }

  private get standbySlot(): 0 | 1 {
    return this.activeSlot === 0 ? 1 : 0;
  }

  private get standbyAudio(): HTMLAudioElement {
    return this.elements[this.standbySlot];
  }

  private get currentTrack(): Track | null {
    return this.slotTracks[this.activeSlot];
  }

  private emit() {
    const copy = { ...this.snapshot };
    for (const listener of this.listeners) {
      listener(copy);
    }
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.snapshot });
    return () => {
      this.listeners.delete(listener);
    };
  }

  onAdvance(listener: TrackAdvanceListener): () => void {
    this.advanceListeners.add(listener);
    return () => {
      this.advanceListeners.delete(listener);
    };
  }

  onTrackHandoff(listener: TrackHandoffListener): () => void {
    this.handoffListeners.add(listener);
    return () => {
      this.handoffListeners.delete(listener);
    };
  }

  onDurationResolved(listener: TrackDurationResolvedListener): () => void {
    this.durationListeners.add(listener);
    return () => {
      this.durationListeners.delete(listener);
    };
  }

  setQueueProvider(
    provider: () => {
      queueTrackIds: string[];
      queueIndex: number;
      shuffle: boolean;
      smartShuffle: boolean;
      repeat: RepeatMode;
    }
  ) {
    this.getQueueSnapshot = provider;
  }

  setRepeatMode(mode: RepeatMode) {
    this.repeatMode = mode;
  }

  setNetworkMode(mode: NetworkMode) {
    this.networkMode = mode;
  }

  setAnalyticsEnabled(enabled: boolean) {
    this.analyticsEnabled = enabled;
  }

  configureTransitions(config: {
    transitionMode?: TransitionMode;
    crossfadeEnabled?: boolean;
    crossfadeSeconds?: number;
    gaplessEnabled?: boolean;
  }) {
    const resolved = resolveTransitionConfig(config);
    this.transitionMode = resolved.transitionMode;
    this.crossfadeEnabled = resolved.crossfadeEnabled;
    this.crossfadeSeconds = resolved.crossfadeSeconds;
    this.gaplessEnabled = resolved.gaplessEnabled;
    if (
      (this.crossfadeEnabled || this.transitionMode === 'crossfade') &&
      this.currentTrack?.sourceType === 'local' &&
      !this.audioCtx
    ) {
      this.ensureWebAudioGraph();
    }
  }

  configureGapless(enabled: boolean, crossfadeSeconds: number) {
    this.configureTransitions({
      gaplessEnabled: enabled,
      crossfadeEnabled: crossfadeSeconds > 0,
      crossfadeSeconds,
      transitionMode: crossfadeSeconds > 0 ? 'crossfade' : 'gapless',
    });
  }

  stopCrossfadePreview() {
    if (this.previewTimer !== null) {
      window.clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    if (this.previewCleanup) {
      this.previewCleanup();
      this.previewCleanup = null;
    }
    if (this.snapshot.isPreviewingCrossfade) {
      this.snapshot.isPreviewingCrossfade = false;
      this.emit();
    }
  }

  async previewCrossfade(requestedSeconds?: number): Promise<void> {
    if (this.snapshot.isPreviewingCrossfade) {
      this.stopCrossfadePreview();
      return;
    }
    if (!this.isWebAudioSupported()) return;
    if (!this.audioCtx) {
      this.ensureWebAudioGraph();
    }
    const ctx = this.audioCtx;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    const durationSec = Math.max(
      1.5,
      Math.min(8, requestedSeconds ?? (this.crossfadeSeconds > 0 ? this.crossfadeSeconds : 5))
    );
    const { fadeOutCurve, fadeInCurve } = buildEqualPowerFadeCurves(64);
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(Math.max(0.08, this.snapshot.volume * 0.24), now);
    master.connect(ctx.destination);

    const gOut = ctx.createGain();
    const gIn = ctx.createGain();
    gOut.gain.setValueCurveAtTime(fadeOutCurve, now, durationSec);
    gIn.gain.setValueCurveAtTime(fadeInCurve, now, durationSec);
    gOut.connect(master);
    gIn.connect(master);

    // Outgoing Cmaj7 warm pad vs Incoming Fmaj7 warm pad to audition equal-power blend cleanly
    const oscOut1 = ctx.createOscillator();
    const oscOut2 = ctx.createOscillator();
    oscOut1.type = 'triangle';
    oscOut2.type = 'sine';
    oscOut1.frequency.setValueAtTime(261.63, now); // C4
    oscOut2.frequency.setValueAtTime(329.63, now); // E4
    oscOut1.connect(gOut);
    oscOut2.connect(gOut);

    const oscIn1 = ctx.createOscillator();
    const oscIn2 = ctx.createOscillator();
    oscIn1.type = 'triangle';
    oscIn2.type = 'sine';
    oscIn1.frequency.setValueAtTime(349.23, now); // F4
    oscIn2.frequency.setValueAtTime(440.0, now); // A4
    oscIn1.connect(gIn);
    oscIn2.connect(gIn);

    const allOscs = [oscOut1, oscOut2, oscIn1, oscIn2];
    for (const osc of allOscs) {
      osc.start(now);
      osc.stop(now + durationSec + 0.05);
    }

    this.previewCleanup = () => {
      for (const osc of allOscs) {
        try {
          osc.stop();
        } catch {
          // Already stopped
        }
        osc.disconnect();
      }
      gOut.disconnect();
      gIn.disconnect();
      master.disconnect();
    };

    this.snapshot.isPreviewingCrossfade = true;
    this.emit();

    this.previewTimer = window.setTimeout(() => {
      this.stopCrossfadePreview();
    }, durationSec * 1000 + 80);
  }

  isOutputDeviceSelectionSupported(): boolean {
    if (typeof HTMLAudioElement === 'undefined') return false;
    return typeof (HTMLAudioElement.prototype as HTMLAudioWithSink).setSinkId === 'function';
  }

  async setAudioOutputDevice(deviceId: string): Promise<{ ok: boolean; error?: string }> {
    this.outputDeviceId = deviceId;
    if (!this.isOutputDeviceSelectionSupported()) {
      return {
        ok: false,
        error: 'Audio output device switching (setSinkId) is not supported in this browser.',
      };
    }

    try {
      for (const el of this.elements) {
        const sinkEl = el as HTMLAudioWithSink;
        if (typeof sinkEl.setSinkId === 'function') {
          await sinkEl.setSinkId(deviceId || '');
        }
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to switch audio output device.',
      };
    }
  }

  getActiveOutputDeviceId(): string {
    return this.outputDeviceId;
  }

  isWebAudioSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      (typeof window.AudioContext !== 'undefined' ||
        typeof (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext !== 'undefined')
    );
  }

  private ensureWebAudioGraph() {
    if (this.audioCtx || !this.isWebAudioSupported()) return;

    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();

      const bass = ctx.createBiquadFilter();
      bass.type = 'lowshelf';
      bass.frequency.value = 100;

      const treble = ctx.createBiquadFilter();
      treble.type = 'highshelf';
      treble.frequency.value = 8000;

      const bands = EQ_FREQUENCIES.map((freq) => {
        const filter = ctx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.4;
        filter.gain.value = 0;
        return filter;
      });

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      analyser.minDecibels = -92;
      analyser.maxDecibels = -18;

      const spatialGraph = new SpatialAudioGraph(ctx);

      const src0 = ctx.createMediaElementSource(this.elements[0]);
      const src1 = ctx.createMediaElementSource(this.elements[1]);
      const g0 = ctx.createGain();
      const g1 = ctx.createGain();
      g0.gain.value = this.activeSlot === 0 ? 1 : 0;
      g1.gain.value = this.activeSlot === 1 ? 1 : 0;

      src0.connect(g0);
      src1.connect(g1);
      g0.connect(bass);
      g1.connect(bass);

      let prev: AudioNode = bass;
      for (const f of bands) {
        prev.connect(f);
        prev = f;
      }
      prev.connect(treble);
      treble.connect(spatialGraph.input);
      spatialGraph.output.connect(analyser);
      analyser.connect(ctx.destination);

      this.audioCtx = ctx;
      this.slotSources = [src0, src1];
      this.slotGains = [g0, g1];
      this.bassFilter = bass;
      this.trebleFilter = treble;
      this.bandFilters = bands;
      this.spatialGraph = spatialGraph;
      this.analyser = analyser;
      this.freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      this.timeData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      this.snapshot.webAudioActive = true;
      spatialGraph.applySettings(this.spatialSettings);
    } catch {
      this.snapshot.webAudioActive = false;
    }
  }

  setVisualizerActive(active: boolean) {
    this.visualizerDesired = active;
    if (
      active &&
      this.currentTrack?.sourceType === 'local' &&
      this.snapshot.isPlaying
    ) {
      if (!this.audioCtx) {
        this.ensureWebAudioGraph();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
    }
    this.emit();
  }

  sampleAudioAnalysis(): AudioAnalysisFrame {
    if (!this.analyser || !this.freqData || !this.timeData || !this.snapshot.isPlaying) {
      this.rollingBassAvg *= 0.85;
      return {
        active: false,
        frequencyData: ZERO_FREQ,
        timeDomainData: ZERO_TIME,
        bass: 0,
        mid: 0,
        treble: 0,
        overall: 0,
        beatPulse: 0,
        leftLevel: 0,
        rightLevel: 0,
        stereoSpread: 0,
      };
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.timeData);

    const bins = this.freqData;
    const len = bins.length;
    let bassSum = 0;
    const bassEnd = Math.min(10, len);
    for (let i = 0; i < bassEnd; i++) bassSum += bins[i];
    const bass = bassEnd > 0 ? bassSum / (bassEnd * 255) : 0;

    let midSum = 0;
    const midEnd = Math.min(44, len);
    for (let i = bassEnd; i < midEnd; i++) midSum += bins[i];
    const midCount = Math.max(1, midEnd - bassEnd);
    const mid = midSum / (midCount * 255);

    let trebleSum = 0;
    const trebleEnd = Math.min(96, len);
    for (let i = midEnd; i < trebleEnd; i++) trebleSum += bins[i];
    const trebleCount = Math.max(1, trebleEnd - midEnd);
    const treble = trebleSum / (trebleCount * 255);

    let totalSum = 0;
    const totalBins = Math.max(1, trebleEnd);
    for (let i = 0; i < totalBins; i++) totalSum += bins[i];
    const overall = totalSum / (totalBins * 255);

    const delta = Math.max(0, bass - this.rollingBassAvg);
    this.rollingBassAvg = this.rollingBassAvg * 0.88 + bass * 0.12;
    const beatPulse = Math.min(1, delta * 4.2 + (bass > 0.72 ? (bass - 0.72) * 2.1 : 0));

    const lr = this.spatialGraph
      ? this.spatialGraph.sampleStereoActivity()
      : { leftLevel: overall, rightLevel: overall, spread: 0 };

    return {
      active: true,
      frequencyData: bins,
      timeDomainData: this.timeData,
      bass,
      mid,
      treble,
      overall,
      beatPulse,
      leftLevel: lr.leftLevel,
      rightLevel: lr.rightLevel,
      stereoSpread: lr.spread,
    };
  }

  applySpatialAudioSettings(settings: SpatialAudioSettings) {
    this.spatialSettings = { ...settings };
    if (settings.enabled && settings.mode !== 'stereo' && !this.audioCtx) {
      this.ensureWebAudioGraph();
    }
    if (this.spatialGraph) {
      const effective: SpatialAudioSettings =
        this.currentTrack === null || this.currentTrack.sourceType === 'local'
          ? settings
          : { ...settings, enabled: false };
      this.spatialGraph.applySettings(effective);
    }
    if (
      settings.enabled &&
      this.audioCtx &&
      this.audioCtx.state === 'suspended' &&
      this.snapshot.isPlaying
    ) {
      this.audioCtx.resume().catch(() => {});
    }
    this.emit();
  }

  applyEqualizerSettings(settings: EqualizerSettingsRecord) {
    this.eqSettings = settings;

    if (settings.enabled && !this.audioCtx) {
      this.ensureWebAudioGraph();
    }

    if (!this.audioCtx || !this.bassFilter || !this.trebleFilter) {
      this.emit();
      return;
    }

    const now = this.audioCtx.currentTime;
    const isActive =
      settings.enabled &&
      (this.currentTrack === null || this.currentTrack.sourceType === 'local');

    const targetBass = isActive ? settings.bassGain : 0;
    const targetTreble = isActive ? settings.trebleGain : 0;

    this.bassFilter.gain.setTargetAtTime(targetBass, now, 0.02);
    this.trebleFilter.gain.setTargetAtTime(targetTreble, now, 0.02);

    this.bandFilters.forEach((filter, idx) => {
      const gain = isActive ? (settings.bands[idx] ?? 0) : 0;
      filter.gain.setTargetAtTime(gain, now, 0.02);
    });

    if (settings.enabled && this.audioCtx.state === 'suspended' && this.snapshot.isPlaying) {
      this.audioCtx.resume().catch(() => {});
    }

    this.emit();
  }

  private flushListeningSession(skipped: boolean) {
    if (this.sessionLastTickMs !== null) {
      this.sessionAccumulatedSec += (Date.now() - this.sessionLastTickMs) / 1000;
      this.sessionLastTickMs = null;
    }
    if (this.sessionTrackId && this.analyticsEnabled) {
      const secs = Math.max(0, this.sessionAccumulatedSec);
      const trackId = this.sessionTrackId;
      if (secs >= 3 || skipped) {
        void recordListeningSessionEvent(trackId, secs, skipped).catch(() => {});
      }
      if (skipped && secs < 20) {
        void recordTrackSkip(trackId).catch(() => {});
      }
    }
    this.sessionTrackId = null;
    this.sessionAccumulatedSec = 0;
  }

  notifyManualSkip() {
    const pos = this.audio.currentTime || 0;
    const dur = Number.isFinite(this.audio.duration) ? this.audio.duration : this.snapshot.duration;
    const isEarlySkip = dur > 30 ? pos < Math.min(20, dur * 0.4) : pos < 12;
    this.flushListeningSession(isEarlySkip);
  }

  private cancelCrossfade(pauseStandby = true) {
    this.transitionEpoch += 1;
    if (this.crossfadeTimer !== null) {
      window.clearInterval(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
    const wasCrossfading = this.crossfadeInProgress;
    this.crossfadeInProgress = false;
    this.snapshot.isCrossfading = false;

    const activeGain = this.slotGains[this.activeSlot];
    const standbyGain = this.slotGains[this.standbySlot];
    if (this.audioCtx) {
      const now = this.audioCtx.currentTime;
      try {
        activeGain?.gain.cancelScheduledValues(now);
        standbyGain?.gain.cancelScheduledValues(now);
      } catch {
        // Ignore
      }
      activeGain?.gain.setValueAtTime(1, now);
      standbyGain?.gain.setValueAtTime(0, now);
    }

    this.elements[this.activeSlot].volume = this.snapshot.volume;
    const standbyEl = this.elements[this.standbySlot];
    standbyEl.volume = 0;

    if (pauseStandby && (wasCrossfading || !standbyEl.paused)) {
      standbyEl.pause();
      if (wasCrossfading) {
        standbyEl.removeAttribute('src');
        standbyEl.load();
        this.revokeSlotUrl(this.standbySlot);
        this.slotTracks[this.standbySlot] = null;
      }
    }
  }

  private async triggerSeamlessTransition(
    useCrossfade: boolean,
    effectiveCrossfadeSeconds?: number
  ) {
    if (this.crossfadeInProgress) return;
    const nextSlot = this.standbySlot;
    const prevSlot = this.activeSlot;
    const nextTrack = this.slotTracks[nextSlot];
    const nextEl = this.elements[nextSlot];
    const prevEl = this.elements[prevSlot];

    if (!nextTrack || !nextEl.src) return;

    const fadeSec = effectiveCrossfadeSeconds ?? this.crossfadeSeconds;
    const epoch = ++this.transitionEpoch;

    this.flushListeningSession(false);

    if (useCrossfade && fadeSec > 0) {
      this.crossfadeInProgress = true;
      this.snapshot.isCrossfading = true;

      if (nextTrack.sourceType === 'local' && !this.audioCtx) {
        this.ensureWebAudioGraph();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume().catch(() => {});
      }
      if (epoch !== this.transitionEpoch) {
        this.crossfadeInProgress = false;
        this.snapshot.isCrossfading = false;
        return;
      }

      nextEl.currentTime = 0;
      nextEl.volume = this.snapshot.volume;
      nextEl.muted = this.snapshot.muted;

      const canUseWebAudioGain =
        Boolean(this.audioCtx) &&
        Boolean(this.slotGains[prevSlot]) &&
        Boolean(this.slotGains[nextSlot]) &&
        nextTrack.sourceType === 'local' &&
        this.slotTracks[prevSlot]?.sourceType === 'local';

      if (canUseWebAudioGain && this.audioCtx) {
        const now = this.audioCtx.currentTime;
        const { fadeOutCurve, fadeInCurve } = buildEqualPowerFadeCurves(64);
        const prevGain = this.slotGains[prevSlot]!.gain;
        const nextGain = this.slotGains[nextSlot]!.gain;
        try {
          prevGain.cancelScheduledValues(now);
          nextGain.cancelScheduledValues(now);
          prevGain.setValueCurveAtTime(fadeOutCurve, now, fadeSec);
          nextGain.setValueCurveAtTime(fadeInCurve, now, fadeSec);
        } catch {
          prevGain.setValueAtTime(1, now);
          prevGain.linearRampToValueAtTime(0, now + fadeSec);
          nextGain.setValueAtTime(0, now);
          nextGain.linearRampToValueAtTime(1, now + fadeSec);
        }
      } else {
        nextEl.volume = 0;
      }

      try {
        await nextEl.play();
      } catch {
        // Decoding/play error rollback: keep outgoing track cleanly audible without ghost fade
        if (this.audioCtx && this.slotGains[prevSlot] && this.slotGains[nextSlot]) {
          const now = this.audioCtx.currentTime;
          try {
            this.slotGains[prevSlot]!.gain.cancelScheduledValues(now);
            this.slotGains[nextSlot]!.gain.cancelScheduledValues(now);
          } catch {
            // Ignore
          }
          this.slotGains[prevSlot]!.gain.setValueAtTime(1, now);
          this.slotGains[nextSlot]!.gain.setValueAtTime(0, now);
        }
        prevEl.volume = this.snapshot.volume;
        nextEl.pause();
        nextEl.volume = 0;
        this.crossfadeInProgress = false;
        this.snapshot.isCrossfading = false;
        this.emit();
        return;
      }

      if (epoch !== this.transitionEpoch) {
        nextEl.pause();
        this.crossfadeInProgress = false;
        this.snapshot.isCrossfading = false;
        return;
      }

      const startMs = performance.now();
      const totalMs = fadeSec * 1000;

      // Flip active slot for UI/transport controls while outgoing tail completes smoothly
      this.activeSlot = nextSlot;
      this.snapshot.currentTrackId = nextTrack.id;
      this.snapshot.currentTime = 0;
      this.snapshot.duration = Number.isFinite(nextEl.duration)
        ? nextEl.duration
        : nextTrack.duration || 0;
      this.snapshot.isPlaying = true;
      this.sessionTrackId = nextTrack.id;
      this.sessionLastTickMs = Date.now();
      this.sessionAccumulatedSec = 0;

      void recordTrackPlay(nextTrack.id).catch(() => {});
      void this.updateMediaSessionMetadata(nextTrack);
      for (const cb of this.handoffListeners) cb(nextTrack.id);
      this.emit();

      this.crossfadeTimer = window.setInterval(() => {
        if (epoch !== this.transitionEpoch) {
          if (this.crossfadeTimer !== null) {
            window.clearInterval(this.crossfadeTimer);
            this.crossfadeTimer = null;
          }
          return;
        }
        const elapsed = performance.now() - startMs;
        const t = Math.min(1, elapsed / totalMs);
        if (!canUseWebAudioGain) {
          // Equal-power HTMLAudio fallback for remote/non-WebAudio tracks
          prevEl.volume = this.snapshot.volume * Math.cos((t * Math.PI) / 2);
          nextEl.volume = this.snapshot.volume * Math.sin((t * Math.PI) / 2);
        }
        if (t >= 1) {
          if (this.crossfadeTimer !== null) {
            window.clearInterval(this.crossfadeTimer);
            this.crossfadeTimer = null;
          }
          prevEl.pause();
          prevEl.removeAttribute('src');
          prevEl.load();
          this.revokeSlotUrl(prevSlot);
          this.slotTracks[prevSlot] = null;
          if (this.audioCtx && this.slotGains[prevSlot]) {
            this.slotGains[prevSlot]!.gain.setValueAtTime(0, this.audioCtx.currentTime);
          }
          this.crossfadeInProgress = false;
          this.snapshot.isCrossfading = false;
          this.emit();
        }
      }, 50);
      return;
    }

    // Tight gapless handoff (0ms decode lag)
    nextEl.currentTime = 0;
    nextEl.volume = this.snapshot.volume;
    nextEl.muted = this.snapshot.muted;
    if (this.slotGains[prevSlot] && this.slotGains[nextSlot] && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.slotGains[prevSlot]!.gain.setValueAtTime(0, now);
      this.slotGains[nextSlot]!.gain.setValueAtTime(1, now);
    }
    try {
      await nextEl.play();
    } catch {
      return;
    }

    prevEl.pause();
    prevEl.removeAttribute('src');
    prevEl.load();
    this.revokeSlotUrl(prevSlot);
    this.slotTracks[prevSlot] = null;

    this.activeSlot = nextSlot;
    this.snapshot.currentTrackId = nextTrack.id;
    this.snapshot.currentTime = 0;
    this.snapshot.duration = Number.isFinite(nextEl.duration)
      ? nextEl.duration
      : nextTrack.duration || 0;
    this.snapshot.isPlaying = true;
    this.sessionTrackId = nextTrack.id;
    this.sessionLastTickMs = Date.now();
    this.sessionAccumulatedSec = 0;

    void recordTrackPlay(nextTrack.id).catch(() => {});
    void this.updateMediaSessionMetadata(nextTrack);
    for (const cb of this.handoffListeners) cb(nextTrack.id);
    this.emit();
  }

  private bindSlotEvents(slot: 0 | 1) {
    const el = this.elements[slot];

    el.addEventListener('play', () => {
      if (slot !== this.activeSlot) return;
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      if (this.sessionTrackId === this.currentTrack?.id && this.sessionLastTickMs === null) {
        this.sessionLastTickMs = Date.now();
      }
      this.snapshot.isPlaying = true;
      this.snapshot.isBuffering = false;
      this.snapshot.error = null;
      this.updateMediaSessionPlaybackState('playing');
      this.updateMediaSessionPositionState();
      this.persistPlaybackPositionNow();
      this.emit();
    });

    el.addEventListener('pause', () => {
      if (slot !== this.activeSlot) return;
      if (this.sessionLastTickMs !== null) {
        this.sessionAccumulatedSec += (Date.now() - this.sessionLastTickMs) / 1000;
        this.sessionLastTickMs = null;
      }
      this.snapshot.isPlaying = false;
      this.snapshot.isBuffering = false;
      this.updateMediaSessionPlaybackState('paused');
      this.updateMediaSessionPositionState();
      this.persistPlaybackPositionNow();
      this.emit();
    });

    el.addEventListener('waiting', () => {
      if (slot !== this.activeSlot) return;
      this.snapshot.isBuffering = true;
      this.emit();
    });

    el.addEventListener('playing', () => {
      if (slot !== this.activeSlot) return;
      this.snapshot.isBuffering = false;
      this.snapshot.isPlaying = true;
      this.snapshot.error = null;
      this.emit();
    });

    el.addEventListener('loadedmetadata', () => {
      if (slot !== this.activeSlot) return;
      const dur = Number.isFinite(el.duration) ? el.duration : 0;
      if (dur > 0) {
        this.snapshot.duration = dur;
        const track = this.slotTracks[slot];
        if (track && (!track.duration || track.duration < 1)) {
          const trackId = track.id;
          this.slotTracks[slot] = { ...track, duration: dur };
          sonoraDb.tracks.update(trackId, { duration: dur }).catch(() => {});
          for (const cb of this.durationListeners) cb(trackId, dur);
        }
      }
      this.updateMediaSessionPositionState();
      this.emit();
    });

    el.addEventListener('timeupdate', () => {
      if (slot !== this.activeSlot) return;
      const current = el.currentTime || 0;
      this.snapshot.currentTime = current;
      const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : this.snapshot.duration;
      if (dur > 0) {
        this.snapshot.duration = dur;
      }

      // Check crossfade or tight gapless pre-end trigger
      const standbyTrack = this.slotTracks[this.standbySlot];
      const standbyEl = this.elements[this.standbySlot];
      const standbyDur =
        Number.isFinite(standbyEl.duration) && standbyEl.duration > 0
          ? standbyEl.duration
          : standbyTrack?.duration ?? null;

      const decision = evaluateCrossfadeDecision({
        crossfadeEnabled: this.crossfadeEnabled,
        transitionMode: this.transitionMode,
        gaplessEnabled: this.gaplessEnabled,
        configuredCrossfadeSeconds: this.crossfadeSeconds,
        repeatMode: this.repeatMode,
        currentTime: current,
        currentDuration: dur,
        nextDuration: standbyDur,
        hasStandbyTrack: Boolean(standbyTrack && standbyEl.src),
        crossfadeInProgress: this.crossfadeInProgress,
      });

      if (decision.action === 'crossfade') {
        void this.triggerSeamlessTransition(true, decision.effectiveCrossfadeSeconds);
        return;
      }
      if (decision.action === 'gapless') {
        void this.triggerSeamlessTransition(false);
        return;
      }

      const now = Date.now();
      if (now - this.lastPositionStateUpdate > 1000) {
        this.lastPositionStateUpdate = now;
        this.updateMediaSessionPositionState();
      }
      if (now - this.lastDbPersistTime > 2500) {
        this.lastDbPersistTime = now;
        this.persistPlaybackPositionNow();
      }

      this.emit();
    });

    el.addEventListener('seeked', () => {
      if (slot !== this.activeSlot) return;
      this.snapshot.currentTime = el.currentTime || 0;
      this.updateMediaSessionPositionState();
      this.persistPlaybackPositionNow();
      this.emit();
    });

    el.addEventListener('ended', () => {
      if (slot !== this.activeSlot) return;
      if (this.repeatMode === 'one') {
        el.currentTime = 0;
        el.play().catch(() => {});
        return;
      }
      if (
        !this.crossfadeInProgress &&
        this.gaplessEnabled &&
        this.slotTracks[this.standbySlot] &&
        this.elements[this.standbySlot].src
      ) {
        void this.triggerSeamlessTransition(false);
        return;
      }
      this.flushListeningSession(false);
      for (const cb of this.advanceListeners) {
        cb('next');
      }
    });

    el.addEventListener('error', () => {
      if (slot !== this.activeSlot) return;
      const mediaError = el.error;
      let msg = 'Unable to play this audio file.';
      if (mediaError) {
        if (mediaError.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
          msg =
            this.currentTrack?.sourceType === 'remote'
              ? 'Remote stream unavailable or format unsupported.'
              : 'Audio format or codec is not supported by this browser.';
        } else if (mediaError.code === MediaError.MEDIA_ERR_NETWORK) {
          msg = 'Network error while loading remote stream.';
        } else if (mediaError.code === MediaError.MEDIA_ERR_DECODE) {
          msg = 'Audio stream failed to decode.';
        }
      }
      this.snapshot.isPlaying = false;
      this.snapshot.isBuffering = false;
      this.snapshot.error = msg;
      this.updateMediaSessionPlaybackState('paused');
      this.emit();
    });
  }

  private bindMediaSessionHandlers() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;

    const safeSetHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null
    ) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Ignore unsupported handler
      }
    };

    safeSetHandler('play', () => {
      this.resume();
    });
    safeSetHandler('pause', () => {
      this.pause();
    });
    safeSetHandler('stop', () => {
      this.pause();
      this.seek(0);
    });
    safeSetHandler('previoustrack', () => {
      if (this.audio.currentTime > 3) {
        this.seek(0);
      } else {
        for (const cb of this.advanceListeners) cb('prev');
      }
    });
    safeSetHandler('nexttrack', () => {
      for (const cb of this.advanceListeners) cb('next');
    });
    safeSetHandler('seekbackward', (details) => {
      const skip = details.seekOffset || 10;
      this.seek(Math.max(0, (this.audio.currentTime || 0) - skip));
    });
    safeSetHandler('seekforward', (details) => {
      const skip = details.seekOffset || 10;
      const maxDur = Number.isFinite(this.audio.duration) ? this.audio.duration : Infinity;
      this.seek(Math.min(maxDur, (this.audio.currentTime || 0) + skip));
    });
    safeSetHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') {
        if (details.fastSeek && 'fastSeek' in this.audio) {
          this.audio.fastSeek(details.seekTime);
        } else {
          this.seek(details.seekTime);
        }
      }
    });
  }

  private bindLifecyclePersistence() {
    if (typeof window === 'undefined') return;
    window.addEventListener('pagehide', () => {
      this.persistPlaybackPositionNow();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.persistPlaybackPositionNow();
      }
    });
  }

  private persistPlaybackPositionNow(allowEmpty = false) {
    const queueInfo = this.getQueueSnapshot?.();
    const hasActiveState =
      Boolean(this.snapshot.currentTrackId) || (queueInfo?.queueTrackIds.length ?? 0) > 0;
    if (!allowEmpty && !hasActiveState) {
      return;
    }

    sonoraDb.playbackState
      .put({
        id: 'current',
        currentTrackId: this.snapshot.currentTrackId,
        positionSeconds: this.audio.currentTime || this.snapshot.currentTime || 0,
        queueTrackIds: queueInfo?.queueTrackIds ?? [],
        queueIndex: queueInfo?.queueIndex ?? -1,
        shuffle: queueInfo?.shuffle ?? false,
        smartShuffle: queueInfo?.smartShuffle ?? false,
        repeat: queueInfo?.repeat ?? this.repeatMode,
        volume: this.snapshot.volume,
        muted: this.snapshot.muted,
        updatedAt: Date.now(),
      })
      .catch(() => {});
  }

  private updateMediaSessionPlaybackState(state: MediaSessionPlaybackState) {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = state;
      } catch {
        // Ignore
      }
    }
  }

  private updateMediaSessionPositionState() {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      typeof navigator.mediaSession.setPositionState !== 'function'
    ) {
      return;
    }

    const dur =
      Number.isFinite(this.audio.duration) && this.audio.duration > 0
        ? this.audio.duration
        : this.snapshot.duration;

    if (!dur || !Number.isFinite(dur) || dur <= 0) return;
    const pos = Math.min(Math.max(0, this.audio.currentTime || 0), dur);

    try {
      navigator.mediaSession.setPositionState({
        duration: dur,
        playbackRate: this.audio.playbackRate || 1,
        position: pos,
      });
    } catch {
      // Ignore
    }
  }

  private async updateMediaSessionMetadata(track: Track) {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      typeof MediaMetadata === 'undefined'
    ) {
      return;
    }

    const artworkEntries: MediaImage[] = [];
    if (track.artworkId) {
      try {
        const art = await sonoraDb.artworks.get(track.artworkId);
        if (art?.blob) {
          const dataUrl = await blobToDataUrl(art.blob);
          artworkEntries.push({
            src: dataUrl,
            sizes: '512x512',
            type: art.mimeType || 'image/jpeg',
          });
        }
      } catch {
        // Fallback below
      }
    }

    if (artworkEntries.length === 0) {
      artworkEntries.push(
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }
      );
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Unknown Title',
        artist: track.artist || 'Unknown Artist',
        album: track.album || 'SONORA Library',
        artwork: artworkEntries,
      });
    } catch {
      // Ignore
    }
  }

  private revokeSlotUrl(slot: 0 | 1) {
    const url = this.objectUrls[slot];
    if (url) {
      URL.revokeObjectURL(url);
      this.objectUrls[slot] = null;
    }
  }

  async preloadNextTrack(track: Track | null): Promise<void> {
    const slot = this.standbySlot;
    const standbyEl = this.elements[slot];
    const transitionsReady =
      this.gaplessEnabled ||
      ((this.transitionMode === 'crossfade' || this.crossfadeEnabled) && this.crossfadeSeconds > 0);
    if (!track || !transitionsReady) {
      standbyEl.pause();
      standbyEl.removeAttribute('src');
      standbyEl.load();
      this.revokeSlotUrl(slot);
      this.slotTracks[slot] = null;
      return;
    }

    if (this.slotTracks[slot]?.id === track.id && standbyEl.src) {
      return;
    }

    standbyEl.pause();
    this.revokeSlotUrl(slot);
    this.slotTracks[slot] = track;

    if (track.sourceType === 'remote') {
      if (this.networkMode === 'offline' || !track.streamUrl) {
        this.slotTracks[slot] = null;
        return;
      }
      if (!this.audioCtx) {
        standbyEl.removeAttribute('crossorigin');
      } else {
        standbyEl.crossOrigin = 'anonymous';
      }
      standbyEl.src = track.streamUrl;
      standbyEl.load();
      return;
    }

    try {
      const record = await sonoraDb.audioBlobs.get(track.id);
      if (!record?.blob || record.blob.size <= 0) {
        this.slotTracks[slot] = null;
        return;
      }
      if (this.slotTracks[slot]?.id !== track.id) return;
      const playableBlob = record.blob.type
        ? record.blob
        : new Blob([record.blob], { type: track.mimeType || 'audio/mpeg' });
      standbyEl.removeAttribute('crossorigin');
      const url = URL.createObjectURL(playableBlob);
      this.objectUrls[slot] = url;
      standbyEl.src = url;
      standbyEl.load();
    } catch {
      this.slotTracks[slot] = null;
    }
  }

  async loadTrack(
    track: Track,
    options: { autoPlay?: boolean; initialPosition?: number; recordPlay?: boolean } = {}
  ): Promise<boolean> {
    const { autoPlay = true, initialPosition = 0, recordPlay = true } = options;

    this.cancelCrossfade();
    if (this.sessionTrackId && this.sessionTrackId !== track.id) {
      this.flushListeningSession(false);
    }

    const slot = this.activeSlot;
    const el = this.elements[slot];

    this.snapshot.error = null;
    this.snapshot.currentTrackId = track.id;
    this.snapshot.currentTime = initialPosition;
    this.snapshot.duration = track.duration || 0;
    this.slotTracks[slot] = track;

    el.pause();
    this.revokeSlotUrl(slot);
    el.volume = this.snapshot.volume;
    el.muted = this.snapshot.muted;

    if (this.audioCtx && this.slotGains[0] && this.slotGains[1]) {
      const now = this.audioCtx.currentTime;
      this.slotGains[slot]!.gain.setValueAtTime(1, now);
      this.slotGains[this.standbySlot]!.gain.setValueAtTime(0, now);
    }

    if (track.sourceType === 'remote') {
      if (this.networkMode === 'offline' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        this.snapshot.isPlaying = false;
        this.snapshot.isBuffering = false;
        this.snapshot.error =
          this.networkMode === 'offline'
            ? 'Offline Mode is active. Switch to Online Mode to play remote streams.'
            : 'No internet connection. Local IndexedDB tracks remain playable offline.';
        this.emit();
        return false;
      }

      if (!track.streamUrl) {
        this.snapshot.error = 'Missing stream URL for remote track.';
        this.emit();
        return false;
      }

      if (!this.audioCtx) {
        el.removeAttribute('crossorigin');
      } else {
        el.crossOrigin = 'anonymous';
      }

      this.snapshot.isBuffering = autoPlay;
      el.src = track.streamUrl;
    } else {
      const record = await sonoraDb.audioBlobs.get(track.id);
      if (!record?.blob || record.blob.size <= 0) {
        this.snapshot.isPlaying = false;
        this.snapshot.error = 'Audio file missing from local IndexedDB storage.';
        this.emit();
        return false;
      }
      const playableBlob = record.blob.type
        ? record.blob
        : new Blob([record.blob], { type: track.mimeType || 'audio/mpeg' });
      el.removeAttribute('crossorigin');
      const objectUrl = URL.createObjectURL(playableBlob);
      this.objectUrls[slot] = objectUrl;
      el.src = objectUrl;
    }

    el.load();
    if (
      (this.visualizerDesired ||
        this.crossfadeEnabled ||
        this.transitionMode === 'crossfade' ||
        (this.spatialSettings.enabled && this.spatialSettings.mode !== 'stereo')) &&
      track.sourceType === 'local' &&
      !this.audioCtx
    ) {
      this.ensureWebAudioGraph();
    }
    this.applyEqualizerSettings(this.eqSettings);
    this.applySpatialAudioSettings(this.spatialSettings);

    if (initialPosition > 0) {
      const applySeek = () => {
        if (Number.isFinite(el.duration) && initialPosition < el.duration) {
          el.currentTime = initialPosition;
        }
      };
      if (el.readyState >= 1) {
        applySeek();
      } else {
        el.addEventListener('loadedmetadata', applySeek, { once: true });
      }
    }

    await this.updateMediaSessionMetadata(track);
    this.emit();

    if (autoPlay) {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume().catch(() => {});
      }
      try {
        this.sessionTrackId = track.id;
        this.sessionLastTickMs = Date.now();
        this.sessionAccumulatedSec = 0;
        await el.play();
        if (recordPlay) {
          recordTrackPlay(track.id).catch(() => {});
        }
        return true;
      } catch (err) {
        this.snapshot.isPlaying = false;
        this.snapshot.isBuffering = false;
        this.snapshot.error =
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Tap Play to start audio playback.'
            : 'Unable to start audio playback.';
        this.emit();
        return false;
      }
    }

    return true;
  }

  async resume(): Promise<void> {
    if (!this.currentTrack) return;

    if (
      this.currentTrack.sourceType === 'remote' &&
      (this.networkMode === 'offline' || (typeof navigator !== 'undefined' && !navigator.onLine))
    ) {
      this.snapshot.error =
        this.networkMode === 'offline'
          ? 'Offline Mode is active. Switch to Online Mode to play remote streams.'
          : 'No internet connection for remote stream.';
      this.emit();
      return;
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume().catch(() => {});
    }

    if (!this.audio.src) {
      await this.loadTrack(this.currentTrack, {
        autoPlay: true,
        initialPosition: this.snapshot.currentTime,
      });
      return;
    }

    try {
      this.sessionTrackId = this.currentTrack.id;
      this.sessionLastTickMs = Date.now();
      await this.audio.play();
    } catch (err) {
      this.snapshot.error = err instanceof Error ? err.message : 'Unable to resume playback.';
      this.emit();
    }
  }

  pause(): void {
    this.cancelCrossfade(true);
    this.audio.pause();
  }

  seek(seconds: number): void {
    if (this.crossfadeInProgress) {
      this.cancelCrossfade(true);
    }
    const dur = Number.isFinite(this.audio.duration) ? this.audio.duration : this.snapshot.duration;
    const clamped = Math.max(0, dur > 0 ? Math.min(seconds, dur) : seconds);
    if (this.audio.src) {
      this.audio.currentTime = clamped;
    }
    this.snapshot.currentTime = clamped;
    this.updateMediaSessionPositionState();
    this.persistPlaybackPositionNow();
    this.emit();
  }

  restoreAudioSettings(volume: number, muted: boolean): void {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.9));
    this.audio.volume = clamped;
    this.snapshot.volume = clamped;
    this.elements[0].muted = Boolean(muted);
    this.elements[1].muted = Boolean(muted);
    this.snapshot.muted = Boolean(muted);
    this.emit();
  }

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.audio.volume = clamped;
    this.snapshot.volume = clamped;
    if (clamped > 0 && this.snapshot.muted) {
      this.elements[0].muted = false;
      this.elements[1].muted = false;
      this.snapshot.muted = false;
    }
    this.persistPlaybackPositionNow();
    this.emit();
  }

  setMuted(muted: boolean): void {
    this.elements[0].muted = muted;
    this.elements[1].muted = muted;
    this.snapshot.muted = muted;
    this.persistPlaybackPositionNow();
    this.emit();
  }

  stopAndClear(): void {
    this.stopCrossfadePreview();
    this.cancelCrossfade(true);
    this.flushListeningSession(false);
    for (const slot of [0, 1] as const) {
      const el = this.elements[slot];
      el.pause();
      el.removeAttribute('src');
      el.load();
      this.revokeSlotUrl(slot);
      this.slotTracks[slot] = null;
    }
    this.snapshot.currentTrackId = null;
    this.snapshot.isPlaying = false;
    this.snapshot.isBuffering = false;
    this.snapshot.currentTime = 0;
    this.snapshot.duration = 0;
    this.snapshot.error = null;
    this.snapshot.isCrossfading = false;
    this.snapshot.isPreviewingCrossfade = false;
    this.updateMediaSessionPlaybackState('none');
    this.persistPlaybackPositionNow(true);
    this.emit();
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read artwork blob'));
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

export const audioEngine = new PersistentAudioEngine();
