import type { StorageBreakdown, StorageSectionId, Track } from '../types/music';

export const SECTION_CAPACITY_BYTES = 25 * 1024 * 1024 * 1024; // 25 GB logical target per section
export const TOTAL_CONFIGURED_CAPACITY_BYTES = SECTION_CAPACITY_BYTES * 2; // 50 GB combined target

export interface SequentialAllocationResult {
  section: StorageSectionId | null;
  nextS1UsedBytes: number;
  nextS2UsedBytes: number;
  storageFull: boolean;
}

/**
 * Strict sequential byte-based allocation:
 * 1. Save entire file in Storage 1 while sufficient space remains within its 25 GB limit.
 * 2. When the file does not fit in remaining Storage 1 space, overflow entire file to Storage 2 if it fits.
 * 3. If neither partition can fit the entire file, signal storageFull so importing pauses safely without deleting or splitting files.
 */
export function allocateSequentialStorageSection(params: {
  fileBytes: number;
  s1UsedBytes: number;
  s2UsedBytes: number;
  s1CapacityBytes?: number;
  s2CapacityBytes?: number;
}): SequentialAllocationResult {
  const fileBytes = Math.max(0, params.fileBytes);
  const s1Cap = params.s1CapacityBytes ?? SECTION_CAPACITY_BYTES;
  const s2Cap = params.s2CapacityBytes ?? SECTION_CAPACITY_BYTES;
  const s1Used = Math.max(0, params.s1UsedBytes);
  const s2Used = Math.max(0, params.s2UsedBytes);

  if (s1Used + fileBytes <= s1Cap) {
    return {
      section: 'storage1',
      nextS1UsedBytes: s1Used + fileBytes,
      nextS2UsedBytes: s2Used,
      storageFull: false,
    };
  }

  if (s2Used + fileBytes <= s2Cap) {
    return {
      section: 'storage2',
      nextS1UsedBytes: s1Used,
      nextS2UsedBytes: s2Used + fileBytes,
      storageFull: false,
    };
  }

  return {
    section: null,
    nextS1UsedBytes: s1Used,
    nextS2UsedBytes: s2Used,
    storageFull: true,
  };
}

export type StorageHealthStatus = 'nominal' | 'warning' | 'critical';
export type CombinedAlertLevel = 'nominal' | 'yellow' | 'orange' | 'red';

export interface PartitionChartMetric {
  id: StorageSectionId;
  name: string;
  subtitle: string;
  priorityLabel: string;
  configuredBytes: number;
  usedBytes: number;
  availableBytes: number;
  utilizationPct: number;
  barWidthPct: number;
  trackCount: number;
  averageTrackBytes: number;
  health: StorageHealthStatus;
  healthLabel: string;
}

export interface CombinedStorageMetric {
  totalConfiguredBytes: number;
  audioUsedBytes: number;
  artworkBytes: number;
  combinedUsedWithArtworkBytes: number;
  availableAudioBytes: number;
  audioUtilizationPct: number;
  s1ShareOfConfiguredPct: number;
  s2ShareOfConfiguredPct: number;
  artworkShareOfConfiguredPct: number;
  browserUsageBytes: number | null;
  browserQuotaBytes: number | null;
  browserQuotaPct: number | null;
  persisted: boolean | null;
  totalTrackCount: number;
  artworkCount: number;
  health: StorageHealthStatus;
}

export interface ReactiveStorageWarning {
  combinedUsagePct: number;
  totalUsedBytes: number;
  totalLimitBytes: number;
  storage1RemainingBytes: number;
  storage2RemainingBytes: number;
  totalRemainingBytes: number;
  thresholdPct: number;
  thresholdBytes: number;
  exceedsCombinedThreshold: boolean;
  exceedsAnyPartitionOrQuota: boolean;
  alertLevel: CombinedAlertLevel;
  /** Normalized 0..1 intensity across the 85% -> 100% alert range */
  alertIntensity: number;
  /** Dynamic yellow (hsl 48deg) to red (hsl 0deg) CSS color for >85% usage */
  dynamicAlertHue: number;
  dynamicAlertColor: string;
  statusTitle: string;
  statusDescription: string;
}

export interface FormatDistributionItem {
  format: string;
  totalBytes: number;
  storage1Bytes: number;
  storage2Bytes: number;
  trackCount: number;
  sharePct: number;
  maxRelativePct: number;
}

export function classifyUtilizationHealth(pct: number): {
  health: StorageHealthStatus;
  label: string;
} {
  if (pct >= 85) {
    return { health: 'critical', label: 'Critical (>= 85%)' };
  }
  if (pct >= 70) {
    return { health: 'warning', label: 'High Usage (>= 70%)' };
  }
  return { health: 'nominal', label: 'Nominal' };
}

