import type { SortDirection, SortField, Track } from '../types/music';

export function sortTracks(
  tracks: Track[],
  sortBy: SortField,
  sortDir: SortDirection
): Track[] {
  const list = [...tracks];
  const dir = sortDir === 'asc' ? 1 : -1;

  list.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'title':
        cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        break;
      case 'artist':
        cmp = a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' });
        if (cmp === 0) {
          cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        }
        break;
      case 'album':
        cmp = a.album.localeCompare(b.album, undefined, { sensitivity: 'base' });
        if (cmp === 0) {
          cmp = (a.trackNumber ?? 0) - (b.trackNumber ?? 0);
        }
        if (cmp === 0) {
          cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        }
        break;
      case 'duration':
        cmp = (a.duration || 0) - (b.duration || 0);
        break;
      case 'fileSize':
        cmp = (a.fileSize || 0) - (b.fileSize || 0);
        break;
      case 'playCount':
        cmp = (a.playCount || 0) - (b.playCount || 0);
        break;
      case 'lastPlayedAt':
        cmp = (a.lastPlayedAt || 0) - (b.lastPlayedAt || 0);
        break;
      case 'addedAt':
      default:
        cmp = (a.addedAt || 0) - (b.addedAt || 0);
        break;
    }

    if (cmp !== 0) return cmp * dir;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });

  return list;
}
