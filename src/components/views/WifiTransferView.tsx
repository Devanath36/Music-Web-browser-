import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  CheckCircle2,
  FolderOpen,
  Info,
  Laptop,
  QrCode,
  Send,
  ShieldAlert,
  Smartphone,
  Upload,
  Wifi,
  X,
} from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import {
  WifiTransferClient,
  type TransferProgressState,
} from '../../transfer/wifiTransfer';
import { formatBytes, formatRelativeDate, isSupportedAudioFile } from '../../utils/formatters';

export const WifiTransferView: React.FC = () => {
  const refreshLibrary = useLibraryStore((s) => s.refreshLibrary);
  const refreshStorage = useLibraryStore((s) => s.refreshStorage);
  const transferHistory = useLibraryStore((s) => s.transferHistory);
  const setActiveView = useLibraryStore((s) => s.setActiveView);

  const [mode, setMode] = useState<'send' | 'receive'>('receive');
  const [joinCode, setJoinCode] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [transferState, setTransferState] = useState<TransferProgressState>({
    phase: 'idle',
    transport: null,
    pairingCode: '',
    peerName: null,
    pendingOffer: null,
    totalFiles: 0,
    completedFiles: 0,
    duplicateFiles: 0,
    failedFiles: 0,
    bytesTransferred: 0,
    totalBytes: 0,
    currentFileName: '',
    error: null,
  });

  const clientRef = useRef<WifiTransferClient | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const client = new WifiTransferClient(
      (next) => setTransferState(next),
      () => {
        refreshLibrary();
        refreshStorage();
      }
    );
    clientRef.current = client;

    // Fetch local Wi-Fi LAN URLs from Express server
    fetch('/api/network-info')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.lanUrls && Array.isArray(data.lanUrls)) {
          setLanUrls(data.lanUrls);
        }
      })
      .catch(() => {});

    // Auto-fill pairing code if opened via QR link (?pair=XXXXXX)
    const params = new URLSearchParams(window.location.search);
    const pairParam = params.get('pair');
    if (pairParam && pairParam.trim().length === 6) {
      const cleaned = pairParam.trim().toUpperCase();
      setMode('send');
      setJoinCode(cleaned);
    }

    return () => {
      client.disconnect();
    };
  }, [refreshLibrary, refreshStorage]);

  useEffect(() => {
    if (!transferState.pairingCode) {
      setQrDataUrl(null);
      return;
    }
    const baseUrl = lanUrls[0] || window.location.origin;
    const pairUrl = `${baseUrl}/?pair=${transferState.pairingCode}`;
    QRCode.toDataURL(pairUrl, {
      width: 200,
      margin: 2,
      color: { dark: '#FFFFFF', light: '#050507' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [transferState.pairingCode, lanUrls]);

  const handleCreateSession = () => {
    const role = mode === 'receive' ? 'receiver' : 'sender';
    clientRef.current?.createSession(role);
  };

  const handleJoinSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    const role = mode === 'receive' ? 'receiver' : 'sender';
    clientRef.current?.joinSession(joinCode.trim(), role);
  };

  const handlePickFiles = (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter((f) => isSupportedAudioFile(f));
    setSelectedFiles(valid);
  };

  const handleStartTransfer = () => {
    if (selectedFiles.length === 0) return;
    clientRef.current?.sendFiles(selectedFiles);
  };

  const pct =
    transferState.totalBytes > 0
      ? Math.min(
          100,
          Math.round((transferState.bytesTransferred / transferState.totalBytes) * 100)
        )
      : 0;

  return (
    <section className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            Wi-Fi Music Transfer
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Transfer songs and folders between your laptop and Android phone over Wi-Fi with SHA-256 verification and automatic dual-storage allocation.
          </p>
        </div>

        {/* Send / Receive Mode Toggle */}
        <div className="inline-flex items-center rounded-xl border border-white/10 bg-[#111216] p-1">
          <button
            type="button"
            onClick={() => {
              clientRef.current?.disconnect();
              setMode('receive');
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mode === 'receive' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Receive Music</span>
          </button>
          <button
            type="button"
            onClick={() => {
              clientRef.current?.disconnect();
              setMode('send');
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mode === 'send' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Send Music</span>
          </button>
        </div>
      </div>

      {/* Pairing Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <QrCode className="w-4 h-4 text-red-400" />
              <h2 className="font-display text-base font-semibold text-white">
                {mode === 'receive'
                  ? '1. Start Receiving Session'
                  : '1. Pair With Receiving Device'}
              </h2>
            </div>
            {transferState.phase !== 'idle' && (
              <button
                type="button"
                onClick={() => clientRef.current?.disconnect()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/10 text-xs text-gray-300 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close Session</span>
              </button>
            )}
          </div>

          {transferState.phase === 'idle' || transferState.phase === 'error' ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleCreateSession}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 transition-colors"
              >
                <Wifi className="w-4 h-4" />
                <span>Generate Temporary Pairing Code</span>
              </button>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-white/[0.08]" />
                <span className="mx-3 text-xs text-gray-500">or join existing code</span>
                <div className="flex-grow border-t border-white/[0.08]" />
              </div>

              <form onSubmit={handleJoinSession} className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="6-CHAR CODE"
                  className="flex-1 min-h-[44px] rounded-xl border border-white/10 bg-[#050507] px-3.5 py-2 text-sm font-mono tracking-widest text-white uppercase placeholder:text-gray-600 focus:outline-none focus:border-red-500"
                />
                <button
                  type="submit"
                  disabled={joinCode.trim().length < 4}
                  className="min-h-[44px] px-5 rounded-xl border border-white/15 bg-[#16171D] text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-40"
                >
                  Pair
                </button>
              </form>

              {transferState.error && (
                <p className="text-xs text-red-400">{transferState.error}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-5">
              {qrDataUrl && (
                <div className="p-2 rounded-xl border border-white/10 bg-[#050507] shrink-0">
                  <img src={qrDataUrl} alt="Pairing QR Code" className="w-36 h-36" />
                </div>
              )}
              <div className="space-y-2 text-center sm:text-left min-w-0 flex-1">
                <p className="text-xs text-gray-400">Temporary Pairing Code</p>
                <p className="font-mono text-3xl font-bold tracking-[0.2em] text-red-400">
                  {transferState.pairingCode}
                </p>
                <p className="text-xs text-gray-300">
                  {transferState.peerName
                    ? `Paired with ${transferState.peerName} (${
                        transferState.transport === 'webrtc' ? 'Direct P2P LAN' : 'Session Relay'
                      })`
                    : 'Waiting for the other device to enter this code or scan the QR...'}
                </p>
                {lanUrls.length > 0 && (
                  <p className="text-[11px] font-mono text-gray-500 truncate">
                    Local Wi-Fi URL: {lanUrls[0]}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Panel (Send files OR Receiver approval + progress) */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-4">
          <h2 className="font-display text-base font-semibold text-white">
            {mode === 'send' ? '2. Select & Send Audio Files' : '2. Incoming Transfer Status'}
          </h2>

          {mode === 'send' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl border border-white/15 bg-[#050507] text-xs font-medium text-white hover:bg-white/10"
                >
                  <Upload className="w-4 h-4 text-red-400" />
                  <span>Select Songs</span>
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl border border-white/15 bg-[#050507] text-xs font-medium text-white hover:bg-white/10"
                >
                  <FolderOpen className="w-4 h-4 text-red-400" />
                  <span>Select Folder</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac"
                className="hidden"
                onChange={(e) => handlePickFiles(e.target.files)}
              />
              <input
                ref={folderInputRef}
                type="file"
                multiple
                {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                className="hidden"
                onChange={(e) => handlePickFiles(e.target.files)}
              />

              {selectedFiles.length > 0 && (
                <div className="rounded-xl border border-white/[0.07] bg-[#050507] p-3.5 text-xs space-y-2">
                  <div className="flex justify-between text-gray-300">
                    <span>{selectedFiles.length} audio files staged</span>
                    <span className="font-mono tabular-nums">
                      {formatBytes(selectedFiles.reduce((s, f) => s + f.size, 0))}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={
                      transferState.phase !== 'paired' && transferState.phase !== 'completed'
                    }
                    onClick={handleStartTransfer}
                    className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {transferState.phase === 'paired' || transferState.phase === 'completed'
                        ? 'Send to Paired Device'
                        : 'Pair with a receiver first'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {transferState.phase === 'awaiting_approval' && transferState.pendingOffer && (
                <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <p className="font-semibold text-white">
                        Incoming Transfer Request from {transferState.peerName || 'Paired Device'}
                      </p>
                      <p className="text-gray-300 tabular-nums">
                        {transferState.pendingOffer.length} audio files (
                        {formatBytes(
                          transferState.pendingOffer.reduce((s, f) => s + f.fileSize, 0)
                        )}
                        )
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => clientRef.current?.respondToOffer(true)}
                      className="flex-1 min-h-[40px] rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
                    >
                      Approve & Import
                    </button>
                    <button
                      type="button"
                      onClick={() => clientRef.current?.respondToOffer(false)}
                      className="min-h-[40px] px-4 rounded-xl border border-white/15 text-xs font-medium text-gray-300 hover:bg-white/5"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}

              {transferState.phase === 'waiting_peer' && (
                <p className="text-xs text-gray-400">
                  Open SONORA on your sending device, choose Send Music, and enter pairing code{' '}
                  <strong className="font-mono text-white">{transferState.pairingCode}</strong>.
                </p>
              )}

              {transferState.phase === 'paired' && (
                <p className="text-xs text-emerald-400">
                  Device paired. Waiting for sender to choose songs...
                </p>
              )}
            </div>
          )}

          {/* Transfer Progress */}
          {(transferState.phase === 'transferring' || transferState.phase === 'completed') && (
            <div className="rounded-xl border border-white/[0.07] bg-[#050507] p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-white flex items-center gap-2">
                  {transferState.phase === 'completed' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                  {transferState.phase === 'completed'
                    ? 'Transfer Completed'
                    : `Transferring: ${transferState.currentFileName}`}
                </span>
                <span className="font-mono tabular-nums text-red-400">{pct}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/[0.08] overflow-hidden">
                <div className="h-full bg-red-500 transition-[width]" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[11px] font-mono tabular-nums text-gray-400">
                Files: {transferState.completedFiles}/{transferState.totalFiles} · Duplicates:{' '}
                {transferState.duplicateFiles} · Failed: {transferState.failedFiles} ·{' '}
                {formatBytes(transferState.bytesTransferred)} / {formatBytes(transferState.totalBytes)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Honest Browser Network Limitation & Offline Alternative */}
      <div className="rounded-xl border border-white/[0.07] bg-[#0B0C10] p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
        <div className="flex items-start gap-3 max-w-3xl">
          <Info className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p>
            Browsers cannot open raw OS TCP/UDP discovery sockets (mDNS) directly from a webpage. SONORA uses a temporary private WebSocket pairing room to negotiate peer-to-peer WebRTC DataChannels over your local Wi-Fi (with in-memory room relay fallback if LAN ICE is blocked). When completely offline without a local server, use Direct File/Folder Import or Storage Backup &amp; Restore.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveView('import')}
          className="px-3.5 py-2 rounded-xl border border-white/10 text-xs font-medium text-white hover:bg-white/5 shrink-0"
        >
          Open Direct Import
        </button>
      </div>

      {/* Transfer History */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-3">
        <h2 className="font-display text-sm font-semibold text-white">Recent Transfer History</h2>
        {transferHistory.length === 0 ? (
          <p className="text-xs text-gray-500">No Wi-Fi transfers recorded yet.</p>
        ) : (
          <div className="divide-y divide-white/[0.05] max-h-60 overflow-y-auto">
            {transferHistory.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 py-2.5 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white truncate">{item.fileName}</p>
                  <p className="text-gray-400">
                    {item.direction === 'receive' ? 'Received from' : 'Sent to'} {item.peerName} ·{' '}
                    {formatBytes(item.fileSize)} · {formatRelativeDate(item.timestamp)}
                  </p>
                </div>
                <span
                  className={`font-mono capitalize ${
                    item.status === 'completed'
                      ? 'text-emerald-400'
                      : item.status === 'duplicate'
                        ? 'text-gray-400'
                        : 'text-red-400'
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
