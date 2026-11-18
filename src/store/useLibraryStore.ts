import { create } from 'zustand';
import { audioEngine, EQ_PRESETS } from '../audio/audioEngine';
import {
  DEFAULT_EQUALIZER_SETTINGS,
  DEFAULT_LISTENING_ROOM_SETTINGS,
  DEFAULT_SPATIAL_AUDIO_SETTINGS,
  DEFAULT_VISUALIZER_SETTINGS,
  bulkUpdateTracksMetadata,
  ensureStorageAllocations,
  getOrInitEqualizerSettings,
  getOrInitSettings,
  getSectionUsedBytes,
  getStorageBreakdown,
  isQuotaExceededError,
  moveTracksToStorageSection,
  openSonoraDatabase,
  removeTrackCompletely,
  restoreSoftDeletedTracks,
  saveTrackBatch,
  softDeleteTracks,
  sonoraDb,
  undoTrackMetadataUpdate,
  updateTrackMetadata,
  type StagedTrackImport,
} from '../db/sonoraDb';
import { formatBytes } from '../utils/formatters';
import {
  DEFAULT_CROSSFADE_SECONDS,
  resolveTransitionConfig,
} from '../utils/crossfadeEngine';
import {
  applyCustomSpatialProfileSettings,
  createCustomSpatialProfile,
  getSpatialPresetSettings,
} from '../utils/spatialAudioPresets';
import { allocateSequentialStorageSection } from '../utils/storageMetrics';
import type {
  AppSettingsRecord,
  AppView,
  CustomSpatialProfile,
  DjMixRecord,
  DjPresetConfig,
  EqualizerPresetId,
  EqualizerSettingsRecord,
  ImportJobState,
  ListeningEventRecord,
  NetworkMode,
  PlaybackRestorePolicy,
  Playlist,
  PlaylistTrack,
  ProcessedStemRecord,
  RecentlyPlayedEntry,
  RecommendationFeedbackRecord,
  SmartPlaylistRecord,
  SortDirection,
  SortField,
  SpatialAudioMode,
  SpatialAudioSettings,
  StorageBreakdown,
  StorageSectionId,
  Track,
  TrackLyricsRecord,
  TransferHistoryRecord,
  VisualizerSettings,
} from '../types/music';
import { artworkCache } from '../utils/artworkCache';
import { canBrowserPlayFile, getFileExtension, isSupportedAudioFile } from '../utils/formatters';
import {
  getStorageEstimate,
  materializeAudioBlob,
  requestPersistentStorage,
} from '../utils/storage';
import type { WorkerAnalyzeResult } from '../workers/importWorker';

interface LibraryState {
  isLoaded: boolean;
  tracks: Track[];
  deletedTracks: Track[];
  playlists: Playlist[];
  playlistTracks: PlaylistTrack[];
  smartPlaylists: SmartPlaylistRecord[];
  favoriteIds: Set<string>;
  recentlyPlayed: RecentlyPlayedEntry[];
  listeningEvents: ListeningEventRecord[];
  lyricsRecords: TrackLyricsRecord[];
  djMixes: DjMixRecord[];
  processedStems: ProcessedStemRecord[];
  recommendationFeedback: RecommendationFeedbackRecord[];
  transferHistory: TransferHistoryRecord[];
  equalizer: EqualizerSettingsRecord;
  settings: AppSettingsRecord;
  storageBreakdown: StorageBreakdown | null;

  activeView: AppView;
  selectedPlaylistId: string | null;
  selectedAlbumKey: string | null;
  selectedArtistName: string | null;
  searchQuery: string;

  importJob: ImportJobState;

  initializeLibrary: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
  refreshStorage: () => Promise<void>;
  setActiveView: (view: AppView) => void;
  setSelectedPlaylistId: (id: string | null) => void;
  setSelectedAlbumKey: (key: string | null) => void;
  setSelectedArtistName: (name: string | null) => void;
  setSearchQuery: (q: string) => void;

  setSort: (sortBy: SortField, sortDir: SortDirection) => Promise<void>;
  setNetworkMode: (mode: NetworkMode) => Promise<void>;
  setPlaybackRestorePolicy: (policy: PlaybackRestorePolicy) => Promise<void>;
  updateVisualizerSettings: (patch: Partial<VisualizerSettings>) => Promise<void>;
  updateSpatialAudioSettings: (patch: Partial<SpatialAudioSettings>) => Promise<void>;
  selectSpatialAudioMode: (mode: SpatialAudioMode) => Promise<void>;
  saveCustomSpatialProfile: (name: string, includeEq?: boolean) => Promise<CustomSpatialProfile>;
  applyCustomSpatialProfile: (profileId: string) => Promise<void>;
  deleteCustomSpatialProfile: (profileId: string) => Promise<void>;
  saveCustomDjPreset: (preset: DjPresetConfig) => Promise<void>;
  deleteCustomDjPreset: (presetId: string) => Promise<void>;
  updateAppSettings: (patch: Partial<AppSettingsRecord>) => Promise<void>;
  requestPersistStorage: () => Promise<boolean>;

  toggleFavorite: (trackId: string) => Promise<void>;
  removeTrack: (trackId: string) => Promise<void>;
  softRemoveTracks: (trackIds: string[]) => Promise<number>;
  restoreDeletedTracks: (trackIds: string[]) => Promise<number>;
  permanentlyDeleteTracks: (trackIds: string[]) => Promise<void>;
  emptyTrash: () => Promise<void>;
  editTrackMetadata: (
    trackId: string,
    updates: {
      title: string;
      artist: string;
      album: string;
      albumArtist: string;
      genre: string;
      composer?: string;
      year: number | null;
      trackNumber: number | null;
      discNumber?: number | null;
      rating?: number | null;
      customTags?: Record<string, string>;
      artworkFile?: { blob: Blob; mimeType: string } | null;
    }
  ) => Promise<void>;
  bulkEditTracksMetadata: (
    trackIds: string[],
    patch: {
      artist?: string;
      album?: string;
      albumArtist?: string;
      genre?: string;
      composer?: string;
      year?: number | null;
      rating?: number | null;
    }
  ) => Promise<number>;
  undoTrackMetadata: (trackId: string) => Promise<boolean>;
  updateTrackDuration: (trackId: string, duration: number) => void;
  moveTracksStorage: (trackIds: string[], targetSection: StorageSectionId) => Promise<number>;

