import { sonoraDb } from './sonoraDb';
import type {
  EqualizerSettingsRecord,
  FavoriteEntry,
  Playlist,
  PlaylistTrack,
  SmartPlaylistRecord,
  Track,
  TrackLyricsRecord,
} from '../types/music';

export interface SonoraPlaylistExportFile {
  app: 'SONORA';
  type: 'playlist_export';
  schemaVersion: 3;
  exportedAt: string;
  playlists: Array<{
    name: string;
    description: string;
    tracks: Array<{
      fingerprint: string;
      title: string;
      artist: string;
      album: string;
      fileName: string;
      sourceType: 'local' | 'remote';
      streamUrl?: string;
    }>;
  }>;
}

export interface SonoraAudioBlobBackupEntry {
  fingerprint: string;
  mimeType: string;
  base64: string;
}

export interface SonoraLibraryBackup {
  app: 'SONORA';
  schemaVersion: 2 | 3;
  exportedAt: string;
  note: string;
  includesAudioBlobs?: boolean;
  tracks: Omit<Track, 'artworkId'>[];
  playlists: Playlist[];
  playlistTracks: PlaylistTrack[];
  smartPlaylists?: SmartPlaylistRecord[];
  favorites: FavoriteEntry[];
  lyrics?: TrackLyricsRecord[];
  equalizerSettings?: EqualizerSettingsRecord;
  audioBlobsBase64?: SonoraAudioBlobBackupEntry[];
}

export interface BackupPreviewSummary {
  schemaVersion: number;
  exportedAt: string;
  trackCount: number;
  playlistCount: number;
  smartPlaylistCount: number;
  lyricsCount: number;
  includesAudioBlobs: boolean;
  audioBlobCount: number;
  matchedExistingCount: number;
  missingLocalAudioCount: number;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || 'audio/mpeg' });
}

export async function exportLibraryMetadataJson(options: {
  includeAudioBlobs?: boolean;
} = {}): Promise<{
  json: string;
  trackCount: number;
  playlistCount: number;
  includedAudioBlobs: number;
}> {
  const [tracks, playlists, playlistTracks, smartPlaylists, favorites, lyrics, equalizerSettings] =
    await Promise.all([
      sonoraDb.tracks.toArray(),
      sonoraDb.playlists.toArray(),
      sonoraDb.playlistTracks.toArray(),
      sonoraDb.smartPlaylists.toArray().catch(() => []),
      sonoraDb.favorites.toArray(),
      sonoraDb.lyrics.toArray().catch(() => []),
      sonoraDb.equalizerSettings.get('eq'),
    ]);

  const activeTracks = tracks.filter((t) => !t.deletedAt);
  const sanitizedTracks = activeTracks.map(({ artworkId: _ignored, ...rest }) => rest);

  let audioBlobsBase64: SonoraAudioBlobBackupEntry[] | undefined;
  if (options.includeAudioBlobs) {
    const blobs = await sonoraDb.audioBlobs.toArray();
    const fpById = new Map(activeTracks.map((t) => [t.id, { fp: t.fingerprint, mime: t.mimeType }]));
    const totalBytes = blobs.reduce((sum, b) => sum + (b.byteSize || b.blob.size || 0), 0);
    if (totalBytes > 180 * 1024 * 1024) {
      throw new Error(
        'Library audio exceeds 180 MB browser JSON archive safety limit. Use Metadata-Only Backup or Wi-Fi Transfer for large libraries.'
      );
    }
    audioBlobsBase64 = [];
    for (const b of blobs) {
      const info = fpById.get(b.trackId);
      if (!info) continue;
      const buf = await b.blob.arrayBuffer();
      audioBlobsBase64.push({
        fingerprint: info.fp,
        mimeType: info.mime || b.blob.type || 'audio/mpeg',
        base64: arrayBufferToBase64(buf),
      });
    }
  }

  const backup: SonoraLibraryBackup = {
    app: 'SONORA',
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    note: options.includeAudioBlobs
      ? 'SONORA complete library archive including embedded audio blobs, metadata, playlists, smart rules, lyrics, favorites, and equalizer.'
      : 'SONORA metadata-only backup (playlists, smart rules, metadata, lyrics, favorites, and equalizer). Local audio files are matched by fingerprint when restoring.',
    includesAudioBlobs: Boolean(options.includeAudioBlobs),
    tracks: sanitizedTracks,
    playlists,
    playlistTracks,
    smartPlaylists,
    favorites,
    lyrics,
    equalizerSettings,
    audioBlobsBase64,
  };

  return {
    json: JSON.stringify(backup, null, 2),
    trackCount: activeTracks.length,
    playlistCount: playlists.length,
    includedAudioBlobs: audioBlobsBase64?.length ?? 0,
  };
}

