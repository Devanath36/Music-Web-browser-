import Dexie, { type Table } from 'dexie';
import type {
  AppSettingsRecord,
  ArtworkRecord,
  AudioBlobRecord,
  EqualizerSettingsRecord,
  FavoriteEntry,
  PlaybackStateRecord,
  Playlist,
  PlaylistTrack,
  RecentlyPlayedEntry,
  StorageAllocationRecord,
  StorageBreakdown,
  StorageSectionId,
  Track,
  TransferHistoryRecord,
} from '../types/music';
import { getStorageEstimate } from '../utils/storage';
import {
  SECTION_CAPACITY_BYTES,
  TOTAL_CONFIGURED_CAPACITY_BYTES,
  allocateSequentialStorageSection,
} from '../utils/storageMetrics';

export { SECTION_CAPACITY_BYTES, TOTAL_CONFIGURED_CAPACITY_BYTES };

export class SonoraDatabase extends Dexie {
  tracks!: Table<Track, string>;
  audioBlobs!: Table<AudioBlobRecord, string>;
  artworks!: Table<ArtworkRecord, string>;
  playlists!: Table<Playlist, string>;
  playlistTracks!: Table<PlaylistTrack, number>;
  favorites!: Table<FavoriteEntry, string>;
  recentlyPlayed!: Table<RecentlyPlayedEntry, number>;
  playbackState!: Table<PlaybackStateRecord, string>;
  storageAllocation!: Table<StorageAllocationRecord, StorageSectionId>;
  transferHistory!: Table<TransferHistoryRecord, number>;
  equalizerSettings!: Table<EqualizerSettingsRecord, string>;
  settings!: Table<AppSettingsRecord, string>;

  constructor() {
    super('SonoraMusicDB');

    // Version 1: Initial schema
    this.version(1).stores({
      tracks:
        'id, &fingerprint, title, artist, album, albumArtist, addedAt, lastPlayedAt, sourceType, artworkId',
      audioBlobs: 'trackId',
      artworks: 'id',
      playlists: 'id, name, createdAt, updatedAt',
      playlistTracks: '++id, playlistId, trackId, [playlistId+position]',
      favorites: 'trackId, addedAt',
      recentlyPlayed: '++id, trackId, playedAt',
      playbackState: 'id',
      settings: 'id',
    });

    // Version 2: Dual 25GB logical storage partitions, Equalizer, Wi-Fi Transfer History, and configurable playback restoration.
    // Non-destructive upgrade: preserves every existing track, blob, artwork, playlist, and favorite.
    this.version(2)
      .stores({
        tracks:
          'id, &fingerprint, storageSection, title, artist, album, albumArtist, addedAt, lastPlayedAt, sourceType, artworkId',
        audioBlobs: 'trackId, storageSection',
        artworks: 'id',
        playlists: 'id, name, createdAt, updatedAt',
        playlistTracks: '++id, playlistId, trackId, [playlistId+position]',
        favorites: 'trackId, addedAt',
        recentlyPlayed: '++id, trackId, playedAt',
        playbackState: 'id',
        storageAllocation: 'id, priority',
        transferHistory: '++id, sessionId, direction, status, timestamp',
        equalizerSettings: 'id',
        settings: 'id',
      })
      .upgrade(async (tx) => {
        await tx
          .table('tracks')
          .toCollection()
          .modify((track: Partial<Track>) => {
            if (!track.storageSection) {
              track.storageSection = 'storage1';
            }
          });

        await tx
          .table('audioBlobs')
          .toCollection()
          .modify((blobRec: Partial<AudioBlobRecord>) => {
            if (!blobRec.storageSection) {
              blobRec.storageSection = 'storage1';
            }
          });

        const settingsTable = tx.table('settings');
        const oldSettings = await settingsTable.get('app');
        if (oldSettings && !oldSettings.playbackRestorePolicy) {
          const legacyResume = (oldSettings as { resumePlaybackOnLoad?: boolean })
            .resumePlaybackOnLoad;
          await settingsTable.put({
            ...oldSettings,
            playbackRestorePolicy: legacyResume === false ? 'library_only' : 'ask_user',
            updatedAt: Date.now(),
          });
        }
      });
  }
}

export const sonoraDb = new SonoraDatabase();

export const DEFAULT_PLAYBACK_STATE: PlaybackStateRecord = {
  id: 'current',
  currentTrackId: null,
  positionSeconds: 0,
  queueTrackIds: [],
  queueIndex: -1,
  shuffle: false,
  repeat: 'off',
  volume: 0.9,
  muted: false,
  updatedAt: Date.now(),
};

export const DEFAULT_APP_SETTINGS: AppSettingsRecord = {
  id: 'app',
  networkMode: typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline',
  playbackRestorePolicy: 'ask_user',
  persistStorageRequested: false,
  sortBy: 'addedAt',
  sortDir: 'desc',
  updatedAt: Date.now(),
};

