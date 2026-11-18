export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return '0 B';
  }
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exp);
  return `${value >= 10 || exp === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}

export function formatBitrate(bps: number | null | undefined): string {
  if (!bps || !Number.isFinite(bps) || bps <= 0) return '';
  const kbps = Math.round(bps > 10000 ? bps / 1000 : bps);
  return `${kbps} kbps`;
}

export function formatRelativeDate(timestamp: number | null | undefined): string {
  if (!timestamp) return '';
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'm4a',
  'aac',
  'ogg',
  'opus',
  'flac',
]);

const EXTENSION_MIME_MAP: Record<string, string[]> = {
  mp3: ['audio/mpeg', 'audio/mp3'],
  wav: ['audio/wav', 'audio/wave', 'audio/x-wav'],
  m4a: ['audio/mp4', 'audio/x-m4a', 'audio/aac'],
  aac: ['audio/aac', 'audio/mp4'],
  ogg: ['audio/ogg', 'audio/ogg; codecs="vorbis"'],
  opus: ['audio/ogg; codecs="opus"', 'audio/opus'],
  flac: ['audio/flac', 'audio/x-flac'],
};

export function getFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

export function isSupportedAudioFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  if (SUPPORTED_AUDIO_EXTENSIONS.has(ext)) return true;
  if (file.type && file.type.startsWith('audio/')) {
    return Object.values(EXTENSION_MIME_MAP).some((mimes) =>
      mimes.some((m) => file.type.toLowerCase().startsWith(m.split(';')[0]))
    );
  }
  return false;
}

export function canBrowserPlayFile(file: File): { supported: boolean; mimeType: string } {
  const ext = getFileExtension(file.name);
  const probe = document.createElement('audio');
  const candidates = new Set<string>();

  if (file.type) candidates.add(file.type);
  if (ext && EXTENSION_MIME_MAP[ext]) {
    for (const m of EXTENSION_MIME_MAP[ext]) candidates.add(m);
  }

  for (const mime of candidates) {
    const can = probe.canPlayType(mime);
    if (can === 'probably' || can === 'maybe') {
      return { supported: true, mimeType: mime };
    }
  }

  // Fallback: if extension is in our supported list and browser didn't explicitly reject,
  // allow import if extension is known (some browsers return '' for audio/flac without codecs).
  if (SUPPORTED_AUDIO_EXTENSIONS.has(ext)) {
    const fallbackMime = file.type || EXTENSION_MIME_MAP[ext]?.[0] || `audio/${ext}`;
    return { supported: true, mimeType: fallbackMime };
  }

  return { supported: false, mimeType: file.type || '' };
}

export function parseFallbackFilenameMetadata(fileName: string): {
  title: string;
  artist: string;
  trackNumber: number | null;
} {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  // Match patterns like "01 - Artist - Title" or "01. Title" or "Artist - Title"
  const trackPrefixMatch = base.match(/^(\d{1,3})[\s._-]+(.+)$/);
  let trackNumber: number | null = null;
  let rest = base;
  if (trackPrefixMatch) {
    const parsedNum = parseInt(trackPrefixMatch[1], 10);
    if (parsedNum > 0 && parsedNum < 500) {
      trackNumber = parsedNum;
      rest = trackPrefixMatch[2].trim();
    }
  }

  const dashParts = rest.split(/\s+-\s+/);
  if (dashParts.length >= 2) {
    return {
      artist: dashParts[0].trim() || 'Unknown Artist',
      title: dashParts.slice(1).join(' - ').trim() || rest,
      trackNumber,
    };
  }

  return {
    artist: 'Unknown Artist',
    title: rest || fileName,
    trackNumber,
  };
}