export function computeStorageDashboardMetrics(breakdown: StorageBreakdown | null): {
  combined: CombinedStorageMetric;
  partitions: [PartitionChartMetric, PartitionChartMetric];
  warning: ReactiveStorageWarning;
} {
  const s1 = breakdown?.storage1;
  const s2 = breakdown?.storage2;

  const s1Configured = s1?.configuredCapacityBytes || SECTION_CAPACITY_BYTES;
  const s2Configured = s2?.configuredCapacityBytes || SECTION_CAPACITY_BYTES;
  const s1Used = s1?.usedBytes ?? 0;
  const s2Used = s2?.usedBytes ?? 0;
  const s1Tracks = s1?.trackCount ?? 0;
  const s2Tracks = s2?.trackCount ?? 0;

  const s1Remaining = Math.max(0, s1Configured - s1Used);
  const s2Remaining = Math.max(0, s2Configured - s2Used);

  const s1Pct = Math.min(100, (s1Used / s1Configured) * 100);
  const s2Pct = Math.min(100, (s2Used / s2Configured) * 100);

  const s1Health = classifyUtilizationHealth(s1Pct);
  const s2Health = classifyUtilizationHealth(s2Pct);

  const partitions: [PartitionChartMetric, PartitionChartMetric] = [
    {
      id: 'storage1',
      name: 'Storage 1',
      subtitle: 'Primary Partition (25 GB Target)',
      priorityLabel: '1st (Default)',
      configuredBytes: s1Configured,
      usedBytes: s1Used,
      availableBytes: s1Remaining,
      utilizationPct: s1Pct,
      barWidthPct: s1Used > 0 ? Math.max(1.5, s1Pct) : 0,
      trackCount: s1Tracks,
      averageTrackBytes: s1Tracks > 0 ? Math.round(s1Used / s1Tracks) : 0,
      health: s1Health.health,
      healthLabel: s1Health.label,
    },
    {
      id: 'storage2',
      name: 'Storage 2',
      subtitle: 'Expansion Partition (25 GB Target)',
      priorityLabel: '2nd (Spillover)',
      configuredBytes: s2Configured,
      usedBytes: s2Used,
      availableBytes: s2Remaining,
      utilizationPct: s2Pct,
      barWidthPct: s2Used > 0 ? Math.max(1.5, s2Pct) : 0,
      trackCount: s2Tracks,
      averageTrackBytes: s2Tracks > 0 ? Math.round(s2Used / s2Tracks) : 0,
      health: s2Health.health,
      healthLabel: s2Health.label,
    },
  ];

  const totalConfiguredBytes =
    breakdown?.totalConfiguredBytes || TOTAL_CONFIGURED_CAPACITY_BYTES;
  const audioUsedBytes = s1Used + s2Used;
  const artworkBytes = breakdown?.artworkBytes ?? 0;
  const combinedUsedWithArtworkBytes = audioUsedBytes + artworkBytes;
  const totalRemainingBytes = s1Remaining + s2Remaining;
  const audioUtilizationPct = Math.min(100, (audioUsedBytes / totalConfiguredBytes) * 100);

  const s1ShareOfConfiguredPct = Math.min(100, (s1Used / totalConfiguredBytes) * 100);
  const s2ShareOfConfiguredPct = Math.min(
    Math.max(0, 100 - s1ShareOfConfiguredPct),
    (s2Used / totalConfiguredBytes) * 100
  );
  const artworkShareOfConfiguredPct = Math.min(
    Math.max(0, 100 - s1ShareOfConfiguredPct - s2ShareOfConfiguredPct),
    (artworkBytes / totalConfiguredBytes) * 100
  );

  const browserUsageBytes = breakdown?.usageBytes ?? null;
  const browserQuotaBytes = breakdown?.quotaBytes ?? null;
  const browserQuotaPct =
    browserUsageBytes !== null && browserQuotaBytes !== null && browserQuotaBytes > 0
      ? Math.min(100, (browserUsageBytes / browserQuotaBytes) * 100)
      : null;

  const combinedHealth = classifyUtilizationHealth(
    Math.max(audioUtilizationPct, browserQuotaPct ?? 0)
  ).health;

  const warning = computeReactiveStorageWarning({
    s1RemainingBytes: s1Remaining,
    s2RemainingBytes: s2Remaining,
    totalUsedBytes: audioUsedBytes,
    totalLimitBytes: totalConfiguredBytes,
    s1Pct,
    s2Pct,
    browserQuotaPct,
  });

  return {
    combined: {
      totalConfiguredBytes,
      audioUsedBytes,
      artworkBytes,
      combinedUsedWithArtworkBytes,
      availableAudioBytes: totalRemainingBytes,
      audioUtilizationPct,
      s1ShareOfConfiguredPct,
      s2ShareOfConfiguredPct,
      artworkShareOfConfiguredPct,
      browserUsageBytes,
      browserQuotaBytes,
      browserQuotaPct,
      persisted: breakdown?.persisted ?? null,
      totalTrackCount: s1Tracks + s2Tracks,
      artworkCount: breakdown?.artworkCount ?? 0,
      health: combinedHealth,
    },
    partitions,
    warning,
  };
}

