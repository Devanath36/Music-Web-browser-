import type { Track } from '../types/music';

export interface CodecSupportReport {
  id: string;
  label: string;
  mimeTest: string;
  canPlay: 'probably' | 'maybe' | 'unsupported';
  category: 'spatial_licensed' | 'multichannel' | 'stereo_lossless';
  note: string;
}

export interface TrackSpatialClassification {
  kind: 'browser_decodable_atmos' | 'unsupported_atmos_codec' | 'multichannel_spatial' | 'stereo_web_audio_spatial';
  badgeLabel: string;
  headline: string;
  detail: string;
  hasSpatialMetadata: boolean;
  isAtmosContainer: boolean;
}

const ATMOS_PATTERNS = /\b(atmos|dolby\s*atmos|ec-?3|eac3|joc|ac-?4|truehd|mlpa)\b/i;
const MULTICHANNEL_PATTERNS = /\b(5\.1|7\.1|surround|ambisonic|binaural|360\s*reality|spatial)\b/i;

export function detectBrowserSpatialCodecSupport(): CodecSupportReport[] {
  const audio = typeof document !== 'undefined' ? document.createElement('audio') : null;
  const testMime = (mime: string): 'probably' | 'maybe' | 'unsupported' => {
    if (!audio || typeof audio.canPlayType !== 'function') return 'unsupported';
    const res = audio.canPlayType(mime);
    if (res === 'probably') return 'probably';
    if (res === 'maybe') return 'maybe';
    return 'unsupported';
  };

  return [
    {
      id: 'eac3-joc',
      label: 'Dolby Digital Plus / Atmos (E-AC-3 JOC)',
      mimeTest: 'audio/mp4; codecs="ec-3"',
      canPlay: testMime('audio/mp4; codecs="ec-3"'),
      category: 'spatial_licensed',
      note: 'Requires OS/browser-licensed Dolby decoder. Most desktop/Android web browsers return unsupported.',
    },
    {
      id: 'ac4',
      label: 'Dolby AC-4 Spatial',
      mimeTest: 'audio/mp4; codecs="ac-4"',
      canPlay: testMime('audio/mp4; codecs="ac-4"'),
      category: 'spatial_licensed',
      note: 'Next-gen Dolby bitstream; requires platform-licensed AC-4 media pipeline.',
    },
    {
      id: 'truehd',
      label: 'Dolby TrueHD / MLP Lossless Atmos',
      mimeTest: 'audio/mp4; codecs="mlpa"',
      canPlay: testMime('audio/mp4; codecs="mlpa"'),
      category: 'spatial_licensed',
      note: 'Blu-ray/mastering lossless Atmos container; rarely decodable inside standard web browsers.',
    },
    {
      id: 'mpegh',
      label: 'MPEG-H 3D Audio',
      mimeTest: 'audio/mp4; codecs="mhm1"',
      canPlay: testMime('audio/mp4; codecs="mhm1"'),
      category: 'spatial_licensed',
      note: '3D object/scene audio standard; requires native browser/OS decoder support.',
    },
    {
      id: 'opus-mc',
      label: 'Opus (Stereo & Ambisonic WebM/Ogg)',
      mimeTest: 'audio/webm; codecs="opus"',
      canPlay: testMime('audio/webm; codecs="opus"'),
      category: 'multichannel',
      note: 'Open multichannel/ambisonic codec widely supported on modern Chrome, Edge, and Android.',
    },
    {
      id: 'aac',
      label: 'AAC / M4A (Stereo & 5.1 Discrete)',
      mimeTest: 'audio/mp4; codecs="mp4a.40.2"',
      canPlay: testMime('audio/mp4; codecs="mp4a.40.2"'),
      category: 'multichannel',
      note: 'Plays natively via HTML Audio; SONORA Web Audio Spatial Engine enhances stereo output.',
    },
    {
      id: 'flac',
      label: 'FLAC Lossless',
      mimeTest: 'audio/flac',
      canPlay: testMime('audio/flac'),
      category: 'stereo_lossless',
      note: 'Lossless PCM audio processed by SONORA 3D Spatial Engine without Dolby Atmos claim.',
    },
    {
      id: 'mp3',
      label: 'MP3 / WAV Stereo',
      mimeTest: 'audio/mpeg',
      canPlay: testMime('audio/mpeg'),
      category: 'stereo_lossless',
      note: 'Standard stereo audio. Spatial modes apply simulated 3D positioning, width, and reverb.',
    },
  ];
}

