import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import {
  formatBitrate,
  formatBytes,
  formatDuration,
  getFileExtension,
  parseFallbackFilenameMetadata,
} from './formatters';
import {
  allocateSequentialStorageSection,
  computeFormatStorageBreakdown,
  computeReactiveStorageWarning,
  computeStorageDashboardMetrics,
} from './storageMetrics';
import {
  detectShortcutConflicts,
  getEffectiveShortcutBindings,
  resolveKeyboardShortcut,
} from './keyboardShortcuts';
import { materializeAudioBlob, verifyBlobReadable } from './storage';
import { sortTracks } from './trackSort';
import {
  computeUserPreferences,
  pickNextSmartShuffleIndex,
  scoreTrackForSmartShuffle,
} from './smartShuffle';
import { analyzePcmBpmAndKey, computeCrossfaderGains } from './bpmAnalyzer';
import { BUILTIN_DJ_PRESETS, DJ_EFFECT_DEFINITIONS } from './djPresets';
import {
  buildEqualPowerFadeCurves,
  calculateEffectiveCrossfadeDuration,
  clampCrossfadeSeconds,
  DEFAULT_CROSSFADE_SECONDS,
  evaluateCrossfadeDecision,
  resolveTransitionConfig,
} from './crossfadeEngine';
import {
  applyCustomSpatialProfileSettings,
  createCustomSpatialProfile,
  DEFAULT_SPATIAL_AUDIO_SETTINGS,
  getSpatialPresetSettings,
  SPATIAL_MODE_DEFINITIONS,
} from './spatialAudioPresets';
import { inspectTrackSpatialMetadata, type CodecSupportReport } from './spatialCompatibility';
import { computeMidSideMatrixGains, computeSpatialCoordinates } from '../audio/spatialAudioProcessor';
import { generateTrackRecommendations } from './recommendationEngine';
import {
  findActiveLyricIndex,
  formatLrcTimestamp,
  parseLyricsText,
  searchSavedLyrics,
} from './lrcParser';
import { computeListeningAnalytics } from './analyticsEngine';
import { evaluateSmartPlaylist } from './smartPlaylists';
import {
  generatePlaylistM3U8,
  generatePlaylistsJson,
  parseImportedPlaylistJson,
} from '../db/exportBackup';
import { computeMidSideIsolationSample } from '../audio/vocalIsolation';
import { parseVoiceMusicCommand } from './voiceCommandParser';
import type {
  ListeningEventRecord,
  Playlist,
  PlaylistTrack,
  StorageBreakdown,
  Track,
  TrackLyricsRecord,
} from '../types/music';

test('formatDuration handles seconds, minutes, hours, and edge inputs', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(-5), '0:00');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3661), '1:01:01');
});

test('formatBytes formats binary units cleanly', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(25 * 1024 * 1024 * 1024), '25 GB');
});

test('formatBitrate normalizes bps and kbps', () => {
  assert.equal(formatBitrate(320000), '320 kbps');
  assert.equal(formatBitrate(192), '192 kbps');
  assert.equal(formatBitrate(null), '');
});

test('getFileExtension extracts lowercase extensions', () => {
  assert.equal(getFileExtension('Track.FLAC'), 'flac');
  assert.equal(getFileExtension('archive.tar.mp3'), 'mp3');
  assert.equal(getFileExtension('noext'), '');
});

test('parseFallbackFilenameMetadata extracts track numbers, artists, and titles', () => {
  assert.deepEqual(parseFallbackFilenameMetadata('04 - Midnight Drive - Neon Echo.flac'), {
    trackNumber: 4,
    artist: 'Midnight Drive',
    title: 'Neon Echo',
  });
  assert.deepEqual(parseFallbackFilenameMetadata('Solo Track.mp3'), {
    trackNumber: null,
    artist: 'Unknown Artist',
    title: 'Solo Track',
  });
});

test('WebSocket /ws/transfer pairs two peers and relays binary frames', async () => {
  const receiver = new WebSocket('ws://localhost:3000/ws/transfer');
  const sender = new WebSocket('ws://localhost:3000/ws/transfer');

  const nextJson = (ws: WebSocket) =>
    new Promise<Record<string, unknown>>((resolve) => {
      const handler = (raw: WebSocket.RawData, isBinary: boolean) => {
        if (isBinary) return;
        ws.off('message', handler);
        resolve(JSON.parse(raw.toString()));
      };
      ws.on('message', handler);
    });

  await Promise.all([
    new Promise<void>((res) => receiver.once('open', () => res())),
    new Promise<void>((res) => sender.once('open', () => res())),
  ]);

  const createdPromise = nextJson(receiver);
  receiver.send(JSON.stringify({ type: 'session:create', role: 'receiver', deviceName: 'Phone' }));
  const created = await createdPromise;
  assert.equal(created.type, 'session:created');
  const code = String(created.code);
  assert.equal(code.length, 6);

  const peerConnectedPromise = nextJson(receiver);
  const joinedPromise = nextJson(sender);
  sender.send(JSON.stringify({ type: 'session:join', code, role: 'sender', deviceName: 'Laptop' }));
  const [joined, peerConnected] = await Promise.all([joinedPromise, peerConnectedPromise]);
  assert.equal(joined.type, 'session:joined');
  assert.equal(joined.peerConnected, true);
  assert.equal(peerConnected.type, 'peer:connected');

  const binaryPromise = new Promise<Buffer>((resolve) => {
    receiver.once('message', (data, isBinary) => {
      assert.equal(isBinary, true);
      resolve(Buffer.from(data as Buffer));
    });
  });

  const payload = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
  sender.send(payload);
  const received = await binaryPromise;
  assert.deepEqual(received, payload);

  receiver.close();
  sender.close();
});