export function generatePlaylistM3U(playlistName: string, tracks: Track[]): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${playlistName}`];
  for (const t of tracks) {
    const dur = Math.round(t.duration || -1);
    const label = `${t.artist} - ${t.title}`;
    lines.push(`#EXTINF:${dur},${label}`);
    lines.push(t.sourceType === 'remote' && t.streamUrl ? t.streamUrl : t.fileName || `${t.title}.mp3`);
  }
  return lines.join('\n');
}

export function generatePlaylistM3U8(playlistName: string, tracks: Track[]): string {
  const lines = ['#EXTM3U', '#EXTENC:UTF-8', `#PLAYLIST:${playlistName}`];
  for (const t of tracks) {
    const dur = Math.round(t.duration || -1);
    const label = `${t.artist} - ${t.title}`;
    lines.push(`#EXTINF:${dur},${label}`);
    const ref =
      t.sourceType === 'remote' && t.streamUrl
        ? t.streamUrl
        : t.folderPath || t.fileName || `${t.title}.mp3`;
    lines.push(ref);
  }
  return lines.join('\n');
}

export function generatePlaylistsJson(
  playlists: Playlist[],
  playlistTracks: PlaylistTrack[],
  allTracks: Track[]
): string {
  const trackMap = new Map(allTracks.map((t) => [t.id, t]));
  const exportObj: SonoraPlaylistExportFile = {
    app: 'SONORA',
    type: 'playlist_export',
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    playlists: playlists.map((pl) => {
      const items = playlistTracks
        .filter((pt) => pt.playlistId === pl.id)
        .sort((a, b) => a.position - b.position)
        .map((pt) => trackMap.get(pt.trackId))
        .filter((t): t is Track => Boolean(t));

      return {
        name: pl.name,
        description: pl.description,
        tracks: items.map((t) => ({
          fingerprint: t.fingerprint,
          title: t.title,
          artist: t.artist,
          album: t.album,
          fileName: t.fileName,
          sourceType: t.sourceType,
          streamUrl: t.streamUrl,
        })),
      };
    }),
  };
  return JSON.stringify(exportObj, null, 2);
}

export function parseImportedPlaylistJson(
  jsonText: string,
  existingTracks: Track[]
): {
  playlists: Array<{
    name: string;
    description: string;
    matchedTrackIds: string[];
    missingTrackLabels: string[];
  }>;
  totalMatched: number;
  totalMissing: number;
} {
  const parsed = JSON.parse(jsonText) as Partial<SonoraPlaylistExportFile>;
  if (parsed.app !== 'SONORA' || !Array.isArray(parsed.playlists)) {
    throw new Error('Invalid SONORA playlist JSON file.');
  }

  const byFp = new Map(existingTracks.map((t) => [t.fingerprint, t]));
  const byTitleArtist = new Map(
    existingTracks.map((t) => [`${t.title.toLowerCase()}::${t.artist.toLowerCase()}`, t])
  );

  let totalMatched = 0;
  let totalMissing = 0;

  const playlists = parsed.playlists.map((pl) => {
    const matchedTrackIds: string[] = [];
    const missingTrackLabels: string[] = [];

    for (const item of pl.tracks || []) {
      const matched =
        byFp.get(item.fingerprint) ||
        byTitleArtist.get(`${(item.title || '').toLowerCase()}::${(item.artist || '').toLowerCase()}`);

      if (matched) {
        matchedTrackIds.push(matched.id);
        totalMatched++;
      } else {
        missingTrackLabels.push(`${item.artist || 'Unknown'} - ${item.title || item.fileName}`);
        totalMissing++;
      }
    }

    return {
      name: pl.name || 'Imported Playlist',
      description: pl.description || '',
      matchedTrackIds,
      missingTrackLabels,
    };
  });

  return { playlists, totalMatched, totalMissing };
}