export const DEFAULT_EQUALIZER_SETTINGS: EqualizerSettingsRecord = {
  id: 'eq',
  enabled: false,
  preset: 'flat',
  bassGain: 0,
  trebleGain: 0,
  bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  updatedAt: Date.now(),
};

export async function ensureStorageAllocations(): Promise<StorageAllocationRecord[]> {
  const existing = await sonoraDb.storageAllocation.toArray();
  if (existing.length === 2) return existing.sort((a, b) => a.priority - b.priority);

  const now = Date.now();
  const defaults: StorageAllocationRecord[] = [
    {
      id: 'storage1',
      label: 'Storage 1 (Primary)',
      configuredCapacityBytes: SECTION_CAPACITY_BYTES,
      priority: 1,
      updatedAt: now,
    },
    {
      id: 'storage2',
      label: 'Storage 2 (Expansion)',
      configuredCapacityBytes: SECTION_CAPACITY_BYTES,
      priority: 2,
      updatedAt: now,
    },
  ];
  await sonoraDb.storageAllocation.bulkPut(defaults);
  return defaults;
}

export async function getOrInitSettings(): Promise<AppSettingsRecord> {
  const existing = await sonoraDb.settings.get('app');
  if (existing) {
    if (!existing.playbackRestorePolicy) {
      const migrated: AppSettingsRecord = {
        ...DEFAULT_APP_SETTINGS,
        ...existing,
        playbackRestorePolicy: 'ask_user',
      };
      await sonoraDb.settings.put(migrated);
      return migrated;
    }
    return existing;
  }
  const fresh = { ...DEFAULT_APP_SETTINGS, updatedAt: Date.now() };
  await sonoraDb.settings.put(fresh);
  return fresh;
}

export async function getOrInitPlaybackState(): Promise<PlaybackStateRecord> {
  const existing = await sonoraDb.playbackState.get('current');
  if (existing) return existing;
  const fresh = { ...DEFAULT_PLAYBACK_STATE, updatedAt: Date.now() };
  await sonoraDb.playbackState.put(fresh);
  return fresh;
}

