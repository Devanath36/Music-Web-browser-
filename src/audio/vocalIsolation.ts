export type StemIsolationMode = 'original' | 'vocals' | 'instrumental';

/**
 * Pure Mid-Side stereo matrix math helper (also unit tested cleanly in Node):
 * - Vocals are typically center-panned (Mid = (L + R) * 0.5)
 * - Side ambience / stereo instruments live in Side = (L - R) * 0.5
 * Blending Mid subtraction removes center vocals while blending band-focused Mid emphasizes vocals.
 */
export function computeMidSideIsolationSample(
  left: number,
  right: number,
  mode: StemIsolationMode,
  intensity: number
): [number, number] {
  const k = Math.max(0, Math.min(1, intensity));
  if (mode === 'original' || k === 0) return [left, right];

  const mid = (left + right) * 0.5;
  const side = (left - right) * 0.5;

  if (mode === 'instrumental') {
    // Attenuate center-panned vocal energy proportional to intensity
    const midGain = 1 - k * 0.94;
    const outMid = mid * midGain;
    const l = Math.max(-1, Math.min(1, outMid + side));
    const r = Math.max(-1, Math.min(1, outMid - side));
    return [l, r];
  }

  // mode === 'vocals': emphasize center signal while attenuating stereo side accompaniment
  const sideGain = 1 - k * 0.9;
  const outSide = side * sideGain;
  const boostedMid = mid * (1 + k * 0.2);
  const l = Math.max(-1, Math.min(1, boostedMid + outSide));
  const r = Math.max(-1, Math.min(1, boostedMid - outSide));
  return [l, r];
}

export function encodeAudioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const dataBytes = length * numChannels * bytesPerSample;
  const totalBytes = 44 + dataBytes;

  const out = new ArrayBuffer(totalBytes);
  const view = new DataView(out);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, totalBytes - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  const ch0 = buffer.getChannelData(0);
  const ch1 = numChannels > 1 ? buffer.getChannelData(1) : ch0;

  let offset = 44;
  for (let i = 0; i < length; i++) {
    const s0 = Math.max(-1, Math.min(1, ch0[i]));
    view.setInt16(offset, s0 < 0 ? s0 * 0x8000 : s0 * 0x7fff, true);
    offset += 2;
    if (numChannels > 1) {
      const s1 = Math.max(-1, Math.min(1, ch1[i]));
      view.setInt16(offset, s1 < 0 ? s1 * 0x8000 : s1 * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([out], { type: 'audio/wav' });
}

export async function processVocalIsolationBuffer(params: {
  sourceArrayBuffer: ArrayBuffer;
  mode: Exclude<StemIsolationMode, 'original'>;
  intensity: number;
}): Promise<{ buffer: AudioBuffer; wavBlob: Blob; isMonoWarning: boolean }> {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new Ctx();

  try {
    const decoded = await decodeCtx.decodeAudioData(params.sourceArrayBuffer.slice(0));
    const isMonoWarning = decoded.numberOfChannels < 2;
    const chCount = Math.max(2, decoded.numberOfChannels);
    const offline = new OfflineAudioContext(2, decoded.length, decoded.sampleRate);

    const processed = offline.createBuffer(2, decoded.length, decoded.sampleRate);
    const srcL = decoded.getChannelData(0);
    const srcR = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : srcL;
    const dstL = processed.getChannelData(0);
    const dstR = processed.getChannelData(1);

    for (let i = 0; i < decoded.length; i++) {
      const [l, r] = computeMidSideIsolationSample(srcL[i], srcR[i], params.mode, params.intensity);
      dstL[i] = l;
      dstR[i] = r;
    }

    const source = offline.createBufferSource();
    source.buffer = processed;

    if (params.mode === 'vocals') {
      // Gentle vocal-band focus filter (keeps 180Hz-5500Hz clear while taming sub-bass & extreme hiss)
      const hp = offline.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 140 + params.intensity * 80;

      const lp = offline.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 12000 - params.intensity * 4500;

      source.connect(hp);
      hp.connect(lp);
      lp.connect(offline.destination);
    } else {
      // Slightly restore low-end warmth removed by Mid attenuation
      const lowShelf = offline.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = 140;
      lowShelf.gain.value = 2.5 * params.intensity;
      source.connect(lowShelf);
      lowShelf.connect(offline.destination);
    }

    source.start(0);
    const rendered = await offline.startRendering();
    const wavBlob = encodeAudioBufferToWavBlob(rendered);

    void chCount;
    return { buffer: rendered, wavBlob, isMonoWarning };
  } finally {
    await decodeCtx.close().catch(() => {});
  }
}