test('computeStorageDashboardMetrics computes 25 GB partition bars and 50 GB combined indicator', () => {
  const gb = 1024 * 1024 * 1024;
  const s1Used = 22.5 * gb; // 90% of 25 GB -> critical
  const s2Used = 10 * gb; // 40% of 25 GB -> nominal
  const breakdown: StorageBreakdown = {
    usageBytes: 33 * gb,
    quotaBytes: 60 * gb,
    audioBytes: s1Used + s2Used,
    artworkBytes: 0.5 * gb,
    trackCount: 300,
    artworkCount: 40,
    persisted: true,
    totalConfiguredBytes: 50 * gb,
    storage1: {
      id: 'storage1',
      label: 'Storage 1 (Primary)',
      configuredCapacityBytes: 25 * gb,
      usedBytes: s1Used,
      availableBytes: 2.5 * gb,
      utilizationPct: 90,
      trackCount: 200,
    },
    storage2: {
      id: 'storage2',
      label: 'Storage 2 (Expansion)',
      configuredCapacityBytes: 25 * gb,
      usedBytes: s2Used,
      availableBytes: 15 * gb,
      utilizationPct: 40,
      trackCount: 100,
    },
  };

  const result = computeStorageDashboardMetrics(breakdown);
  assert.equal(result.combined.audioUsedBytes, 32.5 * gb);
  assert.equal(result.combined.availableAudioBytes, 17.5 * gb);
  assert.equal(result.combined.audioUtilizationPct, 65);
  assert.equal(result.combined.s1ShareOfConfiguredPct, 45);
  assert.equal(result.combined.s2ShareOfConfiguredPct, 20);
  assert.equal(result.combined.artworkShareOfConfiguredPct, 1);
  assert.equal(result.partitions[0].health, 'critical');
  assert.equal(result.partitions[1].health, 'nominal');
  assert.equal(result.partitions[0].averageTrackBytes, Math.round(s1Used / 200));
});

test('computeFormatStorageBreakdown aggregates local tracks by codec and partition', () => {
  const baseTrack: Omit<Track, 'id' | 'fingerprint' | 'format' | 'fileSize' | 'storageSection' | 'sourceType'> = {
    title: 'Sample',
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    genre: '',
    year: null,
    trackNumber: null,
    discNumber: null,
    duration: 200,
    mimeType: 'audio/flac',
    bitrate: null,
    sampleRate: null,
    fileName: 'sample.flac',
    artworkId: null,
    addedAt: 1,
    playCount: 0,
    lastPlayedAt: null,
  };

  const tracks: Track[] = [
    { ...baseTrack, id: '1', fingerprint: 'a', sourceType: 'local', storageSection: 'storage1', format: 'flac', fileSize: 3000 },
    { ...baseTrack, id: '2', fingerprint: 'b', sourceType: 'local', storageSection: 'storage2', format: 'FLAC', fileSize: 1000 },
    { ...baseTrack, id: '3', fingerprint: 'c', sourceType: 'local', storageSection: 'storage1', format: 'mp3', fileSize: 1000 },
    { ...baseTrack, id: '4', fingerprint: 'd', sourceType: 'remote', storageSection: 'storage1', format: 'mp3', fileSize: 9999 },
  ];

  const breakdown = computeFormatStorageBreakdown(tracks);
  assert.equal(breakdown.length, 2);
  assert.equal(breakdown[0].format, 'FLAC');
  assert.equal(breakdown[0].totalBytes, 4000);
  assert.equal(breakdown[0].storage1Bytes, 3000);
  assert.equal(breakdown[0].storage2Bytes, 1000);
  assert.equal(breakdown[0].sharePct, 80);
  assert.equal(breakdown[1].format, 'MP3');
  assert.equal(breakdown[1].totalBytes, 1000);
});

test('computeReactiveStorageWarning calculates remaining space and yellow-to-red color above 85% of 50 GB', () => {
  const gb = 1024 * 1024 * 1024;
  const total50Gb = 50 * gb;

  // Nominal (80% combined = 40 GB used, 10 GB remaining across partitions)
  const nominal = computeReactiveStorageWarning({
    s1RemainingBytes: 5 * gb,
    s2RemainingBytes: 5 * gb,
    totalUsedBytes: 40 * gb,
    totalLimitBytes: total50Gb,
    s1Pct: 80,
    s2Pct: 80,
    browserQuotaPct: 50,
  });
  assert.equal(nominal.exceedsCombinedThreshold, false);
  assert.equal(nominal.alertLevel, 'nominal');
  assert.equal(nominal.totalRemainingBytes, 10 * gb);

  // Just over 85% (86% = 43 GB used, 7 GB remaining -> yellow)
  const yellow = computeReactiveStorageWarning({
    s1RemainingBytes: 1 * gb,
    s2RemainingBytes: 6 * gb,
    totalUsedBytes: 43 * gb,
    totalLimitBytes: total50Gb,
    s1Pct: 96,
    s2Pct: 76,
    browserQuotaPct: 60,
  });
  assert.equal(yellow.exceedsCombinedThreshold, true);
  assert.equal(yellow.alertLevel, 'yellow');
  assert.equal(yellow.totalRemainingBytes, 7 * gb);
  assert.ok(yellow.dynamicAlertHue >= 40 && yellow.dynamicAlertHue <= 48);

  // Mid-danger 92.5% -> orange transition (hue ~24deg)
  const orange = computeReactiveStorageWarning({
    s1RemainingBytes: 0,
    s2RemainingBytes: 3.75 * gb,
    totalUsedBytes: 46.25 * gb,
    totalLimitBytes: total50Gb,
    s1Pct: 100,
    s2Pct: 85,
    browserQuotaPct: 70,
  });
  assert.equal(orange.exceedsCombinedThreshold, true);
  assert.equal(orange.alertLevel, 'orange');
  assert.equal(orange.dynamicAlertHue, 24);

  // Critical 100% -> red (hue 0deg, 0 remaining)
  const red = computeReactiveStorageWarning({
    s1RemainingBytes: 0,
    s2RemainingBytes: 0,
    totalUsedBytes: 50 * gb,
    totalLimitBytes: total50Gb,
    s1Pct: 100,
    s2Pct: 100,
    browserQuotaPct: 95,
  });
  assert.equal(red.exceedsCombinedThreshold, true);
  assert.equal(red.alertLevel, 'red');
  assert.equal(red.dynamicAlertHue, 0);
  assert.equal(red.totalRemainingBytes, 0);
});

