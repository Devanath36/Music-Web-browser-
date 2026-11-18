import { create } from 'zustand';
import { audioEngine, type EngineSnapshot } from '../audio/audioEngine';
import { getOrInitPlaybackState, sonoraDb } from '../db/sonoraDb';
import type { RepeatMode } from '../types/music';
import { pickNextSmartShuffleIndex } from '../utils/smartShuffle';
import { useLibraryStore } from './useLibraryStore';

export interface PendingRestorePrompt {
  trackId: string | null;
  trackTitle: string;
  trackArtist: string;
  positionSeconds: number;
  queueTrackIds: string[];
  queueIndex: number;
}

interface PlayerState extends EngineSnapshot {
  queueTrackIds: string[];
  queueIndex: number;
  shuffle: boolean;
  smartShuffle: boolean;
  repeat: RepeatMode;
  isQueueOpen: boolean;
  isExpandedOpen: boolean;
  isMiniPlayerOpen: boolean;
  pendingRestorePrompt: PendingRestorePrompt | null;

  initPlayer: () => Promise<void>;
  applyRestoreChoice: (choice: 'resume_position' | 'restore_queue' | 'dismiss') => Promise<void>;
  playTrackList: (trackIds: string[], startIndex?: number) => Promise<void>;
  playTrackById: (trackId: string, contextTrackIds?: string[]) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  playNext: (manual?: boolean) => Promise<void>;
  playPrevious: () => Promise<void>;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleSmartShuffle: () => void;
  cycleRepeat: () => void;
  setPlaybackOrder: (
    mode: 'sequential' | 'shuffle' | 'smart_shuffle' | 'repeat_all' | 'repeat_one'
  ) => void;
  addToQueueNext: (trackId: string) => void;
  addToQueueEnd: (trackId: string) => void;
  removeFromQueue: (index: number) => void;
  jumpToQueueIndex: (index: number) => Promise<void>;
  clearQueue: () => void;
  setQueueOpen: (open: boolean) => void;
  setExpandedOpen: (open: boolean) => void;
  setMiniPlayerOpen: (open: boolean) => void;
  handleTrackDeleted: (trackId: string) => void;
  previewCrossfade: () => Promise<void>;
  stopCrossfadePreview: () => void;
}

let initialized = false;
let shuffleHistory: number[] = [];
let pendingShuffleNextIndex: number | null = null;

function computeNextIndexForPreload(
  queueTrackIds: string[],
  queueIndex: number,
  shuffle: boolean,
  smartShuffle: boolean,
  repeat: RepeatMode
): number | null {
  if (repeat === 'one' || queueTrackIds.length === 0) {
    pendingShuffleNextIndex = null;
    return null;
  }

  if ((shuffle || smartShuffle) && queueTrackIds.length > 1) {
    if (smartShuffle) {
      const lib = useLibraryStore.getState();
      const tracksById = new Map(lib.tracks.map((t) => [t.id, t]));
      pendingShuffleNextIndex = pickNextSmartShuffleIndex({
        queueTrackIds,
        currentIndex: queueIndex,
        tracksById,
        allTracks: lib.tracks,
        favoriteIds: lib.favoriteIds,
        recentTrackIds: lib.recentlyPlayed.map((r) => r.trackId),
      });
    } else {
      let rand = Math.floor(Math.random() * queueTrackIds.length);
      if (rand === queueIndex) {
        rand = (queueIndex + 1) % queueTrackIds.length;
      }
      pendingShuffleNextIndex = rand;
    }
    return pendingShuffleNextIndex;
  }

  pendingShuffleNextIndex = null;
  let nextIdx = queueIndex + 1;
  if (nextIdx >= queueTrackIds.length) {
    if (repeat === 'all') nextIdx = 0;
    else return null;
  }
  return nextIdx;
}

