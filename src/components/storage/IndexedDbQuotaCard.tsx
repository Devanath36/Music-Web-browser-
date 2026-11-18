import React from 'react';
import { Database, HardDrive, ShieldCheck } from 'lucide-react';
import { formatBytes } from '../../utils/formatters';

interface IndexedDbQuotaCardProps {
  isLoading: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
  audioBytes: number;
  artworkBytes: number;
  persisted: boolean | null;
  verifiedBlobCount: number;
  localTrackCount: number;
}

export const IndexedDbQuotaCard: React.FC<IndexedDbQuotaCardProps> = ({
  isLoading,
  usageBytes,
  quotaBytes,
  audioBytes,
  artworkBytes,
  persisted,
  verifiedBlobCount,
  localTrackCount,
}) => {
  const hasEstimate = usageBytes !== null && quotaBytes !== null && quotaBytes > 0;
  const effectiveUsage = usageBytes ?? audioBytes + artworkBytes;
  const effectiveQuota = hasEstimate ? quotaBytes : 0;

  const usagePct = hasEstimate
    ? Math.min(100, (effectiveUsage / effectiveQuota) * 100)
    : 0;
  const remainingBytes = hasEstimate ? Math.max(0, effectiveQuota - effectiveUsage) : null;

  const indexedDbCoreBytes = audioBytes + artworkBytes;
  const otherOriginBytes = Math.max(0, effectiveUsage - indexedDbCoreBytes);

  const audioPct = hasEstimate
    ? Math.min(100, (audioBytes / effectiveQuota) * 100)
    : 0;
  const artworkPct = hasEstimate
    ? Math.min(Math.max(0, 100 - audioPct), (artworkBytes / effectiveQuota) * 100)
    : 0;
  const otherPct = hasEstimate
    ? Math.min(Math.max(0, 100 - audioPct - artworkPct), (otherOriginBytes / effectiveQuota) * 100)
    : 0;

  const visibleAudioPct = audioBytes > 0 && hasEstimate ? Math.max(0.6, audioPct) : 0;
  const visibleArtworkPct = artworkBytes > 0 && hasEstimate ? Math.max(0.4, artworkPct) : 0;
  const visibleOtherPct = otherOriginBytes > 0 && hasEstimate ? Math.max(0.4, otherPct) : 0;

  const isCritical = usagePct >= 90;
  const isWarning = usagePct >= 75 && usagePct < 90;

  return (
    <section
      aria-label="IndexedDB Storage Usage vs Browser Quota"
      className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-red-400 shrink-0" />
            <h2 className="font-display text-base font-semibold text-white">
              IndexedDB Storage Usage vs. Total Quota
            </h2>
          </div>
          <p className="text-xs text-gray-400 tabular-nums">
            <span className="inline-flex items-center gap-1.5 text-gray-200 font-medium">
              <ShieldCheck
                className={`w-3.5 h-3.5 ${persisted ? 'text-emerald-400' : 'text-gray-400'}`}
              />
              {persisted ? 'Persistent Origin Storage' : 'Best-Effort Origin Storage'}
            </span>
            <span aria-hidden="true"> · </span>
            <span>
              {verifiedBlobCount} / {localTrackCount} audio Blobs verified in this browser
            </span>
          </p>
        </div>

        <div className="flex items-baseline gap-3 text-right shrink-0">
          <div>
            <span className="font-mono text-xl font-bold tabular-nums text-white">
              {isLoading ? '--' : formatBytes(effectiveUsage)}
            </span>
            <span className="font-mono text-xs tabular-nums text-gray-400 ml-1.5">
              {hasEstimate ? `/ ${formatBytes(effectiveQuota)}` : 'quota unavailable'}
            </span>
          </div>
          {hasEstimate && (
            <span
              className={`font-mono text-sm font-semibold tabular-nums ${
                isCritical
                  ? 'text-red-400'
                  : isWarning
                    ? 'text-amber-300'
                    : 'text-gray-200'
              }`}
            >
              {usagePct.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Segmented Quota Progress Bar */}
      <div className="space-y-2">
        <div
          role="progressbar"
          aria-label="IndexedDB usage relative to total browser storage quota"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(usagePct * 10) / 10}
          className="h-4 w-full rounded-lg bg-[#050507] border border-white/[0.08] overflow-hidden flex"
        >
          {visibleAudioPct > 0 && (
            <div
              style={{ width: `${visibleAudioPct}%` }}
              title={`IndexedDB Audio Blobs: ${formatBytes(audioBytes)}`}
              className={`h-full transition-[width] duration-300 ${
                isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-400' : 'bg-red-500'
              }`}
            />
          )}
          {visibleArtworkPct > 0 && (
            <div
              style={{ width: `${visibleArtworkPct}%` }}
              title={`IndexedDB Artwork Blobs: ${formatBytes(artworkBytes)}`}
              className="h-full bg-zinc-300 transition-[width] duration-300"
            />
          )}
          {visibleOtherPct > 0 && (
            <div
              style={{ width: `${visibleOtherPct}%` }}
              title={`Metadata, Indexes & Cache: ${formatBytes(otherOriginBytes)}`}
              className="h-full bg-zinc-600 transition-[width] duration-300"
            />
          )}
        </div>

        {/* Text Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1 text-xs">
          <div className="rounded-xl border border-white/[0.06] bg-[#050507] px-3.5 py-2.5">
            <p className="text-gray-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[2px] bg-red-500 shrink-0" aria-hidden="true" />
              <span>Audio Blobs</span>
            </p>
            <p className="font-mono font-semibold tabular-nums text-white mt-1">
              {isLoading ? '--' : formatBytes(audioBytes)}
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-[#050507] px-3.5 py-2.5">
            <p className="text-gray-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[2px] bg-zinc-300 shrink-0" aria-hidden="true" />
              <span>Artwork &amp; Metadata</span>
            </p>
            <p className="font-mono font-semibold tabular-nums text-white mt-1">
              {isLoading ? '--' : formatBytes(artworkBytes + otherOriginBytes)}
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-[#050507] px-3.5 py-2.5">
            <p className="text-gray-400 flex items-center gap-1.5">
              <HardDrive className="w-3 h-3 text-gray-400 shrink-0" />
              <span>Total Browser Quota</span>
            </p>
            <p className="font-mono font-semibold tabular-nums text-white mt-1">
              {isLoading ? '--' : hasEstimate ? formatBytes(effectiveQuota) : 'Unavailable'}
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-[#050507] px-3.5 py-2.5">
            <p className="text-gray-400">Free Quota Remaining</p>
            <p className="font-mono font-semibold tabular-nums text-emerald-400 mt-1">
              {isLoading ? '--' : remainingBytes !== null ? formatBytes(remainingBytes) : 'Unavailable'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