export function inspectTrackSpatialMetadata(
  track: Track | null | undefined,
  codecs: CodecSupportReport[] = detectBrowserSpatialCodecSupport()
): TrackSpatialClassification {
  if (!track) {
    return {
      kind: 'stereo_web_audio_spatial',
      badgeLabel: 'Web Audio Spatial Ready',
      headline: 'No track currently loaded',
      detail:
        'Load or play any local track to inspect its codec and spatial audio path. Ordinary stereo files use SONORA Web Audio 3D spatial processing, not licensed Dolby Atmos.',
      hasSpatialMetadata: false,
      isAtmosContainer: false,
    };
  }

  const haystack = `${track.title} ${track.album} ${track.genre} ${track.fileName} ${track.format} ${track.mimeType}`;
  const isAtmosMarker = ATMOS_PATTERNS.test(haystack);
  const isMultiMarker = MULTICHANNEL_PATTERNS.test(haystack);
  const fmtLower = (track.format || '').toLowerCase();
  const mimeLower = (track.mimeType || '').toLowerCase();

  const isEac3OrAc4 =
    /ec-?3|eac3|ac-?4|mlpa|truehd/.test(haystack) ||
    fmtLower === 'ec3' ||
    fmtLower === 'eac3' ||
    fmtLower === 'ac4';

  const eac3Support = codecs.find((c) => c.id === 'eac3-joc')?.canPlay ?? 'unsupported';
  const ac4Support = codecs.find((c) => c.id === 'ac4')?.canPlay ?? 'unsupported';

  if (isEac3OrAc4 || isAtmosMarker) {
    const browserCanDecodeAtmosCodec =
      (fmtLower.includes('ac4') || mimeLower.includes('ac-4') ? ac4Support : eac3Support) !==
      'unsupported';

    if (browserCanDecodeAtmosCodec) {
      return {
        kind: 'browser_decodable_atmos',
        badgeLabel: 'Browser-Decodable Spatial Stream',
        headline: 'Spatial/Atmos-tagged stream compatible with this browser media decoder',
        detail:
          'This file contains Atmos/E-AC-3 metadata and the browser reports native codec support. Note: full Dolby Atmos object rendering depends on your OS and hardware audio endpoint; SONORA is not officially Dolby-certified.',
        hasSpatialMetadata: true,
        isAtmosContainer: true,
      };
    }

    return {
      kind: 'unsupported_atmos_codec',
      badgeLabel: 'Unsupported Atmos Codec in Browser',
      headline: 'Browser cannot natively decode this Dolby Atmos / E-AC-3 / AC-4 bitstream',
      detail:
        'Your current browser lacks a licensed E-AC-3 JOC / AC-4 / TrueHD decoder. If this file is a stereo fallback container, SONORA can play the stereo stream with Web Audio 3D spatial enhancement; raw Atmos bitstreams require a Dolby-licensed OS player.',
      hasSpatialMetadata: true,
      isAtmosContainer: true,
    };
  }

  if (isMultiMarker) {
    return {
      kind: 'multichannel_spatial',
      badgeLabel: 'Spatial-Tagged Audio',
      headline: 'Track metadata indicates surround, binaural, or spatial mastering',
      detail:
        'Decoded via browser audio pipeline and enhanced through SONORA’s Web Audio HRTF 3D spatial processor. This is not licensed Dolby Atmos.',
      hasSpatialMetadata: true,
      isAtmosContainer: false,
    };
  }

  return {
    kind: 'stereo_web_audio_spatial',
    badgeLabel: 'Stereo · Web Audio 3D Spatial',
    headline: `Standard ${track.format || 'Stereo'} audio — Simulated 3D Spatial via Web Audio API`,
    detail:
      'This file is ordinary stereo audio (not Dolby Atmos). When Spatial Audio is enabled, SONORA applies genuine Web Audio Mid/Side widening, HRTF 3D panning, depth delay, and room reverb.',
    hasSpatialMetadata: false,
    isAtmosContainer: false,
  };
}