export async function importPlaylistsJsonIntoDb(jsonText: string): Promise<{
  importedPlaylists: number;
  matchedTracks: number;
  missingTracks: string[];
}> {
  const existingTracks = (await sonoraDb.tracks.toArray()).filter((t) => !t.deletedAt);
  const parsed = parseImportedPlaylistJson(jsonText, existingTracks);
  const now = Date.now();
  const missingTracks: string[] = [];

  await sonoraDb.transaction('rw', [sonoraDb.playlists, sonoraDb.playlistTracks], async () => {
    for (const pl of parsed.playlists) {
      const playlistId = crypto.randomUUID();
      await sonoraDb.playlists.put({
        id: playlistId,
        name: pl.name,
        description: pl.description,
        createdAt: now,
        updatedAt: now,
      });
      for (let i = 0; i < pl.matchedTrackIds.length; i++) {
        await sonoraDb.playlistTracks.add({
          playlistId,
          trackId: pl.matchedTrackIds[i],
          position: i,
          addedAt: now,
        });
      }
      missingTracks.push(...pl.missingTrackLabels);
    }
  });

  return {
    importedPlaylists: parsed.playlists.length,
    matchedTracks: parsed.totalMatched,
    missingTracks,
  };
}

export async function previewLibraryBackup(jsonText: string): Promise<BackupPreviewSummary> {
  const parsed = JSON.parse(jsonText) as Partial<SonoraLibraryBackup>;
  if (parsed.app !== 'SONORA' || !Array.isArray(parsed.playlists) || !Array.isArray(parsed.tracks)) {
    throw new Error('Invalid SONORA backup file.');
  }

  const existingTracks = await sonoraDb.tracks.toArray();
  const existingFps = new Set(existingTracks.map((t) => t.fingerprint));
  const embeddedBlobFps = new Set((parsed.audioBlobsBase64 || []).map((b) => b.fingerprint));

  let matchedExistingCount = 0;
  let missingLocalAudioCount = 0;

  for (const t of parsed.tracks) {
    if (existingFps.has(t.fingerprint)) {
      matchedExistingCount++;
    } else if (t.sourceType === 'local' && !embeddedBlobFps.has(t.fingerprint)) {
      missingLocalAudioCount++;
    }
  }

  return {
    schemaVersion: parsed.schemaVersion || 2,
    exportedAt: parsed.exportedAt || 'Unknown',
    trackCount: parsed.tracks.length,
    playlistCount: parsed.playlists.length,
    smartPlaylistCount: parsed.smartPlaylists?.length ?? 0,
    lyricsCount: parsed.lyrics?.length ?? 0,
    includesAudioBlobs: Boolean(parsed.includesAudioBlobs && parsed.audioBlobsBase64?.length),
    audioBlobCount: parsed.audioBlobsBase64?.length ?? 0,
    matchedExistingCount,
    missingLocalAudioCount,
  };
}

