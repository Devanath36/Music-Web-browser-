import { create } from 'zustand';
import { audioEngine, EQ_PRESETS } from '../audio/audioEngine';
import {
  DEFAULT_EQUALIZER_SETTINGS,
  ensureStorageAllocations,
  getOrInitEqualizerSettings,
  getOrInitSettings,
  getSectionUsedBytes,
  getStorageBreakdown,
  isQuotaExceededError,
  moveTracksToStorageSection,
  removeTrackCompletely,
  saveTrackBatch,
  sonoraDb,
  updateTrackMetadata,
  type StagedTrackImport,
} from '../db/sonoraDb';
import { formatBytes } from '../utils/formatters';
import { allocateSequentialStorageSection } from '../utils/storageMetrics';
import type {
  AppSettingsRecord,
  AppView,
  EqualizerPresetId,
  EqualizerSettingsRecord,
  ImportJobState,
  NetworkMode,
  PlaybackRestorePolicy,
  Playlist,
  PlaylistTrack,
  RecentlyPlayedEntry,
  SortDirection,
  SortField,
  StorageBreakdown,
  StorageSectionId,
  Track,
  TransferHistoryRecord,
} from '../types/music';
import { artworkCache } from '../utils/artworkCache';
import { canBrowserPlayFile, getFileExtension, isSupportedAudioFile } from '../utils/formatters';
import { requestPersistentStorage } from '../utils/storage';
import type { WorkerAnalyzeResult } from '../workers/importWorker';

interface LibraryState {
  isLoaded: boolean;
  tracks: Track[];
  playlists: Playlist[];
  playlistTracks: PlaylistTrack[];
  favoriteIds: Set<string>;
  recentlyPlayed: RecentlyPlayedEntry[];
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
  requestPersistStorage: () => Promise<boolean>;

  toggleFavorite: (trackId: string) => Promise<void>;
  removeTrack: (trackId: string) => Promise<void>;
  editTrackMetadata: (
    trackId: string,
    updates: {
      title: string;
      artist: string;
      album: string;
      albumArtist: string;
      genre: string;
      year: number | null;
      trackNumber: number | null;
    }
  ) => Promise<void>;
  updateTrackDuration: (trackId: string, duration: number) => void;
  moveTracksStorage: (trackIds: string[], targetSection: StorageSectionId) => Promise<number>;

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
  playlists: [],
  playlistTracks: [],
  favoriteIds: new Set<string>(),
  recentlyPlayed: [],
  transferHistory: [],
  equalizer: DEFAULT_EQUALIZER_SETTINGS,
  settings: {
    id: 'app',
    networkMode: typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline',
    playbackRestorePolicy: 'ask_user',
    persistStorageRequested: false,
    sortBy: 'addedAt',
    sortDir: 'desc',
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
    const [
      settings,
      equalizer,
      tracks,
      playlists,
      playlistTracks,
      favorites,
      recentlyPlayed,
      transferHistory,
    ] = await Promise.all([
      getOrInitSettings(),
      getOrInitEqualizerSettings(),
      sonoraDb.tracks.toArray(),
      sonoraDb.playlists.orderBy('createdAt').reverse().toArray(),
      sonoraDb.playlistTracks.toArray(),
      sonoraDb.favorites.toArray(),
      sonoraDb.recentlyPlayed.orderBy('playedAt').reverse().limit(200).toArray(),
      sonoraDb.transferHistory.orderBy('timestamp').reverse().limit(100).toArray(),
    ]);

    audioEngine.setNetworkMode(settings.networkMode);
    audioEngine.applyEqualizerSettings(equalizer);

    set({
      isLoaded: true,
      settings,
      equalizer,
      tracks,
      playlists,
      playlistTracks,
      favoriteIds: new Set(favorites.map((f) => f.trackId)),
      recentlyPlayed,
      transferHistory,
    });

    getStorageBreakdown()
      .then((storageBreakdown) => set({ storageBreakdown }))
      .catch(() => {});
  },