test('allocateSequentialStorageSection enforces strict 25 GB S1->S2 sequential overflow and pauses when full', () => {
  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;
  const s1Cap = 25 * gb;
  const s2Cap = 25 * gb;

  // Simulate 600 songs filling Storage 1 right up to 25 GB (600 * ~42.66 MB, or exact bytes)
  let s1Used = 0;
  let s2Used = 0;
  const perSongBytes = Math.floor(s1Cap / 600);
  for (let i = 1; i <= 600; i++) {
    const res = allocateSequentialStorageSection({
      fileBytes: perSongBytes,
      s1UsedBytes: s1Used,
      s2UsedBytes: s2Used,
      s1CapacityBytes: s1Cap,
      s2CapacityBytes: s2Cap,
    });
    assert.equal(res.section, 'storage1');
    assert.equal(res.storageFull, false);
    s1Used = res.nextS1UsedBytes;
    s2Used = res.nextS2UsedBytes;
  }

  // Song 601 (10 MB) cannot fit in remaining < 600 bytes of Storage 1 -> must overflow entirely to Storage 2
  const song601 = allocateSequentialStorageSection({
    fileBytes: 10 * mb,
    s1UsedBytes: s1Used,
    s2UsedBytes: s2Used,
    s1CapacityBytes: s1Cap,
    s2CapacityBytes: s2Cap,
  });
  assert.equal(song601.section, 'storage2');
  assert.equal(song601.storageFull, false);
  assert.equal(song601.nextS1UsedBytes, s1Used);
  assert.equal(song601.nextS2UsedBytes, 10 * mb);

  // When both Storage 1 and Storage 2 cannot fit the next file, return storageFull without modifying used bytes
  const full = allocateSequentialStorageSection({
    fileBytes: 20 * mb,
    s1UsedBytes: s1Cap - 5 * mb,
    s2UsedBytes: s2Cap - 5 * mb,
    s1CapacityBytes: s1Cap,
    s2CapacityBytes: s2Cap,
  });
  assert.equal(full.section, null);
  assert.equal(full.storageFull, true);
  assert.equal(full.nextS1UsedBytes, s1Cap - 5 * mb);
  assert.equal(full.nextS2UsedBytes, s2Cap - 5 * mb);
});

test('resolveKeyboardShortcut maps Space, Arrow keys, and Q while ignoring form inputs', () => {
  const base = {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    targetTagName: 'BODY',
    isContentEditable: false,
    isFocusVisible: false,
  };

  assert.equal(
    resolveKeyboardShortcut({ ...base, key: ' ', code: 'Space' }),
    'toggle_play_pause'
  );
  assert.equal(
    resolveKeyboardShortcut({ ...base, key: 'ArrowRight', code: 'ArrowRight' }),
    'next_track'
  );
  assert.equal(
    resolveKeyboardShortcut({ ...base, key: 'ArrowLeft', code: 'ArrowLeft' }),
    'prev_track'
  );
  assert.equal(
    resolveKeyboardShortcut({ ...base, key: 'q', code: 'KeyQ' }),
    'toggle_queue'
  );
  assert.equal(
    resolveKeyboardShortcut({ ...base, key: 'Q', code: 'KeyQ', shiftKey: true }),
    'toggle_queue'
  );

  // Ignore inside search/text inputs, textareas, sliders, modifiers, and repeat Space/Q
  assert.equal(
    resolveKeyboardShortcut({ ...base, key: ' ', code: 'Space', targetTagName: 'INPUT' }),
    null
  );
  assert.equal(
    resolveKeyboardShortcut({ ...base, key: 'q', code: 'KeyQ', targetTagName: 'TEXTAREA' }),
    null
  );
  assert.equal(
    resolveKeyboardShortcut({ ...base, key: 'ArrowRight', code: 'ArrowRight', targetRole: 'slider' }),
    null
  );
  assert.equal(
    resolveKeyboardShortcut({ ...base, key: 'q', code: 'KeyQ', ctrlKey: true }),
    null
  );
  assert.equal(
    resolveKeyboardShortcut({ ...base, key: ' ', code: 'Space', targetTagName: 'BUTTON', isFocusVisible: true }),
    null
  );
  // Mouse-focused button (not focus-visible) still allows global Spacebar play/pause
  assert.equal(
    resolveKeyboardShortcut({ ...base, key: ' ', code: 'Space', targetTagName: 'BUTTON', isFocusVisible: false }),
    'toggle_play_pause'
  );
});

test('materializeAudioBlob produces a readable standalone Blob and rejects empty files', async () => {
  const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01, 0x02]);
  const file = new File([bytes], 'track.mp3', { type: '' });
  const blob = await materializeAudioBlob(file, 'audio/mpeg');

  assert.equal(blob instanceof File, false);
  assert.equal(blob.size, bytes.byteLength);
  assert.equal(blob.type, 'audio/mpeg');
  assert.equal(await verifyBlobReadable(blob), true);

  const readBack = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual(readBack, bytes);

  await assert.rejects(
    () => materializeAudioBlob(new Blob([]), 'audio/mpeg'),
    /empty/i
  );
});