export async function getOrInitEqualizerSettings(): Promise<EqualizerSettingsRecord> {
  const existing = await sonoraDb.equalizerSettings.get('eq');
  if (existing) return existing;
  const fresh = { ...DEFAULT_EQUALIZER_SETTINGS, updatedAt: Date.now() };
  await sonoraDb.equalizerSettings.put(fresh);
  return fresh;
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException) {
    return (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /quota|storage.*full|disk.*full/i.test(msg);
}

export async function getSectionUsedBytes(): Promise<{
  storage1Bytes: number;
  storage2Bytes: number;
  storage1Count: number;
  storage2Count: number;
}> {
  let storage1Bytes = 0;
  let storage2Bytes = 0;
  let storage1Count = 0;
  let storage2Count = 0;

  await sonoraDb.audioBlobs.each((rec) => {
    const size = rec.byteSize || rec.blob?.size || 0;
    if (rec.storageSection === 'storage2') {
      storage2Bytes += size;
      storage2Count++;
    } else {
      storage1Bytes += size;
      storage1Count++;
    }
  });

  return { storage1Bytes, storage2Bytes, storage1Count, storage2Count };
}

export async function chooseStorageSectionForSize(
  incomingBytes: number,
  currentUsed?: { storage1Bytes: number; storage2Bytes: number }
): Promise<StorageSectionId | null> {
  const allocations = await ensureStorageAllocations();
  const s1Cap =
    allocations.find((a) => a.id === 'storage1')?.configuredCapacityBytes ??
    SECTION_CAPACITY_BYTES;
  const s2Cap =
    allocations.find((a) => a.id === 'storage2')?.configuredCapacityBytes ??
    SECTION_CAPACITY_BYTES;
  const used = currentUsed ?? (await getSectionUsedBytes());

  const result = allocateSequentialStorageSection({
    fileBytes: incomingBytes,
    s1UsedBytes: used.storage1Bytes,
    s2UsedBytes: used.storage2Bytes,
    s1CapacityBytes: s1Cap,
    s2CapacityBytes: s2Cap,
  });

  return result.section;
}

export interface StagedTrackImport {
  track: Track;
  audioBlob: Blob;
  artwork?: {
    id: string;
    blob: Blob;
    mimeType: string;
  } | null;
}

export interface SaveTrackBatchResult {
  savedIds: string[];
  savedSections: Record<string, StorageSectionId>;
  storage1SavedCount: number;
  storage2SavedCount: number;
  duplicateFingerprints: string[];
  storageFull: boolean;
  rejectedStartIndex: number;
}

export async function saveTrackBatch(items: StagedTrackImport[]): Promise<SaveTrackBatchResult> {
  if (items.length === 0) {
    return {
      savedIds: [],
      savedSections: {},
      storage1SavedCount: 0,
      storage2SavedCount: 0,
      duplicateFingerprints: [],
      storageFull: false,
      rejectedStartIndex: 0,
    };
  }

  const savedIds: string[] = [];
  const savedSections: Record<string, StorageSectionId> = {};
  let storage1SavedCount = 0;
  let storage2SavedCount = 0;
  const duplicateFingerprints: string[] = [];
  let storageFull = false;
  let rejectedStartIndex = items.length;

  const allocations = await ensureStorageAllocations();
  const s1Cap =
    allocations.find((a) => a.id === 'storage1')?.configuredCapacityBytes ??
    SECTION_CAPACITY_BYTES;
  const s2Cap =
    allocations.find((a) => a.id === 'storage2')?.configuredCapacityBytes ??
    SECTION_CAPACITY_BYTES;

  await sonoraDb.transaction(
    'rw',
    [sonoraDb.tracks, sonoraDb.audioBlobs, sonoraDb.artworks],
    async () => {
      const fingerprints = items.map((i) => i.track.fingerprint);
      const existingTracks = await sonoraDb.tracks
        .where('fingerprint')
        .anyOf(fingerprints)
        .toArray();
      const existingFpSet = new Set(existingTracks.map((t) => t.fingerprint));

      // Compute running Storage 1 / Storage 2 bytes inside the transaction
      let s1Used = 0;
      let s2Used = 0;
      await sonoraDb.audioBlobs.each((b) => {
        const sz = b.byteSize || b.blob?.size || 0;
        if (b.storageSection === 'storage2') s2Used += sz;
        else s1Used += sz;
      });

      const artworksToPut: ArtworkRecord[] = [];
      const seenArtworkIds = new Set<string>();
      const tracksToPut: Track[] = [];
      const blobsToPut: AudioBlobRecord[] = [];

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        if (existingFpSet.has(item.track.fingerprint)) {
          duplicateFingerprints.push(item.track.fingerprint);
          continue;
        }

        const fileBytes = item.audioBlob.size;
        const alloc = allocateSequentialStorageSection({
          fileBytes,
          s1UsedBytes: s1Used,
          s2UsedBytes: s2Used,
          s1CapacityBytes: s1Cap,
          s2CapacityBytes: s2Cap,
        });

        if (alloc.storageFull || !alloc.section) {
          storageFull = true;
          rejectedStartIndex = idx;
          break;
        }

        existingFpSet.add(item.track.fingerprint);
        s1Used = alloc.nextS1UsedBytes;
        s2Used = alloc.nextS2UsedBytes;
        const assignedSection = alloc.section;

        if (item.artwork && !seenArtworkIds.has(item.artwork.id)) {
          seenArtworkIds.add(item.artwork.id);
          const alreadyExists = await sonoraDb.artworks.get(item.artwork.id);
          if (!alreadyExists) {
            artworksToPut.push({
              id: item.artwork.id,
              blob: item.artwork.blob,
              mimeType: item.artwork.mimeType,
              byteSize: item.artwork.blob.size,
            });
          }
        }

        tracksToPut.push({
          ...item.track,
          storageSection: assignedSection,
        });
        blobsToPut.push({
          trackId: item.track.id,
          storageSection: assignedSection,
          blob: item.audioBlob,
          byteSize: fileBytes,
        });
        savedIds.push(item.track.id);
        savedSections[item.track.id] = assignedSection;
        if (assignedSection === 'storage1') storage1SavedCount += 1;
        else storage2SavedCount += 1;
      }

      if (artworksToPut.length > 0) {
        await sonoraDb.artworks.bulkPut(artworksToPut);
      }
      if (tracksToPut.length > 0) {
        await sonoraDb.tracks.bulkPut(tracksToPut);
        await sonoraDb.audioBlobs.bulkPut(blobsToPut);
      }
    }
  );

  return {
    savedIds,
    savedSections,
    storage1SavedCount,
    storage2SavedCount,
    duplicateFingerprints,
    storageFull,
    rejectedStartIndex,
  };
}

export async function moveTracksToStorageSection(
  trackIds: string[],
  targetSection: StorageSectionId
): Promise<number> {
  if (trackIds.length === 0) return 0;
  let moved = 0;

  await sonoraDb.transaction('rw', [sonoraDb.tracks, sonoraDb.audioBlobs], async () => {
    for (const id of trackIds) {
      const track = await sonoraDb.tracks.get(id);
      if (!track || track.sourceType !== 'local' || track.storageSection === targetSection) {
        continue;
      }
      // Atomic update preserving track ID, playlists, favorites, history, and playback queue references
      await sonoraDb.tracks.update(id, { storageSection: targetSection });
      await sonoraDb.audioBlobs.update(id, { storageSection: targetSection });
      moved++;
    }
  });

  return moved;
}