  refreshLibrary: async () => {
    const [tracks, playlists, playlistTracks, favorites, recentlyPlayed, transferHistory] =
      await Promise.all([
        sonoraDb.tracks.toArray(),
        sonoraDb.playlists.orderBy('createdAt').reverse().toArray(),
        sonoraDb.playlistTracks.toArray(),
        sonoraDb.favorites.toArray(),
        sonoraDb.recentlyPlayed.orderBy('playedAt').reverse().limit(200).toArray(),
        sonoraDb.transferHistory.orderBy('timestamp').reverse().limit(100).toArray(),
      ]);

    set({
      tracks,
      playlists,
      playlistTracks,
      favoriteIds: new Set(favorites.map((f) => f.trackId)),
      recentlyPlayed,
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
    const target = get().tracks.find((t) => t.id === trackId);
    await removeTrackCompletely(trackId);
    if (target?.artworkId) {
      const stillUsed = get().tracks.some(
        (t) => t.id !== trackId && t.artworkId === target.artworkId
      );
      if (!stillUsed) {
        artworkCache.revoke(target.artworkId);
      }
    }
    await get().refreshLibrary();
    await get().refreshStorage();
  },

  editTrackMetadata: async (trackId, updates) => {
    await updateTrackMetadata(trackId, updates);
    await get().refreshLibrary();
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

    if (!get().settings.persistStorageRequested) {
      requestPersistentStorage()
        .then(async (granted) => {
          const next = { ...get().settings, persistStorageRequested: true, updatedAt: Date.now() };
          set({ settings: next });
          await sonoraDb.settings.put(next);
          if (granted) get().refreshStorage();
        })
        .catch(() => {});
    }

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

    const BATCH_SIZE = 8;

    try {
      set((s) => ({ importJob: { ...s.importJob, status: 'importing' } }));

      for (let offset = 0; offset < rawFiles.length; offset += BATCH_SIZE) {
        if (activeImportCancelled || pausedByFullStorage) break;

        // Pre-calculate available capacity using actual partition usage before processing the batch
        const [allocations, sectionUsed] = await Promise.all([
          ensureStorageAllocations(),
          getSectionUsedBytes(),
        ]);
        const s1Cap = allocations.find((a) => a.id === 'storage1')?.configuredCapacityBytes;
        const s2Cap = allocations.find((a) => a.id === 'storage2')?.configuredCapacityBytes;

        const slice = rawFiles.slice(offset, offset + BATCH_SIZE);
        const stagedBatch: StagedTrackImport[] = [];
        const stagedSourceFiles: File[] = [];

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
            // Confirm it's not an already-imported duplicate before pausing
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

            // Confirmed new file and both Storage 1 (25 GB) and Storage 2 (25 GB) lack room: pause import cleanly
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
            year: analysis.year ?? null,
            trackNumber: analysis.trackNumber ?? null,
            discNumber: analysis.discNumber ?? null,
            duration: analysis.duration || 0,
            mimeType: mimeType || file.type || 'audio/mpeg',
            format: analysis.format || getFileExtension(file.name).toUpperCase() || 'AUDIO',
            bitrate: analysis.bitrate ?? null,
            sampleRate: analysis.sampleRate ?? null,
            fileSize: file.size,
            fileName: file.name,
            artworkId: analysis.artworkId ?? null,
            addedAt: Date.now(),
            playCount: 0,
            lastPlayedAt: null,
          };

          stagedSourceFiles.push(file);
          stagedBatch.push({
            track,
            audioBlob: file,
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
            set((s) => ({
              importJob: {
                ...s.importJob,
                status: 'error',
                processedFiles: s.importJob.processedFiles + stagedBatch.length,
                failedCount: s.importJob.failedCount + stagedBatch.length,
                quotaExceeded: quotaErr,
                errors: [
                  ...s.importJob.errors.slice(-49),
                  {
                    fileName: 'Batch write',
                    reason: quotaErr
                      ? 'Browser storage quota exceeded. Free space or remove unused tracks to continue.'
                      : err instanceof Error
                        ? err.message
                        : 'Failed to store batch in IndexedDB.',
                  },
                ],
              },
            }));
            if (quotaErr) break;
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
              : s.importJob.status === 'error'
                ? 'error'
                : 'completed',
          currentFileName: '',
        },
      }));
    } finally {
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
