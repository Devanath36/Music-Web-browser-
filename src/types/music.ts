export type AppView =
  | 'songs'
  | 'playlists'
  | 'smart_playlists'
  | 'favorites'
  | 'albums'
  | 'artists'
  | 'genres'
  | 'folders'
  | 'recent'
  | 'most_played'
  | 'dj_mixes'
  | 'recommendations'
  | 'lyrics'
  | 'listening_room'
  | 'analytics'
  | 'vocal_isolation'
  | 'deleted'
  | 'import'
  | 'transfer'
  | 'equalizer'
  | 'spatial'
  | 'dj'
  | 'storage'
  | 'settings';

export type RepeatMode = 'off' | 'all' | 'one';
export type TransitionMode = 'gapless' | 'crossfade';
export type NetworkMode = 'offline' | 'online';
export type TrackSourceType = 'local' | 'remote';
export type SortField =
  | 'addedAt'
  | 'title'
  | 'artist'
  | 'album'
  | 'lastPlayedAt'
  | 'playCount'
  | 'duration'
  | 'fileSize';
export type SortDirection = 'asc' | 'desc';

export type VisualizerStyle =
  | 'waveform'
  | 'bars'
  | 'circular'
  | 'particles'
  | '3d'
  | 'spectrum'
  | 'ambient'
  | 'spatial_3d';

export interface VisualizerSettings {
  enabled: boolean;
  style: VisualizerStyle;
  animationIntensity: number;
  backgroundIntensity: number;
  threeDEnabled: boolean;
  albumRotationEnabled: boolean;
  performanceMode: boolean;
}

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
  composer?: string;
  folderPath?: string;
  year: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  duration: number;
  mimeType: string;
  format: string;
  bitrate: number | null;
  sampleRate: number | null;
  bitDepth?: number | null;
  channelCount?: number | null;
  fileSize: number;
  fileName: string;
  artworkId: string | null;
  streamUrl?: string;
  addedAt: number;
  playCount: number;
  skipCount?: number;
  rating?: number | null;
  customTags?: Record<string, string>;
  deletedAt?: number | null;
  previousMetadataSnapshot?: {
    title: string;
    artist: string;
    album: string;
    albumArtist: string;
    genre: string;
    composer?: string;
    year: number | null;
    trackNumber: number | null;
    discNumber: number | null;
    rating?: number | null;
    customTags?: Record<string, string>;
  };
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
  smartShuffle?: boolean;
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

export interface DjPresetEffectState {
  enabled: boolean;
  intensity: number;
  mix: number;
  timingMs?: number;
}

export interface DjPresetConfig {
  id: string;
  name: string;
  crossfader: number;
  masterVolume: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  filterValue: number;
  effects: Record<string, DjPresetEffectState>;
}

export type SpatialAudioMode =
  | 'stereo'
  | 'wide_stereo'
  | 'virtual_surround'
  | '3d_spatial'
  | 'cinema'
  | 'concert_hall'
  | 'studio'
  | 'headphone_spatial'
  | 'custom';

export interface SpatialAudioSettings {
  enabled: boolean;
  mode: SpatialAudioMode;
  headphoneMode: boolean;
  spatialWidth: number; // 0.0 to 2.0 (1.0 = neutral stereo)
  balance: number; // -1.0 to 1.0
  depth: number; // 0.0 to 1.0
  distance: number; // 0.0 to 1.0
  reverbIntensity: number; // 0.0 to 1.0
  surroundIntensity: number; // 0.0 to 1.0
  bassEnhanceDb: number; // -6 to +10
  midGainDb: number; // -6 to +6
  trebleEnhanceDb: number; // -6 to +8
  azimuthDeg: number; // -180 to +180
  elevationDeg: number; // -45 to +45
  limiterEnabled: boolean;
}

