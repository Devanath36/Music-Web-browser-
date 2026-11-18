import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Database,
  HardDrive,
} from 'lucide-react';
import type { StorageSectionId } from '../../types/music';
import { formatBytes } from '../../utils/formatters';
import type {
  CombinedStorageMetric,
  FormatDistributionItem,
  PartitionChartMetric,
  ReactiveStorageWarning,
} from '../../utils/storageMetrics';

const PARTITION_SCALE_TICKS = [25, 20, 15, 10, 5, 0] as const;

interface StorageUsageDashboardProps {
  isLoading: boolean;
  combined: CombinedStorageMetric;
  partitions: [PartitionChartMetric, PartitionChartMetric];
  warning: ReactiveStorageWarning;
  formatBreakdown: FormatDistributionItem[];
  sectionFilter: 'all' | StorageSectionId;
  onSelectPartitionFilter: (section: StorageSectionId) => void;
  onBalanceHalf: () => void;
  onScrollToBrowser: () => void;
  onOpenImport: () => void;
}

export const StorageUsageDashboard: React.FC<StorageUsageDashboardProps> = ({
  isLoading,
  combined,
  partitions,
  warning,
  formatBreakdown,
  sectionFilter,
  onSelectPartitionFilter,
  onBalanceHalf,
  onScrollToBrowser,
  onOpenImport,
}) => {
  const [p1, p2] = partitions;

  const warningStyles =
    warning.alertLevel === 'red'
      ? {
          container: 'border-red-500/60 bg-red-500/12',
          headline: 'text-red-300',
          subtext: 'text-red-100/80',
          action: 'bg-red-600 text-white hover:bg-red-500',
        }
      : warning.alertLevel === 'orange'
        ? {
            container: 'border-orange-500/55 bg-orange-500/12',
            headline: 'text-orange-300',
            subtext: 'text-orange-100/80',
            action: 'bg-orange-500 text-black hover:bg-orange-400',
          }
        : warning.alertLevel === 'yellow'
          ? {
              container: 'border-yellow-500/50 bg-yellow-500/10',
              headline: 'text-yellow-300',
              subtext: 'text-yellow-100/80',
              action: 'bg-yellow-400 text-black hover:bg-yellow-300',
            }
          : {
              container: 'border-white/[0.08] bg-[#111216]',
              headline: 'text-emerald-400',
              subtext: 'text-gray-400',
              action: 'border border-white/10 bg-[#050507] text-gray-200 hover:bg-white/10',
            };

  const visibleCombinedS1Pct =
    p1.usedBytes > 0 ? Math.max(0.8, combined.s1ShareOfConfiguredPct) : 0;
  const visibleCombinedS2Pct =
    p2.usedBytes > 0 ? Math.max(0.8, combined.s2ShareOfConfiguredPct) : 0;
  const visibleCombinedArtPct =
    combined.artworkBytes > 0 ? Math.max(0.5, combined.artworkShareOfConfiguredPct) : 0;

  const overflowActive = p1.utilizationPct >= 99.5 || p2.usedBytes > 0;

  return (
    <div className="space-y-6">
      {/* Reactive Storage Warning Indicator (Remaining Space + Dynamic Yellow-to-Red Alert > 85% of 50 GB) */}
      <section
        role={warning.exceedsAnyPartitionOrQuota ? 'alert' : 'status'}
        aria-live="polite"
        aria-label="Reactive Storage Warning Indicator"
        className={`rounded-2xl border p-4 sm:p-5 space-y-4 transition-colors duration-200 ${warningStyles.container}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="mt-0.5 shrink-0">
              {warning.exceedsAnyPartitionOrQuota ? (
                <AlertTriangle
                  className="w-5 h-5"
                  style={{ color: warning.dynamicAlertColor }}
                />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              )}
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                <h2 className={`font-display text-sm font-semibold ${warningStyles.headline}`}>
                  {warning.statusTitle}
                </h2>
                <span className="font-mono text-xs tabular-nums text-gray-300">
                  {warning.combinedUsagePct.toFixed(1)}% of 50 GB used
                </span>
              </div>
              <p className={`text-xs leading-relaxed ${warningStyles.subtext}`}>
                {warning.statusDescription}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[11px] text-gray-400">Combined Remaining (S1 + S2)</p>
              <p className="font-mono text-base font-bold tabular-nums text-white">
                {isLoading ? '--' : formatBytes(warning.totalRemainingBytes)}
              </p>
            </div>

            {p1.utilizationPct >= 85 && p2.utilizationPct < 85 ? (
              <button
                type="button"
                onClick={onBalanceHalf}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${warningStyles.action}`}
              >
                Move Half to Storage 2
              </button>
            ) : warning.exceedsCombinedThreshold ? (
              <button
                type="button"
                onClick={onScrollToBrowser}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${warningStyles.action}`}
              >
                Manage Tracks
              </button>
            ) : null}
          </div>
        </div>

        {/* Dynamic Yellow-to-Red Threshold Progress & Partition Remaining Readout */}
        <div className="space-y-2 pt-2 border-t border-white/[0.08]">
          <div className="relative h-2.5 w-full rounded-full bg-[#050507] border border-white/[0.08] overflow-hidden">
            {/* 85% threshold marker */}
            <div
              aria-hidden="true"
              style={{ left: '85%' }}
              className="absolute inset-y-0 w-0.5 bg-white/40 z-10 pointer-events-none"
            />
            {warning.exceedsCombinedThreshold ? (
              <div
                className="h-full transition-[width,background] duration-300"
                style={{
                  width: `${warning.combinedUsagePct}%`,
                  background: `linear-gradient(90deg, #EAB308 0%, ${warning.dynamicAlertColor} 100%)`,
                }}
              />
            ) : (
              <div
                className="h-full bg-emerald-500/80 transition-[width] duration-300"
                style={{ width: `${warning.combinedUsagePct}%` }}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-gray-400">
            <span>
              Storage 1 free:{' '}
              <strong className="text-gray-200">
                {formatBytes(warning.storage1RemainingBytes)}
              </strong>{' '}
              · Storage 2 free:{' '}
              <strong className="text-gray-200">
                {formatBytes(warning.storage2RemainingBytes)}
              </strong>
            </span>
            <span>
              85% Alert Threshold: {formatBytes(warning.thresholdBytes)} /{' '}
              {formatBytes(warning.totalLimitBytes)}
            </span>
          </div>
        </div>
      </section>

      {/* Combined Total Progress Indicator (50 GB Target) */}
      <section
        aria-label="Combined Total Storage Indicator"
        className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-red-400" />
              <h2 className="font-display text-base font-semibold text-white">
                Combined Storage Total
              </h2>
            </div>
            <p className="text-xs text-gray-400 tabular-nums">
              {combined.totalTrackCount} local tracks · {combined.artworkCount} cached artworks · Sequential allocation:{' '}
              <span className="text-gray-200 inline-flex items-center gap-1">
                Storage 1 <ArrowRight className="w-3 h-3 inline text-red-400" /> Storage 2
              </span>
              {overflowActive ? ' (Overflow active)' : ''}
            </p>
          </div>

          <div className="flex items-baseline gap-3 text-right">
            <div>
              <span className="font-mono text-2xl font-bold tabular-nums text-white">
                {isLoading ? '--' : formatBytes(combined.audioUsedBytes)}
              </span>
              <span className="font-mono text-xs tabular-nums text-gray-400 ml-1.5">
                / {formatBytes(combined.totalConfiguredBytes)}
              </span>
            </div>
            <span className="font-mono text-sm font-semibold tabular-nums text-red-400">
              {isLoading ? '--%' : `${combined.audioUtilizationPct.toFixed(1)}%`}
            </span>
          </div>
        </div>

        {/* Stacked Combined Progress Indicator (0 - 50 GB) */}
        <div className="space-y-2">
          <div
            role="progressbar"
            aria-label="Combined 50 GB storage utilization"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(combined.audioUtilizationPct * 10) / 10}
            className="relative h-5 w-full rounded-lg bg-[#050507] border border-white/[0.08] overflow-hidden flex"
          >
            {/* 25 GB midpoint marker */}
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-1/2 w-px bg-white/25 z-10 pointer-events-none"
            />
            {visibleCombinedS1Pct > 0 && (
              <div
                style={{ width: `${visibleCombinedS1Pct}%` }}
                title={`Storage 1 Audio: ${formatBytes(p1.usedBytes)}`}
                className="h-full bg-red-500 transition-[width] duration-300"
              />
            )}
            {visibleCombinedS2Pct > 0 && (
              <div
                style={{ width: `${visibleCombinedS2Pct}%` }}
                title={`Storage 2 Audio: ${formatBytes(p2.usedBytes)}`}
                className="h-full bg-zinc-200 transition-[width] duration-300"
              />
            )}
            {visibleCombinedArtPct > 0 && (
              <div
                style={{ width: `${visibleCombinedArtPct}%` }}
                title={`Artwork Cache: ${formatBytes(combined.artworkBytes)}`}
                className="h-full bg-zinc-600 transition-[width] duration-300"
              />
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-gray-500">
            <span>0 GB</span>
            <span>12.5 GB</span>
            <span className="text-gray-300">25 GB (S1 / S2)</span>
            <span>37.5 GB</span>
            <span>50 GB</span>
          </div>
        </div>

        {/* Legend & Breakdown Figures */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-white/[0.06] text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-gray-400">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-red-500 shrink-0" aria-hidden="true" />
              <span>Storage 1 Audio</span>
            </div>
            <p className="font-mono font-semibold tabular-nums text-white">
              {formatBytes(p1.usedBytes)}
              <span className="text-gray-500 font-normal ml-1.5">({p1.trackCount})</span>
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-gray-400">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-zinc-200 shrink-0" aria-hidden="true" />
              <span>Storage 2 Audio</span>
            </div>
            <p className="font-mono font-semibold tabular-nums text-white">
              {formatBytes(p2.usedBytes)}
              <span className="text-gray-500 font-normal ml-1.5">({p2.trackCount})</span>
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-gray-400">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-zinc-600 shrink-0" aria-hidden="true" />
              <span>Artwork Cache</span>
            </div>
            <p className="font-mono font-semibold tabular-nums text-white">
              {formatBytes(combined.artworkBytes)}
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-gray-400">
              <span
                className="w-2.5 h-2.5 rounded-[2px] bg-[#050507] border border-white/20 shrink-0"
                aria-hidden="true"
              />
              <span>Remaining Target</span>
            </div>
            <p className="font-mono font-semibold tabular-nums text-gray-200">
              {formatBytes(combined.availableAudioBytes)}
            </p>
          </div>
        </div>

        {/* Actual Browser Origin Disk Quota Row */}
        <div className="pt-3 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-gray-400">
            <CheckCircle2
              className={`w-4 h-4 shrink-0 ${
                combined.persisted ? 'text-emerald-400' : 'text-gray-500'
              }`}
            />
            <span>
              Browser Origin Disk Quota ·{' '}
              <span className="text-gray-200">
                {combined.persisted ? 'Persistent Storage Granted' : 'Best-Effort Storage'}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3 sm:min-w-[280px]">
            <div className="flex-1 h-2 rounded-full bg-[#050507] border border-white/[0.06] overflow-hidden">
              <div
                className={`h-full transition-[width] duration-300 ${
                  (combined.browserQuotaPct ?? 0) >= 85 ? 'bg-red-500' : 'bg-zinc-300'
                }`}
                style={{ width: `${combined.browserQuotaPct ?? 0}%` }}
              />
            </div>
            <span className="font-mono tabular-nums text-gray-300 whitespace-nowrap shrink-0">
              {combined.browserQuotaBytes !== null && combined.browserUsageBytes !== null
                ? `${formatBytes(combined.browserUsageBytes)} / ${formatBytes(combined.browserQuotaBytes)}`
                : 'Checking quota...'}
            </span>
          </div>
        </div>
      </section>

      {/* Dual 25 GB Partition Bar Charts + Codec Distribution Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left: 25 GB Partition Comparison Bar Chart */}
        <section
          aria-label="25 GB Partition Capacity Bar Chart"
          className="xl:col-span-7 rounded-2xl border border-white/[0.08] bg-[#111216] p-5 flex flex-col justify-between space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-red-400" />
                <h2 className="font-display text-base font-semibold text-white">
                  25 GB Partition Capacity Chart
                </h2>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Used vs. 25 GB configured limit per section · Click a partition to filter tracks below
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-gray-400">
              Alert threshold: 85% (21.25 GB)
            </span>
          </div>

          {/* Vertical Column Capacity Chart (0 - 25 GB Y-Axis) */}
          <div className="relative pt-3 pb-1">
            <div className="flex gap-3">
              {/* Y-Axis Scale */}
              <div className="flex flex-col justify-between h-52 py-0.5 text-[11px] font-mono tabular-nums text-gray-500 select-none shrink-0 text-right w-10">
                {PARTITION_SCALE_TICKS.map((gb) => (
                  <span key={gb}>{gb} GB</span>
                ))}
              </div>

              {/* Plot Area */}
              <div className="relative flex-1 h-52 border-l border-b border-white/10">
                {/* Horizontal Gridlines (0, 5, 10, 15, 20, 25 GB) */}
                {PARTITION_SCALE_TICKS.slice(0, -1).map((gb) => {
                  const bottomPct = (gb / 25) * 100;
                  return (
                    <div
                      key={gb}
                      aria-hidden="true"
                      style={{ bottom: `${bottomPct}%` }}
                      className="absolute inset-x-0 border-t border-white/[0.06] pointer-events-none"
                    />
                  );
                })}

                {/* 85% Warning Reference Line (21.25 GB) */}
                <div
                  aria-hidden="true"
                  style={{ bottom: '85%' }}
                  className="absolute inset-x-0 border-t border-dashed border-red-500/50 pointer-events-none"
                />

                {/* Two 25 GB Partition Columns */}
                <div className="relative z-10 h-full grid grid-cols-2 gap-6 sm:gap-12 px-6 sm:px-12 items-end">
                  {partitions.map((part, idx) => {
                    const isPrimary = idx === 0;
                    const isSelected = sectionFilter === part.id;
                    const barHeightPct = part.usedBytes > 0 ? Math.max(2, part.utilizationPct) : 0;

                    return (
                      <button
                        key={part.id}
                        type="button"
                        onClick={() => onSelectPartitionFilter(part.id)}
                        aria-pressed={isSelected}
                        className="group h-full flex flex-col justify-end items-center focus:outline-none"
                      >
                        {/* Capacity Envelope (25 GB max height) */}
                        <div
                          className={`relative w-full max-w-[112px] h-full rounded-t-lg border transition-colors flex flex-col justify-end overflow-hidden ${
                            isSelected
                              ? 'border-red-500/60 bg-white/[0.04]'
                              : 'border-white/[0.08] bg-[#050507]/80 group-hover:border-white/25'
                          }`}
                        >
                          {/* Top Used Readout inside envelope */}
                          <div className="absolute top-2 inset-x-1 text-center pointer-events-none">
                            <p className="font-mono text-xs font-semibold tabular-nums text-white">
                              {isLoading ? '--' : formatBytes(part.usedBytes)}
                            </p>
                            <p className="font-mono text-[11px] tabular-nums text-gray-400">
                              {isLoading ? '--%' : `${part.utilizationPct.toFixed(1)}%`}
                            </p>
                          </div>

                          {/* Actual Fill Bar */}
                          <div
                            style={{ height: `${barHeightPct}%` }}
                            className={`w-full transition-[height] duration-300 ${
                              part.health === 'critical'
                                ? 'bg-red-500'
                                : isPrimary
                                  ? 'bg-red-500 group-hover:bg-red-400'
                                  : 'bg-zinc-200 group-hover:bg-white'
                            }`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* X-Axis Labels */}
            <div className="flex gap-3 mt-2.5">
              <div className="w-10 shrink-0" />
              <div className="flex-1 grid grid-cols-2 gap-6 sm:gap-12 px-6 sm:px-12 text-center">
                {partitions.map((part) => (
                  <div key={part.id} className="space-y-0.5">
                    <p className="text-xs font-semibold text-white">{part.name} · 25 GB</p>
                    <p className="text-[11px] font-mono tabular-nums text-gray-400">
                      {part.trackCount} {part.trackCount === 1 ? 'track' : 'tracks'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Horizontal Partition Bars & Detailed Telemetry Rows */}
          <div className="pt-4 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-5">
            {partitions.map((part, idx) => {
              const isPrimary = idx === 0;
              return (
                <div key={part.id} className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">{part.subtitle}</span>
                    <span className="font-mono text-xs tabular-nums text-red-400">
                      {part.utilizationPct.toFixed(1)}%
                    </span>
                  </div>

                  {/* Horizontal 25 GB Fill Bar */}
                  <div className="h-2.5 w-full rounded-full bg-[#050507] border border-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full transition-[width] duration-300 ${
                        part.health === 'critical'
                          ? 'bg-red-500'
                          : isPrimary
                            ? 'bg-red-500'
                            : 'bg-zinc-200'
                      }`}
                      style={{ width: `${part.barWidthPct}%` }}
                    />
                  </div>

                  <dl className="space-y-1 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-400">Used / Remaining</dt>
                      <dd className="font-mono tabular-nums text-gray-200">
                        {formatBytes(part.usedBytes)} / {formatBytes(part.availableBytes)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-400">Average Track Size</dt>
                      <dd className="font-mono tabular-nums text-gray-300">
                        {part.trackCount > 0 ? formatBytes(part.averageTrackBytes) : '--'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-400">Priority · Status</dt>
                      <dd className="text-gray-300">
                        {part.priorityLabel} ·{' '}
                        <span
                          className={
                            part.health === 'critical'
                              ? 'text-red-400 font-medium'
                              : part.health === 'warning'
                                ? 'text-amber-300 font-medium'
                                : 'text-emerald-400'
                          }
                        >
                          {part.healthLabel}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right: Audio Format Storage Breakdown Bar Chart */}
        <section
          aria-label="Audio Format Storage Breakdown"
          className="xl:col-span-5 rounded-2xl border border-white/[0.08] bg-[#111216] p-5 flex flex-col justify-between space-y-4"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-red-400" />
                <h2 className="font-display text-base font-semibold text-white">
                  Format Distribution
                </h2>
              </div>
              <span className="text-xs font-mono tabular-nums text-gray-400">
                {formatBreakdown.length} {formatBreakdown.length === 1 ? 'codec' : 'codecs'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Storage consumed per audio format split across Storage 1 and Storage 2
            </p>
          </div>

          {isLoading ? (
            <div className="flex-1 space-y-3 py-4" aria-busy="true">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="space-y-1.5 animate-pulse">
                  <div className="flex justify-between">
                    <div className="h-3 w-16 rounded bg-white/10" />
                    <div className="h-3 w-24 rounded bg-white/10" />
                  </div>
                  <div className="h-2.5 w-full rounded bg-white/[0.06]" />
                </div>
              ))}
            </div>
          ) : formatBreakdown.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4 border border-dashed border-white/[0.08] rounded-xl bg-[#050507]/50">
              <p className="text-sm font-medium text-white">No local audio stored yet</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">
                Import MP3, FLAC, WAV, M4A, AAC, or OGG files to view codec distribution across Storage 1 and Storage 2.
              </p>
              <button
                type="button"
                onClick={onOpenImport}
                className="mt-4 px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500 transition-colors whitespace-nowrap shrink-0"
              >
                Import Music
              </button>
            </div>
          ) : (
            <div className="flex-1 space-y-4 overflow-y-auto max-h-[340px] pr-1">
              {formatBreakdown.map((item) => {
                const s1Pct =
                  item.totalBytes > 0 ? (item.storage1Bytes / item.totalBytes) * 100 : 0;
                const s2Pct =
                  item.totalBytes > 0 ? (item.storage2Bytes / item.totalBytes) * 100 : 0;

                return (
                  <div key={item.format} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="font-mono font-semibold text-white">{item.format}</span>
                        <span className="text-gray-400 tabular-nums truncate">
                          {item.trackCount} {item.trackCount === 1 ? 'track' : 'tracks'}
                        </span>
                      </div>
                      <div className="font-mono tabular-nums text-gray-200 whitespace-nowrap shrink-0">
                        {formatBytes(item.totalBytes)}{' '}
                        <span className="text-gray-500">({item.sharePct.toFixed(0)}%)</span>
                      </div>
                    </div>

                    {/* Relative Scale Horizontal Bar */}
                    <div className="h-2.5 w-full rounded-full bg-[#050507] border border-white/[0.06] overflow-hidden">
                      <div
                        className="h-full flex transition-[width] duration-300"
                        style={{ width: `${Math.max(4, item.maxRelativePct)}%` }}
                      >
                        {item.storage1Bytes > 0 && (
                          <div
                            style={{ width: `${s1Pct}%` }}
                            title={`${item.format} in Storage 1: ${formatBytes(item.storage1Bytes)}`}
                            className="h-full bg-red-500"
                          />
                        )}
                        {item.storage2Bytes > 0 && (
                          <div
                            style={{ width: `${s2Pct}%` }}
                            title={`${item.format} in Storage 2: ${formatBytes(item.storage2Bytes)}`}
                            className="h-full bg-zinc-200"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Legend Footer */}
          <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-gray-400">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-[2px] bg-red-500" aria-hidden="true" />
                <span>Storage 1</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-[2px] bg-zinc-200" aria-hidden="true" />
                <span>Storage 2</span>
              </span>
            </div>
            <span className="font-mono tabular-nums text-gray-500">
              {formatBytes(combined.audioUsedBytes)} total audio
            </span>
          </div>
        </section>
      </div>
    </div>
  );
};
