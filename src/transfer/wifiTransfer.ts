import { logTransferHistory, saveTrackBatch, type StagedTrackImport } from '../db/sonoraDb';
import { getFileExtension } from '../utils/formatters';
import type { WorkerAnalyzeResult } from '../workers/importWorker';

export interface TransferFileManifestItem {
  transferId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
  title: string;
  artist: string;
  album: string;
}

export interface TransferProgressState {
  phase:
    | 'idle'
    | 'connecting'
    | 'waiting_peer'
    | 'paired'
    | 'awaiting_approval'
    | 'transferring'
    | 'completed'
    | 'error';
  transport: 'webrtc' | 'ws-relay' | null;
  pairingCode: string;
  peerName: string | null;
  pendingOffer: TransferFileManifestItem[] | null;
  totalFiles: number;
  completedFiles: number;
  duplicateFiles: number;
  failedFiles: number;
  bytesTransferred: number;
  totalBytes: number;
  currentFileName: string;
  error: string | null;
}

export async function computeSha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }
  return `${blob.size}:${blob.type}`;
}

export async function computeQuickFingerprint(file: File): Promise<string> {
  const CHUNK_SIZE = 65536;
  const headSlice = await file.slice(0, Math.min(CHUNK_SIZE, file.size)).arrayBuffer();
  const tailStart = Math.max(0, file.size - CHUNK_SIZE);
  const tailSlice =
    file.size > CHUNK_SIZE
      ? await file.slice(tailStart, file.size).arrayBuffer()
      : new ArrayBuffer(0);

  const combined = new Uint8Array(headSlice.byteLength + tailSlice.byteLength + 8);
  new DataView(combined.buffer).setFloat64(0, file.size);
  combined.set(new Uint8Array(headSlice), 8);
  combined.set(new Uint8Array(tailSlice), 8 + headSlice.byteLength);

  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', combined.buffer);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return `${file.size}:${hex.slice(0, 32)}`;
  }
  return `${file.size}:${file.name}`;
}