test('sortTracks supports A-Z, Z-A, Recently Added, Recently Played, Most Played, Artist, Album, Duration, and File Size', () => {
  const base: Omit<Track, 'id' | 'fingerprint' | 'title' | 'artist' | 'album' | 'addedAt' | 'lastPlayedAt' | 'playCount' | 'duration' | 'fileSize'> = {
    sourceType: 'local',
    storageSection: 'storage1',
    albumArtist: 'Artist',
    genre: '',
    year: null,
    trackNumber: null,
    discNumber: null,
    mimeType: 'audio/mpeg',
    format: 'MP3',
    bitrate: 320,
    sampleRate: 44100,
    fileName: 'track.mp3',
    artworkId: null,
  };

  const t1: Track = { ...base, id: '1', fingerprint: 'f1', title: 'Alpha', artist: 'Zed', album: 'Moon', addedAt: 100, lastPlayedAt: 500, playCount: 2, duration: 300, fileSize: 1000 };
  const t2: Track = { ...base, id: '2', fingerprint: 'f2', title: 'Gamma', artist: 'Amy', album: 'Sun', addedAt: 300, lastPlayedAt: 100, playCount: 10, duration: 120, fileSize: 5000 };
  const t3: Track = { ...base, id: '3', fingerprint: 'f3', title: 'Beta', artist: 'Max', album: 'Dawn', addedAt: 200, lastPlayedAt: 900, playCount: 5, duration: 240, fileSize: 3000 };
  const tracks = [t1, t2, t3];

  assert.deepEqual(sortTracks(tracks, 'title', 'asc').map((t) => t.id), ['1', '3', '2']);
  assert.deepEqual(sortTracks(tracks, 'title', 'desc').map((t) => t.id), ['2', '3', '1']);
  assert.deepEqual(sortTracks(tracks, 'addedAt', 'desc').map((t) => t.id), ['2', '3', '1']);
  assert.deepEqual(sortTracks(tracks, 'lastPlayedAt', 'desc').map((t) => t.id), ['3', '1', '2']);
  assert.deepEqual(sortTracks(tracks, 'playCount', 'desc').map((t) => t.id), ['2', '3', '1']);
  assert.deepEqual(sortTracks(tracks, 'artist', 'asc').map((t) => t.id), ['2', '3', '1']);
  assert.deepEqual(sortTracks(tracks, 'album', 'asc').map((t) => t.id), ['3', '1', '2']);
  assert.deepEqual(sortTracks(tracks, 'duration', 'desc').map((t) => t.id), ['1', '3', '2']);
  assert.deepEqual(sortTracks(tracks, 'fileSize', 'desc').map((t) => t.id), ['2', '3', '1']);
});

test('smartShuffle prioritizes less-frequently heard tracks while respecting user genre/artist affinity', () => {
  const base: Omit<Track, 'id' | 'fingerprint' | 'title' | 'artist' | 'genre' | 'playCount' | 'lastPlayedAt'> = {
    sourceType: 'local',
    storageSection: 'storage1',
    album: 'Album',
    albumArtist: 'Artist',
    year: null,
    trackNumber: null,
    discNumber: null,
    duration: 200,
    mimeType: 'audio/mpeg',
    format: 'MP3',
    bitrate: 320,
    sampleRate: 44100,
    fileSize: 1000,
    fileName: 't.mp3',
    artworkId: null,
    addedAt: 1,
  };

  const now = Date.now();
  const tracks: Track[] = [
    // Heavily played favorite artist/genre seed
    { ...base, id: 'seed', fingerprint: 's', title: 'Seed', artist: 'Nova', genre: 'Synthwave', playCount: 20, lastPlayedAt: now - 5 * 60000 },
    // Unplayed track matching preferred artist & genre -> should score highest
    { ...base, id: 'fresh-match', fingerprint: 'fm', title: 'Fresh Match', artist: 'Nova', genre: 'Synthwave', playCount: 0, lastPlayedAt: null },
    // Unplayed track from unrelated genre/artist -> lower than matching fresh track
    { ...base, id: 'fresh-other', fingerprint: 'fo', title: 'Fresh Other', artist: 'Other', genre: 'Polka', playCount: 0, lastPlayedAt: null },
    // Overplayed track -> lowest
    { ...base, id: 'overplayed', fingerprint: 'op', title: 'Overplayed', artist: 'Nova', genre: 'Synthwave', playCount: 18, lastPlayedAt: now - 10 * 60000 },
  ];

  const favs = new Set<string>(['seed']);
  const prefs = computeUserPreferences(tracks, favs, ['seed']);
  const recentSet = new Set(['seed']);

  const sFreshMatch = scoreTrackForSmartShuffle(tracks[1], prefs, favs, recentSet, now);
  const sFreshOther = scoreTrackForSmartShuffle(tracks[2], prefs, favs, recentSet, now);
  const sOverplayed = scoreTrackForSmartShuffle(tracks[3], prefs, favs, recentSet, now);

  assert.ok(sFreshMatch > sFreshOther);
  assert.ok(sFreshOther > sOverplayed);

  const tracksById = new Map(tracks.map((t) => [t.id, t]));
  const pickedIdx = pickNextSmartShuffleIndex({
    queueTrackIds: tracks.map((t) => t.id),
    currentIndex: 0,
    tracksById,
    allTracks: tracks,
    favoriteIds: favs,
    recentTrackIds: ['seed'],
    now,
    randomFn: () => 0.1,
  });
  assert.equal(pickedIdx, 1);
});

test('analyzePcmBpmAndKey detects synthetic 120 BPM pulse and returns beat interval & key', () => {
  const sampleRate = 22050;
  const durationSec = 10;
  const samples = new Float32Array(sampleRate * durationSec);
  // Synthesize crisp 120 BPM kick pulses (every 0.5 seconds = 11025 samples)
  const beatSamples = Math.round(sampleRate * 0.5);
  for (let beatStart = 0; beatStart < samples.length; beatStart += beatSamples) {
    for (let i = 0; i < 900 && beatStart + i < samples.length; i++) {
      const env = Math.exp(-i / 180);
      samples[beatStart + i] += Math.sin((2 * Math.PI * 80 * i) / sampleRate) * env;
    }
  }

  const analysis = analyzePcmBpmAndKey(samples, sampleRate);
  assert.ok(analysis.bpm >= 118 && analysis.bpm <= 122, `Expected ~120 BPM, got ${analysis.bpm}`);
  assert.ok(analysis.beatIntervalSeconds > 0.45 && analysis.beatIntervalSeconds < 0.55);
  assert.ok(analysis.estimatedKey.length > 0);
});

test('computeCrossfaderGains maintains constant equal-power curve across -1..0..+1', () => {
  const left = computeCrossfaderGains(-1);
  assert.equal(left.gainA, 1);
  assert.equal(left.gainB, 0);

  const center = computeCrossfaderGains(0);
  assert.ok(Math.abs(center.gainA - Math.SQRT1_2) < 0.01);
  assert.ok(Math.abs(center.gainB - Math.SQRT1_2) < 0.01);
  assert.ok(Math.abs(center.gainA * center.gainA + center.gainB * center.gainB - 1) < 0.001);

  const right = computeCrossfaderGains(1);
  assert.equal(right.gainA, 0);
  assert.equal(right.gainB, 1);
});