  createSmartPlaylist: (
    input: Omit<SmartPlaylistRecord, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<SmartPlaylistRecord>;
  updateSmartPlaylist: (
    id: string,
    patch: Partial<Omit<SmartPlaylistRecord, 'id' | 'createdAt' | 'updatedAt'>>
  ) => Promise<void>;
  deleteSmartPlaylist: (id: string) => Promise<void>;

  saveDjMix: (mix: Omit<DjMixRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) => Promise<DjMixRecord>;
  deleteDjMix: (id: string) => Promise<void>;

  saveLyrics: (record: TrackLyricsRecord) => Promise<void>;
  deleteLyrics: (trackId: string) => Promise<void>;

  saveProcessedStem: (stem: ProcessedStemRecord) => Promise<void>;
  deleteProcessedStem: (id: string) => Promise<void>;

  setRecommendationFeedback: (trackId: string, feedback: 'liked' | 'disliked' | null) => Promise<void>;
  clearAnalyticsData: () => Promise<void>;

  setEqualizerEnabled: (enabled: boolean) => Promise<void>;
  selectEqualizerPreset: (preset: EqualizerPresetId) => Promise<void>;
  setEqualizerBand: (index: number, gainDb: number) => Promise<void>;
  setEqualizerBass: (gainDb: number) => Promise<void>;
  setEqualizerTreble: (gainDb: number) => Promise<void>;
  resetEqualizer: () => Promise<void>;

  createPlaylist: (name: string, description?: string) => Promise<Playlist>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<boolean>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;

  addRemoteStreamTrack: (input: {
    title: string;
    artist: string;
    album?: string;
    genre?: string;
    streamUrl: string;
  }) => Promise<Track>;

  importFiles: (files: File[]) => Promise<void>;
  resumePausedImport: () => Promise<void>;
  cancelImport: () => void;
  resetImportJob: () => void;
}

const INITIAL_IMPORT_JOB: ImportJobState = {
  status: 'idle',
  totalFiles: 0,
  processedFiles: 0,
  importedCount: 0,
  duplicateCount: 0,
  unsupportedCount: 0,
  failedCount: 0,
  storage1ImportedCount: 0,
  storage2ImportedCount: 0,
  pausedRemainingCount: 0,
  currentFileName: '',
  errors: [],
  quotaExceeded: false,
  storageFull: false,
};

let activeImportCancelled = false;
let pausedRemainingFiles: File[] = [];

export const useLibraryStore = create<LibraryState>((set, get) => ({
  isLoaded: false,
  tracks: [],
  deletedTracks: [],
  playlists: [],
  playlistTracks: [],
  smartPlaylists: [],
  favoriteIds: new Set<string>(),
  recentlyPlayed: [],
  listeningEvents: [],
  lyricsRecords: [],
  djMixes: [],
  processedStems: [],
  recommendationFeedback: [],
  transferHistory: [],
  equalizer: DEFAULT_EQUALIZER_SETTINGS,
  settings: {
    id: 'app',
    networkMode: typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline',
    playbackRestorePolicy: 'ask_user',
    persistStorageRequested: false,
    sortBy: 'addedAt',
    sortDir: 'desc',
    gaplessEnabled: true,
    transitionMode: 'gapless',
    crossfadeEnabled: false,
    crossfadeSeconds: DEFAULT_CROSSFADE_SECONDS,
    deletedRetentionDays: 30,
    analyticsEnabled: true,
    voiceControlEnabled: false,
    audioOutputDeviceId: '',
    customShortcuts: {},
    listeningRoom: DEFAULT_LISTENING_ROOM_SETTINGS,
    visualizer: DEFAULT_VISUALIZER_SETTINGS,
    spatialAudio: DEFAULT_SPATIAL_AUDIO_SETTINGS,
    customSpatialProfiles: [],
    updatedAt: Date.now(),
  },
  storageBreakdown: null,

  activeView: 'songs',
  selectedPlaylistId: null,
  selectedAlbumKey: null,
  selectedArtistName: null,
  searchQuery: '',
  importJob: INITIAL_IMPORT_JOB,

  initializeLibrary: async () => {
    try {
      await openSonoraDatabase();
    } catch {
      // Proceed to read/fallback cleanly without deleting existing DB
    }

    const [
      settings,
      equalizer,
      rawTracks,
      playlists,
      playlistTracks,
      smartPlaylists,
      favorites,
      recentlyPlayed,
      listeningEvents,
      lyricsRecords,
      djMixes,
      processedStems,
      recommendationFeedback,
      transferHistory,
    ] = await Promise.all([
      getOrInitSettings(),
      getOrInitEqualizerSettings(),
      sonoraDb.tracks.toArray(),
      sonoraDb.playlists.orderBy('createdAt').reverse().toArray(),
      sonoraDb.playlistTracks.toArray(),
      sonoraDb.smartPlaylists.orderBy('createdAt').reverse().toArray().catch(() => []),
      sonoraDb.favorites.toArray(),
      sonoraDb.recentlyPlayed.orderBy('playedAt').reverse().limit(200).toArray().catch(() => []),
      sonoraDb.listeningEvents.orderBy('startedAt').reverse().limit(5000).toArray().catch(() => []),
      sonoraDb.lyrics.toArray().catch(() => []),
      sonoraDb.djMixes.orderBy('createdAt').reverse().toArray().catch(() => []),
      sonoraDb.processedStems.orderBy('createdAt').reverse().toArray().catch(() => []),
      sonoraDb.recommendationFeedback.toArray().catch(() => []),
      sonoraDb.transferHistory.orderBy('timestamp').reverse().limit(100).toArray().catch(() => []),
    ]);

    // Auto-purge expired soft-deleted tracks cleanly
    const retentionDays = settings.deletedRetentionDays ?? 30;
    const expiryCutoff = Date.now() - Math.max(1, retentionDays) * 86_400_000;
    const expiredDeletedIds = rawTracks
      .filter((t) => typeof t.deletedAt === 'number' && t.deletedAt > 0 && t.deletedAt < expiryCutoff)
      .map((t) => t.id);
    if (expiredDeletedIds.length > 0) {
      for (const id of expiredDeletedIds) {
        await removeTrackCompletely(id).catch(() => {});
      }
    }

    const expiredSet = new Set(expiredDeletedIds);
    const remainingTracks = rawTracks.filter((t) => !expiredSet.has(t.id));
    const tracks = remainingTracks.filter((t) => !t.deletedAt);
    const deletedTracks = remainingTracks
      .filter((t) => !!t.deletedAt)
      .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));

    await ensureStorageAllocations().catch(() => {});

    audioEngine.setNetworkMode(settings.networkMode);
    audioEngine.setVisualizerActive(settings.visualizer?.enabled ?? true);
    audioEngine.configureTransitions({
      gaplessEnabled: settings.gaplessEnabled ?? true,
      transitionMode: settings.transitionMode,
      crossfadeEnabled: settings.crossfadeEnabled,
      crossfadeSeconds: settings.crossfadeSeconds ?? DEFAULT_CROSSFADE_SECONDS,
    });
    if (settings.audioOutputDeviceId) {
      void audioEngine.setAudioOutputDevice(settings.audioOutputDeviceId);
    }
    audioEngine.applyEqualizerSettings(equalizer);
    audioEngine.applySpatialAudioSettings({
      ...DEFAULT_SPATIAL_AUDIO_SETTINGS,
      ...(settings.spatialAudio || {}),
    });

    set({
      isLoaded: true,
      settings,
      equalizer,
      tracks,
      deletedTracks,
      playlists,
      playlistTracks,
      smartPlaylists,
      favoriteIds: new Set(favorites.map((f) => f.trackId)),
      recentlyPlayed,
      listeningEvents,
      lyricsRecords,
      djMixes,
      processedStems,
      recommendationFeedback,
      transferHistory,
    });

    getStorageEstimate()
      .then(async (est) => {
        if (est.persisted === false) {
          const granted = await requestPersistentStorage();
          if (granted && !settings.persistStorageRequested) {
            const next = { ...settings, persistStorageRequested: true, updatedAt: Date.now() };
            set({ settings: next });
            await sonoraDb.settings.put(next).catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        getStorageBreakdown()
          .then((storageBreakdown) => set({ storageBreakdown }))
          .catch(() => {});
      });
  },

  refreshLibrary: async () => {
    const [
      rawTracks,
      playlists,
      playlistTracks,
      smartPlaylists,
      favorites,
      recentlyPlayed,
      listeningEvents,
      lyricsRecords,
      djMixes,
      processedStems,
      recommendationFeedback,
      transferHistory,
    ] = await Promise.all([
      sonoraDb.tracks.toArray(),
      sonoraDb.playlists.orderBy('createdAt').reverse().toArray(),
      sonoraDb.playlistTracks.toArray(),
      sonoraDb.smartPlaylists.orderBy('createdAt').reverse().toArray().catch(() => []),
      sonoraDb.favorites.toArray(),
      sonoraDb.recentlyPlayed.orderBy('playedAt').reverse().limit(200).toArray().catch(() => []),
      sonoraDb.listeningEvents.orderBy('startedAt').reverse().limit(5000).toArray().catch(() => []),
      sonoraDb.lyrics.toArray().catch(() => []),
      sonoraDb.djMixes.orderBy('createdAt').reverse().toArray().catch(() => []),
      sonoraDb.processedStems.orderBy('createdAt').reverse().toArray().catch(() => []),
      sonoraDb.recommendationFeedback.toArray().catch(() => []),
      sonoraDb.transferHistory.orderBy('timestamp').reverse().limit(100).toArray().catch(() => []),
    ]);

    const tracks = rawTracks.filter((t) => !t.deletedAt);
    const deletedTracks = rawTracks
      .filter((t) => !!t.deletedAt)
      .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));

    set({
      tracks,
      deletedTracks,
      playlists,
      playlistTracks,
      smartPlaylists,
      favoriteIds: new Set(favorites.map((f) => f.trackId)),
      recentlyPlayed,
      listeningEvents,
      lyricsRecords,
      djMixes,
      processedStems,
      recommendationFeedback,
      transferHistory,
    });
  },

  refreshStorage: async () => {
    const storageBreakdown = await getStorageBreakdown();
    set({ storageBreakdown });
  },

  setActiveView: (view) => set({ activeView: view }),
  setSelectedPlaylistId: (id) => set({ selectedPlaylistId: id }),
  setSelectedAlbumKey: (key) => set({ selectedAlbumKey: key }),
  setSelectedArtistName: (name) => set({ selectedArtistName: name }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  setSort: async (sortBy, sortDir) => {
    const next = { ...get().settings, sortBy, sortDir, updatedAt: Date.now() };
    set({ settings: next });
    await sonoraDb.settings.put(next);
  },

  setNetworkMode: async (mode) => {
    audioEngine.setNetworkMode(mode);
    const next = { ...get().settings, networkMode: mode, updatedAt: Date.now() };
    set({ settings: next });
    await sonoraDb.settings.put(next);
  },

  setPlaybackRestorePolicy: async (policy) => {
    const next = {
      ...get().settings,
      playbackRestorePolicy: policy,
      updatedAt: Date.now(),
    };
    set({ settings: next });
    await sonoraDb.settings.put(next);
  },

  updateVisualizerSettings: async (patch) => {
    const currentSettings = get().settings;
    const nextVisualizer: VisualizerSettings = {
      ...DEFAULT_VISUALIZER_SETTINGS,
      ...(currentSettings.visualizer || {}),
      ...patch,
    };
    const next = {
      ...currentSettings,
      visualizer: nextVisualizer,
      updatedAt: Date.now(),
    };
    set({ settings: next });
    audioEngine.setVisualizerActive(nextVisualizer.enabled);
    await sonoraDb.settings.put(next);
  },

  updateSpatialAudioSettings: async (patch) => {
    const currentSettings = get().settings;
    const base: SpatialAudioSettings = {
      ...DEFAULT_SPATIAL_AUDIO_SETTINGS,
      ...(currentSettings.spatialAudio || {}),
    };
    const nextSpatial: SpatialAudioSettings = {
      ...base,
      ...patch,
    };
    const next = {
      ...currentSettings,
      spatialAudio: nextSpatial,
      updatedAt: Date.now(),
    };
    set({ settings: next });
    audioEngine.applySpatialAudioSettings(nextSpatial);
    await sonoraDb.settings.put(next);
  },

  selectSpatialAudioMode: async (mode) => {
    const currentSettings = get().settings;
    const currentSpatial = {
      ...DEFAULT_SPATIAL_AUDIO_SETTINGS,
      ...(currentSettings.spatialAudio || {}),
    };
    const nextSpatial = getSpatialPresetSettings(mode, currentSpatial);
    const next = {
      ...currentSettings,
      spatialAudio: nextSpatial,
      updatedAt: Date.now(),
    };
    set({ settings: next });
    audioEngine.applySpatialAudioSettings(nextSpatial);
    await sonoraDb.settings.put(next);
  },

  saveCustomSpatialProfile: async (name, includeEq = true) => {
    const currentSettings = get().settings;
    const currentSpatial: SpatialAudioSettings = {
      ...DEFAULT_SPATIAL_AUDIO_SETTINGS,
      ...(currentSettings.spatialAudio || {}),
    };
    const profile = createCustomSpatialProfile({
      name,
      spatial: currentSpatial,
      equalizer: get().equalizer,
      includeEq,
    });
    const existing = currentSettings.customSpatialProfiles || [];
    const next = {
      ...currentSettings,
      customSpatialProfiles: [profile, ...existing],
      updatedAt: Date.now(),
    };
    set({ settings: next });
    await sonoraDb.settings.put(next);
    return profile;
  },

  applyCustomSpatialProfile: async (profileId) => {
    const currentSettings = get().settings;
    const target = (currentSettings.customSpatialProfiles || []).find((p) => p.id === profileId);
    if (!target) return;

    const nextSpatial = applyCustomSpatialProfileSettings(target);
    const nextSettings: AppSettingsRecord = {
      ...currentSettings,
      spatialAudio: nextSpatial,
      updatedAt: Date.now(),
    };
    set({ settings: nextSettings });
    audioEngine.applySpatialAudioSettings(nextSpatial);
    await sonoraDb.settings.put(nextSettings);

    if (target.eqSnapshot) {
      const nextEq: EqualizerSettingsRecord = {
        ...get().equalizer,
        enabled: target.eqSnapshot.enabled,
        preset: 'custom',
        bassGain: target.eqSnapshot.bassGain,
        trebleGain: target.eqSnapshot.trebleGain,
        bands: [...target.eqSnapshot.bands],
        updatedAt: Date.now(),
      };
      set({ equalizer: nextEq });
      audioEngine.applyEqualizerSettings(nextEq);
      await sonoraDb.equalizerSettings.put(nextEq);
    }
  },

  deleteCustomSpatialProfile: async (profileId) => {
    const currentSettings = get().settings;
    const next: AppSettingsRecord = {
      ...currentSettings,
      customSpatialProfiles: (currentSettings.customSpatialProfiles || []).filter(
        (p) => p.id !== profileId
      ),
      updatedAt: Date.now(),
    };
    set({ settings: next });
    await sonoraDb.settings.put(next);
  },

  saveCustomDjPreset: async (preset) => {
    const currentSettings = get().settings;
    const existing = currentSettings.customDjPresets || [];
    const filtered = existing.filter((p) => p.id !== preset.id);
    const next = {
      ...currentSettings,
      customDjPresets: [preset, ...filtered],
      updatedAt: Date.now(),
    };
    set({ settings: next });
    await sonoraDb.settings.put(next);
  },

  deleteCustomDjPreset: async (presetId) => {
    const currentSettings = get().settings;
    const next = {
      ...currentSettings,
      customDjPresets: (currentSettings.customDjPresets || []).filter((p) => p.id !== presetId),
      updatedAt: Date.now(),
    };
    set({ settings: next });
    await sonoraDb.settings.put(next);
  },

  updateAppSettings: async (patch) => {
    const currentSettings = get().settings;
    const resolved = resolveTransitionConfig({
      transitionMode:
        patch.transitionMode ??
        (typeof patch.crossfadeEnabled === 'boolean'
          ? patch.crossfadeEnabled
            ? 'crossfade'
            : 'gapless'
          : currentSettings.transitionMode),
      crossfadeEnabled:
        typeof patch.crossfadeEnabled === 'boolean'
          ? patch.crossfadeEnabled
          : typeof patch.transitionMode !== 'undefined'
            ? patch.transitionMode === 'crossfade'
            : currentSettings.crossfadeEnabled,
      crossfadeSeconds:
        typeof patch.crossfadeSeconds === 'number'
          ? patch.crossfadeSeconds
          : currentSettings.crossfadeSeconds,
      gaplessEnabled: patch.gaplessEnabled ?? currentSettings.gaplessEnabled,
    });

    const next: AppSettingsRecord = {
      ...currentSettings,
      ...patch,
      gaplessEnabled: resolved.gaplessEnabled,
      transitionMode: resolved.transitionMode,
      crossfadeEnabled: resolved.crossfadeEnabled,
      crossfadeSeconds: resolved.crossfadeSeconds,
      updatedAt: Date.now(),
    };
    set({ settings: next });

    if (
      typeof patch.gaplessEnabled !== 'undefined' ||
      typeof patch.transitionMode !== 'undefined' ||
      typeof patch.crossfadeEnabled !== 'undefined' ||
      typeof patch.crossfadeSeconds !== 'undefined'
    ) {
      audioEngine.configureTransitions(resolved);
    }
    if (typeof patch.audioOutputDeviceId === 'string') {
      void audioEngine.setAudioOutputDevice(patch.audioOutputDeviceId);
    }
    await sonoraDb.settings.put(next);
  },

  requestPersistStorage: async () => {
    const granted = await requestPersistentStorage();
    const next = { ...get().settings, persistStorageRequested: true, updatedAt: Date.now() };
    set({ settings: next });
    await sonoraDb.settings.put(next);
    await get().refreshStorage();
    return granted;
  },

  toggleFavorite: async (trackId) => {
    const current = new Set(get().favoriteIds);
    if (current.has(trackId)) {
      current.delete(trackId);
      set({ favoriteIds: current });
      await sonoraDb.favorites.delete(trackId);
    } else {
      current.add(trackId);
      set({ favoriteIds: current });
      await sonoraDb.favorites.put({ trackId, addedAt: Date.now() });
    }
  },

  removeTrack: async (trackId) => {
    await softDeleteTracks([trackId]);
    await get().refreshLibrary();
  },

  softRemoveTracks: async (trackIds) => {
    const count = await softDeleteTracks(trackIds);
    await get().refreshLibrary();
    return count;
  },

  restoreDeletedTracks: async (trackIds) => {
    const count = await restoreSoftDeletedTracks(trackIds);
    await get().refreshLibrary();
    return count;
  },

  permanentlyDeleteTracks: async (trackIds) => {
    const allTracks = [...get().tracks, ...get().deletedTracks];
    for (const trackId of trackIds) {
      const target = allTracks.find((t) => t.id === trackId);
      await removeTrackCompletely(trackId);
      if (target?.artworkId) {
        const stillUsed = allTracks.some(
          (t) => !trackIds.includes(t.id) && t.artworkId === target.artworkId
        );
        if (!stillUsed) {
          artworkCache.revoke(target.artworkId);
        }
      }
    }
    await get().refreshLibrary();
    await get().refreshStorage();
  },

  emptyTrash: async () => {
    const deletedIds = get().deletedTracks.map((t) => t.id);
    if (deletedIds.length === 0) return;
    await get().permanentlyDeleteTracks(deletedIds);
  },

  editTrackMetadata: async (trackId, updates) => {
    await updateTrackMetadata(trackId, updates);
    artworkCache.revoke(get().tracks.find((t) => t.id === trackId)?.artworkId || '');
    await get().refreshLibrary();
  },

  bulkEditTracksMetadata: async (trackIds, patch) => {
    const count = await bulkUpdateTracksMetadata(trackIds, patch);
    await get().refreshLibrary();
    return count;
  },

  undoTrackMetadata: async (trackId) => {
    const ok = await undoTrackMetadataUpdate(trackId);
    if (ok) {
      await get().refreshLibrary();
    }
    return ok;
  },

  updateTrackDuration: (trackId, duration) => {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, duration } : t)),
    }));
  },

  moveTracksStorage: async (trackIds, targetSection) => {
    const moved = await moveTracksToStorageSection(trackIds, targetSection);
    await get().refreshLibrary();
    await get().refreshStorage();
    return moved;
  },

  createSmartPlaylist: async (input) => {
    const now = Date.now();
    const record: SmartPlaylistRecord = {
      id: `smart_${crypto.randomUUID()}`,
      name: input.name.trim() || 'Smart Playlist',
      description: input.description.trim(),
      matchMode: input.matchMode,
      rules: input.rules,
      createdAt: now,
      updatedAt: now,
    };
    await sonoraDb.smartPlaylists.put(record);
    await get().refreshLibrary();
    return record;
  },

  updateSmartPlaylist: async (id, patch) => {
    await sonoraDb.smartPlaylists.update(id, { ...patch, updatedAt: Date.now() });
    await get().refreshLibrary();
  },

  deleteSmartPlaylist: async (id) => {
    await sonoraDb.smartPlaylists.delete(id);
    await get().refreshLibrary();
  },

  saveDjMix: async (mixInput) => {
    const record: DjMixRecord = {
      id: mixInput.id || `djmix_${crypto.randomUUID()}`,
      title: mixInput.title,
      createdAt: mixInput.createdAt || Date.now(),
      durationSec: mixInput.durationSec,
      mimeType: mixInput.mimeType,
      byteSize: mixInput.byteSize,
      blob: mixInput.blob,
    };
    await sonoraDb.djMixes.put(record);
    await get().refreshLibrary();
    return record;
  },

  deleteDjMix: async (id) => {
    await sonoraDb.djMixes.delete(id);
    await get().refreshLibrary();
  },

  saveLyrics: async (record) => {
    await sonoraDb.lyrics.put(record);
    await get().refreshLibrary();
  },

  deleteLyrics: async (trackId) => {
    await sonoraDb.lyrics.delete(trackId);
    await get().refreshLibrary();
  },

  saveProcessedStem: async (stem) => {
    await sonoraDb.processedStems.put(stem);
    await get().refreshLibrary();
  },

  deleteProcessedStem: async (id) => {
    await sonoraDb.processedStems.delete(id);
    await get().refreshLibrary();
  },

  setRecommendationFeedback: async (trackId, feedback) => {
    if (!feedback) {
      await sonoraDb.recommendationFeedback.delete(trackId);
    } else {
      await sonoraDb.recommendationFeedback.put({
        trackId,
        feedback,
        updatedAt: Date.now(),
      });
    }
    await get().refreshLibrary();
  },

  clearAnalyticsData: async () => {
    await sonoraDb.transaction(
      'rw',
      [sonoraDb.listeningEvents, sonoraDb.recentlyPlayed],
      async () => {
        await sonoraDb.listeningEvents.clear();
        await sonoraDb.recentlyPlayed.clear();
      }
    );
    await get().refreshLibrary();
  },

  setEqualizerEnabled: async (enabled) => {
    const next: EqualizerSettingsRecord = {
      ...get().equalizer,
      enabled,
      updatedAt: Date.now(),
    };
    set({ equalizer: next });
    audioEngine.applyEqualizerSettings(next);
    await sonoraDb.equalizerSettings.put(next);
  },

  selectEqualizerPreset: async (preset) => {
    if (preset === 'custom') {
      const next: EqualizerSettingsRecord = {
        ...get().equalizer,
        enabled: true,
        preset: 'custom',
        updatedAt: Date.now(),
      };
      set({ equalizer: next });
      audioEngine.applyEqualizerSettings(next);
      await sonoraDb.equalizerSettings.put(next);
      return;
    }

    const p = EQ_PRESETS[preset];
    const next: EqualizerSettingsRecord = {
      id: 'eq',
      enabled: preset !== 'flat' ? true : get().equalizer.enabled,
      preset,
      bassGain: p.bass,
      trebleGain: p.treble,
      bands: [...p.bands],
      updatedAt: Date.now(),
    };
    set({ equalizer: next });
    audioEngine.applyEqualizerSettings(next);
    await sonoraDb.equalizerSettings.put(next);
  },

  setEqualizerBand: async (index, gainDb) => {
    const clamped = Math.max(-12, Math.min(12, gainDb));
    const bands = [...get().equalizer.bands];
    bands[index] = clamped;
    const next: EqualizerSettingsRecord = {
      ...get().equalizer,
      enabled: true,
      preset: 'custom',
      bands,
      updatedAt: Date.now(),
    };
    set({ equalizer: next });
    audioEngine.applyEqualizerSettings(next);
    await sonoraDb.equalizerSettings.put(next);
  },

  setEqualizerBass: async (gainDb) => {
    const clamped = Math.max(-12, Math.min(12, gainDb));
    const next: EqualizerSettingsRecord = {
      ...get().equalizer,
      enabled: true,
      preset: 'custom',
      bassGain: clamped,
      updatedAt: Date.now(),
    };
    set({ equalizer: next });
    audioEngine.applyEqualizerSettings(next);
    await sonoraDb.equalizerSettings.put(next);
  },

  setEqualizerTreble: async (gainDb) => {
    const clamped = Math.max(-12, Math.min(12, gainDb));
    const next: EqualizerSettingsRecord = {
      ...get().equalizer,
      enabled: true,
      preset: 'custom',
      trebleGain: clamped,
      updatedAt: Date.now(),
    };
    set({ equalizer: next });
    audioEngine.applyEqualizerSettings(next);
    await sonoraDb.equalizerSettings.put(next);
  },

  resetEqualizer: async () => {
    const next: EqualizerSettingsRecord = {
      ...DEFAULT_EQUALIZER_SETTINGS,
      enabled: get().equalizer.enabled,
      updatedAt: Date.now(),
    };
    set({ equalizer: next });
    audioEngine.applyEqualizerSettings(next);
    await sonoraDb.equalizerSettings.put(next);
  },

  createPlaylist: async (name, description = '') => {
    const now = Date.now();
    const playlist: Playlist = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Untitled Playlist',
      description: description.trim(),
      createdAt: now,
      updatedAt: now,
    };
    await sonoraDb.playlists.put(playlist);
    await get().refreshLibrary();
    return playlist;
  },

  renamePlaylist: async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await sonoraDb.playlists.update(id, { name: trimmed, updatedAt: Date.now() });
    await get().refreshLibrary();
  },

  deletePlaylist: async (id) => {
    await sonoraDb.transaction('rw', [sonoraDb.playlists, sonoraDb.playlistTracks], async () => {
      await sonoraDb.playlists.delete(id);
      await sonoraDb.playlistTracks.where('playlistId').equals(id).delete();
    });
    if (get().selectedPlaylistId === id) {
      set({ selectedPlaylistId: null });
    }
    await get().refreshLibrary();
  },

  addTrackToPlaylist: async (playlistId, trackId) => {
    const existing = await sonoraDb.playlistTracks
      .where('playlistId')
      .equals(playlistId)
      .toArray();
    if (existing.some((pt) => pt.trackId === trackId)) {
      return false;
    }
    const maxPos = existing.reduce((max, pt) => Math.max(max, pt.position), -1);
    await sonoraDb.playlistTracks.add({
      playlistId,
      trackId,
      position: maxPos + 1,
      addedAt: Date.now(),
    });
    await sonoraDb.playlists.update(playlistId, { updatedAt: Date.now() });
    await get().refreshLibrary();
    return true;
  },

  removeTrackFromPlaylist: async (playlistId, trackId) => {
    await sonoraDb.playlistTracks
      .where('playlistId')
      .equals(playlistId)
      .and((pt) => pt.trackId === trackId)
      .delete();
    await sonoraDb.playlists.update(playlistId, { updatedAt: Date.now() });
    await get().refreshLibrary();
  },

  addRemoteStreamTrack: async ({ title, artist, album, genre, streamUrl }) => {
    const cleanUrl = streamUrl.trim();
    const fingerprint = `remote:${cleanUrl}`;
    const existing = await sonoraDb.tracks.where('fingerprint').equals(fingerprint).first();
    if (existing) return existing;

    const now = Date.now();
    const track: Track = {
      id: crypto.randomUUID(),
      fingerprint,
      sourceType: 'remote',
      storageSection: 'storage1',
      title: title.trim() || 'Online Stream',
      artist: artist.trim() || 'Online Source',
      album: album?.trim() || 'Online Streams',
      albumArtist: artist.trim() || 'Online Source',
      genre: genre?.trim() || 'Stream',
      year: null,
      trackNumber: null,
      discNumber: null,
      duration: 0,
      mimeType: 'audio/mpeg',
      format: 'STREAM',
      bitrate: null,
      sampleRate: null,
      fileSize: 0,
      fileName: cleanUrl,
      artworkId: null,
      streamUrl: cleanUrl,
      addedAt: now,
      playCount: 0,
      lastPlayedAt: null,
    };

    await sonoraDb.tracks.put(track);
    await get().refreshLibrary();
    return track;
  },

  importFiles: async (rawFiles) => {
    if (rawFiles.length === 0) return;
    if (get().importJob.status === 'scanning' || get().importJob.status === 'importing') {
      return;
    }

    activeImportCancelled = false;
    pausedRemainingFiles = [];
    let pausedByFullStorage = false;
    let quotaExceededHit = false;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // Request persistent browser storage before committing new audio blobs
    getStorageEstimate()
      .then(async (est) => {
        if (est.persisted === false || !get().settings.persistStorageRequested) {
          const granted = await requestPersistentStorage();
          const next = { ...get().settings, persistStorageRequested: true, updatedAt: Date.now() };
          set({ settings: next });
          await sonoraDb.settings.put(next).catch(() => {});
          if (granted) get().refreshStorage();
        }
      })
      .catch(() => {});

    set({
      importJob: {
        status: 'scanning',
        totalFiles: rawFiles.length,
        processedFiles: 0,
        importedCount: 0,
        duplicateCount: 0,
        unsupportedCount: 0,
        failedCount: 0,
        storage1ImportedCount: 0,
        storage2ImportedCount: 0,
        pausedRemainingCount: 0,
        currentFileName: '',
        errors: [],
        quotaExceeded: false,
        storageFull: false,
      },
    });

    const worker = new Worker(new URL('../workers/importWorker.ts', import.meta.url), {
      type: 'module',
    });

    const analyzeInWorker = (file: File, mimeType: string): Promise<WorkerAnalyzeResult> => {
      return new Promise((resolve) => {
        const id = crypto.randomUUID();
        const onMessage = (ev: MessageEvent<WorkerAnalyzeResult>) => {
          if (ev.data.id === id) {
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
            resolve(ev.data);
          }
        };
        const onError = (err: ErrorEvent) => {
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
          resolve({
            id,
            ok: false,
            error: err.message || 'Worker failed to parse file',
          });
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage({ id, file, mimeType });
      });
    };

    const BATCH_SIZE = 4;

    try {
      await openSonoraDatabase().catch(() => {});
      set((s) => ({ importJob: { ...s.importJob, status: 'importing' } }));

      for (let offset = 0; offset < rawFiles.length; offset += BATCH_SIZE) {
        if (activeImportCancelled || pausedByFullStorage || quotaExceededHit) break;

        // Pre-calculate available partition capacity and actual browser quota before processing batch
        const [allocations, sectionUsed, browserEst] = await Promise.all([
          ensureStorageAllocations(),
          getSectionUsedBytes(),
          getStorageEstimate(),
        ]);
        const s1Cap = allocations.find((a) => a.id === 'storage1')?.configuredCapacityBytes;
        const s2Cap = allocations.find((a) => a.id === 'storage2')?.configuredCapacityBytes;
        let runningBrowserUsage = browserEst.usageBytes;
        const browserQuota = browserEst.quotaBytes;

        const slice = rawFiles.slice(offset, offset + BATCH_SIZE);
        const stagedBatch: StagedTrackImport[] = [];
        const stagedSourceFiles: File[] = [];
        const stagedFingerprints = new Set<string>();

        for (let sliceIdx = 0; sliceIdx < slice.length; sliceIdx++) {
          const file = slice[sliceIdx];
          if (activeImportCancelled) break;

          set((s) => ({
            importJob: {
              ...s.importJob,
              currentFileName: file.name,
            },
          }));

          if (!isSupportedAudioFile(file)) {
            set((s) => ({
              importJob: {
                ...s.importJob,
                processedFiles: s.importJob.processedFiles + 1,
                unsupportedCount: s.importJob.unsupportedCount + 1,
              },
            }));
            continue;
          }

          if (file.size <= 0) {
            set((s) => ({
              importJob: {
                ...s.importJob,
                processedFiles: s.importJob.processedFiles + 1,
                failedCount: s.importJob.failedCount + 1,
                errors: [
                  ...s.importJob.errors.slice(-49),
                  {
                    fileName: file.name,
                    reason: 'Audio file is empty (0 bytes) and cannot be stored.',
                  },
                ],
              },
            }));
            continue;
          }

          const { supported, mimeType } = canBrowserPlayFile(file);
          if (!supported) {
            set((s) => ({
              importJob: {
                ...s.importJob,
                processedFiles: s.importJob.processedFiles + 1,
                unsupportedCount: s.importJob.unsupportedCount + 1,
                errors: [
                  ...s.importJob.errors.slice(-49),
                  {
                    fileName: file.name,
                    reason: `Browser does not support ${getFileExtension(file.name).toUpperCase() || file.type || 'this'} audio format.`,
                  },
                ],
              },
            }));
            continue;
          }

          // Check capacity ahead of expensive worker extraction when both partitions are already near/at 25 GB
          const preCheck = allocateSequentialStorageSection({
            fileBytes: file.size,
            s1UsedBytes: sectionUsed.storage1Bytes,
            s2UsedBytes: sectionUsed.storage2Bytes,
            s1CapacityBytes: s1Cap,
            s2CapacityBytes: s2Cap,
          });
          if (preCheck.storageFull && stagedBatch.length === 0) {
            const analysis = await analyzeInWorker(file, mimeType);
            if (!analysis.ok || !analysis.fingerprint) {
              set((s) => ({
                importJob: {
                  ...s.importJob,
                  processedFiles: s.importJob.processedFiles + 1,
                  failedCount: s.importJob.failedCount + 1,
                  errors: [
                    ...s.importJob.errors.slice(-49),
                    {
                      fileName: file.name,
                      reason: analysis.error || 'Could not extract metadata.',
                    },
                  ],
                },
              }));
              continue;
            }
            const existingDup = await sonoraDb.tracks
              .where('fingerprint')
              .equals(analysis.fingerprint)
              .first();
            if (existingDup) {
              set((s) => ({
                importJob: {
                  ...s.importJob,
                  processedFiles: s.importJob.processedFiles + 1,
                  duplicateCount: s.importJob.duplicateCount + 1,
                },
              }));
              continue;
            }

            pausedByFullStorage = true;
            const remaining = [file, ...slice.slice(sliceIdx + 1), ...rawFiles.slice(offset + BATCH_SIZE)];
            pausedRemainingFiles = remaining;
            set((s) => ({
              importJob: {
                ...s.importJob,
                status: 'paused_storage_full',
                storageFull: true,
                pausedRemainingCount: remaining.length,
                errors: [
                  ...s.importJob.errors.slice(-49),
                  {
                    fileName: file.name,
                    reason: `Storage 1 (25 GB) and Storage 2 (25 GB) are full for "${file.name}" (${formatBytes(file.size)}). Import paused without deleting existing tracks.`,
                  },
                ],
              },
            }));
            break;
          }

          const analysis = await analyzeInWorker(file, mimeType);
          if (!analysis.ok || !analysis.fingerprint) {
            set((s) => ({
              importJob: {
                ...s.importJob,
                processedFiles: s.importJob.processedFiles + 1,
                failedCount: s.importJob.failedCount + 1,
                errors: [
                  ...s.importJob.errors.slice(-49),
                  {
                    fileName: file.name,
                    reason: analysis.error || 'Could not extract metadata.',
                  },
                ],
              },
            }));
            continue;
          }

          // Deduplicate BEFORE reading full file bytes into memory
          const existingDup =
            stagedFingerprints.has(analysis.fingerprint) ||
            Boolean(await sonoraDb.tracks.where('fingerprint').equals(analysis.fingerprint).first());
          if (existingDup) {
            set((s) => ({
              importJob: {
                ...s.importJob,
                processedFiles: s.importJob.processedFiles + 1,
                duplicateCount: s.importJob.duplicateCount + 1,
              },
            }));
            continue;
          }

          // Enforce actual browser origin disk quota before buffering/committing new file
          if (
            browserQuota !== null &&
            runningBrowserUsage !== null &&
            runningBrowserUsage + file.size > browserQuota
          ) {
            quotaExceededHit = true;
            set((s) => ({
              importJob: {
                ...s.importJob,
                status: 'error',
                quotaExceeded: true,
                failedCount: s.importJob.failedCount + 1,
                errors: [
                  ...s.importJob.errors.slice(-49),
                  {
                    fileName: file.name,
                    reason: `Browser storage quota reached (${formatBytes(runningBrowserUsage)} / ${formatBytes(browserQuota)}). Previously saved tracks remain intact.`,
                  },
                ],
              },
            }));
            break;
          }

          let ownedAudioBlob: Blob;
          try {
            ownedAudioBlob = await materializeAudioBlob(file, mimeType || 'audio/mpeg');
          } catch (readErr) {
            set((s) => ({
              importJob: {
                ...s.importJob,
                processedFiles: s.importJob.processedFiles + 1,
                failedCount: s.importJob.failedCount + 1,
                errors: [
                  ...s.importJob.errors.slice(-49),
                  {
                    fileName: file.name,
                    reason:
                      readErr instanceof Error
                        ? readErr.message
                        : 'Could not read audio file into IndexedDB storage.',
                  },
                ],
              },
            }));
            continue;
          }

          stagedFingerprints.add(analysis.fingerprint);
          if (runningBrowserUsage !== null) {
            runningBrowserUsage += ownedAudioBlob.size;
          }

          const track: Track = {
            id: crypto.randomUUID(),
            fingerprint: analysis.fingerprint,
            sourceType: 'local',
            storageSection: 'storage1',
            title: analysis.title || file.name,
            artist: analysis.artist || 'Unknown Artist',
            album: analysis.album || 'Unknown Album',
            albumArtist: analysis.albumArtist || analysis.artist || 'Unknown Artist',
            genre: analysis.genre || '',
            composer: analysis.composer || '',
            folderPath: analysis.folderPath || '',
            year: analysis.year ?? null,
            trackNumber: analysis.trackNumber ?? null,
            discNumber: analysis.discNumber ?? null,
            duration: analysis.duration || 0,
            mimeType: mimeType || ownedAudioBlob.type || 'audio/mpeg',
            format: analysis.format || getFileExtension(file.name).toUpperCase() || 'AUDIO',
            bitrate: analysis.bitrate ?? null,
            sampleRate: analysis.sampleRate ?? null,
            bitDepth: analysis.bitDepth ?? null,
            channelCount: analysis.channelCount ?? null,
            fileSize: ownedAudioBlob.size,
            fileName: file.name,
            artworkId: analysis.artworkId ?? null,
            addedAt: Date.now(),
            playCount: 0,
            skipCount: 0,
            rating: null,
            deletedAt: null,
            lastPlayedAt: null,
          };

          stagedSourceFiles.push(file);
          stagedBatch.push({
            track,
            audioBlob: ownedAudioBlob,
            artwork:
              analysis.artworkId && analysis.artworkBlob
                ? {
                    id: analysis.artworkId,
                    blob: analysis.artworkBlob,
                    mimeType: analysis.artworkMimeType || 'image/jpeg',
                  }
                : null,
          });
        }

        if (stagedBatch.length > 0) {
          try {
            const res = await saveTrackBatch(stagedBatch);
            const processedInBatch = res.storageFull
              ? res.savedIds.length + res.duplicateFingerprints.length
              : stagedBatch.length;

            if (res.storageFull) {
              pausedByFullStorage = true;
              const remaining = [
                ...stagedSourceFiles.slice(res.rejectedStartIndex),
                ...rawFiles.slice(offset + BATCH_SIZE),
              ];
              pausedRemainingFiles = remaining;
              const blockedItem = stagedBatch[res.rejectedStartIndex];
              set((s) => ({
                importJob: {
                  ...s.importJob,
                  status: 'paused_storage_full',
                  storageFull: true,
                  pausedRemainingCount: remaining.length,
                  processedFiles: s.importJob.processedFiles + processedInBatch,
                  importedCount: s.importJob.importedCount + res.savedIds.length,
                  duplicateCount: s.importJob.duplicateCount + res.duplicateFingerprints.length,
                  storage1ImportedCount: s.importJob.storage1ImportedCount + res.storage1SavedCount,
                  storage2ImportedCount: s.importJob.storage2ImportedCount + res.storage2SavedCount,
                  errors: [
                    ...s.importJob.errors.slice(-49),
                    {
                      fileName: blockedItem?.track.fileName || 'Storage Full',
                      reason: `Both Storage 1 (25 GB) and Storage 2 (25 GB) are full. Paused before "${blockedItem?.track.fileName || 'next track'}" (${formatBytes(blockedItem?.audioBlob.size || 0)}).`,
                    },
                  ],
                },
              }));
            } else {
              set((s) => ({
                importJob: {
                  ...s.importJob,
                  processedFiles: s.importJob.processedFiles + processedInBatch,
                  importedCount: s.importJob.importedCount + res.savedIds.length,
                  duplicateCount: s.importJob.duplicateCount + res.duplicateFingerprints.length,
                  storage1ImportedCount: s.importJob.storage1ImportedCount + res.storage1SavedCount,
                  storage2ImportedCount: s.importJob.storage2ImportedCount + res.storage2SavedCount,
                },
              }));
            }

            if (res.savedIds.length > 0) {
              await get().refreshLibrary();
              await get().refreshStorage();
            }
          } catch (err) {
            const quotaErr = isQuotaExceededError(err);
            if (quotaErr) {
              quotaExceededHit = true;
              set((s) => ({
                importJob: {
                  ...s.importJob,
                  status: 'error',
                  processedFiles: s.importJob.processedFiles + stagedBatch.length,
                  failedCount: s.importJob.failedCount + stagedBatch.length,
                  quotaExceeded: true,
                  errors: [
                    ...s.importJob.errors.slice(-49),
                    {
                      fileName: 'Browser Quota',
                      reason:
                        'Browser storage quota exceeded. Free space or remove unused tracks to continue. Previously saved tracks remain intact.',
                    },
                  ],
                },
              }));
              break;
            }

            // Isolate single-file write failures without losing healthy items in the batch
            for (const singleItem of stagedBatch) {
              try {
                const singleRes = await saveTrackBatch([singleItem]);
                set((s) => ({
                  importJob: {
                    ...s.importJob,
                    processedFiles: s.importJob.processedFiles + 1,
                    importedCount: s.importJob.importedCount + singleRes.savedIds.length,
                    duplicateCount:
                      s.importJob.duplicateCount + singleRes.duplicateFingerprints.length,
                    storage1ImportedCount:
                      s.importJob.storage1ImportedCount + singleRes.storage1SavedCount,
                    storage2ImportedCount:
                      s.importJob.storage2ImportedCount + singleRes.storage2SavedCount,
                  },
                }));
              } catch (singleErr) {
                const singleQuota = isQuotaExceededError(singleErr);
                if (singleQuota) quotaExceededHit = true;
                set((s) => ({
                  importJob: {
                    ...s.importJob,
                    status: singleQuota ? 'error' : s.importJob.status,
                    processedFiles: s.importJob.processedFiles + 1,
                    failedCount: s.importJob.failedCount + 1,
                    quotaExceeded: s.importJob.quotaExceeded || singleQuota,
                    errors: [
                      ...s.importJob.errors.slice(-49),
                      {
                        fileName: singleItem.track.fileName,
                        reason: singleQuota
                          ? 'Browser storage quota exceeded. Previously saved tracks remain intact.'
                          : singleErr instanceof Error
                            ? singleErr.message
                            : 'Failed to store track in IndexedDB.',
                      },
                    ],
                  },
                }));
                if (singleQuota) break;
              }
            }
            await get().refreshLibrary();
            await get().refreshStorage();
          }
        }
      }

      set((s) => ({
        importJob: {
          ...s.importJob,
          status: activeImportCancelled
            ? 'cancelled'
            : pausedByFullStorage
              ? 'paused_storage_full'
              : quotaExceededHit || s.importJob.status === 'error'
                ? 'error'
                : 'completed',
          currentFileName: '',
        },
      }));
    } finally {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      worker.terminate();
      await get().refreshLibrary();
      await get().refreshStorage();
    }
  },

  resumePausedImport: async () => {
    const queue = [...pausedRemainingFiles];
    if (queue.length === 0) return;
    await get().importFiles(queue);
  },

  cancelImport: () => {
    activeImportCancelled = true;
    pausedRemainingFiles = [];
  },

  resetImportJob: () => {
    pausedRemainingFiles = [];
    set({ importJob: INITIAL_IMPORT_JOB });
  },
}));
