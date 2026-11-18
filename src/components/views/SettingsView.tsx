import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  HardDrive,
  Headphones,
  Info,
  Keyboard,
  Radio,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Speaker,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  exportLibraryMetadataJson,
  previewLibraryBackup,
  restoreLibraryBackupJson,
  triggerTextDownload,
  type BackupPreviewSummary,
} from '../../db/exportBackup';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { PlaybackRestorePolicy } from '../../types/music';
import { listAudioOutputDevices, type AudioOutputDeviceOption } from '../../utils/audioDeviceManager';
import { DEFAULT_CROSSFADE_SECONDS } from '../../utils/crossfadeEngine';
import { formatBytes } from '../../utils/formatters';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { VisualizerSettingsPanel } from '../visualizer/VisualizerSettingsPanel';

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
  const updateAppSettings = useLibraryStore((s) => s.updateAppSettings);
  const requestPersistStorage = useLibraryStore((s) => s.requestPersistStorage);
  const refreshStorage = useLibraryStore((s) => s.refreshStorage);
  const refreshLibrary = useLibraryStore((s) => s.refreshLibrary);
  const setActiveView = useLibraryStore((s) => s.setActiveView);
  const isPreviewingCrossfade = usePlayerStore((s) => s.isPreviewingCrossfade);
  const previewCrossfade = usePlayerStore((s) => s.previewCrossfade);
  const stopCrossfadePreview = usePlayerStore((s) => s.stopCrossfadePreview);

  const isDeviceOnline = useOnlineStatus();
  const { isInstalled } = usePWAInstall();

  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [swActive, setSwActive] = useState<boolean>(false);
  const [persistFeedback, setPersistFeedback] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{
    rawJson: string;
    summary: BackupPreviewSummary;
  } | null>(null);

  const [audioDevices, setAudioDevices] = useState<AudioOutputDeviceOption[]>([]);
  const [sinkSupported, setSinkSupported] = useState(false);
  const [deviceWarning, setDeviceWarning] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    const res = await listAudioOutputDevices();
    setAudioDevices(res.devices);
    setSinkSupported(res.supported);
    setDeviceWarning(res.warning);
  }, []);

  useEffect(() => {
    refreshStorage();
    void loadDevices();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => setSwActive(!!reg?.active || !!navigator.serviceWorker.controller))
        .catch(() => {});
    }

    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    const onDeviceChange = () => {
      void loadDevices();
    };
    md?.addEventListener?.('devicechange', onDeviceChange);
    return () => {
      md?.removeEventListener?.('devicechange', onDeviceChange);
    };
  }, [refreshStorage, loadDevices]);

  const hasMediaSession = typeof navigator !== 'undefined' && 'mediaSession' in navigator;

  const handleRequestPersist = async () => {
    const granted = await requestPersistStorage();
    setPersistFeedback(
      granted
        ? 'Persistent storage granted — browser will protect your library from automatic eviction.'
        : 'Browser declined or already manages persistence automatically.'
    );
  };

  const handleExportBackup = async (includeAudioBlobs: boolean) => {
    setBackupError(null);
    setBackupMessage(null);
    try {
      const { json, trackCount, playlistCount, includedAudioBlobs } =
        await exportLibraryMetadataJson({ includeAudioBlobs });
      const dateStamp = new Date().toISOString().slice(0, 10);
      const filename = includeAudioBlobs
        ? `sonora-full-archive-${dateStamp}.json`
        : `sonora-library-backup-${dateStamp}.json`;
      triggerTextDownload(filename, json);
      setBackupMessage(
        includeAudioBlobs
          ? `Exported complete archive with ${trackCount} tracks, ${playlistCount} playlists, and ${includedAudioBlobs} embedded audio files.`
          : `Exported metadata backup (${trackCount} tracks, ${playlistCount} playlists, smart rules, and lyrics).`
      );
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Failed to export backup.');
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBackupError(null);
    setBackupMessage(null);
    try {
      const text = await file.text();
      const summary = await previewLibraryBackup(text);
      setPendingRestore({ rawJson: text, summary });
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Failed to inspect backup file.');
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore) return;
    try {
      const res = await restoreLibraryBackupJson(pendingRestore.rawJson);
      setPendingRestore(null);
      await refreshLibrary();
      await refreshStorage();
      setBackupMessage(
        `Restored ${res.restoredPlaylists} playlists, ${res.restoredSmartPlaylists} smart playlists, ${res.restoredFavorites} favorites, ${res.restoredLyrics} lyrics, ${res.restoredRemoteStreams} remote streams, and ${res.restoredAudioTracks} embedded audio files (matched ${res.matchedLocalTracks} existing local tracks).`
      );
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Restore failed.');
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
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">Settings</h1>
          <p className="text-xs text-gray-400 mt-1">
            Gapless crossfade playback, output routing, keyboard shortcuts, local IndexedDB backup, and PWA diagnostics.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('sonora:open-shortcuts'))}
          className="inline-flex items-center gap-2 min-h-[38px] px-3.5 py-2 rounded-xl border border-white/10 bg-[#111216] text-xs font-semibold text-white hover:border-red-500/40"
        >
          <Keyboard className="w-4 h-4 text-red-400" />
          <span>Customize Shortcuts</span>
        </button>
      </div>

      {/* Mode, Gapless & Restoration Section */}
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

        {/* Gapless Playback & Equal-Power Crossfade */}
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1 max-w-lg">
              <h2 className="font-display text-sm font-semibold text-white">
                Playback Transitions: Gapless &amp; Equal-Power Crossfade
              </h2>
              <p className="text-xs text-gray-400">
                Choose pure consecutive Gapless playback or synchronized Web Audio equal-power crossfades across sequential, shuffle, Smart Shuffle, playlists, and Repeat All. Repeat One loops cleanly without crossfading.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Gapless vs Crossfade Mode Switcher */}
              <div className="inline-flex items-center rounded-xl border border-white/10 bg-[#050507] p-1">
                <button
                  type="button"
                  onClick={() =>
                    void updateAppSettings({
                      transitionMode: 'gapless',
                      crossfadeEnabled: false,
                      gaplessEnabled: true,
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    (settings.transitionMode ?? (settings.crossfadeEnabled ? 'crossfade' : 'gapless')) === 'gapless'
                      ? 'bg-red-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Gapless Mode
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void updateAppSettings({
                      transitionMode: 'crossfade',
                      crossfadeEnabled: true,
                      gaplessEnabled: true,
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    (settings.transitionMode ?? (settings.crossfadeEnabled ? 'crossfade' : 'gapless')) === 'crossfade'
                      ? 'bg-red-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Crossfade Mode
                </button>
              </div>

              {/* Explicit Crossfade ON/OFF Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(settings.crossfadeEnabled)}
                onClick={() => {
                  const nextOn = !settings.crossfadeEnabled;
                  void updateAppSettings({
                    crossfadeEnabled: nextOn,
                    transitionMode: nextOn ? 'crossfade' : 'gapless',
                  });
                }}
                className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                  settings.crossfadeEnabled
                    ? 'border-red-500/60 bg-red-600/20 text-red-200'
                    : 'border-white/10 bg-[#050507] text-gray-400 hover:text-white'
                }`}
              >
                Crossfade: {settings.crossfadeEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-[#050507] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-gray-300">Crossfade Duration (0–20 seconds)</span>
              <div className="flex items-center gap-3">
                <span className="font-mono tabular-nums text-red-400 font-semibold">
                  {!settings.crossfadeEnabled || (settings.crossfadeSeconds ?? DEFAULT_CROSSFADE_SECONDS) === 0
                    ? `${settings.crossfadeSeconds ?? DEFAULT_CROSSFADE_SECONDS}s (Gapless active)`
                    : `${settings.crossfadeSeconds ?? DEFAULT_CROSSFADE_SECONDS}s equal-power blend`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    isPreviewingCrossfade ? stopCrossfadePreview() : void previewCrossfade()
                  }
                  className={`px-3 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                    isPreviewingCrossfade
                      ? 'border-red-500 bg-red-600 text-white'
                      : 'border-white/15 bg-[#111216] text-gray-200 hover:border-red-500/50 hover:text-white'
                  }`}
                >
                  {isPreviewingCrossfade ? 'Stop Preview' : 'Preview Crossfade'}
                </button>
              </div>
            </div>

            <input
              type="range"
              aria-label="Crossfade duration in seconds"
              min={0}
              max={20}
              step={1}
              value={settings.crossfadeSeconds ?? DEFAULT_CROSSFADE_SECONDS}
              onChange={(e) => {
                const secs = parseInt(e.target.value, 10);
                void updateAppSettings({
                  crossfadeSeconds: secs,
                  crossfadeEnabled: secs > 0 ? (settings.crossfadeEnabled ?? true) : false,
                  transitionMode:
                    secs > 0 && (settings.crossfadeEnabled ?? false) ? 'crossfade' : 'gapless',
                });
              }}
              className="sonora-range w-full h-1.5 rounded-full bg-white/10"
            />
            <div className="flex justify-between text-[10px] font-mono tabular-nums text-gray-500">
              <span>0s</span>
              <span>5s (Default)</span>
              <span>10s</span>
              <span>15s</span>
              <span>20s</span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/[0.06] text-[11px] text-gray-400">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.gaplessEnabled ?? true}
                  onChange={(e) => void updateAppSettings({ gaplessEnabled: e.target.checked })}
                  className="accent-red-600 w-3.5 h-3.5"
                />
                <span>Standby preloading active (eliminates silence between songs)</span>
              </label>
              <span>Short tracks auto-clamp to avoid double fades</span>
            </div>
          </div>
        </div>

        {/* Audio Output Device Routing */}
        <div className="p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Speaker className="w-4 h-4 text-red-400" />
              <h2 className="font-display text-sm font-semibold text-white">
                Audio Output Device
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void loadDevices()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-300 hover:text-white hover:bg-white/5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Devices</span>
            </button>
          </div>

          <select
            aria-label="Select audio output device"
            disabled={!sinkSupported || audioDevices.length === 0}
            value={settings.audioOutputDeviceId || ''}
            onChange={(e) => void updateAppSettings({ audioOutputDeviceId: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2.5 text-xs text-white disabled:opacity-50"
          >
            <option value="">System Default Audio Output</option>
            {audioDevices.map((dev) => (
              <option key={dev.deviceId} value={dev.deviceId}>
                {dev.label}
              </option>
            ))}
          </select>

          {deviceWarning && <p className="text-[11px] text-amber-300/90">{deviceWarning}</p>}
        </div>

        {/* Configurable Playback Restoration Policy */}
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

      {/* Visualizer & 3D Effects Preferences */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
        <VisualizerSettingsPanel />
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

        <p className="text-[11px] text-gray-500 leading-relaxed">
          Each browser (Edge, Chrome, Samsung Internet, Opera) maintains its own independent IndexedDB database ({storageBreakdown?.verifiedBlobCount ?? 0} audio Blobs verified locally). Note: browser storage can still be removed if you clear site data/cookies, use Private/Incognito windows, or if the browser/OS reclaims space under extreme low-disk conditions.
        </p>
      </div>

      {/* Backup & Export */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold text-white">
            Library Backup &amp; Archive Restore
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Export playlists, smart rules, lyrics, favorites, equalizer settings, and metadata — or create a self-contained archive including embedded audio files (up to 180 MB browser JSON cap).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleExportBackup(false)}
            className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-white/10 text-xs font-semibold text-white hover:bg-white/15"
          >
            <Download className="w-4 h-4 text-red-400" />
            <span>Export Metadata Backup (.json)</span>
          </button>

          <button
            type="button"
            onClick={() => void handleExportBackup(true)}
            className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl border border-red-500/40 bg-red-600/15 text-xs font-semibold text-red-200 hover:bg-red-600/25"
          >
            <Download className="w-4 h-4 text-red-400" />
            <span>Export Full Archive + Audio (.json)</span>
          </button>

          <button
            type="button"
            onClick={() => restoreInputRef.current?.click()}
            className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl border border-white/10 text-xs font-medium text-gray-200 hover:bg-white/5"
          >
            <Upload className="w-4 h-4" />
            <span>Preview &amp; Restore Backup (.json)</span>
          </button>

          <input
            ref={restoreInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleRestoreFile}
          />
        </div>

        {pendingRestore && (
          <div className="rounded-xl border border-red-500/35 bg-[#050507] p-4 space-y-3">
            <p className="text-xs font-semibold text-white">
              Restore Preview · Schema v{pendingRestore.summary.schemaVersion} ({pendingRestore.summary.exportedAt})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono tabular-nums text-gray-300">
              <span>Tracks in backup: {pendingRestore.summary.trackCount}</span>
              <span>Playlists: {pendingRestore.summary.playlistCount}</span>
              <span>Smart Playlists: {pendingRestore.summary.smartPlaylistCount}</span>
              <span>Lyrics records: {pendingRestore.summary.lyricsCount}</span>
              <span>Embedded Audio: {pendingRestore.summary.audioBlobCount}</span>
              <span>Matched locally: {pendingRestore.summary.matchedExistingCount}</span>
            </div>
            {pendingRestore.summary.missingLocalAudioCount > 0 && (
              <p className="text-[11px] text-amber-300">
                {pendingRestore.summary.missingLocalAudioCount} local tracks in this metadata backup are not currently in IndexedDB and have no embedded audio blob; import those files to relink them automatically.
              </p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void handleConfirmRestore()}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
              >
                Confirm Restore
              </button>
              <button
                type="button"
                onClick={() => setPendingRestore(null)}
                className="px-3.5 py-1.5 rounded-lg border border-white/10 text-xs text-gray-300 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {backupMessage && <p className="text-xs text-emerald-400">{backupMessage}</p>}
        {backupError && <p className="text-xs text-red-400">{backupError}</p>}
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
              SONORA keeps persistent dual HTMLAudioElements outside React and registers Media Session metadata and AVRCP handlers (Play, Pause, Next, Previous, Seek) so lock-screen controls, notification widgets, and Bluetooth earbuds work during background and screen-off playback on Chromium/Android.
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
