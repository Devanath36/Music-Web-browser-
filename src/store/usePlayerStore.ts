import { create } from 'zustand';
import { audioEngine, type EngineSnapshot } from '../audio/audioEngine';
import { getOrInitPlaybackState, sonoraDb } from '../db/sonoraDb';
import type { RepeatMode } from '../types/music';
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
  repeat: RepeatMode;
  isQueueOpen: boolean;
  isExpandedOpen: boolean;
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
  cycleRepeat: () => void;
  addToQueueNext: (trackId: string) => void;
  addToQueueEnd: (trackId: string) => void;
  removeFromQueue: (index: number) => void;
  jumpToQueueIndex: (index: number) => Promise<void>;
  clearQueue: () => void;
  setQueueOpen: (open: boolean) => void;
  setExpandedOpen: (open: boolean) => void;
  handleTrackDeleted: (trackId: string) => void;
}

let initialized = false;

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

  queueTrackIds: [],
  queueIndex: -1,
  shuffle: false,
  repeat: 'off',
  isQueueOpen: false,
  isExpandedOpen: false,
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
      });
    });

    audioEngine.onAdvance((dir) => {
      if (dir === 'next') {
        get().playNext(false);
      } else {
        get().playPrevious();
      }
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
    audioEngine.setVolume(saved.volume);
    audioEngine.setMuted(saved.muted);

    const policy = settings.playbackRestorePolicy || 'ask_user';
    const savedTrack = saved.currentTrackId ? trackMap.get(saved.currentTrackId) || null : null;

    if (policy === 'library_only') {
      set({
        queueTrackIds: [],
        queueIndex: -1,
        shuffle: saved.shuffle,
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
        repeat: saved.repeat,
        volume: saved.volume,
        muted: saved.muted,
      });
      return;
    }

    if (policy === 'resume_position') {
      set({
        queueTrackIds: validQueue,
        queueIndex: nextIndex,
        shuffle: saved.shuffle,
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
      return;
    }

    // policy === 'ask_user'
    set({
      shuffle: saved.shuffle,
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
    }
  },

  playTrackList: async (trackIds, startIndex = 0) => {
    if (trackIds.length === 0) return;
    const clampedIndex = Math.max(0, Math.min(startIndex, trackIds.length - 1));
    const targetId = trackIds[clampedIndex];
    const track = useLibraryStore.getState().tracks.find((t) => t.id === targetId);
    if (!track) return;

    set({
      queueTrackIds: [...trackIds],
      queueIndex: clampedIndex,
      pendingRestorePrompt: null,
    });
    await audioEngine.loadTrack(track, { autoPlay: true, initialPosition: 0 });
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
    const { queueTrackIds, queueIndex, shuffle, repeat } = get();
    if (queueTrackIds.length === 0) return;

    let nextIndex = queueIndex + 1;

    if (shuffle && queueTrackIds.length > 1) {
      let rand = Math.floor(Math.random() * queueTrackIds.length);
      if (rand === queueIndex) {
        rand = (queueIndex + 1) % queueTrackIds.length;
      }
      nextIndex = rand;
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
    const { queueTrackIds, queueIndex, currentTime, repeat } = get();
    if (queueTrackIds.length === 0) return;

    if (currentTime > 3) {
      audioEngine.seek(0);
      return;
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
    set({ shuffle: next });
    persistQueuePrefs(get());
  },

  cycleRepeat: () => {
    const order: RepeatMode[] = ['off', 'all', 'one'];
    const current = get().repeat;
    const next = order[(order.indexOf(current) + 1) % order.length];
    audioEngine.setRepeatMode(next);
    set({ repeat: next });
    persistQueuePrefs(get());
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
    set({ queueTrackIds: updated });
    persistQueuePrefs(get());
  },

  addToQueueEnd: (trackId) => {
    const { queueTrackIds } = get();
    if (queueTrackIds.length === 0) {
      get().playTrackList([trackId], 0);
      return;
    }
    set({ queueTrackIds: [...queueTrackIds, trackId] });
    persistQueuePrefs(get());
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
        set({ queueTrackIds: [], queueIndex: -1 });
        return;
      }
      nextIdx = Math.min(index, updated.length - 1);
      set({ queueTrackIds: updated, queueIndex: nextIdx });
      get().jumpToQueueIndex(nextIdx);
      return;
    }
    set({ queueTrackIds: updated, queueIndex: nextIdx });
    persistQueuePrefs(get());
  },

  jumpToQueueIndex: async (index) => {
    const { queueTrackIds } = get();
    if (index < 0 || index >= queueTrackIds.length) return;
    const trackId = queueTrackIds[index];
    const track = useLibraryStore.getState().tracks.find((t) => t.id === trackId);
    if (!track) return;

    set({ queueIndex: index, pendingRestorePrompt: null });
    await audioEngine.loadTrack(track, { autoPlay: true, initialPosition: 0 });
    useLibraryStore.getState().refreshLibrary();
  },

  clearQueue: () => {
    audioEngine.stopAndClear();
    set({ queueTrackIds: [], queueIndex: -1 });
  },

  setQueueOpen: (open) => set({ isQueueOpen: open }),
  setExpandedOpen: (open) => set({ isExpandedOpen: open }),

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
    set({ queueTrackIds: filtered, queueIndex: newIndex });
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
      repeat: state.repeat,
      volume: state.volume,
      muted: state.muted,
      updatedAt: Date.now(),
    })
    .catch(() => {});
}
