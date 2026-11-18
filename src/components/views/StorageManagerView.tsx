import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Download,
  Info,
  Search,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  exportLibraryMetadataJson,
  restoreLibraryBackupJson,
  triggerTextDownload,
} from '../../db/exportBackup';
import { useLibraryStore } from '../../store/useLibraryStore';
import type { StorageSectionId } from '../../types/music';
import { formatBytes } from '../../utils/formatters';
import {
  computeFormatStorageBreakdown,
  computeStorageDashboardMetrics,
} from '../../utils/storageMetrics';
import { StorageUsageDashboard } from '../storage/StorageUsageDashboard';

export const StorageManagerView: React.FC = () => {
  const isLoaded = useLibraryStore((s) => s.isLoaded);
  const tracks = useLibraryStore((s) => s.tracks);
  const storageBreakdown = useLibraryStore((s) => s.storageBreakdown);
  const refreshStorage = useLibraryStore((s) => s.refreshStorage);
  const refreshLibrary = useLibraryStore((s) => s.refreshLibrary);
  const requestPersistStorage = useLibraryStore((s) => s.requestPersistStorage);
  const moveTracksStorage = useLibraryStore((s) => s.moveTracksStorage);
  const setActiveView = useLibraryStore((s) => s.setActiveView);

  const [sectionFilter, setSectionFilter] = useState<'all' | StorageSectionId>('all');
  const [partitionSearch, setPartitionSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const partitionBrowserRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refreshStorage();
  }, [refreshStorage, tracks]);

  const localTracks = useMemo(
    () => tracks.filter((t) => t.sourceType === 'local'),
    [tracks]
  );

  // Reconcile live track sizes reactively so remaining space & warning colors update immediately on any import/delete/move
  const effectiveBreakdown = useMemo(() => {
    if (!storageBreakdown) return null;

    let s1Used = 0;
    let s2Used = 0;
    let s1Count = 0;
    let s2Count = 0;

    for (const t of localTracks) {
      const sz = Math.max(0, t.fileSize || 0);
      if (t.storageSection === 'storage2') {
        s2Used += sz;
        s2Count += 1;
      } else {
        s1Used += sz;
        s1Count += 1;
      }
    }

    const s1Cap = storageBreakdown.storage1.configuredCapacityBytes;
    const s2Cap = storageBreakdown.storage2.configuredCapacityBytes;

    return {
      ...storageBreakdown,
      audioBytes: s1Used + s2Used,
      storage1: {
        ...storageBreakdown.storage1,
        usedBytes: s1Used,
        availableBytes: Math.max(0, s1Cap - s1Used),
        utilizationPct: Math.min(100, (s1Used / s1Cap) * 100),
        trackCount: s1Count,
      },
      storage2: {
        ...storageBreakdown.storage2,
        usedBytes: s2Used,
        availableBytes: Math.max(0, s2Cap - s2Used),
        utilizationPct: Math.min(100, (s2Used / s2Cap) * 100),
        trackCount: s2Count,
      },
    };
  }, [storageBreakdown, localTracks]);

  const dashboard = useMemo(
    () => computeStorageDashboardMetrics(effectiveBreakdown),
    [effectiveBreakdown]
  );

  const formatBreakdown = useMemo(
    () => computeFormatStorageBreakdown(localTracks),
    [localTracks]
  );

  const filteredTracks = useMemo(() => {
    const q = partitionSearch.trim().toLowerCase();
    return localTracks.filter((t) => {
      if (sectionFilter !== 'all' && (t.storageSection || 'storage1') !== sectionFilter) {
        return false;
      }
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        (t.format || '').toLowerCase().includes(q)
      );
    });
  }, [localTracks, sectionFilter, partitionSearch]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleMoveSelected = async (target: StorageSectionId) => {
    if (selectedIds.size === 0 || moving) return;
    setMoving(true);
    try {
      const moved = await moveTracksStorage(Array.from(selectedIds), target);
      setSelectedIds(new Set());
      setStatusMessage(
        `Moved ${moved} ${moved === 1 ? 'track' : 'tracks'} to ${
          target === 'storage1' ? 'Storage 1' : 'Storage 2'
        }. Playlists, favorites, and queue references preserved.`
      );
    } finally {
      setMoving(false);
    }
  };

  const handleMoveSingle = async (trackId: string, currentSection: StorageSectionId) => {
    const target: StorageSectionId = currentSection === 'storage1' ? 'storage2' : 'storage1';
    setMoving(true);
    try {
      await moveTracksStorage([trackId], target);
      setStatusMessage(
        `Moved track to ${target === 'storage1' ? 'Storage 1' : 'Storage 2'} with zero duplicate entries.`
      );
    } finally {
      setMoving(false);
    }
  };

  const handleBalanceHalf = async () => {
    const s1Tracks = localTracks.filter((t) => (t.storageSection || 'storage1') === 'storage1');
    if (s1Tracks.length < 2 || moving) return;
    const halfCount = Math.floor(s1Tracks.length / 2);
    const toMove = s1Tracks.slice(0, halfCount).map((t) => t.id);
    setMoving(true);
    try {
      const moved = await moveTracksStorage(toMove, 'storage2');
      setStatusMessage(`Balanced ${moved} tracks from Storage 1 into Storage 2.`);
    } finally {
      setMoving(false);
    }
  };

  const handleExportBackup = async () => {
    const { json, trackCount, playlistCount } = await exportLibraryMetadataJson();
    const dateStamp = new Date().toISOString().slice(0, 10);
    triggerTextDownload(`sonora-storage-backup-${dateStamp}.json`, json);
    setStatusMessage(`Exported backup with ${trackCount} tracks and ${playlistCount} playlists.`);
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const res = await restoreLibraryBackupJson(text);
      await refreshLibrary();
      setStatusMessage(
        `Restored ${res.restoredPlaylists} playlists and ${res.restoredFavorites} favorites (matched ${res.matchedLocalTracks} local tracks).`
      );
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Failed to restore backup.');
    }
  };

  const { combined, partitions, warning } = dashboard;
  const [p1, p2] = partitions;
  const isDashboardLoading = !isLoaded || !storageBreakdown;

  return (
    <section className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-6 pb-8">
      {/* View Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            Dual Storage Manager
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            50 GB combined logical architecture · 25 GB Storage 1 + 25 GB Storage 2 serving one unified library
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={requestPersistStorage}
            className="inline-flex items-center gap-2 min-h-[38px] px-4 py-2 rounded-xl border border-white/10 bg-[#111216] text-xs font-medium text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-red-400" />
            <span>
              {combined.persisted ? 'Persistent Storage Active' : 'Request Persistence'}
            </span>
          </button>
          <button
            type="button"
            onClick={handleExportBackup}
            className="inline-flex items-center gap-2 min-h-[38px] px-4 py-2 rounded-xl border border-white/10 bg-[#111216] text-xs font-medium text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-red-400" />
            <span>Backup</span>
          </button>
          <button
            type="button"
            onClick={() => restoreInputRef.current?.click()}
            className="inline-flex items-center gap-2 min-h-[38px] px-4 py-2 rounded-xl border border-white/10 bg-[#111216] text-xs font-medium text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Restore</span>
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleRestoreBackup}
          />
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300">
          {statusMessage}
        </div>
      )}

      {/* Detailed Storage Usage Dashboard Component */}
      <StorageUsageDashboard
        isLoading={isDashboardLoading}
        combined={combined}
        partitions={partitions}
        warning={warning}
        formatBreakdown={formatBreakdown}
        sectionFilter={sectionFilter}
        onSelectPartitionFilter={(section) => {
          setSectionFilter(sectionFilter === section ? 'all' : section);
          setSelectedIds(new Set());
        }}
        onBalanceHalf={handleBalanceHalf}
        onScrollToBrowser={() =>
          partitionBrowserRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
        onOpenImport={() => setActiveView('import')}
      />

      {/* Sequential Overflow & Browser Quota Clarification */}
      <div className="rounded-xl border border-white/[0.07] bg-[#0B0C10] px-4 py-3 flex items-start gap-3 text-xs text-gray-400">
        <Info className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <p>
          Imported songs are saved sequentially to Storage 1 (25 GB primary limit) first based on actual file size in bytes, and automatically overflow into Storage 2 (25 GB secondary limit) once Storage 1 lacks space for a song. Individual songs are never split, and importing pauses safely without deleting or overwriting existing music if both partitions reach capacity.
        </p>
      </div>

      {/* Track Partition Browser & Mover */}
      <div
        ref={partitionBrowserRef}
        className="rounded-2xl border border-white/[0.08] bg-[#111216] flex flex-col"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07]">
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'storage1', 'storage2'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setSectionFilter(tab);
                  setSelectedIds(new Set());
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  sectionFilter === tab
                    ? 'bg-red-600 text-white'
                    : 'bg-[#050507] text-gray-400 hover:text-white'
                }`}
              >
                {tab === 'all'
                  ? `All (${localTracks.length})`
                  : tab === 'storage1'
                    ? `Storage 1 (${p1.trackCount})`
                    : `Storage 2 (${p2.trackCount})`}
              </button>
            ))}

            <div className="relative min-w-[190px] sm:w-56">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={partitionSearch}
                onChange={(e) => setPartitionSearch(e.target.value)}
                placeholder="Filter partition tracks..."
                aria-label="Filter partition tracks"
                className="w-full h-8 rounded-lg border border-white/10 bg-[#050507] pl-8 pr-3 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <button
                  type="button"
                  disabled={moving}
                  onClick={() => handleMoveSelected('storage1')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-[#050507] text-xs font-medium text-white hover:bg-white/10 disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-red-400" />
                  <span>Move {selectedIds.size} to Storage 1</span>
                </button>
                <button
                  type="button"
                  disabled={moving}
                  onClick={() => handleMoveSelected('storage2')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-[#050507] text-xs font-medium text-white hover:bg-white/10 disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-red-400" />
                  <span>Move {selectedIds.size} to Storage 2</span>
                </button>
              </>
            )}
            {localTracks.length >= 2 && (
              <button
                type="button"
                disabled={moving}
                onClick={handleBalanceHalf}
                className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                Balance Storage
              </button>
            )}
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto divide-y divide-white/[0.05]">
          {filteredTracks.length === 0 ? (
            <div className="p-10 text-center text-xs text-gray-500">
              {partitionSearch.trim()
                ? 'No tracks match your filter in this storage section.'
                : 'No local tracks in this storage section.'}
            </div>
          ) : (
            filteredTracks.slice(0, 250).map((track) => {
              const sec = track.storageSection || 'storage1';
              const checked = selectedIds.has(track.id);
              return (
                <div
                  key={track.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-white/[0.02]"
                >
                  <label className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(track.id)}
                      className="h-4 w-4 rounded border-white/20 bg-[#050507] accent-red-500 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{track.title}</p>
                      <p className="text-xs text-gray-400 truncate tabular-nums">
                        {track.artist} · {track.format || 'AUDIO'} · {formatBytes(track.fileSize)}
                      </p>
                    </div>
                  </label>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-xs font-mono tabular-nums whitespace-nowrap ${
                        sec === 'storage1' ? 'text-red-400' : 'text-zinc-200'
                      }`}
                    >
                      {sec === 'storage1' ? 'Storage 1' : 'Storage 2'}
                    </span>

                    <button
                      type="button"
                      disabled={moving}
                      onClick={() => handleMoveSingle(track.id, sec)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 whitespace-nowrap shrink-0"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5 text-red-400" />
                      <span>{sec === 'storage1' ? 'Move to S2' : 'Move to S1'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
          {filteredTracks.length > 250 && (
            <p className="px-5 py-3 text-xs text-gray-500 text-center">
              Showing first 250 tracks in manager view ({filteredTracks.length} total).
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
