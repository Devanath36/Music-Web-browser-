import { sonoraDb } from './sonoraDb';
import type {
  EqualizerSettingsRecord,
  FavoriteEntry,
  Playlist,
  PlaylistTrack,
  Track,
} from '../types/music';

export interface SonoraLibraryBackup {
  app: 'SONORA';
  schemaVersion: 2;
  exportedAt: string;
  note: string;
  tracks: Omit<Track, 'artworkId'>[];
  playlists: Playlist[];
  playlistTracks: PlaylistTrack[];
  favorites: FavoriteEntry[];
  equalizerSettings?: EqualizerSettingsRecord;
}

export async function exportLibraryMetadataJson(): Promise<{
  json: string;
  trackCount: number;
  playlistCount: number;
}> {
  const [tracks, playlists, playlistTracks, favorites, equalizerSettings] = await Promise.all([
    sonoraDb.tracks.toArray(),
    sonoraDb.playlists.toArray(),
    sonoraDb.playlistTracks.toArray(),
    sonoraDb.favorites.toArray(),
    sonoraDb.equalizerSettings.get('eq'),
  ]);

  const sanitizedTracks = tracks.map(({ artworkId: _ignored, ...rest }) => rest);

  const backup: SonoraLibraryBackup = {
    app: 'SONORA',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    note: 'SONORA library metadata, playlists, remote streams, favorites, and equalizer backup. Local audio files remain stored on the originating device and are matched by file fingerprint when restoring.',
    tracks: sanitizedTracks,
    playlists,
    playlistTracks,
    favorites,
    equalizerSettings,
  };

  return {
    json: JSON.stringify(backup, null, 2),
    trackCount: tracks.length,
    playlistCount: playlists.length,
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

export async function restoreLibraryBackupJson(jsonText: string): Promise<{
  restoredPlaylists: number;
  restoredFavorites: number;
  restoredRemoteStreams: number;
  matchedLocalTracks: number;
}> {
  const parsed = JSON.parse(jsonText) as Partial<SonoraLibraryBackup>;
  if (parsed.app !== 'SONORA' || !Array.isArray(parsed.playlists) || !Array.isArray(parsed.tracks)) {
    throw new Error('Invalid SONORA backup file.');
  }

  let restoredPlaylists = 0;
  let restoredFavorites = 0;
  let restoredRemoteStreams = 0;
  let matchedLocalTracks = 0;

  await sonoraDb.transaction(
    'rw',
    [
      sonoraDb.tracks,
      sonoraDb.playlists,
      sonoraDb.playlistTracks,
      sonoraDb.favorites,
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
        }
      }

      for (const pl of parsed.playlists || []) {
        const existingPl = await sonoraDb.playlists.get(pl.id);
        if (!existingPl) {
          await sonoraDb.playlists.put(pl);
          restoredPlaylists++;
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
    restoredFavorites,
    restoredRemoteStreams,
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