function preloadStandbyForQueue(
  queueTrackIds: string[],
  queueIndex: number,
  shuffle: boolean,
  smartShuffle: boolean,
  repeat: RepeatMode
) {
  const nextIdx = computeNextIndexForPreload(
    queueTrackIds,
    queueIndex,
    shuffle,
    smartShuffle,
    repeat
  );
  if (nextIdx === null || nextIdx < 0 || nextIdx >= queueTrackIds.length) {
    void audioEngine.preloadNextTrack(null);
    return;
  }
  const nextId = queueTrackIds[nextIdx];
  const nextTrack = useLibraryStore.getState().tracks.find((t) => t.id === nextId) || null;
  void audioEngine.preloadNextTrack(nextTrack);
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
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

  queueTrackIds: [],
  queueIndex: -1,
  shuffle: false,
  smartShuffle: false,
  repeat: 'off',
  isQueueOpen: false,
  isExpandedOpen: false,
  isMiniPlayerOpen: false,
  pendingRestorePrompt: null,

  initPlayer: async () => {
    if (initialized) return;
    initialized = true;

    audioEngine.setQueueProvider(() => {
      const s = get();
      return {
        queueTrackIds: s.queueTrackIds,
        queueIndex: s.queueIndex,
        shuffle: s.shuffle,
        smartShuffle: s.smartShuffle,
        repeat: s.repeat,
      };
    });

    audioEngine.subscribe((snap) => {
      set({
        currentTrackId: snap.currentTrackId,
        isPlaying: snap.isPlaying,
        isBuffering: snap.isBuffering,
        currentTime: snap.currentTime,
        duration: snap.duration,
        volume: snap.volume,
        muted: snap.muted,
        error: snap.error,
        webAudioActive: snap.webAudioActive,
        isCrossfading: snap.isCrossfading,
        isPreviewingCrossfade: snap.isPreviewingCrossfade,
      });
    });

    audioEngine.onAdvance((dir) => {
      if (dir === 'next') {
        get().playNext(false);
      } else {
        get().playPrevious();
      }
    });

    audioEngine.onTrackHandoff((trackId) => {
      const s = get();
      if ((s.shuffle || s.smartShuffle) && s.queueIndex >= 0) {
        shuffleHistory.push(s.queueIndex);
        if (shuffleHistory.length > 200) shuffleHistory.shift();
      }
      const nextIdx =
        pendingShuffleNextIndex !== null &&
        s.queueTrackIds[pendingShuffleNextIndex] === trackId
          ? pendingShuffleNextIndex
          : (() => {
              const idx = s.queueTrackIds.indexOf(trackId);
              return idx >= 0 ? idx : Math.min(s.queueIndex + 1, s.queueTrackIds.length - 1);
            })();
      pendingShuffleNextIndex = null;
      set({ queueIndex: nextIdx, pendingRestorePrompt: null });
      preloadStandbyForQueue(
        s.queueTrackIds,
        nextIdx,
        s.shuffle,
        s.smartShuffle,
        s.repeat
      );
      void useLibraryStore.getState().refreshLibrary();
    });

    audioEngine.onDurationResolved((trackId, duration) => {
      useLibraryStore.getState().updateTrackDuration(trackId, duration);
    });

    const saved = await getOrInitPlaybackState();
    const settings = useLibraryStore.getState().settings;
    const allTracks = useLibraryStore.getState().tracks;
    const trackMap = new Map(allTracks.map((t) => [t.id, t]));

    const validQueue = saved.queueTrackIds.filter((id) => trackMap.has(id));
    let nextIndex = saved.queueIndex;
    if (saved.currentTrackId && validQueue.length > 0) {
      const foundIdx = validQueue.indexOf(saved.currentTrackId);
      nextIndex = foundIdx >= 0 ? foundIdx : Math.min(saved.queueIndex, validQueue.length - 1);
    } else {
      nextIndex = -1;
    }

    audioEngine.setRepeatMode(saved.repeat);
    audioEngine.restoreAudioSettings(saved.volume, saved.muted);

    const policy = settings.playbackRestorePolicy || 'ask_user';
    const savedTrack = saved.currentTrackId ? trackMap.get(saved.currentTrackId) || null : null;

    if (policy === 'library_only') {
      set({
        queueTrackIds: [],
        queueIndex: -1,
        shuffle: saved.shuffle,
        smartShuffle: Boolean(saved.smartShuffle),
        repeat: saved.repeat,
        volume: saved.volume,
        muted: saved.muted,
      });
      return;
    }

    if (policy === 'restore_queue') {
      set({
        queueTrackIds: validQueue,
        queueIndex: nextIndex,
        shuffle: saved.shuffle,
        smartShuffle: Boolean(saved.smartShuffle),
        repeat: saved.repeat,
        volume: saved.volume,
        muted: saved.muted,
      });
      preloadStandbyForQueue(
        validQueue,
        nextIndex,
        saved.shuffle,
        Boolean(saved.smartShuffle),
        saved.repeat
      );
      return;
    }

    if (policy === 'resume_position') {
      set({
        queueTrackIds: validQueue,
        queueIndex: nextIndex,
        shuffle: saved.shuffle,
        smartShuffle: Boolean(saved.smartShuffle),
        repeat: saved.repeat,
        volume: saved.volume,
        muted: saved.muted,
      });
      if (savedTrack) {
        await audioEngine.loadTrack(savedTrack, {
          autoPlay: false,
          initialPosition: saved.positionSeconds || 0,
          recordPlay: false,
        });
      }
      preloadStandbyForQueue(
        validQueue,
        nextIndex,
        saved.shuffle,
        Boolean(saved.smartShuffle),
        saved.repeat
      );
      return;
    }

    // policy === 'ask_user'
    set({
      shuffle: saved.shuffle,
      smartShuffle: Boolean(saved.smartShuffle),
      repeat: saved.repeat,
      volume: saved.volume,
      muted: saved.muted,
    });

    if (savedTrack || validQueue.length > 0) {
      set({
        pendingRestorePrompt: {
          trackId: savedTrack?.id ?? null,
          trackTitle: savedTrack?.title ?? `${validQueue.length} queued tracks`,
          trackArtist: savedTrack?.artist ?? 'Previous session',
          positionSeconds: saved.positionSeconds || 0,
          queueTrackIds: validQueue,
          queueIndex: nextIndex,
        },
      });
    }
  },

  applyRestoreChoice: async (choice) => {
    const prompt = get().pendingRestorePrompt;
    set({ pendingRestorePrompt: null });
    if (!prompt || choice === 'dismiss') return;

    const tracks = useLibraryStore.getState().tracks;
    const track = prompt.trackId ? tracks.find((t) => t.id === prompt.trackId) : null;

    set({
      queueTrackIds: prompt.queueTrackIds,
      queueIndex: prompt.queueIndex,
    });

    if (choice === 'resume_position' && track) {
      await audioEngine.loadTrack(track, {
        autoPlay: true,
        initialPosition: prompt.positionSeconds,
        recordPlay: false,
      });
      const st = get();
      preloadStandbyForQueue(st.queueTrackIds, st.queueIndex, st.shuffle, st.smartShuffle, st.repeat);
    }
  },

  playTrackList: async (trackIds, startIndex = 0) => {
    if (trackIds.length === 0) return;
    const clampedIndex = Math.max(0, Math.min(startIndex, trackIds.length - 1));
    const targetId = trackIds[clampedIndex];
    const track = useLibraryStore.getState().tracks.find((t) => t.id === targetId);
    if (!track) return;

    shuffleHistory = [];
    set({
      queueTrackIds: [...trackIds],
      queueIndex: clampedIndex,
      pendingRestorePrompt: null,
    });
    await audioEngine.loadTrack(track, { autoPlay: true, initialPosition: 0 });
    const st = get();
    preloadStandbyForQueue(st.queueTrackIds, st.queueIndex, st.shuffle, st.smartShuffle, st.repeat);
    useLibraryStore.getState().refreshLibrary();
  },

  playTrackById: async (trackId, contextTrackIds) => {
    const libraryTracks = useLibraryStore.getState().tracks;
    const track = libraryTracks.find((t) => t.id === trackId);
    if (!track) return;

    if (contextTrackIds && contextTrackIds.length > 0) {
      const idx = contextTrackIds.indexOf(trackId);
      set({
        queueTrackIds: [...contextTrackIds],
        queueIndex: idx >= 0 ? idx : 0,
        pendingRestorePrompt: null,
      });
    } else {
      const { queueTrackIds } = get();
      const existingIdx = queueTrackIds.indexOf(trackId);
      if (existingIdx >= 0) {
        set({ queueIndex: existingIdx, pendingRestorePrompt: null });
      } else {
        const allIds = libraryTracks.map((t) => t.id);
        const idx = allIds.indexOf(trackId);
        set({
          queueTrackIds: allIds,
          queueIndex: idx >= 0 ? idx : 0,
          pendingRestorePrompt: null,
        });
      }
    }

    await audioEngine.loadTrack(track, { autoPlay: true, initialPosition: 0 });
    const st = get();
    preloadStandbyForQueue(st.queueTrackIds, st.queueIndex, st.shuffle, st.smartShuffle, st.repeat);
    useLibraryStore.getState().refreshLibrary();
  },

  togglePlayPause: async () => {
    const state = get();
    if (state.isPlaying) {
      audioEngine.pause();
      return;
    }

    if (state.currentTrackId) {
      await audioEngine.resume();
      return;
    }

    if (state.queueTrackIds.length > 0) {
      const idx = state.queueIndex >= 0 ? state.queueIndex : 0;
      await get().jumpToQueueIndex(idx);
      return;
    }

    const tracks = useLibraryStore.getState().tracks;
    if (tracks.length > 0) {
      await get().playTrackList(tracks.map((t) => t.id), 0);
    }
  },

  playNext: async (manual = true) => {
    const { queueTrackIds, queueIndex, shuffle, smartShuffle, repeat } = get();
    if (queueTrackIds.length === 0) return;

    if (manual) {
      audioEngine.notifyManualSkip();
    }

    let nextIndex = queueIndex + 1;

    if ((shuffle || smartShuffle) && queueTrackIds.length > 1) {
      if (queueIndex >= 0) {
        shuffleHistory.push(queueIndex);
        if (shuffleHistory.length > 200) shuffleHistory.shift();
      }
      if (
        !manual &&
        pendingShuffleNextIndex !== null &&
        pendingShuffleNextIndex >= 0 &&
        pendingShuffleNextIndex < queueTrackIds.length &&
        pendingShuffleNextIndex !== queueIndex
      ) {
        nextIndex = pendingShuffleNextIndex;
      } else if (smartShuffle) {
        const lib = useLibraryStore.getState();
        const tracksById = new Map(lib.tracks.map((t) => [t.id, t]));
        nextIndex = pickNextSmartShuffleIndex({
          queueTrackIds,
          currentIndex: queueIndex,
          tracksById,
          allTracks: lib.tracks,
          favoriteIds: lib.favoriteIds,
          recentTrackIds: lib.recentlyPlayed.map((r) => r.trackId),
        });
      } else {
        let rand = Math.floor(Math.random() * queueTrackIds.length);
        if (rand === queueIndex) {
          rand = (queueIndex + 1) % queueTrackIds.length;
        }
        nextIndex = rand;
      }
      pendingShuffleNextIndex = null;
    } else if (nextIndex >= queueTrackIds.length) {
      if (repeat === 'all' || manual) {
        nextIndex = 0;
      } else {
        audioEngine.pause();
        audioEngine.seek(0);
        return;
      }
    }

    await get().jumpToQueueIndex(nextIndex);
  },

  playPrevious: async () => {
    const { queueTrackIds, queueIndex, currentTime, repeat, shuffle, smartShuffle } = get();
    if (queueTrackIds.length === 0) return;

    if (currentTime > 3) {
      audioEngine.seek(0);
      return;
    }

    if ((shuffle || smartShuffle) && shuffleHistory.length > 0) {
      const prevHistIdx = shuffleHistory.pop();
      if (
        typeof prevHistIdx === 'number' &&
        prevHistIdx >= 0 &&
        prevHistIdx < queueTrackIds.length
      ) {
        await get().jumpToQueueIndex(prevHistIdx);
        return;
      }
    }

    let prevIndex = queueIndex - 1;
    if (prevIndex < 0) {
      prevIndex = repeat === 'all' ? queueTrackIds.length - 1 : 0;
    }

    await get().jumpToQueueIndex(prevIndex);
  },

  seek: (seconds) => audioEngine.seek(seconds),
  setVolume: (volume) => audioEngine.setVolume(volume),
  toggleMute: () => audioEngine.setMuted(!get().muted),

  toggleShuffle: () => {
    const next = !get().shuffle;
    if (!next) shuffleHistory = [];
    pendingShuffleNextIndex = null;
    set({ shuffle: next, smartShuffle: false });
    const st = get();
    preloadStandbyForQueue(st.queueTrackIds, st.queueIndex, st.shuffle, st.smartShuffle, st.repeat);
    persistQueuePrefs(st);
  },

  toggleSmartShuffle: () => {
    const next = !get().smartShuffle;
    if (!next) shuffleHistory = [];
    pendingShuffleNextIndex = null;
    set({ smartShuffle: next, shuffle: next });
    const st = get();
    preloadStandbyForQueue(st.queueTrackIds, st.queueIndex, st.shuffle, st.smartShuffle, st.repeat);
    persistQueuePrefs(st);
  },

  cycleRepeat: () => {
    const order: RepeatMode[] = ['off', 'all', 'one'];
    const current = get().repeat;
    const next = order[(order.indexOf(current) + 1) % order.length];
    audioEngine.setRepeatMode(next);
    set({ repeat: next });
    const st = get();
    preloadStandbyForQueue(st.queueTrackIds, st.queueIndex, st.shuffle, st.smartShuffle, st.repeat);
    persistQueuePrefs(st);
  },

  setPlaybackOrder: (mode) => {
    let nextShuffle = false;
    let nextSmartShuffle = false;
    let nextRepeat: RepeatMode = 'off';

    if (mode === 'smart_shuffle') {
      nextShuffle = true;
      nextSmartShuffle = true;
      nextRepeat = 'off';
    } else if (mode === 'shuffle') {
      nextShuffle = true;
      nextSmartShuffle = false;
      nextRepeat = 'off';
    } else if (mode === 'repeat_all') {
      nextShuffle = false;
      nextSmartShuffle = false;
      nextRepeat = 'all';
    } else if (mode === 'repeat_one') {
      nextShuffle = false;
      nextSmartShuffle = false;
      nextRepeat = 'one';
    } else {
      shuffleHistory = [];
    }

    pendingShuffleNextIndex = null;
    audioEngine.setRepeatMode(nextRepeat);
    set({ shuffle: nextShuffle, smartShuffle: nextSmartShuffle, repeat: nextRepeat });
    const st = get();
    preloadStandbyForQueue(st.queueTrackIds, st.queueIndex, st.shuffle, st.smartShuffle, st.repeat);
    persistQueuePrefs(st);
  },

  addToQueueNext: (trackId) => {
    const { queueTrackIds, queueIndex } = get();
    if (queueTrackIds.length === 0) {
      get().playTrackList([trackId], 0);
      return;
    }
    const insertAt = Math.max(0, queueIndex + 1);
    const updated = [...queueTrackIds];
    updated.splice(insertAt, 0, trackId);
    pendingShuffleNextIndex = null;
    set({ queueTrackIds: updated });
    const st = get();
    preloadStandbyForQueue(st.queueTrackIds, st.queueIndex, st.shuffle, st.smartShuffle, st.repeat);
    persistQueuePrefs(st);
  },

  addToQueueEnd: (trackId) => {
    const { queueTrackIds } = get();
    if (queueTrackIds.length === 0) {
      get().playTrackList([trackId], 0);
      return;
    }
    set({ queueTrackIds: [...queueTrackIds, trackId] });
    const st = get();
    preloadStandbyForQueue(st.queueTrackIds, st.queueIndex, st.shuffle, st.smartShuffle, st.repeat);
    persistQueuePrefs(st);
  },

  removeFromQueue: (index) => {
    const { queueTrackIds, queueIndex } = get();
    if (index < 0 || index >= queueTrackIds.length) return;
    const updated = queueTrackIds.filter((_, i) => i !== index);
    let nextIdx = queueIndex;
    if (index < queueIndex) nextIdx = queueIndex - 1;
    else if (index === queueIndex) {
      if (updated.length === 0) {
        audioEngine.stopAndClear();
        pendingShuffleNextIndex = null;
        set({ queueTrackIds: [], queueIndex: -1 });
        return;
      }
      nextIdx = Math.min(index, updated.length - 1);
      set({ queueTrackIds: updated, queueIndex: nextIdx });
      get().jumpToQueueIndex(nextIdx);
      return;
    }
    pendingShuffleNextIndex = null;
    set({ queueTrackIds: updated, queueIndex: nextIdx });
    const st = get();
    preloadStandbyForQueue(st.queueTrackIds, st.queueIndex, st.shuffle, st.smartShuffle, st.repeat);
    persistQueuePrefs(st);
  },

  jumpToQueueIndex: async (index) => {
    const { queueTrackIds } = get();
    if (index < 0 || index >= queueTrackIds.length) return;
    const trackId = queueTrackIds[index];
    const track = useLibraryStore.getState().tracks.find((t) => t.id === trackId);
    if (!track) return;

    set({ queueIndex: index, pendingRestorePrompt: null });
    await audioEngine.loadTrack(track, { autoPlay: true, initialPosition: 0 });
    const st = get();
    preloadStandbyForQueue(st.queueTrackIds, st.queueIndex, st.shuffle, st.smartShuffle, st.repeat);
    useLibraryStore.getState().refreshLibrary();
  },

  clearQueue: () => {
    audioEngine.stopAndClear();
    set({ queueTrackIds: [], queueIndex: -1 });
  },

  setQueueOpen: (open) => set({ isQueueOpen: open }),
  setExpandedOpen: (open) => set({ isExpandedOpen: open }),
  setMiniPlayerOpen: (open) => set({ isMiniPlayerOpen: open }),

  handleTrackDeleted: (trackId) => {
    const { queueTrackIds, queueIndex, currentTrackId } = get();
    if (currentTrackId === trackId) {
      audioEngine.stopAndClear();
    }
    const filtered = queueTrackIds.filter((id) => id !== trackId);
    const newIndex =
      currentTrackId === trackId
        ? -1
        : queueIndex >= 0
          ? filtered.indexOf(currentTrackId || '')
          : -1;
    pendingShuffleNextIndex = null;
    set({ queueTrackIds: filtered, queueIndex: newIndex });
    const st = get();
    preloadStandbyForQueue(st.queueTrackIds, st.queueIndex, st.shuffle, st.smartShuffle, st.repeat);
  },

  previewCrossfade: async () => {
    const seconds = useLibraryStore.getState().settings.crossfadeSeconds ?? 5;
    await audioEngine.previewCrossfade(seconds);
  },

  stopCrossfadePreview: () => {
    audioEngine.stopCrossfadePreview();
  },
}));

function persistQueuePrefs(state: PlayerState) {
  sonoraDb.playbackState
    .put({
      id: 'current',
      currentTrackId: state.currentTrackId,
      positionSeconds: state.currentTime,
      queueTrackIds: state.queueTrackIds,
      queueIndex: state.queueIndex,
      shuffle: state.shuffle,
      smartShuffle: state.smartShuffle,
      repeat: state.repeat,
      volume: state.volume,
      muted: state.muted,
      updatedAt: Date.now(),
    })
    .catch(() => {});
}