function getWsEndpoint(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/transfer`;
}

export class WifiTransferClient {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private role: 'sender' | 'receiver' = 'receiver';
  private pairingCode = '';
  private onState: (state: TransferProgressState) => void;
  private onLibraryUpdated: () => void;

  private state: TransferProgressState = {
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
  };

  private stagedFilesToSend: { file: File; meta: TransferFileManifestItem }[] = [];
  private activeIncomingMeta: TransferFileManifestItem | null = null;
  private incomingChunks: Uint8Array[] = [];
  private incomingReceivedBytes = 0;
  private approvedResolver: ((approved: boolean) => void) | null = null;
  private fileAckResolver: (() => void) | null = null;

  constructor(onState: (state: TransferProgressState) => void, onLibraryUpdated: () => void) {
    this.onState = onState;
    this.onLibraryUpdated = onLibraryUpdated;
  }

  private update(patch: Partial<TransferProgressState>) {
    this.state = { ...this.state, ...patch };
    this.onState({ ...this.state });
  }

  private getDeviceLabel(): string {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return 'Android Device';
    if (/iphone|ipad/i.test(ua)) return 'iOS Device';
    if (/windows/i.test(ua)) return 'Windows Laptop/PC';
    if (/macintosh/i.test(ua)) return 'Mac';
    return 'Browser Device';
  }

  async createSession(role: 'sender' | 'receiver') {
    this.disconnect();
    this.role = role;
    this.update({ phase: 'connecting', error: null, pairingCode: '', peerName: null });

    const ws = new WebSocket(getWsEndpoint());
    this.ws = ws;
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'session:create',
          role,
          deviceName: this.getDeviceLabel(),
        })
      );
    };

    ws.onmessage = (ev) => this.handleWsMessage(ev);
    ws.onerror = () => {
      this.update({
        phase: 'error',
        error: 'Unable to reach pairing server. Ensure both devices can reach SONORA over Wi-Fi.',
      });
    };
    ws.onclose = () => {
      if (this.state.phase !== 'completed' && this.state.phase !== 'idle' && this.state.phase !== 'error') {
        this.update({ phase: 'idle', peerName: null });
      }
    };
  }

  async joinSession(code: string, role: 'sender' | 'receiver') {
    this.disconnect();
    this.role = role;
    this.pairingCode = code.trim().toUpperCase();
    this.update({ phase: 'connecting', error: null, pairingCode: this.pairingCode });

    const ws = new WebSocket(getWsEndpoint());
    this.ws = ws;
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'session:join',
          code: this.pairingCode,
          role,
          deviceName: this.getDeviceLabel(),
        })
      );
    };

    ws.onmessage = (ev) => this.handleWsMessage(ev);
    ws.onerror = () => {
      this.update({
        phase: 'error',
        error: 'Unable to connect to pairing server.',
      });
    };
  }

  private sendSignal(payload: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private initWebRtc(isInitiator: boolean) {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      this.pc = pc;

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          this.sendSignal({ type: 'rtc:ice', candidate: ev.candidate });
        }
      };

      if (isInitiator) {
        const dc = pc.createDataChannel('sonora-audio', { ordered: true });
        this.attachDataChannel(dc);
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer).then(() => offer))
          .then((offer) => this.sendSignal({ type: 'rtc:offer', sdp: offer }))
          .catch(() => {
            this.update({ transport: 'ws-relay' });
          });
      } else {
        pc.ondatachannel = (ev) => {
          this.attachDataChannel(ev.channel);
        };
      }
    } catch {
      this.update({ transport: 'ws-relay' });
    }
  }

  private attachDataChannel(dc: RTCDataChannel) {
    this.dc = dc;
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = 256 * 1024;
    dc.onopen = () => {
      this.update({ transport: 'webrtc' });
    };
    dc.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        this.handleControlMessage(JSON.parse(ev.data));
      } else {
        this.handleBinaryChunk(new Uint8Array(ev.data));
      }
    };
    dc.onerror = () => {
      this.update({ transport: 'ws-relay' });
    };
  }

  private async handleWsMessage(ev: MessageEvent) {
    if (ev.data instanceof ArrayBuffer) {
      this.handleBinaryChunk(new Uint8Array(ev.data));
      return;
    }

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }

    const type = String(msg.type || '');

    if (type === 'session:created') {
      this.pairingCode = String(msg.code || '');
      this.update({
        phase: 'waiting_peer',
        pairingCode: this.pairingCode,
        transport: 'ws-relay',
      });
      return;
    }

    if (type === 'session:joined') {
      const peerConnected = Boolean(msg.peerConnected);
      this.update({
        phase: peerConnected ? 'paired' : 'waiting_peer',
        peerName: msg.peerName ? String(msg.peerName) : null,
        transport: 'ws-relay',
      });
      if (peerConnected && this.role === 'sender') {
        this.initWebRtc(true);
      }
      return;
    }

    if (type === 'peer:connected') {
      this.update({
        phase: 'paired',
        peerName: msg.peerName ? String(msg.peerName) : 'Paired Device',
      });
      if (this.role === 'sender') {
        this.initWebRtc(true);
      }
      return;
    }

    if (type === 'peer:disconnected') {
      this.update({
        phase: 'waiting_peer',
        peerName: null,
        pendingOffer: null,
      });
      return;
    }

    if (type === 'session:error') {
      this.update({
        phase: 'error',
        error: String(msg.error || 'Pairing error'),
      });
      return;
    }

    if (type === 'session:closed') {
      this.disconnect();
      return;
    }

    if (type === 'rtc:offer' && msg.sdp) {
      this.initWebRtc(false);
      if (this.pc) {
        await this.pc.setRemoteDescription(msg.sdp as RTCSessionDescriptionInit);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.sendSignal({ type: 'rtc:answer', sdp: answer });
      }
      return;
    }

    if (type === 'rtc:answer' && msg.sdp && this.pc) {
      await this.pc.setRemoteDescription(msg.sdp as RTCSessionDescriptionInit);
      return;
    }

    if (type === 'rtc:ice' && msg.candidate && this.pc) {
      await this.pc.addIceCandidate(msg.candidate as RTCIceCandidateInit).catch(() => {});
      return;
    }

    // Forward transfer protocol control messages
    this.handleControlMessage(msg);
  }

  private sendControl(payload: Record<string, unknown>) {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(JSON.stringify(payload));
    } else {
      this.sendSignal(payload);
    }
  }

  private async sendBinary(chunk: Uint8Array) {
    if (this.dc && this.dc.readyState === 'open') {
      if (this.dc.bufferedAmount > 1024 * 1024) {
        await new Promise<void>((resolve) => {
          const dc = this.dc!;
          const onLow = () => {
            dc.removeEventListener('bufferedamountlow', onLow);
            resolve();
          };
          dc.addEventListener('bufferedamountlow', onLow);
          setTimeout(resolve, 200);
        });
      }
      const copy = new ArrayBuffer(chunk.byteLength);
      new Uint8Array(copy).set(chunk);
      this.dc.send(copy);
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      while (this.ws.bufferedAmount > 2 * 1024 * 1024) {
        await new Promise((r) => setTimeout(r, 40));
      }
      const copy = new ArrayBuffer(chunk.byteLength);
      new Uint8Array(copy).set(chunk);
      this.ws.send(copy);
    }
  }

  async sendFiles(files: File[]) {
    if (files.length === 0) return;

    this.update({
      phase: 'transferring',
      totalFiles: files.length,
      completedFiles: 0,
      duplicateFiles: 0,
      failedFiles: 0,
      bytesTransferred: 0,
      totalBytes: files.reduce((sum, f) => sum + f.size, 0),
      currentFileName: 'Preparing checksums...',
      error: null,
    });

    const staged: { file: File; meta: TransferFileManifestItem }[] = [];
    for (const file of files) {
      const checksum = await computeSha256Hex(file);
      staged.push({
        file,
        meta: {
          transferId: crypto.randomUUID(),
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'audio/mpeg',
          checksum,
          title: file.name.replace(/\.[^.]+$/, ''),
          artist: 'Transferred Audio',
          album: 'Wi-Fi Transfer',
        },
      });
    }

    this.stagedFilesToSend = staged;
    this.sendControl({
      type: 'transfer:offer',
      manifest: staged.map((s) => s.meta),
    });
    this.update({ currentFileName: 'Waiting for receiver approval...' });

    const approved = await new Promise<boolean>((resolve) => {
      this.approvedResolver = resolve;
    });

    if (!approved) {
      this.update({
        phase: 'paired',
        currentFileName: '',
        error: 'Receiver declined the transfer.',
      });
      return;
    }

    const CHUNK_SIZE = 64 * 1024;
    let totalSentBytes = 0;

    for (let idx = 0; idx < this.stagedFilesToSend.length; idx++) {
      const { file, meta } = this.stagedFilesToSend[idx];
      this.update({ currentFileName: file.name });
      this.sendControl({ type: 'file:start', meta });

      const buf = new Uint8Array(await file.arrayBuffer());
      for (let off = 0; off < buf.byteLength; off += CHUNK_SIZE) {
        const end = Math.min(off + CHUNK_SIZE, buf.byteLength);
        await this.sendBinary(buf.subarray(off, end));
        totalSentBytes += end - off;
        this.update({ bytesTransferred: totalSentBytes });
      }

      this.sendControl({ type: 'file:end', transferId: meta.transferId });

      // Wait for receiver checksum & storage acknowledgment before next file
      await new Promise<void>((resolve) => {
        this.fileAckResolver = resolve;
      });

      await logTransferHistory({
        sessionId: this.pairingCode,
        direction: 'send',
        peerName: this.state.peerName || 'Paired Device',
        fileName: file.name,
        trackId: null,
        fileSize: file.size,
        checksum: meta.checksum,
        storageSection: null,
        status: 'completed',
        timestamp: Date.now(),
      });

      this.update({ completedFiles: idx + 1 });
    }

    this.sendControl({ type: 'transfer:done' });
    this.update({ phase: 'completed', currentFileName: '' });
    this.onLibraryUpdated();
  }

  respondToOffer(approved: boolean) {
    const offer = this.state.pendingOffer;
    if (!offer) return;

    this.sendControl({ type: 'transfer:approval', approved });
    if (!approved) {
      this.update({ phase: 'paired', pendingOffer: null });
      return;
    }

    const totalBytes = offer.reduce((sum, item) => sum + item.fileSize, 0);
    this.update({
      phase: 'transferring',
      pendingOffer: null,
      totalFiles: offer.length,
      completedFiles: 0,
      duplicateFiles: 0,
      failedFiles: 0,
      bytesTransferred: 0,
      totalBytes,
      currentFileName: 'Receiving...',
    });
  }

  private async handleControlMessage(msg: Record<string, unknown>) {
    const type = String(msg.type || '');

    if (type === 'transfer:offer') {
      const manifest = (msg.manifest as TransferFileManifestItem[]) || [];
      this.update({
        phase: 'awaiting_approval',
        pendingOffer: manifest,
      });
      return;
    }

    if (type === 'transfer:approval') {
      if (this.approvedResolver) {
        this.approvedResolver(Boolean(msg.approved));
        this.approvedResolver = null;
      }
      return;
    }

    if (type === 'file:start') {
      const meta = msg.meta as TransferFileManifestItem;
      this.activeIncomingMeta = meta;
      this.incomingChunks = [];
      this.incomingReceivedBytes = 0;
      this.update({ currentFileName: meta.fileName });
      return;
    }

    if (type === 'file:end') {
      await this.finalizeIncomingFile();
      return;
    }

    if (type === 'file:ack') {
      if (msg.result === 'duplicate') {
        this.update({ duplicateFiles: this.state.duplicateFiles + 1 });
      } else if (msg.result === 'failed') {
        this.update({ failedFiles: this.state.failedFiles + 1 });
      }
      if (this.fileAckResolver) {
        this.fileAckResolver();
        this.fileAckResolver = null;
      }
      return;
    }

    if (type === 'transfer:done') {
      this.update({ phase: 'completed', currentFileName: '' });
      this.onLibraryUpdated();
    }
  }

  private handleBinaryChunk(chunk: Uint8Array) {
    if (!this.activeIncomingMeta) return;
    this.incomingChunks.push(chunk);
    this.incomingReceivedBytes += chunk.byteLength;
    this.update({
      bytesTransferred: this.state.bytesTransferred + chunk.byteLength,
    });
  }

  private async finalizeIncomingFile() {
    const meta = this.activeIncomingMeta;
    if (!meta) return;

    const blobParts = this.incomingChunks.map((u8) => {
      const ab = new ArrayBuffer(u8.byteLength);
      new Uint8Array(ab).set(u8);
      return ab;
    });
    const receivedBlob = new Blob(blobParts, { type: meta.mimeType || 'audio/mpeg' });
    this.incomingChunks = [];
    this.activeIncomingMeta = null;

    // 1. Verify SHA-256 checksum integrity
    const actualChecksum = await computeSha256Hex(receivedBlob);
    if (actualChecksum !== meta.checksum) {
      await logTransferHistory({
        sessionId: this.pairingCode,
        direction: 'receive',
        peerName: this.state.peerName || 'Paired Device',
        fileName: meta.fileName,
        trackId: null,
        fileSize: receivedBlob.size,
        checksum: actualChecksum,
        storageSection: null,
        status: 'failed',
        timestamp: Date.now(),
      });
      this.update({ failedFiles: this.state.failedFiles + 1 });
      this.sendControl({ type: 'file:ack', transferId: meta.transferId, result: 'failed' });
      return;
    }

    // 2. Parse metadata via importWorker & compute fingerprint for duplicate detection
    const file = new File([receivedBlob], meta.fileName, { type: meta.mimeType });
    const quickFp = await computeQuickFingerprint(file);
    const analysis = await analyzeSingleFileInWorker(file, meta.mimeType);

    const trackId = crypto.randomUUID();
    const staged: StagedTrackImport = {
      track: {
        id: trackId,
        fingerprint: analysis.fingerprint || quickFp,
        sourceType: 'local',
        storageSection: 'storage1',
        title: analysis.title || meta.title,
        artist: analysis.artist || meta.artist,
        album: analysis.album || meta.album,
        albumArtist: analysis.albumArtist || analysis.artist || meta.artist,
        genre: analysis.genre || '',
        year: analysis.year ?? null,
        trackNumber: analysis.trackNumber ?? null,
        discNumber: analysis.discNumber ?? null,
        duration: analysis.duration || 0,
        mimeType: meta.mimeType || 'audio/mpeg',
        format:
          analysis.format || getFileExtension(meta.fileName).toUpperCase() || 'AUDIO',
        bitrate: analysis.bitrate ?? null,
        sampleRate: analysis.sampleRate ?? null,
        fileSize: file.size,
        fileName: meta.fileName,
        artworkId: analysis.artworkId ?? null,
        addedAt: Date.now(),
        playCount: 0,
        lastPlayedAt: null,
      },
      audioBlob: file,
      artwork:
        analysis.artworkId && analysis.artworkBlob
          ? {
              id: analysis.artworkId,
              blob: analysis.artworkBlob,
              mimeType: analysis.artworkMimeType || 'image/jpeg',
            }
          : null,
    };

    const res = await saveTrackBatch([staged]);
    if (res.storageFull) {
      await logTransferHistory({
        sessionId: this.pairingCode,
        direction: 'receive',
        peerName: this.state.peerName || 'Paired Device',
        fileName: meta.fileName,
        trackId: null,
        fileSize: file.size,
        checksum: actualChecksum,
        storageSection: null,
        status: 'failed',
        timestamp: Date.now(),
      });
      this.update({
        failedFiles: this.state.failedFiles + 1,
        error: 'Both Storage 1 (25 GB) and Storage 2 (25 GB) are full. Free space before receiving more files.',
      });
      this.sendControl({ type: 'file:ack', transferId: meta.transferId, result: 'failed' });
      return;
    }

    const isDuplicate = res.duplicateFingerprints.length > 0;
    const savedId = res.savedIds[0] || null;
    const assignedSection = savedId ? res.savedSections[savedId] || null : null;

    await logTransferHistory({
      sessionId: this.pairingCode,
      direction: 'receive',
      peerName: this.state.peerName || 'Paired Device',
      fileName: meta.fileName,
      trackId: savedId,
      fileSize: file.size,
      checksum: actualChecksum,
      storageSection: assignedSection,
      status: isDuplicate ? 'duplicate' : 'completed',
      timestamp: Date.now(),
    });

    this.update({
      completedFiles: this.state.completedFiles + 1,
      duplicateFiles: this.state.duplicateFiles + (isDuplicate ? 1 : 0),
    });

    this.sendControl({
      type: 'file:ack',
      transferId: meta.transferId,
      result: isDuplicate ? 'duplicate' : 'ok',
    });
    this.onLibraryUpdated();
  }

  disconnect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'session:close' }));
    }
    this.dc?.close();
    this.pc?.close();
    this.ws?.close();
    this.dc = null;
    this.pc = null;
    this.ws = null;
    this.pairingCode = '';
    this.update({
      phase: 'idle',
      transport: null,
      pairingCode: '',
      peerName: null,
      pendingOffer: null,
      currentFileName: '',
      error: null,
    });
  }
}

function analyzeSingleFileInWorker(file: File, mimeType: string): Promise<WorkerAnalyzeResult> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('../workers/importWorker.ts', import.meta.url), {
      type: 'module',
    });
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ id, ok: false, error: 'Timeout' });
    }, 15000);

    worker.onmessage = (ev: MessageEvent<WorkerAnalyzeResult>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(ev.data);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ id, ok: false, error: 'Worker error' });
    };
    worker.postMessage({ id, file, mimeType });
  });
}