export function computeReactiveStorageWarning(input: {
  s1RemainingBytes: number;
  s2RemainingBytes: number;
  totalUsedBytes: number;
  totalLimitBytes: number;
  s1Pct: number;
  s2Pct: number;
  browserQuotaPct: number | null;
}): ReactiveStorageWarning {
  const thresholdPct = 85;
  const totalLimitBytes = Math.max(1, input.totalLimitBytes);
  const thresholdBytes = totalLimitBytes * (thresholdPct / 100);
  const totalRemainingBytes = Math.max(0, input.s1RemainingBytes) + Math.max(0, input.s2RemainingBytes);
  const combinedUsagePct = Math.min(100, Math.max(0, (input.totalUsedBytes / totalLimitBytes) * 100));

  const exceedsCombinedThreshold = combinedUsagePct > thresholdPct;
  const exceedsAnyPartitionOrQuota =
    exceedsCombinedThreshold ||
    input.s1Pct >= thresholdPct ||
    input.s2Pct >= thresholdPct ||
    (input.browserQuotaPct !== null && input.browserQuotaPct >= thresholdPct);

  // Map 85% -> 100% linearly into 0 -> 1 alert intensity, shifting hue from 48deg (yellow) to 0deg (red)
  const alertIntensity = exceedsCombinedThreshold
    ? Math.min(1, Math.max(0, (combinedUsagePct - thresholdPct) / (100 - thresholdPct)))
    : 0;
  const dynamicAlertHue = Math.round(48 * (1 - alertIntensity));
  const dynamicAlertColor = exceedsCombinedThreshold
    ? `hsl(${dynamicAlertHue}, 92%, 54%)`
    : 'hsl(152, 65%, 45%)';

  let alertLevel: CombinedAlertLevel = 'nominal';
  let statusTitle = 'Combined Capacity Healthy';
  let statusDescription =
    'Total usage across Storage 1 and Storage 2 is within the 85% combined safety threshold.';

  if (exceedsCombinedThreshold) {
    if (combinedUsagePct >= 95) {
      alertLevel = 'red';
      statusTitle = 'Critical Combined Storage Capacity';
      statusDescription =
        'Combined usage exceeds 95% of your 50 GB dual-partition limit. Free space or remove unused tracks before importing more audio.';
    } else if (combinedUsagePct >= 90) {
      alertLevel = 'orange';
      statusTitle = 'High Combined Storage Pressure';
      statusDescription =
        'Combined usage exceeds 90% of your 50 GB limit across Storage 1 and Storage 2. Remaining space is running low.';
    } else {
      alertLevel = 'yellow';
      statusTitle = 'Combined Storage Threshold Exceeded (>85%)';
      statusDescription =
        'Combined usage across Storage 1 and Storage 2 has crossed 85% of the 50 GB limit.';
    }
  } else if (exceedsAnyPartitionOrQuota) {
    alertLevel = 'yellow';
    statusTitle = 'Single Partition or Browser Quota High';
    statusDescription =
      'Total 50 GB usage is below 85%, but an individual 25 GB partition or browser disk quota has reached 85%.';
  }

  return {
    combinedUsagePct,
    totalUsedBytes: input.totalUsedBytes,
    totalLimitBytes,
    storage1RemainingBytes: Math.max(0, input.s1RemainingBytes),
    storage2RemainingBytes: Math.max(0, input.s2RemainingBytes),
    totalRemainingBytes,
    thresholdPct,
    thresholdBytes,
    exceedsCombinedThreshold,
    exceedsAnyPartitionOrQuota,
    alertLevel,
    alertIntensity,
    dynamicAlertHue,
    dynamicAlertColor,
    statusTitle,
    statusDescription,
  };
}

export function computeFormatStorageBreakdown(tracks: Track[]): FormatDistributionItem[] {
  const localTracks = tracks.filter((t) => t.sourceType === 'local');
  if (localTracks.length === 0) return [];

  const map = new Map<
    string,
    { format: string; totalBytes: number; storage1Bytes: number; storage2Bytes: number; trackCount: number }
  >();

  let totalLocalBytes = 0;

  for (const track of localTracks) {
    const format = (track.format || 'AUDIO').trim().toUpperCase() || 'AUDIO';
    const size = Math.max(0, track.fileSize || 0);
    totalLocalBytes += size;

    let entry = map.get(format);
    if (!entry) {
      entry = {
        format,
        totalBytes: 0,
        storage1Bytes: 0,
        storage2Bytes: 0,
        trackCount: 0,
      };
      map.set(format, entry);
    }

    entry.totalBytes += size;
    entry.trackCount += 1;
    if (track.storageSection === 'storage2') {
      entry.storage2Bytes += size;
    } else {
      entry.storage1Bytes += size;
    }
  }

  const sorted = Array.from(map.values()).sort((a, b) => b.totalBytes - a.totalBytes);
  const maxBytes = sorted[0]?.totalBytes || 1;

  return sorted.map((item) => ({
    ...item,
    sharePct: totalLocalBytes > 0 ? (item.totalBytes / totalLocalBytes) * 100 : 0,
    maxRelativePct: maxBytes > 0 ? (item.totalBytes / maxBytes) * 100 : 0,
  }));
}
