import type { SmartPlaylistRecord, SmartPlaylistRule, Track } from '../types/music';

export function evaluateSmartRule(
  track: Track,
  rule: SmartPlaylistRule,
  favoriteIds: Set<string>,
  now = Date.now()
): boolean {
  const rawVal = (rule.value || '').trim();
  const numVal = parseFloat(rawVal);

  switch (rule.field) {
    case 'playCount': {
      const actual = track.playCount || 0;
      if (!Number.isFinite(numVal)) return false;
      if (rule.operator === 'gt') return actual > numVal;
      if (rule.operator === 'lt') return actual < numVal;
      return actual === numVal;
    }

    case 'rating': {
      const actual = track.rating || 0;
      if (!Number.isFinite(numVal)) return false;
      if (rule.operator === 'gt') return actual > numVal;
      if (rule.operator === 'lt') return actual < numVal;
      return actual === numVal;
    }

    case 'year': {
      const actual = track.year || 0;
      if (!actual || !Number.isFinite(numVal)) return false;
      if (rule.operator === 'gt') return actual > numVal;
      if (rule.operator === 'lt') return actual < numVal;
      return actual === numVal;
    }

    case 'daysSincePlayed': {
      if (!Number.isFinite(numVal)) return false;
      const days = track.lastPlayedAt ? (now - track.lastPlayedAt) / 86_400_000 : 9999;
      if (rule.operator === 'gt') return days > numVal;
      if (rule.operator === 'lt') return days < numVal;
      return Math.floor(days) === Math.floor(numVal);
    }

    case 'daysSinceAdded': {
      if (!Number.isFinite(numVal)) return false;
      const days = (now - (track.addedAt || now)) / 86_400_000;
      if (rule.operator === 'gt') return days > numVal;
      if (rule.operator === 'lt') return days < numVal;
      return Math.floor(days) === Math.floor(numVal);
    }

    case 'isFavorite': {
      const isFav = favoriteIds.has(track.id);
      const wantFav = rawVal.toLowerCase() !== 'false' && rawVal !== '0';
      return rule.operator === 'is_not' ? isFav !== wantFav : isFav === wantFav;
    }

    case 'artist':
    case 'genre':
    case 'album': {
      const target = (track[rule.field] || '').toLowerCase();
      const needle = rawVal.toLowerCase();
      if (!needle) return true;
      if (rule.operator === 'is') return target === needle;
      if (rule.operator === 'is_not') return target !== needle;
      return target.includes(needle);
    }
  }
}

export function evaluateSmartPlaylist(
  playlist: Pick<SmartPlaylistRecord, 'matchMode' | 'rules'>,
  tracks: Track[],
  favoriteIds: Set<string>,
  now = Date.now()
): Track[] {
  if (playlist.rules.length === 0) return tracks;

  return tracks.filter((track) => {
    if (playlist.matchMode === 'any') {
      return playlist.rules.some((rule) => evaluateSmartRule(track, rule, favoriteIds, now));
    }
    return playlist.rules.every((rule) => evaluateSmartRule(track, rule, favoriteIds, now));
  });
}

export const BUILTIN_SMART_TEMPLATES: Array<
  Omit<SmartPlaylistRecord, 'id' | 'createdAt' | 'updatedAt'>
> = [
  {
    name: 'Heavy Rotation',
    description: 'Tracks with more than 5 plays',
    matchMode: 'all',
    rules: [{ id: 'r1', field: 'playCount', operator: 'gt', value: '5' }],
  },
  {
    name: 'Forgotten Gems',
    description: 'Not played in over 30 days',
    matchMode: 'all',
    rules: [{ id: 'r2', field: 'daysSincePlayed', operator: 'gt', value: '30' }],
  },
  {
    name: 'Fresh Imports (14 Days)',
    description: 'Added in the last 14 days',
    matchMode: 'all',
    rules: [{ id: 'r3', field: 'daysSinceAdded', operator: 'lt', value: '14' }],
  },
  {
    name: 'Top Rated Favorites',
    description: 'Favorited tracks or rated 4+ stars',
    matchMode: 'any',
    rules: [
      { id: 'r4', field: 'isFavorite', operator: 'is', value: 'true' },
      { id: 'r5', field: 'rating', operator: 'gt', value: '3' },
    ],
  },
];