test('DJ Studio presets and 10 real-time effects definitions match specification', () => {
  const presetNames = BUILTIN_DJ_PRESETS.map((p) => p.name);
  for (const required of [
    'Club Mix',
    'Deep Bass',
    'House Mix',
    'Electronic',
    'Hip-Hop',
    'Chill Mix',
    'Custom DJ Setup',
  ]) {
    assert.ok(presetNames.includes(required), `Missing DJ preset: ${required}`);
  }

  const fxNames = DJ_EFFECT_DEFINITIONS.map((e) => e.id);
  assert.equal(fxNames.length, 10);
  for (const fx of [
    'echo',
    'reverb',
    'delay',
    'flanger',
    'phaser',
    'lowpass',
    'highpass',
    'bassboost',
    'beatrepeat',
    'stutter',
  ]) {
    assert.ok(fxNames.includes(fx as (typeof fxNames)[number]), `Missing DJ effect: ${fx}`);
  }
});

test('Spatial Audio provides all 9 modes and Stereo bypasses spatial processing', () => {
  const modeIds = SPATIAL_MODE_DEFINITIONS.map((m) => m.id);
  assert.equal(modeIds.length, 9);
  for (const required of [
    'stereo',
    'wide_stereo',
    'virtual_surround',
    '3d_spatial',
    'cinema',
    'concert_hall',
    'studio',
    'headphone_spatial',
    'custom',
  ] as const) {
    assert.ok(modeIds.includes(required), `Missing spatial mode: ${required}`);
  }

  const stereo = getSpatialPresetSettings('stereo');
  assert.equal(stereo.enabled, false);
  assert.equal(stereo.mode, 'stereo');
  assert.equal(stereo.spatialWidth, 1.0);
  assert.equal(stereo.reverbIntensity, 0);

  const wide = getSpatialPresetSettings('wide_stereo');
  assert.equal(wide.enabled, true);
  assert.ok(wide.spatialWidth > 1.3);

  const spatial3d = getSpatialPresetSettings('3d_spatial');
  assert.equal(spatial3d.enabled, true);
  assert.ok(spatial3d.depth > 0.5);
});

test('computeSpatialCoordinates and computeMidSideMatrixGains enforce 3D sphere and headroom bounds', () => {
  const center = computeSpatialCoordinates(0, 0, 0);
  assert.ok(Math.abs(center.x) < 1e-6);
  assert.ok(Math.abs(center.y) < 1e-6);
  assert.ok(center.z < 0); // Listener faces -Z

  const right = computeSpatialCoordinates(90, 0, 0.5);
  assert.ok(right.x > 0);
  assert.ok(Math.abs(right.z) < 1e-4);

  const extremeClamped = computeSpatialCoordinates(720, 120, 5);
  const maxValid = computeSpatialCoordinates(180, 45, 1);
  assert.ok(Math.abs(extremeClamped.y - maxValid.y) < 1e-6);

  const neutralMs = computeMidSideMatrixGains(1.0);
  assert.equal(neutralMs.midGain, 1);
  assert.equal(neutralMs.sideGain, 1);

  const wideMs = computeMidSideMatrixGains(2.0);
  assert.equal(wideMs.sideGain, 2.0);
  assert.ok(wideMs.midGain < 1 && wideMs.midGain >= 0.76);
});

test('inspectTrackSpatialMetadata honestly distinguishes standard stereo from Dolby Atmos codecs', () => {
  const baseTrack: Track = {
    id: 't-1',
    fingerprint: 'fp-1',
    sourceType: 'local',
    storageSection: 'storage1',
    title: 'Midnight Echo',
    artist: 'Luna',
    album: 'Nocturne',
    albumArtist: 'Luna',
    genre: 'Electronic',
    year: 2024,
    trackNumber: 1,
    discNumber: 1,
    duration: 210,
    mimeType: 'audio/flac',
    format: 'FLAC',
    bitrate: 1411,
    sampleRate: 44100,
    fileSize: 28_000_000,
    fileName: 'Midnight Echo.flac',
    artworkId: null,
    addedAt: Date.now(),
    playCount: 0,
    lastPlayedAt: null,
  };

  const noAtmosCodecs: CodecSupportReport[] = [
    { id: 'eac3-joc', label: 'E-AC-3 JOC', mimeTest: 'audio/mp4; codecs="ec-3"', canPlay: 'unsupported', category: 'spatial_licensed', note: '' },
    { id: 'ac4', label: 'AC-4', mimeTest: 'audio/mp4; codecs="ac-4"', canPlay: 'unsupported', category: 'spatial_licensed', note: '' },
  ];

  // Ordinary stereo track must NEVER be labeled Dolby Atmos
  const stereoReport = inspectTrackSpatialMetadata(baseTrack, noAtmosCodecs);
  assert.equal(stereoReport.kind, 'stereo_web_audio_spatial');
  assert.equal(stereoReport.isAtmosContainer, false);
  assert.match(stereoReport.detail, /not Dolby Atmos/i);

  // Atmos-tagged track when browser lacks licensed codec -> unsupported_atmos_codec
  const atmosTrack: Track = {
    ...baseTrack,
    id: 't-2',
    title: 'Symphony (Dolby Atmos E-AC-3)',
    fileName: 'Symphony.ec3.mp4',
    format: 'EAC3',
  };
  const unsupportedAtmos = inspectTrackSpatialMetadata(atmosTrack, noAtmosCodecs);
  assert.equal(unsupportedAtmos.kind, 'unsupported_atmos_codec');
  assert.equal(unsupportedAtmos.isAtmosContainer, true);

  // Atmos-tagged track when browser reports decoder support -> browser_decodable_atmos (still non-certified disclaimer)
  const supportedAtmosCodecs: CodecSupportReport[] = [
    { id: 'eac3-joc', label: 'E-AC-3 JOC', mimeTest: 'audio/mp4; codecs="ec-3"', canPlay: 'probably', category: 'spatial_licensed', note: '' },
    { id: 'ac4', label: 'AC-4', mimeTest: 'audio/mp4; codecs="ac-4"', canPlay: 'unsupported', category: 'spatial_licensed', note: '' },
  ];
  const decodableAtmos = inspectTrackSpatialMetadata(atmosTrack, supportedAtmosCodecs);
  assert.equal(decodableAtmos.kind, 'browser_decodable_atmos');
  assert.equal(decodableAtmos.isAtmosContainer, true);
  assert.match(decodableAtmos.detail, /not officially Dolby-certified/i);
});

