import React, { useMemo, useState } from 'react';
import { CheckSquare, RotateCcw, Square, Trash2 } from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { formatBytes, formatDuration } from '../../utils/formatters';
import { ArtworkThumb } from '../library/ArtworkThumb';
import { ConfirmDialog } from '../library/ConfirmDialog';

export const RecentlyDeletedView: React.FC = () => {
  const deletedTracks = useLibraryStore((s) => s.deletedTracks);
  const settings = useLibraryStore((s) => s.settings);
  const updateAppSettings = useLibraryStore((s) => s.updateAppSettings);
  const restoreDeletedTracks = useLibraryStore((s) => s.restoreDeletedTracks);
  const permanentlyDeleteTracks = useLibraryStore((s) => s.permanentlyDeleteTracks);
  const emptyTrash = useLibraryStore((s) => s.emptyTrash);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmPermanentIds, setConfirmPermanentIds] = useState<string[] | null>(null);
  const [confirmEmptyAll, setConfirmEmptyAll] = useState(false);

  const retentionDays = settings.deletedRetentionDays ?? 30;
  const totalTrashBytes = useMemo(
    () => deletedTracks.reduce((sum, t) => sum + (t.fileSize || 0), 0),
    [deletedTracks]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            Recently Deleted
          </h1>
          <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
            {deletedTracks.length} {deletedTracks.length === 1 ? 'track' : 'tracks'} ·{' '}
            {formatBytes(totalTrashBytes)} recoverable · Auto-purges after {retentionDays} days
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-gray-400 border border-white/10 rounded-xl px-3 py-1.5 bg-[#0B0C10]">
            <span>Retention:</span>
            <select
              value={retentionDays}
              onChange={(e) =>
                updateAppSettings({ deletedRetentionDays: parseInt(e.target.value, 10) })
              }
              className="bg-transparent text-white font-mono focus:outline-none"
            >
              <option value={7} className="bg-[#111216]">7 days</option>
              <option value={14} className="bg-[#111216]">14 days</option>
              <option value={30} className="bg-[#111216]">30 days</option>
              <option value={60} className="bg-[#111216]">60 days</option>
            </select>
          </label>

          {selectedIds.size > 0 && (
            <>
              <button
                type="button"
                onClick={async () => {
                  const ids = Array.from(selectedIds);
                  setSelectedIds(new Set());
                  await restoreDeletedTracks(ids);
                }}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore ({selectedIds.size})</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmPermanentIds(Array.from(selectedIds))}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-xl border border-red-500/40 bg-red-600/20 text-xs font-semibold text-red-200 hover:bg-red-600/35"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Permanently</span>
              </button>
            </>
          )}

          {deletedTracks.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmEmptyAll(true)}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-xl border border-white/10 text-xs font-medium text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Empty Trash</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-4 space-y-2">
        {deletedTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-white/[0.08] rounded-2xl bg-[#0B0C10]/80">
            <Trash2 className="w-10 h-10 text-gray-600 mb-3" />
            <p className="font-display text-lg font-semibold text-white">Trash is empty</p>
            <p className="mt-1.5 max-w-md text-sm text-gray-400">
              Songs removed from your library stay here for {retentionDays} days so you can restore them safely before permanent deletion.
            </p>
          </div>
        ) : (
          deletedTracks.map((track) => {
            const deletedMs = track.deletedAt || Date.now();
            const daysRemaining = Math.max(
              0,
              Math.ceil((deletedMs + retentionDays * 86_400_000 - Date.now()) / 86_400_000)
            );
            const checked = selectedIds.has(track.id);

            return (
              <div
                key={track.id}
                className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#111216] px-3.5 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => toggleSelect(track.id)}
                    aria-label={`Select ${track.title}`}
                    className="p-1 text-gray-400 hover:text-white"
                  >
                    {checked ? (
                      <CheckSquare className="w-4 h-4 text-red-500" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                  <ArtworkThumb
                    artworkId={track.artworkId}
                    alt={track.album}
                    sizeClass="w-10 h-10"
                    sourceType={track.sourceType}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{track.title}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {track.artist} · {formatDuration(track.duration)} · {formatBytes(track.fileSize)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono tabular-nums text-gray-500">
                    {daysRemaining}d left
                  </span>
                  <button
                    type="button"
                    onClick={() => restoreDeletedTracks([track.id])}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restore</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmPermanentIds([track.id])}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Erase</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={!!confirmPermanentIds}
        title="Permanently Delete Tracks"
        message={`Permanently erase ${confirmPermanentIds?.length || 0} track(s) and free IndexedDB audio storage? This cannot be undone.`}
        confirmLabel="Delete Permanently"
        onCancel={() => setConfirmPermanentIds(null)}
        onConfirm={async () => {
          if (confirmPermanentIds) {
            const ids = confirmPermanentIds;
            setConfirmPermanentIds(null);
            setSelectedIds(new Set());
            await permanentlyDeleteTracks(ids);
          }
        }}
      />

      <ConfirmDialog
        open={confirmEmptyAll}
        title="Empty Recently Deleted"
        message={`Permanently erase all ${deletedTracks.length} track(s) in Trash and reclaim ${formatBytes(totalTrashBytes)}?`}
        confirmLabel="Empty Trash"
        onCancel={() => setConfirmEmptyAll(false)}
        onConfirm={async () => {
          setConfirmEmptyAll(false);
          setSelectedIds(new Set());
          await emptyTrash();
        }}
      />
    </section>
  );
};
