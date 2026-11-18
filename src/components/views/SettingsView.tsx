import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  HardDrive,
  Headphones,
  Info,
  Radio,
  ShieldCheck,
  Smartphone,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  exportLibraryMetadataJson,
  restoreLibraryBackupJson,
  triggerTextDownload,
} from '../../db/exportBackup';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useLibraryStore } from '../../store/useLibraryStore';
import type { PlaybackRestorePolicy } from '../../types/music';
import { formatBytes } from '../../utils/formatters';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

const RESTORE_POLICIES: {
  id: PlaybackRestorePolicy;
  label: string;
  desc: string;
}[] = [
  {
    id: 'ask_user',
    label: 'Ask me when reopening',
    desc: 'Show a quick prompt to resume your previous track, restore the queue, or start fresh.',
  },
  {
    id: 'resume_position',
    label: 'Load last track & position',
    desc: 'Preload the previous song at its saved timestamp (paused until you tap Play).',
  },
  {
    id: 'restore_queue',
    label: 'Restore queue only',
    desc: 'Keep your playback queue ready without preloading audio.',
  },
  {
    id: 'library_only',
    label: 'Open library clean',
    desc: 'Open directly to your music library without restoring the previous queue.',
  },
];

export const SettingsView: React.FC = () => {
  const settings = useLibraryStore((s) => s.settings);
  const storageBreakdown = useLibraryStore((s) => s.storageBreakdown);
  const setNetworkMode = useLibraryStore((s) => s.setNetworkMode);
  const setPlaybackRestorePolicy = useLibraryStore((s) => s.setPlaybackRestorePolicy);
  const requestPersistStorage = useLibraryStore((s) => s.requestPersistStorage);
  const refreshStorage = useLibraryStore((s) => s.refreshStorage);
  const refreshLibrary = useLibraryStore((s) => s.refreshLibrary);
  const setActiveView = useLibraryStore((s) => s.setActiveView);

  const isDeviceOnline = useOnlineStatus();
  const { isInstalled } = usePWAInstall();

  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [swActive, setSwActive] = useState<boolean>(false);
  const [persistFeedback, setPersistFeedback] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  useEffect(() => {
    refreshStorage();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => setSwActive(!!reg?.active || !!navigator.serviceWorker.controller))
        .catch(() => {});
    }
  }, [refreshStorage]);

  const hasMediaSession = typeof navigator !== 'undefined' && 'mediaSession' in navigator;

  const handleRequestPersist = async () => {
    const granted = await requestPersistStorage();
    setPersistFeedback(
      granted
        ? 'Persistent storage granted — browser will protect your library from automatic eviction.'
        : 'Browser declined or already manages persistence automatically.'
    );
  };

  const handleExportBackup = async () => {
    const { json, trackCount, playlistCount } = await exportLibraryMetadataJson();
    const dateStamp = new Date().toISOString().slice(0, 10);
    triggerTextDownload(`sonora-library-backup-${dateStamp}.json`, json);
    setBackupMessage(`Exported ${trackCount} track records and ${playlistCount} playlists.`);
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const res = await restoreLibraryBackupJson(text);
      await refreshLibrary();
      setBackupMessage(
        `Restored ${res.restoredPlaylists} playlists, ${res.restoredFavorites} favorites, and ${res.restoredRemoteStreams} remote streams (matched ${res.matchedLocalTracks} local tracks).`
      );
    } catch (err) {
      setBackupMessage(err instanceof Error ? err.message : 'Failed to read backup file.');
    }
  };

  const quotaPct =
    storageBreakdown?.usageBytes && storageBreakdown?.quotaBytes
      ? Math.min(
          100,
          Math.round((storageBreakdown.usageBytes / storageBreakdown.quotaBytes) * 100)
        )
      : 0;

  return (
    <section className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-6 pb-8">
      <div className="pb-4 border-b border-white/[0.07]">
        <h1 className="font-display text-2xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-xs text-gray-400 mt-1">
          Playback restoration policy, Online/Offline mode, local IndexedDB storage, and Android background diagnostics.
        </p>
      </div>

      {/* Mode & Playback Section */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111216] divide-y divide-white/[0.06]">
        <div className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 max-w-lg">
            <div className="flex items-center gap-2">
              {settings.networkMode === 'online' ? (
                <Wifi className="w-4 h-4 text-emerald-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-400" />
              )}
              <h2 className="font-display text-base font-semibold text-white">
                Online / Offline Mode
              </h2>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Offline Mode plays strictly from local IndexedDB with zero network requests. Online Mode also enables remote audio stream URLs and Wi-Fi pairing. Switching modes preserves your queue and local music.
            </p>
          </div>

          <div className="inline-flex items-center rounded-xl border border-white/10 bg-[#050507] p-1">
            <button
              type="button"
              onClick={() => setNetworkMode('offline')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                settings.networkMode === 'offline'
                  ? 'bg-red-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline</span>
            </button>
            <button
              type="button"
              onClick={() => setNetworkMode('online')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                settings.networkMode === 'online'
                  ? 'bg-emerald-500 text-[#050507]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Online</span>
            </button>
          </div>
        </div>

        {/* Configurable Playback Restoration Policy (Section 13) */}
        <div className="p-5 space-y-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-white">
              Reopen &amp; Playback Restoration Behavior
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Choose how SONORA behaves when reopened after closing the browser or restarting your device.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {RESTORE_POLICIES.map((opt) => {
              const active = settings.playbackRestorePolicy === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPlaybackRestorePolicy(opt.id)}
                  className={`rounded-xl border p-3.5 text-left transition-colors ${
                    active
                      ? 'border-red-500/70 bg-red-600/10'
                      : 'border-white/[0.07] bg-[#050507] hover:border-white/15'
                  }`}
                >
                  <p className={`text-xs font-semibold ${active ? 'text-red-400' : 'text-white'}`}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Storage & Persistence */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-4 h-4 text-red-400" />
            <h2 className="font-display text-base font-semibold text-white">
              Dual Storage &amp; Persistence
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveView('storage')}
              className="min-h-[38px] px-3.5 py-2 rounded-xl border border-white/10 bg-[#050507] text-xs font-medium text-white hover:bg-white/10"
            >
              Open Storage Manager
            </button>
            <button
              type="button"
              onClick={handleRequestPersist}
              className="inline-flex items-center gap-2 min-h-[38px] px-3.5 py-2 rounded-xl border border-white/10 bg-[#050507] text-xs font-medium text-white hover:bg-white/10"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-red-400" />
              <span>
                {storageBreakdown?.persisted
                  ? 'Persistent Storage Active'
                  : 'Request Persistent Storage'}
              </span>
            </button>
          </div>
        </div>

        {storageBreakdown && (
          <div className="space-y-2.5">
            <div className="h-2 w-full rounded-full bg-white/[0.08] overflow-hidden">
              <div className="h-full bg-red-500" style={{ width: `${quotaPct}%` }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
              <div className="rounded-xl border border-white/[0.06] bg-[#050507] p-3">
                <p className="text-gray-400">Storage 1 + 2 Audio</p>
                <p className="font-mono tabular-nums text-sm font-semibold text-white mt-1">
                  {formatBytes(storageBreakdown.audioBytes)} ({storageBreakdown.trackCount} tracks)
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#050507] p-3">
                <p className="text-gray-400">Artwork Cache</p>
                <p className="font-mono tabular-nums text-sm font-semibold text-white mt-1">
                  {formatBytes(storageBreakdown.artworkBytes)} ({storageBreakdown.artworkCount} covers)
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#050507] p-3">
                <p className="text-gray-400">Browser Storage Quota</p>
                <p className="font-mono tabular-nums text-sm font-semibold text-white mt-1">
                  {storageBreakdown.quotaBytes !== null
                    ? `${formatBytes(storageBreakdown.usageBytes)} / ${formatBytes(storageBreakdown.quotaBytes)}`
                    : 'Unavailable'}
                </p>
              </div>
            </div>
          </div>
        )}

        {persistFeedback && <p className="text-xs text-red-300">{persistFeedback}</p>}
      </div>

      {/* Backup & Export */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold text-white">
            Library Backup &amp; Export
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Export your playlists, favorites, equalizer settings, remote streams, and track metadata as JSON. Local audio files stay on this device and relink by fingerprint during restore.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportBackup}
            className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-white/10 text-xs font-semibold text-white hover:bg-white/15"
          >
            <Download className="w-4 h-4 text-red-400" />
            <span>Export Library Backup (.json)</span>
          </button>

          <button
            type="button"
            onClick={() => restoreInputRef.current?.click()}
            className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-200 hover:bg-white/5"
          >
            <Upload className="w-4 h-4" />
            <span>Restore Backup (.json)</span>
          </button>

          <input
            ref={restoreInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleRestoreFile}
          />
        </div>

        {backupMessage && <p className="text-xs text-emerald-400">{backupMessage}</p>}
      </div>

      {/* Background Audio Playback & PWA Diagnostics */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Headphones className="w-4 h-4 text-red-400" />
            <h2 className="font-display text-base font-semibold text-white">
              Background Playback &amp; PWA Status
            </h2>
          </div>
          <PWAInstallButton />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl border border-white/[0.06] bg-[#050507] p-3">
            <p className="text-gray-400">Media Session API</p>
            <p className={`mt-1 font-medium flex items-center gap-1.5 ${hasMediaSession ? 'text-emerald-400' : 'text-red-400'}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{hasMediaSession ? 'Supported' : 'Unavailable'}</span>
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-[#050507] p-3">
            <p className="text-gray-400">Offline App Shell (SW)</p>
            <p className={`mt-1 font-medium flex items-center gap-1.5 ${swActive ? 'text-emerald-400' : 'text-gray-300'}`}>
              <Smartphone className="w-3.5 h-3.5" />
              <span>{swActive ? 'Active & Cached' : 'Registering'}</span>
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-[#050507] p-3">
            <p className="text-gray-400">Install Mode</p>
            <p className="mt-1 font-medium text-white">
              {isInstalled ? 'Installed Standalone PWA' : 'Browser Tab'}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-[#050507] p-3">
            <p className="text-gray-400">Device Connectivity</p>
            <p className={`mt-1 font-medium ${isDeviceOnline ? 'text-emerald-400' : 'text-red-400'}`}>
              {isDeviceOnline ? 'Network Connected' : 'Offline'}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-[#050507] p-4 flex items-start gap-3 text-xs text-gray-300 leading-relaxed">
          <Info className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <p className="font-medium text-white">
              Android Lock-Screen &amp; Bluetooth Headphone Behavior
            </p>
            <p className="text-gray-400">
              SONORA keeps a single persistent HTMLAudioElement outside React and registers Media Session metadata and AVRCP handlers (Play, Pause, Next, Previous, Seek) so lock-screen controls, notification widgets, and Bluetooth earbuds work during background and screen-off playback on Chromium/Android.
            </p>
            <p className="text-gray-400">
              <strong>Platform limitation:</strong> Browser-based PWAs cannot guarantee unrestricted background playback on every Android OEM or iOS device when aggressive battery savers (Doze mode) suspend background browser processes. For guaranteed multi-hour OEM-proof background playback, wrap SONORA in Capacitor or a Trusted Web Activity with a native Android <code className="font-mono text-gray-200">Media3 MediaSessionService</code> foreground service.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