export async function restoreLibraryBackupJson(jsonText: string): Promise<{
  restoredPlaylists: number;
  restoredSmartPlaylists: number;
  restoredFavorites: number;
  restoredLyrics: number;
  restoredRemoteStreams: number;
  restoredAudioTracks: number;
  matchedLocalTracks: number;
}> {
  const parsed = JSON.parse(jsonText) as Partial<SonoraLibraryBackup>;
  if (parsed.app !== 'SONORA' || !Array.isArray(parsed.playlists) || !Array.isArray(parsed.tracks)) {
    throw new Error('Invalid SONORA backup file.');
  }

  let restoredPlaylists = 0;
  let restoredSmartPlaylists = 0;
  let restoredFavorites = 0;
  let restoredLyrics = 0;
  let restoredRemoteStreams = 0;
  let restoredAudioTracks = 0;
  let matchedLocalTracks = 0;

  const blobByFp = new Map<string, SonoraAudioBlobBackupEntry>();
  for (const b of parsed.audioBlobsBase64 || []) {
    blobByFp.set(b.fingerprint, b);
  }

  await sonoraDb.transaction(
    'rw',
    [
      sonoraDb.tracks,
      sonoraDb.audioBlobs,
      sonoraDb.playlists,
      sonoraDb.playlistTracks,
      sonoraDb.smartPlaylists,
      sonoraDb.favorites,
      sonoraDb.lyrics,
      sonoraDb.equalizerSettings,
    ],
    async () => {
      const existingTracks = await sonoraDb.tracks.toArray();
      const fpToLocalId = new Map<string, string>();
      for (const t of existingTracks) {
        fpToLocalId.set(t.fingerprint, t.id);
      }

      const backupIdToLocalId = new Map<string, string>();

      for (const bt of parsed.tracks || []) {
        const matched = fpToLocalId.get(bt.fingerprint);
        if (matched) {
          backupIdToLocalId.set(bt.id, matched);
          matchedLocalTracks++;
        } else if (bt.sourceType === 'remote' && bt.streamUrl) {
          const newId = bt.id;
          await sonoraDb.tracks.put({
            ...bt,
            storageSection: bt.storageSection || 'storage1',
            artworkId: null,
          });
          backupIdToLocalId.set(bt.id, newId);
          restoredRemoteStreams++;
        } else if (bt.sourceType === 'local' && blobByFp.has(bt.fingerprint)) {
          const blobEntry = blobByFp.get(bt.fingerprint)!;
          const blob = base64ToBlob(blobEntry.base64, blobEntry.mimeType);
          const newId = bt.id || crypto.randomUUID();
          await sonoraDb.tracks.put({
            ...bt,
            id: newId,
            storageSection: bt.storageSection || 'storage1',
            fileSize: blob.size,
            artworkId: null,
          });
          await sonoraDb.audioBlobs.put({
            trackId: newId,
            storageSection: bt.storageSection || 'storage1',
            blob,
            byteSize: blob.size,
          });
          backupIdToLocalId.set(bt.id, newId);
          fpToLocalId.set(bt.fingerprint, newId);
          restoredAudioTracks++;
        }
      }

      for (const pl of parsed.playlists || []) {
        const existingPl = await sonoraDb.playlists.get(pl.id);
        if (!existingPl) {
          await sonoraDb.playlists.put(pl);
          restoredPlaylists++;
        }
      }

      for (const spl of parsed.smartPlaylists || []) {
        const existingSpl = await sonoraDb.smartPlaylists.get(spl.id);
        if (!existingSpl) {
          await sonoraDb.smartPlaylists.put(spl);
          restoredSmartPlaylists++;
        }
      }

      const existingLinks = await sonoraDb.playlistTracks.toArray();
      const linkKeys = new Set(existingLinks.map((l) => `${l.playlistId}:${l.trackId}`));

      for (const pt of parsed.playlistTracks || []) {
        const localTrackId = backupIdToLocalId.get(pt.trackId);
        if (!localTrackId) continue;
        const key = `${pt.playlistId}:${localTrackId}`;
        if (!linkKeys.has(key)) {
          linkKeys.add(key);
          await sonoraDb.playlistTracks.add({
            playlistId: pt.playlistId,
            trackId: localTrackId,
            position: pt.position,
            addedAt: pt.addedAt || Date.now(),
          });
        }
      }

      for (const fav of parsed.favorites || []) {
        const localTrackId = backupIdToLocalId.get(fav.trackId);
        if (!localTrackId) continue;
        const existingFav = await sonoraDb.favorites.get(localTrackId);
        if (!existingFav) {
          await sonoraDb.favorites.put({
            trackId: localTrackId,
            addedAt: fav.addedAt || Date.now(),
          });
          restoredFavorites++;
        }
      }

      for (const lyr of parsed.lyrics || []) {
        const localTrackId = backupIdToLocalId.get(lyr.trackId);
        if (!localTrackId) continue;
        const existingLyr = await sonoraDb.lyrics.get(localTrackId);
        if (!existingLyr) {
          await sonoraDb.lyrics.put({
            ...lyr,
            trackId: localTrackId,
          });
          restoredLyrics++;
        }
      }

      if (parsed.equalizerSettings && Array.isArray(parsed.equalizerSettings.bands)) {
        await sonoraDb.equalizerSettings.put({
          ...parsed.equalizerSettings,
          id: 'eq',
          updatedAt: Date.now(),
        });
      }
    }
  );

  return {
    restoredPlaylists,
    restoredSmartPlaylists,
    restoredFavorites,
    restoredLyrics,
    restoredRemoteStreams,
    restoredAudioTracks,
    matchedLocalTracks,
  };
}

export function triggerTextDownload(filename: string, content: string, mimeType = 'application/json') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
