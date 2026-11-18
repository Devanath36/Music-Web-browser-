import { recordTrackPlay, sonoraDb } from '../db/sonoraDb';
import type {
  EqualizerPresetId,
  EqualizerSettingsRecord,
  NetworkMode,
  RepeatMode,
  Track,
} from '../types/music';

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
}

type SnapshotListener = (snapshot: EngineSnapshot) => void;
type TrackAdvanceListener = (direction: 'next' | 'prev') => void;
type TrackDurationResolvedListener = (trackId: string, duration: number) => void;

class PersistentAudioEngine {
  private audio: HTMLAudioElement;
  private currentObjectUrl: string | null = null;
  private currentTrack: Track | null = null;
  private listeners = new Set<SnapshotListener>();
  private advanceListeners = new Set<TrackAdvanceListener>();
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
  };
  private repeatMode: RepeatMode = 'off';
  private networkMode: NetworkMode = 'online';
  private lastPositionStateUpdate = 0;
  private lastDbPersistTime = 0;
  private getQueueSnapshot:
    | (() => {
        queueTrackIds: string[];
        queueIndex: number;
        shuffle: boolean;
        repeat: RepeatMode;
      })
    | null = null;

  // Web Audio Equalizer graph (lazily initialized only when user enables Equalizer)
  private audioCtx: AudioContext | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private bassFilter: BiquadFilterNode | null = null;
  private trebleFilter: BiquadFilterNode | null = null;
  private bandFilters: BiquadFilterNode[] = [];
  private eqSettings: EqualizerSettingsRecord = {
    id: 'eq',
    enabled: false,
    preset: 'flat',
    bassGain: 0,
    trebleGain: 0,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    updatedAt: Date.now(),
  };

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = this.snapshot.volume;
    this.bindAudioEvents();
    this.bindMediaSessionHandlers();
    this.bindLifecyclePersistence();
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
      const source = ctx.createMediaElementSource(this.audio);

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

      // Chain: source -> bass -> band[0..9] -> treble -> destination
      let prev: AudioNode = source;
      prev.connect(bass);
      prev = bass;
      for (const f of bands) {
        prev.connect(f);
        prev = f;
      }
      prev.connect(treble);
      treble.connect(ctx.destination);

      this.audioCtx = ctx;
      this.mediaSource = source;
      this.bassFilter = bass;
      this.trebleFilter = treble;
      this.bandFilters = bands;
      this.snapshot.webAudioActive = true;
    } catch {
      this.snapshot.webAudioActive = false;
    }
  }

  applyEqualizerSettings(settings: EqualizerSettingsRecord) {
    this.eqSettings = settings;

    // Only instantiate Web Audio graph if user explicitly enabled EQ (preserves pure HTMLAudio compatibility otherwise)
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

  private bindAudioEvents() {
    this.audio.addEventListener('play', () => {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      this.snapshot.isPlaying = true;
      this.snapshot.isBuffering = false;
      this.snapshot.error = null;
      this.updateMediaSessionPlaybackState('playing');
      this.updateMediaSessionPositionState();
      this.emit();
    });

    this.audio.addEventListener('pause', () => {
      this.snapshot.isPlaying = false;
      this.snapshot.isBuffering = false;
      this.updateMediaSessionPlaybackState('paused');
      this.updateMediaSessionPositionState();
      this.persistPlaybackPositionNow();
      this.emit();
    });

    this.audio.addEventListener('waiting', () => {
      this.snapshot.isBuffering = true;
      this.emit();
    });

    this.audio.addEventListener('playing', () => {
      this.snapshot.isBuffering = false;
      this.snapshot.isPlaying = true;
      this.snapshot.error = null;
      this.emit();
    });

    this.audio.addEventListener('loadedmetadata', () => {
      const dur = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
      if (dur > 0) {
        this.snapshot.duration = dur;
        if (this.currentTrack && (!this.currentTrack.duration || this.currentTrack.duration < 1)) {
          const trackId = this.currentTrack.id;
          this.currentTrack = { ...this.currentTrack, duration: dur };
          sonoraDb.tracks.update(trackId, { duration: dur }).catch(() => {});
          for (const cb of this.durationListeners) cb(trackId, dur);
        }
      }
      this.updateMediaSessionPositionState();
      this.emit();
    });

    this.audio.addEventListener('timeupdate', () => {
      this.snapshot.currentTime = this.audio.currentTime || 0;
      if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
        this.snapshot.duration = this.audio.duration;
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

    this.audio.addEventListener('seeked', () => {
      this.snapshot.currentTime = this.audio.currentTime || 0;
      this.updateMediaSessionPositionState();
      this.persistPlaybackPositionNow();
      this.emit();
    });

    this.audio.addEventListener('ended', () => {
      if (this.repeatMode === 'one') {
        this.audio.currentTime = 0;
        this.audio.play().catch(() => {});
        return;
      }
      for (const cb of this.advanceListeners) {
        cb('next');
      }
    });

    this.audio.addEventListener('error', () => {
      const mediaError = this.audio.error;
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

  private persistPlaybackPositionNow() {
    const queueInfo = this.getQueueSnapshot?.();
    sonoraDb.playbackState
      .put({
        id: 'current',
        currentTrackId: this.snapshot.currentTrackId,
        positionSeconds: this.audio.currentTime || this.snapshot.currentTime || 0,
        queueTrackIds: queueInfo?.queueTrackIds ?? [],
        queueIndex: queueInfo?.queueIndex ?? -1,
        shuffle: queueInfo?.shuffle ?? false,
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

  private revokeCurrentObjectUrl() {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  }

  async loadTrack(
    track: Track,
    options: { autoPlay?: boolean; initialPosition?: number; recordPlay?: boolean } = {}
  ): Promise<boolean> {
    const { autoPlay = true, initialPosition = 0, recordPlay = true } = options;

    this.snapshot.error = null;
    this.snapshot.currentTrackId = track.id;
    this.snapshot.currentTime = initialPosition;
    this.snapshot.duration = track.duration || 0;
    this.currentTrack = track;

    this.audio.pause();
    this.revokeCurrentObjectUrl();

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

      // Remove crossOrigin if Web Audio isn't active so remote streams without CORS headers play cleanly
      if (!this.audioCtx) {
        this.audio.removeAttribute('crossorigin');
      } else {
        this.audio.crossOrigin = 'anonymous';
      }

      this.snapshot.isBuffering = autoPlay;
      this.audio.src = track.streamUrl;
    } else {
      const record = await sonoraDb.audioBlobs.get(track.id);
      if (!record?.blob) {
        this.snapshot.isPlaying = false;
        this.snapshot.error = 'Audio file missing from local IndexedDB storage.';
        this.emit();
        return false;
      }
      this.audio.removeAttribute('crossorigin');
      const objectUrl = URL.createObjectURL(record.blob);
      this.currentObjectUrl = objectUrl;
      this.audio.src = objectUrl;
    }

    this.audio.load();
    this.applyEqualizerSettings(this.eqSettings);

    if (initialPosition > 0) {
      const applySeek = () => {
        if (Number.isFinite(this.audio.duration) && initialPosition < this.audio.duration) {
          this.audio.currentTime = initialPosition;
        }
      };
      if (this.audio.readyState >= 1) {
        applySeek();
      } else {
        this.audio.addEventListener('loadedmetadata', applySeek, { once: true });
      }
    }

    await this.updateMediaSessionMetadata(track);
    this.emit();

    if (autoPlay) {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume().catch(() => {});
      }
      try {
        await this.audio.play();
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
      await this.audio.play();
    } catch (err) {
      this.snapshot.error = err instanceof Error ? err.message : 'Unable to resume playback.';
      this.emit();
    }
  }

  pause(): void {
    this.audio.pause();
  }

  seek(seconds: number): void {
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

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.audio.volume = clamped;
    this.snapshot.volume = clamped;
    if (clamped > 0 && this.snapshot.muted) {
      this.audio.muted = false;
      this.snapshot.muted = false;
    }
    this.persistPlaybackPositionNow();
    this.emit();
  }

  setMuted(muted: boolean): void {
    this.audio.muted = muted;
    this.snapshot.muted = muted;
    this.persistPlaybackPositionNow();
    this.emit();
  }

  stopAndClear(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.revokeCurrentObjectUrl();
    this.currentTrack = null;
    this.snapshot.currentTrackId = null;
    this.snapshot.isPlaying = false;
    this.snapshot.isBuffering = false;
    this.snapshot.currentTime = 0;
    this.snapshot.duration = 0;
    this.snapshot.error = null;
    this.updateMediaSessionPlaybackState('none');
    this.persistPlaybackPositionNow();
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
