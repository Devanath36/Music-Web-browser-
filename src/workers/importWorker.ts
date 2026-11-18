import { parseBlob } from 'music-metadata';
import { getFileExtension, parseFallbackFilenameMetadata } from '../utils/formatters';

export interface WorkerAnalyzeRequest {
  id: string;
  file: File;
  mimeType: string;
}

export interface WorkerAnalyzeResult {
  id: string;
  ok: boolean;
  error?: string;
  fingerprint?: string;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  genre?: string;
  year?: number | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  duration?: number;
  format?: string;
  bitrate?: number | null;
  sampleRate?: number | null;
  artworkId?: string | null;
  artworkBlob?: Blob | null;
  artworkMimeType?: string | null;
}

async function computeBufferHash(buffer: ArrayBuffer): Promise<string> {
  if (self.crypto?.subtle) {
    const digest = await self.crypto.subtle.digest('SHA-256', buffer);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  // Fallback FNV-1a 64-bit-like hex if subtle crypto is unavailable
  const view = new Uint8Array(buffer);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < view.length; i++) {
    h1 ^= view[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= view[i] + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

async function computeFileFingerprint(file: File): Promise<string> {
  const CHUNK_SIZE = 65536; // 64 KB head + 64 KB tail
  const headSlice = await file.slice(0, Math.min(CHUNK_SIZE, file.size)).arrayBuffer();
  const tailStart = Math.max(0, file.size - CHUNK_SIZE);
  const tailSlice =
    file.size > CHUNK_SIZE
      ? await file.slice(tailStart, file.size).arrayBuffer()
      : new ArrayBuffer(0);

  const combined = new Uint8Array(headSlice.byteLength + tailSlice.byteLength + 8);
  const sizeView = new DataView(combined.buffer);
  sizeView.setFloat64(0, file.size);
  combined.set(new Uint8Array(headSlice), 8);
  combined.set(new Uint8Array(tailSlice), 8 + headSlice.byteLength);

  const hash = await computeBufferHash(combined.buffer);
  return `${file.size}:${hash.slice(0, 32)}`;
}

self.onmessage = async (event: MessageEvent<WorkerAnalyzeRequest>) => {
  const { id, file, mimeType } = event.data;

  try {
    const fingerprint = await computeFileFingerprint(file);
    const fallback = parseFallbackFilenameMetadata(file.name);
    const ext = getFileExtension(file.name).toUpperCase() || 'AUDIO';

    let title = fallback.title;
    let artist = fallback.artist;
    let album = 'Unknown Album';
    let albumArtist = '';
    let genre = '';
    let year: number | null = null;
    let trackNumber: number | null = fallback.trackNumber;
    let discNumber: number | null = null;
    let duration = 0;
    let format = ext;
    let bitrate: number | null = null;
    let sampleRate: number | null = null;
    let artworkId: string | null = null;
    let artworkBlob: Blob | null = null;
    let artworkMimeType: string | null = null;

    try {
      const metadata = await parseBlob(file, { duration: true, skipCovers: false });
      const { common, format: fmt } = metadata;

      if (common.title?.trim()) title = common.title.trim();
      if (common.artist?.trim()) artist = common.artist.trim();
      if (common.album?.trim()) album = common.album.trim();
      if (common.albumartist?.trim()) albumArtist = common.albumartist.trim();
      else if (artist && artist !== 'Unknown Artist') albumArtist = artist;
      if (common.genre?.[0]?.trim()) genre = common.genre[0].trim();
      if (typeof common.year === 'number' && common.year > 0) year = common.year;
      if (typeof common.track?.no === 'number' && common.track.no > 0) {
        trackNumber = common.track.no;
      }
      if (typeof common.disk?.no === 'number' && common.disk.no > 0) {
        discNumber = common.disk.no;
      }

      if (typeof fmt.duration === 'number' && Number.isFinite(fmt.duration)) {
        duration = fmt.duration;
      }
      if (fmt.container) {
        format = fmt.container.toUpperCase();
      } else if (fmt.codec) {
        format = fmt.codec.toUpperCase();
      }
      if (typeof fmt.bitrate === 'number' && Number.isFinite(fmt.bitrate)) {
        bitrate = fmt.bitrate;
      }
      if (typeof fmt.sampleRate === 'number' && Number.isFinite(fmt.sampleRate)) {
        sampleRate = fmt.sampleRate;
      }

      const picture = common.picture?.[0];
      if (picture && picture.data && picture.data.length > 0) {
        const picBytes = new Uint8Array(picture.data);
        const picMime = picture.format || 'image/jpeg';
        const artHash = await computeBufferHash(picBytes.buffer);
        artworkId = `art_${artHash.slice(0, 24)}`;
        artworkBlob = new Blob([picBytes], { type: picMime });
        artworkMimeType = picMime;
      }
    } catch {
      // Tag parsing failed (e.g. untagged WAV/raw AAC); keep filename fallback metadata
      if (!albumArtist && artist) albumArtist = artist;
    }

    const result: WorkerAnalyzeResult = {
      id,
      ok: true,
      fingerprint,
      title,
      artist,
      album,
      albumArtist: albumArtist || artist,
      genre,
      year,
      trackNumber,
      discNumber,
      duration,
      format: format || mimeType || ext,
      bitrate,
      sampleRate,
      artworkId,
      artworkBlob,
      artworkMimeType,
    };

    self.postMessage(result);
  } catch (err) {
    const result: WorkerAnalyzeResult = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to read audio file',
    };
    self.postMessage(result);
  }
};
