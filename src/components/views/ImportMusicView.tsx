import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileAudio,
  FolderOpen,
  HardDrive,
  Upload,
  XCircle,
} from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { formatBytes } from '../../utils/formatters';

interface DirHandleLike {
  kind: 'directory' | 'file';
  name: string;
  values?: () => AsyncIterable<DirHandleLike>;
  getFile?: () => Promise<File>;
}

async function collectFilesFromDirectoryHandle(handle: DirHandleLike): Promise<File[]> {
  const files: File[] = [];
  if (!handle.values) return files;
  for await (const entry of handle.values()) {
    if (entry.kind === 'file' && entry.getFile) {
      files.push(await entry.getFile());
    } else if (entry.kind === 'directory') {
      const nested = await collectFilesFromDirectoryHandle(entry);
      files.push(...nested);
    }
  }
  return files;
}

async function collectFilesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file(
        (file) => resolve([file]),
        () => resolve([])
      );
    });
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const allEntries: FileSystemEntry[] = [];
    const readBatch = (): Promise<void> =>
      new Promise((resolve) => {
        reader.readEntries(
          (batch) => {
            if (batch.length === 0) {
              resolve();
            } else {
              allEntries.push(...batch);
              readBatch().then(resolve);
            }
          },
          () => resolve()
        );
      });
    await readBatch();
    const nested: File[] = [];
    for (const child of allEntries) {
      nested.push(...(await collectFilesFromEntry(child)));
    }
    return nested;
  }
  return [];
}

