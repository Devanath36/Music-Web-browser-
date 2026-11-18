import type { LyricLine, TrackLyricsRecord } from '../types/music';

const LRC_TIMESTAMP_RE = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

export function formatLrcTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const hundredths = Math.floor((safe - Math.floor(safe)) * 100);
  return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}]`;
}

export function parseLyricsText(rawText: string): {
  format: 'lrc' | 'plain';
  lines: LyricLine[];
} {
  const normalized = (rawText || '').replace(/\r\n?/g, '\n');
  const rawLines = normalized.split('\n');
  const timedLines: LyricLine[] = [];
  const plainLines: LyricLine[] = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip metadata tags like [ar:Artist] or [ti:Title]
    if (/^\[(ar|ti|al|by|offset|length):.*\]$/i.test(trimmed)) {
      continue;
    }

    LRC_TIMESTAMP_RE.lastIndex = 0;
    const timestamps: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = LRC_TIMESTAMP_RE.exec(trimmed)) !== null) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      const fracRaw = match[3] || '0';
      const frac = fracRaw.length === 3 ? parseInt(fracRaw, 10) / 1000 : parseInt(fracRaw, 10) / 100;
      timestamps.push(mins * 60 + secs + frac);
    }

    const cleanText = trimmed.replace(LRC_TIMESTAMP_RE, '').trim();
    if (timestamps.length > 0) {
      for (const ts of timestamps) {
        timedLines.push({
          timeSeconds: Math.round(ts * 100) / 100,
          text: cleanText || '♪',
        });
      }
    } else {
      plainLines.push({
        timeSeconds: null,
        text: trimmed,
      });
    }
  }

  if (timedLines.length > 0) {
    timedLines.sort((a, b) => (a.timeSeconds ?? 0) - (b.timeSeconds ?? 0));
    return { format: 'lrc', lines: timedLines };
  }

  return { format: 'plain', lines: plainLines };
}

export function findActiveLyricIndex(lines: LyricLine[], currentTimeSec: number): number {
  let activeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].timeSeconds;
    if (t === null) continue;
    if (t <= currentTimeSec + 0.15) {
      activeIdx = i;
    } else {
      break;
    }
  }
  return activeIdx;
}

export function searchSavedLyrics(
  records: TrackLyricsRecord[],
  query: string
): TrackLyricsRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return records;
  return records.filter((rec) => rec.rawText.toLowerCase().includes(q));
}