test('generateTrackRecommendations scores affinity, excludes disliked tracks, and filters by mood', () => {
  const now = Date.now();
  const makeTrack = (over: Partial<Track> & { id: string }): Track => ({
    fingerprint: `fp_${over.id}`,
    sourceType: 'local',
    storageSection: 'storage1',
    title: 'Track',
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    genre: 'Synthwave',
    year: 2024,
    trackNumber: 1,
    discNumber: 1,
    duration: 210,
    mimeType: 'audio/mpeg',
    format: 'MP3',
    bitrate: 320,
    sampleRate: 44100,
    fileSize: 5_000_000,
    fileName: 'track.mp3',
    artworkId: null,
    addedAt: now - 86_400_000,
    playCount: 0,
    skipCount: 0,
    lastPlayedAt: null,
    ...over,
  });

  const tracks: Track[] = [
    makeTrack({ id: 'seed', title: 'Neon Pulse', artist: 'Nova', genre: 'Synthwave', playCount: 15, lastPlayedAt: now - 10_000 }),
    makeTrack({ id: 'gem', title: 'Night Horizon', artist: 'Nova', genre: 'Synthwave', playCount: 0 }),
    makeTrack({ id: 'disliked', title: 'Skip Me', artist: 'Nova', genre: 'Synthwave', playCount: 0 }),
    makeTrack({ id: 'skipped', title: 'Skipped Often', artist: 'Nova', genre: 'Synthwave', playCount: 1, skipCount: 6 }),
    makeTrack({ id: 'chill', title: 'Acoustic Breeze', artist: 'Leaf', genre: 'Acoustic Chill', playCount: 0 }),
  ];

  const recs = generateTrackRecommendations({
    tracks,
    favoriteIds: new Set(['seed']),
    listeningEvents: [],
    feedback: [{ trackId: 'disliked', feedback: 'disliked', updatedAt: now }],
    mood: 'all',
    now,
  });

  const ids = recs.map((r) => r.track.id);
  assert.ok(!ids.includes('disliked'));
  assert.equal(ids[0], 'gem');
  assert.ok(recs.find((r) => r.track.id === 'gem')!.score > recs.find((r) => r.track.id === 'skipped')!.score);

  const chillRecs = generateTrackRecommendations({
    tracks,
    favoriteIds: new Set(['seed']),
    listeningEvents: [],
    feedback: [],
    mood: 'chill',
    now,
  });
  assert.ok(chillRecs.some((r) => r.track.id === 'chill'));
});

test('lrcParser parses synced timestamps, finds active lyric line, formats timestamps, and searches lyrics', () => {
  assert.equal(formatLrcTimestamp(75.5), '[01:15.50]');
  const parsed = parseLyricsText(`[ar:Luna]\n[00:02.00]First line\n[00:10.50][00:25.00]Chorus echo`);
  assert.equal(parsed.format, 'lrc');
  assert.equal(parsed.lines.length, 3);
  assert.equal(parsed.lines[1].text, 'Chorus echo');
  assert.equal(findActiveLyricIndex(parsed.lines, 11), 1);
  assert.equal(findActiveLyricIndex(parsed.lines, 26), 2);

  const plain = parseLyricsText('Line one\nLine two');
  assert.equal(plain.format, 'plain');
  assert.equal(plain.lines.length, 2);

  const records: TrackLyricsRecord[] = [
    { trackId: 't1', rawText: 'Midnight neon stars', format: 'plain', lines: [], source: 'manual', updatedAt: 1 },
    { trackId: 't2', rawText: 'Morning acoustic sky', format: 'plain', lines: [], source: 'manual', updatedAt: 1 },
  ];
  assert.deepEqual(searchSavedLyrics(records, 'neon').map((r) => r.trackId), ['t1']);
});

test('computeListeningAnalytics aggregates totals, streak days, top charts, and time bars', () => {
  const now = new Date('2026-05-10T12:00:00Z').getTime();
  const day0 = new Date(now).toISOString().slice(0, 10);
  const day1 = new Date(now - 86_400_000).toISOString().slice(0, 10);
  const day2 = new Date(now - 2 * 86_400_000).toISOString().slice(0, 10);
  const monthKey = day0.slice(0, 7);

  const track: Track = {
    id: 'a1',
    fingerprint: 'fp_a1',
    sourceType: 'local',
    storageSection: 'storage1',
    title: 'Solaris',
    artist: 'Vega',
    album: 'Orbit',
    albumArtist: 'Vega',
    genre: 'Electronic',
    year: 2025,
    trackNumber: 1,
    discNumber: 1,
    duration: 240,
    mimeType: 'audio/flac',
    format: 'FLAC',
    bitrate: 1000,
    sampleRate: 44100,
    fileSize: 20_000_000,
    fileName: 'Solaris.flac',
    artworkId: null,
    addedAt: now - 10 * 86_400_000,
    playCount: 4,
    lastPlayedAt: now,
  };

  const events: ListeningEventRecord[] = [
    { trackId: 'a1', startedAt: now, durationListenedSec: 180, dayKey: day0, monthKey, skipped: false },
    { trackId: 'a1', startedAt: now - 86_400_000, durationListenedSec: 240, dayKey: day1, monthKey, skipped: false },
    { trackId: 'a1', startedAt: now - 2 * 86_400_000, durationListenedSec: 120, dayKey: day2, monthKey, skipped: false },
  ];

  const summary = computeListeningAnalytics({ tracks: [track], events, now });
  assert.equal(summary.totalSeconds, 540);
  assert.equal(summary.todaySeconds, 180);
  assert.equal(summary.streakDays, 3);
  assert.equal(summary.topArtists[0].artist, 'Vega');
  assert.equal(summary.dailyBars.length, 14);
  assert.equal(summary.monthlyBars.length, 6);
});

