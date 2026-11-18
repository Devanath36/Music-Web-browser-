export type AppView =
  | 'songs'
  | 'playlists'
  | 'favorites'
  | 'albums'
  | 'artists'
  | 'recent'
  | 'import'
  | 'transfer'
  | 'equalizer'
  | 'storage'
  | 'settings';

export type RepeatMode = 'off' | 'all' | 'one';
export type NetworkMode = 'offline' | 'online';
export type TrackSourceType = 'local' | 'remote';
export type SortField =
  | 'addedAt'
  | 'title'
  | 'artist'
  | 'album'
  | 'lastPlayedAt'
  | 'duration';
export type SortDirection = 'asc' | 'desc';

export type StorageSectionId = 'storage1' | 'storage2';

export type PlaybackRestorePolicy =
  | 'resume_position'
  | 'restore_queue'
  | 'library_only'
  | 'ask_user';

export type EqualizerPresetId =
  | 'flat'
  | 'bass'
  | 'treble'
  | 'pop'
  | 'rock'
  | 'classical'
  | 'custom';

export interface Track {
  id: string;
  fingerprint: string;
  sourceType: TrackSourceType;
  storageSection: StorageSectionId;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre: string;
  year: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  duration: number;
  mimeType: string;
  format: string;
  bitrate: number | null;
  sampleRate: number | null;
  fileSize: number;
  fileName: string;
  artworkId: string | null;
  streamUrl?: string;
  addedAt: number;
  playCount: number;
  lastPlayedAt: number | null;
}

export interface AudioBlobRecord {
  trackId: string;
  storageSection: StorageSectionId;
  blob: Blob;
  byteSize: number;
}

export interface ArtworkRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  byteSize: number;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface PlaylistTrack {
  id?: number;
  playlistId: string;
  trackId: string;
  position: number;
  addedAt: number;
}

export interface FavoriteEntry {
  trackId: string;
  addedAt: number;
}

export interface RecentlyPlayedEntry {
  id?: number;
  trackId: string;
  playedAt: number;
}

export interface PlaybackStateRecord {
  id: 'current';
  currentTrackId: string | null;
  positionSeconds: number;
  queueTrackIds: string[];
  queueIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  muted: boolean;
  updatedAt: number;
}

export interface StorageAllocationRecord {
  id: StorageSectionId;
  label: string;
  configuredCapacityBytes: number;
  priority: number;
  updatedAt: number;
}

export interface TransferHistoryRecord {
  id?: number;
  sessionId: string;
  direction: 'send' | 'receive';
  peerName: string;
  fileName: string;
  trackId: string | null;
  fileSize: number;
  checksum: string;
  storageSection: StorageSectionId | null;
  status: 'completed' | 'duplicate' | 'failed';
  timestamp: number;
}

export interface EqualizerSettingsRecord {
  id: 'eq';
  enabled: boolean;
  preset: EqualizerPresetId;
  bassGain: number;
  trebleGain: number;
  bands: number[];
  updatedAt: number;
}

export interface AppSettingsRecord {
  id: 'app';
  networkMode: NetworkMode;
  playbackRestorePolicy: PlaybackRestorePolicy;
  persistStorageRequested: boolean;
  sortBy: SortField;
  sortDir: SortDirection;
  updatedAt: number;
}

export interface ImportFileError {
  fileName: string;
  reason: string;
}

export interface ImportJobState {
  status: 'idle' | 'scanning' | 'importing' | 'paused_storage_full' | 'completed' | 'cancelled' | 'error';
  totalFiles: number;
  processedFiles: number;
  importedCount: number;
  duplicateCount: number;
  unsupportedCount: number;
  failedCount: number;
  storage1ImportedCount: number;
  storage2ImportedCount: number;
  pausedRemainingCount: number;
  currentFileName: string;
  errors: ImportFileError[];
  quotaExceeded: boolean;
  storageFull: boolean;
}

export interface StorageSectionStats {
  id: StorageSectionId;
  label: string;
  configuredCapacityBytes: number;
  usedBytes: number;
  availableBytes: number;
  utilizationPct: number;
  trackCount: number;
}

export interface StorageBreakdown {
  usageBytes: number | null;
  quotaBytes: number | null;
  audioBytes: number;
  artworkBytes: number;
  trackCount: number;
  artworkCount: number;
  persisted: boolean | null;
  totalConfiguredBytes: number;
  storage1: StorageSectionStats;
  storage2: StorageSectionStats;
}