export interface CustomSpatialProfile {
  id: string;
  name: string;
  createdAt: number;
  spatial: Omit<SpatialAudioSettings, 'enabled' | 'mode'>;
  eqSnapshot?: {
    enabled: boolean;
    bassGain: number;
    trebleGain: number;
    bands: number[];
  };
}

export type ListeningRoomId =
  | 'minimal'
  | 'rain'
  | 'night_drive'
  | 'space'
  | 'ocean'
  | 'concert_hall'
  | 'sunset'
  | 'forest';

export interface ListeningRoomSettings {
  environment: ListeningRoomId;
  visualEffectsEnabled: boolean;
  particlesEnabled: boolean;
  backgroundIntensity: number;
  syncSpatialPreset: boolean;
}

export type ShortcutActionId =
  | 'toggle_play_pause'
  | 'seek_forward'
  | 'seek_backward'
  | 'next_track'
  | 'prev_track'
  | 'volume_up'
  | 'volume_down'
  | 'toggle_mute'
  | 'toggle_shuffle'
  | 'toggle_repeat'
  | 'toggle_favorite'
  | 'toggle_queue';

export interface LyricLine {
  timeSeconds: number | null;
  text: string;
}

export interface TrackLyricsRecord {
  trackId: string;
  rawText: string;
  format: 'lrc' | 'plain';
  lines: LyricLine[];
  source: 'manual' | 'imported';
  updatedAt: number;
}

export interface ListeningEventRecord {
  id?: number;
  trackId: string;
  startedAt: number;
  durationListenedSec: number;
  dayKey: string;
  monthKey: string;
  skipped: boolean;
}

export type SmartRuleField =
  | 'playCount'
  | 'daysSincePlayed'
  | 'daysSinceAdded'
  | 'artist'
  | 'genre'
  | 'album'
  | 'isFavorite'
  | 'rating'
  | 'year';

export type SmartRuleOperator = 'gt' | 'lt' | 'eq' | 'contains' | 'is' | 'is_not';

export interface SmartPlaylistRule {
  id: string;
  field: SmartRuleField;
  operator: SmartRuleOperator;
  value: string;
}

export interface SmartPlaylistRecord {
  id: string;
  name: string;
  description: string;
  matchMode: 'all' | 'any';
  rules: SmartPlaylistRule[];
  createdAt: number;
  updatedAt: number;
}

export interface DjMixRecord {
  id: string;
  title: string;
  createdAt: number;
  durationSec: number;
  mimeType: string;
  byteSize: number;
  blob: Blob;
}

export interface ProcessedStemRecord {
  id: string;
  trackId: string;
  mode: 'vocals' | 'instrumental';
  title: string;
  mimeType: string;
  durationSec: number;
  byteSize: number;
  blob: Blob;
  createdAt: number;
}

export interface RecommendationFeedbackRecord {
  trackId: string;
  feedback: 'liked' | 'disliked';
  updatedAt: number;
}

export interface AppSettingsRecord {
  id: 'app';
  networkMode: NetworkMode;
  playbackRestorePolicy: PlaybackRestorePolicy;
  persistStorageRequested: boolean;
  sortBy: SortField;
  sortDir: SortDirection;
  gaplessEnabled?: boolean;
  transitionMode?: TransitionMode;
  crossfadeEnabled?: boolean;
  crossfadeSeconds?: number;
  deletedRetentionDays?: number;
  analyticsEnabled?: boolean;
  voiceControlEnabled?: boolean;
  audioOutputDeviceId?: string;
  customShortcuts?: Partial<Record<ShortcutActionId, string>>;
  listeningRoom?: ListeningRoomSettings;
  visualizer?: VisualizerSettings;
  spatialAudio?: SpatialAudioSettings;
  customSpatialProfiles?: CustomSpatialProfile[];
  customDjPresets?: DjPresetConfig[];
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
  verifiedBlobCount?: number;
  missingBlobCount?: number;
  persisted: boolean | null;
  totalConfiguredBytes: number;
  storage1: StorageSectionStats;
  storage2: StorageSectionStats;
}