test('evaluateSmartPlaylist supports AND/OR multi-condition rules across metadata and favorites', () => {
  const now = Date.now();
  const base: Track = {
    id: '1',
    fingerprint: 'f1',
    sourceType: 'local',
    storageSection: 'storage1',
    title: 'One',
    artist: 'Luna',
    album: 'Night',
    albumArtist: 'Luna',
    genre: 'Electronic',
    year: 2023,
    trackNumber: 1,
    discNumber: 1,
    duration: 180,
    mimeType: 'audio/mpeg',
    format: 'MP3',
    bitrate: 320,
    sampleRate: 44100,
    fileSize: 5_000_000,
    fileName: '1.mp3',
    artworkId: null,
    addedAt: now,
    playCount: 10,
    rating: 5,
    lastPlayedAt: now - 40 * 86_400_000,
  };
  const tracks: Track[] = [
    base,
    { ...base, id: '2', fingerprint: 'f2', title: 'Two', genre: 'Rock', playCount: 1, rating: 2 },
  ];
  const favs = new Set(['1']);

  const andMatched = evaluateSmartPlaylist(
    {
      matchMode: 'all',
      rules: [
        { id: 'r1', field: 'playCount', operator: 'gt', value: '5' },
        { id: 'r2', field: 'isFavorite', operator: 'is', value: 'true' },
        { id: 'r3', field: 'daysSincePlayed', operator: 'gt', value: '30' },
      ],
    },
    tracks,
    favs,
    now
  );
  assert.deepEqual(andMatched.map((t) => t.id), ['1']);

  const orMatched = evaluateSmartPlaylist(
    {
      matchMode: 'any',
      rules: [
        { id: 'r1', field: 'genre', operator: 'contains', value: 'rock' },
        { id: 'r2', field: 'rating', operator: 'eq', value: '5' },
      ],
    },
    tracks,
    favs,
    now
  );
  assert.deepEqual(orMatched.map((t) => t.id), ['1', '2']);
});

test('custom keyboard shortcuts detect conflicts and respect custom rebindings and Shift seek', () => {
  const bindings = getEffectiveShortcutBindings({ toggle_queue: 'Space' });
  const conflicts = detectShortcutConflicts(bindings);
  assert.equal(conflicts.length, 1);
  assert.ok(conflicts[0].actions.includes('toggle_play_pause'));
  assert.ok(conflicts[0].actions.includes('toggle_queue'));

  const base = {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    targetTagName: 'BODY',
    isContentEditable: false,
    isFocusVisible: false,
  };
  assert.equal(
    resolveKeyboardShortcut({ ...base, key: 'ArrowRight', code: 'ArrowRight', shiftKey: true }),
    'seek_forward'
  );
  assert.equal(
    resolveKeyboardShortcut({ ...base, key: 'p', code: 'KeyP' }, { toggle_play_pause: 'P' }),
    'toggle_play_pause'
  );
});