export const ImportMusicView: React.FC = () => {
  const importJob = useLibraryStore((s) => s.importJob);
  const importFiles = useLibraryStore((s) => s.importFiles);
  const resumePausedImport = useLibraryStore((s) => s.resumePausedImport);
  const cancelImport = useLibraryStore((s) => s.cancelImport);
  const resetImportJob = useLibraryStore((s) => s.resetImportJob);
  const storageBreakdown = useLibraryStore((s) => s.storageBreakdown);
  const setActiveView = useLibraryStore((s) => s.setActiveView);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isWorking = importJob.status === 'scanning' || importJob.status === 'importing';

  const codecSupport = useMemo(() => {
    if (typeof document === 'undefined') return [];
    const probe = document.createElement('audio');
    const formats = [
      { label: 'MP3', mime: 'audio/mpeg' },
      { label: 'WAV', mime: 'audio/wav' },
      { label: 'M4A / AAC', mime: 'audio/mp4' },
      { label: 'OGG Vorbis', mime: 'audio/ogg; codecs="vorbis"' },
      { label: 'Opus', mime: 'audio/ogg; codecs="opus"' },
      { label: 'FLAC', mime: 'audio/flac' },
    ];
    return formats.map((f) => ({
      ...f,
      supported: probe.canPlayType(f.mime) !== '',
    }));
  }, []);

  const handleFolderPick = async () => {
    if (isWorking) return;
    const win = window as unknown as { showDirectoryPicker?: () => Promise<DirHandleLike> };
    if (typeof win.showDirectoryPicker === 'function') {
      try {
        const dirHandle = await win.showDirectoryPicker();
        const files = await collectFilesFromDirectoryHandle(dirHandle);
        if (files.length > 0) await importFiles(files);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    folderInputRef.current?.click();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (isWorking) return;

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const entries: FileSystemEntry[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
      if (entries.length > 0) {
        const collected: File[] = [];
        for (const entry of entries) {
          collected.push(...(await collectFilesFromEntry(entry)));
        }
        if (collected.length > 0) {
          await importFiles(collected);
          return;
        }
      }
    }

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      await importFiles(files);
    }
  };

  const progressPct =
    importJob.totalFiles > 0
      ? Math.min(100, Math.round((importJob.processedFiles / importJob.totalFiles) * 100))
      : 0;

  return (
    <section className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-6 pb-8">
      <div className="pb-4 border-b border-white/[0.07]">
        <h1 className="font-display text-2xl font-bold text-white tracking-tight">Import Music</h1>
        <p className="text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed">
          Import individual tracks or complete music folders into local IndexedDB storage. SONORA automatically allocates songs across Storage 1 (25 GB) and Storage 2 (25 GB) while keeping one unified library.
        </p>
      </div>

      {/* Dropzone & Pickers */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!isWorking) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-colors ${
          isDragging
            ? 'border-red-500 bg-red-500/10'
            : 'border-white/15 bg-[#111216] hover:border-white/25'
        }`}
      >
        <div className="mx-auto w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4">
          <Upload className="w-6 h-6" />
        </div>
        <h2 className="font-display text-lg font-semibold text-white">
          Drop audio files or music folders here
        </h2>
        <p className="mt-1.5 text-sm text-gray-400 max-w-md mx-auto">
          Metadata and album art are extracted in a background Web Worker in controlled batches with automatic duplicate detection.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={isWorking}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40 transition-colors"
          >
            <FileAudio className="w-4 h-4" />
            <span>Select Audio Files</span>
          </button>

          <button
            type="button"
            disabled={isWorking}
            onClick={handleFolderPick}
            className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl border border-white/15 bg-[#16171D] text-sm font-medium text-white hover:bg-white/10 disabled:opacity-40 transition-colors"
          >
            <FolderOpen className="w-4 h-4 text-red-400" />
            <span>Select Music Folder</span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac"
          className="hidden"
          onChange={(e) => {
            const list = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = '';
            if (list.length > 0) importFiles(list);
          }}
        />

        <input
          ref={folderInputRef}
          type="file"
          multiple
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          className="hidden"
          onChange={(e) => {
            const list = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = '';
            if (list.length > 0) importFiles(list);
          }}
        />
      </div>

      {/* Live Import Progress */}
      {importJob.status !== 'idle' && (
        <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {isWorking ? (
                <span className="w-4 h-4 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
              ) : importJob.status === 'completed' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : importJob.status === 'paused_storage_full' ? (
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
              ) : importJob.status === 'cancelled' ? (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
              <div>
                <h3 className="font-display text-base font-semibold text-white">
                  {isWorking
                    ? 'Importing into IndexedDB...'
                    : importJob.status === 'paused_storage_full'
                      ? 'Import paused — Both storage partitions are full'
                      : importJob.status === 'completed'
                        ? 'Import complete'
                        : importJob.status === 'cancelled'
                          ? 'Import cancelled'
                          : 'Import finished with errors'}
                </h3>
                {importJob.currentFileName && (
                  <p className="text-xs font-mono text-gray-400 truncate max-w-md">
                    {importJob.currentFileName}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isWorking ? (
                <button
                  type="button"
                  onClick={cancelImport}
                  className="px-3.5 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-xs font-medium text-red-300 hover:bg-red-500/20"
                >
                  Cancel
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={resetImportJob}
                    className="px-3.5 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-300 hover:bg-white/5"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('songs')}
                    className="px-3.5 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
                  >
                    View Library
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="h-2 w-full rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full bg-red-500 transition-[width] duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-gray-400">
              <span>
                {importJob.processedFiles} / {importJob.totalFiles} files ({progressPct}%)
              </span>
              <span>
                Imported: {importJob.importedCount} (S1: {importJob.storage1ImportedCount} · S2: {importJob.storage2ImportedCount}) · Duplicates: {importJob.duplicateCount} · Unsupported: {importJob.unsupportedCount} · Failed: {importJob.failedCount}
              </span>
            </div>
          </div>

          {importJob.storageFull && (
            <div
              role="alert"
              className="rounded-xl border border-yellow-500/45 bg-yellow-500/10 p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="space-y-1 text-xs text-yellow-100">
                <p className="font-semibold text-yellow-300">
                  Storage Full Warning · {importJob.pausedRemainingCount}{' '}
                  {importJob.pausedRemainingCount === 1 ? 'file' : 'files'} paused
                </p>
                <p className="text-yellow-100/80">
                  Both Storage 1 (25 GB) and Storage 2 (25 GB) lack remaining space for the next file. No existing tracks were deleted or overwritten. Free space in Storage Manager, then resume importing.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveView('storage')}
                  className="px-3.5 py-2 rounded-xl border border-yellow-400/35 bg-[#050507] text-xs font-medium text-yellow-200 hover:bg-white/10"
                >
                  Open Storage Manager
                </button>
                {importJob.pausedRemainingCount > 0 && (
                  <button
                    type="button"
                    onClick={resumePausedImport}
                    className="px-3.5 py-2 rounded-xl bg-yellow-400 text-xs font-semibold text-black hover:bg-yellow-300"
                  >
                    Resume Remaining ({importJob.pausedRemainingCount})
                  </button>
                )}
              </div>
            </div>
          )}

          {importJob.quotaExceeded && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-200">
              Browser storage quota reached. Previously completed batches were saved safely. Remove unused tracks or free disk space before importing more audio.
            </div>
          )}

          {importJob.errors.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-[#050507] p-3 max-h-40 overflow-y-auto space-y-1.5">
              <p className="text-xs font-medium text-gray-300">Skipped or failed files:</p>
              {importJob.errors.map((err, idx) => (
                <p key={idx} className="text-xs text-gray-400 font-mono truncate">
                  {err.fileName} — {err.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dual Storage Usage & Codec Support */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-4 h-4 text-red-400" />
              <h3 className="font-display text-sm font-semibold text-white">Dual Storage Allocation</h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('storage')}
              className="text-xs font-medium text-red-400 hover:text-red-300"
            >
              Manage
            </button>
          </div>
          {storageBreakdown ? (
            <div className="space-y-2 text-xs text-gray-400">
              <div className="flex justify-between">
                <span>Storage 1 ({storageBreakdown.storage1.trackCount} tracks)</span>
                <span className="font-mono tabular-nums text-white">
                  {formatBytes(storageBreakdown.storage1.usedBytes)} / 25 GB
                </span>
              </div>
              <div className="flex justify-between">
                <span>Storage 2 ({storageBreakdown.storage2.trackCount} tracks)</span>
                <span className="font-mono tabular-nums text-white">
                  {formatBytes(storageBreakdown.storage2.usedBytes)} / 25 GB
                </span>
              </div>
              {storageBreakdown.quotaBytes !== null && (
                <div className="pt-2 border-t border-white/[0.06] flex justify-between">
                  <span>Browser Quota Available</span>
                  <span className="font-mono tabular-nums text-gray-300">
                    {formatBytes(storageBreakdown.usageBytes)} / {formatBytes(storageBreakdown.quotaBytes)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500">Calculating storage usage...</p>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold text-white">
            Browser Audio Format Support
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {codecSupport.map((c) => (
              <div
                key={c.label}
                className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/[0.06] bg-[#050507]"
              >
                <span className="text-gray-200 font-medium">{c.label}</span>
                <span className={c.supported ? 'text-emerald-400' : 'text-gray-500'}>
                  {c.supported ? 'Ready' : 'No'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