export async function updateTrackMetadata(
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
): Promise<void> {
  await sonoraDb.tracks.update(trackId, {
    title: updates.title.trim() || 'Unknown Title',
    artist: updates.artist.trim() || 'Unknown Artist',
    album: updates.album.trim() || 'Unknown Album',
    albumArtist: updates.albumArtist.trim() || updates.artist.trim() || 'Unknown Artist',
    genre: updates.genre.trim(),
    year: updates.year,
    trackNumber: updates.trackNumber,
  });
}

export async function removeTrackCompletely(trackId: string): Promise<void> {
  await sonoraDb.transaction(
    'rw',
    [
      sonoraDb.tracks,
      sonoraDb.audioBlobs,
      sonoraDb.artworks,
      sonoraDb.playlistTracks,
      sonoraDb.favorites,
      sonoraDb.recentlyPlayed,
    ],
    async () => {
      const track = await sonoraDb.tracks.get(trackId);
      await sonoraDb.tracks.delete(trackId);
      await sonoraDb.audioBlobs.delete(trackId);
      await sonoraDb.playlistTracks.where('trackId').equals(trackId).delete();
      await sonoraDb.favorites.delete(trackId);
      await sonoraDb.recentlyPlayed.where('trackId').equals(trackId).delete();

      if (track?.artworkId) {
        const remainingRefs = await sonoraDb.tracks
          .where('artworkId')
          .equals(track.artworkId)
          .count();
        if (remainingRefs === 0) {
          await sonoraDb.artworks.delete(track.artworkId);
        }
      }
    }
  );
}

export async function recordTrackPlay(trackId: string): Promise<void> {
  const now = Date.now();
  await sonoraDb.transaction('rw', [sonoraDb.tracks, sonoraDb.recentlyPlayed], async () => {
    const track = await sonoraDb.tracks.get(trackId);
    if (track) {
      await sonoraDb.tracks.update(trackId, {
        playCount: (track.playCount || 0) + 1,
        lastPlayedAt: now,
      });
    }
    await sonoraDb.recentlyPlayed.add({ trackId, playedAt: now });

    const count = await sonoraDb.recentlyPlayed.count();
    if (count > 500) {
      const oldest = await sonoraDb.recentlyPlayed
        .orderBy('playedAt')
        .limit(count - 500)
        .primaryKeys();
      if (oldest.length > 0) {
        await sonoraDb.recentlyPlayed.bulkDelete(oldest);
      }
    }
  });
}

export async function logTransferHistory(
  entry: Omit<TransferHistoryRecord, 'id'>
): Promise<void> {
  await sonoraDb.transferHistory.add(entry);
}

export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  const [estimate, trackCount, artworkCount, allocations, sectionStats] = await Promise.all([
    getStorageEstimate(),
    sonoraDb.tracks.count(),
    sonoraDb.artworks.count(),
    ensureStorageAllocations(),
    getSectionUsedBytes(),
  ]);

  let artworkBytes = 0;
  await sonoraDb.artworks.each((a) => {
    artworkBytes += a.byteSize || a.blob?.size || 0;
  });

  const s1Alloc = allocations.find((a) => a.id === 'storage1')!;
  const s2Alloc = allocations.find((a) => a.id === 'storage2')!;

  const s1Used = sectionStats.storage1Bytes;
  const s2Used = sectionStats.storage2Bytes;

  return {
    usageBytes: estimate.usageBytes,
    quotaBytes: estimate.quotaBytes,
    audioBytes: s1Used + s2Used,
    artworkBytes,
    trackCount,
    artworkCount,
    persisted: estimate.persisted,
    totalConfiguredBytes:
      s1Alloc.configuredCapacityBytes + s2Alloc.configuredCapacityBytes,
    storage1: {
      id: 'storage1',
      label: s1Alloc.label,
      configuredCapacityBytes: s1Alloc.configuredCapacityBytes,
      usedBytes: s1Used,
      availableBytes: Math.max(0, s1Alloc.configuredCapacityBytes - s1Used),
      utilizationPct: Math.min(
        100,
        (s1Used / s1Alloc.configuredCapacityBytes) * 100
      ),
      trackCount: sectionStats.storage1Count,
    },
    storage2: {
      id: 'storage2',
      label: s2Alloc.label,
      configuredCapacityBytes: s2Alloc.configuredCapacityBytes,
      usedBytes: s2Used,
      availableBytes: Math.max(0, s2Alloc.configuredCapacityBytes - s2Used),
      utilizationPct: Math.min(
        100,
        (s2Used / s2Alloc.configuredCapacityBytes) * 100
      ),
      trackCount: sectionStats.storage2Count,
    },
  };
}