test('M3U8 and SONORA JSON playlist export/import handle matching and missing tracks cleanly', () => {
  const t1: Track = {
    id: 'tr1',
    fingerprint: 'fp_tr1',
    sourceType: 'local',
    storageSection: 'storage1',
    title: 'Horizon',
    artist: 'Sol',
    album: 'Sky',
    albumArtist: 'Sol',
    genre: 'Ambient',
    folderPath: 'Music/Ambient/Horizon.flac',
    year: 2024,
    trackNumber: 1,
    discNumber: 1,
    duration: 205,
    mimeType: 'audio/flac',
    format: 'FLAC',
    bitrate: 900,
    sampleRate: 44100,
    fileSize: 15_000_000,
    fileName: 'Horizon.flac',
    artworkId: null,
    addedAt: 1,
    playCount: 0,
    lastPlayedAt: null,
  };
  const missingTrack: Track = {
    ...t1,
    id: 'tr2',
    fingerprint: 'fp_missing',
    title: 'Ghost',
    artist: 'Phantom',
    fileName: 'Ghost.mp3',
  };

  const m3u8 = generatePlaylistM3U8('Chill Mix', [t1]);
  assert.match(m3u8, /#EXTENC:UTF-8/);
  assert.match(m3u8, /Music\/Ambient\/Horizon\.flac/);

  const pl: Playlist = { id: 'pl1', name: 'Chill Mix', description: 'Calm', createdAt: 1, updatedAt: 1 };
  const pts: PlaylistTrack[] = [
    { playlistId: 'pl1', trackId: 'tr1', position: 0, addedAt: 1 },
    { playlistId: 'pl1', trackId: 'tr2', position: 1, addedAt: 1 },
  ];
  const json = generatePlaylistsJson([pl], pts, [t1, missingTrack]);
  const parsed = parseImportedPlaylistJson(json, [t1]);
  assert.equal(parsed.totalMatched, 1);
  assert.equal(parsed.totalMissing, 1);
  assert.deepEqual(parsed.playlists[0].matchedTrackIds, ['tr1']);
  assert.match(parsed.playlists[0].missingTrackLabels[0], /Ghost/);
});

test('computeMidSideIsolationSample separates center vocals and stereo accompaniment cleanly', () => {
  // Pure center mono signal (L === R === 0.6): instrumental subtraction attenuates strongly
  const [instL, instR] = computeMidSideIsolationSample(0.6, 0.6, 'instrumental', 1);
  assert.ok(Math.abs(instL) < 0.05 && Math.abs(instR) < 0.05);

  // Pure stereo side signal (L = 0.6, R = -0.6): vocal focus attenuates strongly
  const [vocL, vocR] = computeMidSideIsolationSample(0.6, -0.6, 'vocals', 1);
  assert.ok(Math.abs(vocL) < 0.1 && Math.abs(vocR) < 0.1);

  // Original mode preserves exact samples
  assert.deepEqual(computeMidSideIsolationSample(0.4, -0.2, 'original', 1), [0.4, -0.2]);
});

test('parseVoiceMusicCommand parses playback, playlist, search, and volume commands', () => {
  assert.deepEqual(parseVoiceMusicCommand('Play.'), { type: 'play' });
  assert.deepEqual(parseVoiceMusicCommand('Pause music'), { type: 'pause' });
  assert.deepEqual(parseVoiceMusicCommand('Next song!'), { type: 'next' });
  assert.deepEqual(parseVoiceMusicCommand('Play playlist Late Night'), {
    type: 'play_playlist',
    query: 'late night',
  });
  assert.deepEqual(parseVoiceMusicCommand('Play Midnight Echo'), {
    type: 'play_query',
    query: 'midnight echo',
  });
  assert.deepEqual(parseVoiceMusicCommand('volume up'), { type: 'volume_up' });
});

test('crossfadeEngine enforces 0-20s range, 5s default, equal-power energy, short-song clamping, and Repeat One guard', () => {
  assert.equal(DEFAULT_CROSSFADE_SECONDS, 5);
  assert.equal(clampCrossfadeSeconds(-4), 0);
  assert.equal(clampCrossfadeSeconds(35), 20);
  assert.equal(clampCrossfadeSeconds(7), 7);

  const resolvedDefault = resolveTransitionConfig({});
  assert.equal(resolvedDefault.crossfadeSeconds, 5);
  assert.equal(resolvedDefault.crossfadeEnabled, false);
  assert.equal(resolvedDefault.transitionMode, 'gapless');

  const { fadeOutCurve, fadeInCurve } = buildEqualPowerFadeCurves(33);
  assert.equal(fadeOutCurve[0], 1);
  assert.equal(fadeOutCurve[fadeOutCurve.length - 1], 0);
  assert.equal(fadeInCurve[0], 0);
  assert.equal(fadeInCurve[fadeInCurve.length - 1], 1);
  for (let i = 0; i < fadeOutCurve.length; i++) {
    const energy = fadeOutCurve[i] * fadeOutCurve[i] + fadeInCurve[i] * fadeInCurve[i];
    assert.ok(Math.abs(energy - 1) < 0.001, `Equal power violated at step ${i}: ${energy}`);
  }

  // Short-song clamping
  assert.equal(
    calculateEffectiveCrossfadeDuration({
      configuredSeconds: 12,
      currentDuration: 20,
      nextDuration: 180,
    }),
    8
  );
  assert.equal(
    calculateEffectiveCrossfadeDuration({
      configuredSeconds: 10,
      currentDuration: 2.2,
      nextDuration: 180,
    }),
    0
  );

  // Repeat One must NOT crossfade
  const repeatOneDecision = evaluateCrossfadeDecision({
    crossfadeEnabled: true,
    transitionMode: 'crossfade',
    gaplessEnabled: true,
    configuredCrossfadeSeconds: 5,
    repeatMode: 'one',
    currentTime: 177,
    currentDuration: 180,
    nextDuration: 180,
    hasStandbyTrack: true,
    crossfadeInProgress: false,
  });
  assert.equal(repeatOneDecision.action, 'none');

  // Crossfade triggers within 5s window when enabled and standby ready
  const crossfadeDecision = evaluateCrossfadeDecision({
    crossfadeEnabled: true,
    transitionMode: 'crossfade',
    gaplessEnabled: true,
    configuredCrossfadeSeconds: 5,
    repeatMode: 'all',
    currentTime: 176,
    currentDuration: 180,
    nextDuration: 180,
    hasStandbyTrack: true,
    crossfadeInProgress: false,
  });
  assert.equal(crossfadeDecision.action, 'crossfade');
  assert.equal(crossfadeDecision.effectiveCrossfadeSeconds, 5);

  // Gapless triggers tightly near track end when crossfade is OFF
  const gaplessDecision = evaluateCrossfadeDecision({
    crossfadeEnabled: false,
    transitionMode: 'gapless',
    gaplessEnabled: true,
    configuredCrossfadeSeconds: 5,
    repeatMode: 'off',
    currentTime: 179.9,
    currentDuration: 180,
    nextDuration: 180,
    hasStandbyTrack: true,
    crossfadeInProgress: false,
  });
  assert.equal(gaplessDecision.action, 'gapless');
});

test('Custom Spatial Profiles save and restore width, room reverb, tone shaping, and optional 10-band EQ', () => {
  const customSpatial = {
    ...DEFAULT_SPATIAL_AUDIO_SETTINGS,
    enabled: true,
    mode: 'custom' as const,
    spatialWidth: 1.72,
    reverbIntensity: 0.48,
    bassEnhanceDb: 4.5,
    midGainDb: 1.5,
    trebleEnhanceDb: 3.0,
    azimuthDeg: -24,
    elevationDeg: 15,
  };

  const eq = {
    id: 'eq' as const,
    enabled: true,
    preset: 'custom' as const,
    bassGain: 3,
    trebleGain: 2,
    bands: [4, 3, 1, 0, 0, 1, 2, 3, 2, 1],
    updatedAt: Date.now(),
  };

  const profile = createCustomSpatialProfile({
    id: 'prof-night',
    name: 'Late Night Hall',
    spatial: customSpatial,
    equalizer: eq,
    includeEq: true,
  });

  assert.equal(profile.name, 'Late Night Hall');
  assert.equal(profile.spatial.spatialWidth, 1.72);
  assert.equal(profile.spatial.reverbIntensity, 0.48);
  assert.equal(profile.spatial.bassEnhanceDb, 4.5);
  assert.deepEqual(profile.eqSnapshot?.bands, [4, 3, 1, 0, 0, 1, 2, 3, 2, 1]);

  const restored = applyCustomSpatialProfileSettings(profile);
  assert.equal(restored.enabled, true);
  assert.equal(restored.mode, 'custom');
  assert.equal(restored.spatialWidth, 1.72);
  assert.equal(restored.reverbIntensity, 0.48);
  assert.equal(restored.azimuthDeg, -24);
});





