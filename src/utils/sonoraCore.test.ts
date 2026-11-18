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
import type { StorageBreakdown, Track } from '../types/music';

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
