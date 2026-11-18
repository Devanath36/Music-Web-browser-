export interface BpmKeyAnalysis {
  bpm: number;
  confidence: number;
  beatOffsetSeconds: number;
  beatIntervalSeconds: number;
  estimatedKey: string;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Krumhansl-Schmuckler major & minor key profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export function computeCrossfaderGains(crossfader: number): { gainA: number; gainB: number } {
  const clamped = Math.max(-1, Math.min(1, crossfader));
  // Normalize [-1, 1] -> [0, 1]
  const t = (clamped + 1) * 0.5;
  // Equal-power constant-power curve
  const gainA = Math.cos(t * Math.PI * 0.5);
  const gainB = Math.sin(t * Math.PI * 0.5);
  return {
    gainA: clamped <= -0.999 ? 1 : clamped >= 0.999 ? 0 : gainA,
    gainB: clamped >= 0.999 ? 1 : clamped <= -0.999 ? 0 : gainB,
  };
}

export function extractWaveformPeaks(buffer: AudioBuffer, bucketCount = 320): number[] {
  const channels = buffer.numberOfChannels;
  const totalSamples = buffer.length;
  if (totalSamples === 0 || channels === 0) {
    return new Array(bucketCount).fill(0.08);
  }

  const ch0 = buffer.getChannelData(0);
  const ch1 = channels > 1 ? buffer.getChannelData(1) : null;
  const step = Math.max(1, Math.floor(totalSamples / bucketCount));
  const subStep = Math.max(1, Math.floor(step / 48));
  const peaks: number[] = new Array(bucketCount).fill(0);
  let maxPeak = 0.0001;

  for (let i = 0; i < bucketCount; i++) {
    const start = i * step;
    const end = Math.min(totalSamples, start + step);
    let peak = 0;
    for (let s = start; s < end; s += subStep) {
      const a0 = Math.abs(ch0[s] || 0);
      const a1 = ch1 ? Math.abs(ch1[s] || 0) : a0;
      const val = (a0 + a1) * 0.5;
      if (val > peak) peak = val;
    }
    peaks[i] = peak;
    if (peak > maxPeak) maxPeak = peak;
  }

  for (let i = 0; i < bucketCount; i++) {
    peaks[i] = Math.max(0.06, Math.min(1, peaks[i] / maxPeak));
  }

  return peaks;
}

export function reverseAudioBuffer(ctx: AudioContext, source: AudioBuffer): AudioBuffer {
  const reversed = ctx.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const srcData = source.getChannelData(ch);
    const dstData = reversed.getChannelData(ch);
    const len = source.length;
    for (let i = 0; i < len; i++) {
      dstData[i] = srcData[len - 1 - i];
    }
  }
  return reversed;
}

function estimateKeyFromPcm(samples: Float32Array, sampleRate: number): string {
  if (samples.length < 4096 || sampleRate <= 0) return 'Am (Est)';

  // Sample up to 6 segments of 4096 samples across mid track
  const frameSize = 2048;
  const chroma = new Float64Array(12);
  const numFrames = Math.min(8, Math.max(1, Math.floor(samples.length / frameSize)));
  const stride = Math.max(frameSize, Math.floor(samples.length / numFrames));

  // Target octaves 2..4 (MIDI 36..71 -> ~65Hz..500Hz)
  const targetNotes: { pc: number; freq: number }[] = [];
  for (let midi = 36; midi <= 71; midi++) {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    targetNotes.push({ pc: midi % 12, freq });
  }

  for (let f = 0; f < numFrames; f++) {
    const offset = Math.min(samples.length - frameSize, f * stride);
    for (let n = 0; n < targetNotes.length; n++) {
      const { pc, freq } = targetNotes[n];
      const omega = (2 * Math.PI * freq) / sampleRate;
      const coeff = 2 * Math.cos(omega);
      let sPrev = 0;
      let sPrev2 = 0;
      for (let i = 0; i < frameSize; i++) {
        // Hann window * sample
        const win = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameSize - 1)));
        const s = samples[offset + i] * win + coeff * sPrev - sPrev2;
        sPrev2 = sPrev;
        sPrev = s;
      }
      const power = sPrev2 * sPrev2 + sPrev * sPrev - coeff * sPrev * sPrev2;
      if (power > 0) {
        chroma[pc] += Math.sqrt(power);
      }
    }
  }

  let bestScore = -Infinity;
  let bestKey = 'Am (Est)';

  for (let root = 0; root < 12; root++) {
    let majorCorr = 0;
    let minorCorr = 0;
    for (let i = 0; i < 12; i++) {
      const c = chroma[(root + i) % 12];
      majorCorr += c * MAJOR_PROFILE[i];
      minorCorr += c * MINOR_PROFILE[i];
    }
    if (majorCorr > bestScore) {
      bestScore = majorCorr;
      bestKey = `${NOTE_NAMES[root]} (Est)`;
    }
    if (minorCorr > bestScore) {
      bestScore = minorCorr;
      bestKey = `${NOTE_NAMES[root]}m (Est)`;
    }
  }

  return bestKey;
}

export function analyzePcmBpmAndKey(
  samples: Float32Array,
  sampleRate: number,
  options?: { skipKey?: boolean }
): BpmKeyAnalysis {
  if (!samples || samples.length < sampleRate * 2 || sampleRate <= 0) {
    return {
      bpm: 120,
      confidence: 0,
      beatOffsetSeconds: 0,
      beatIntervalSeconds: 0.5,
      estimatedKey: 'Am (Est)',
    };
  }

  // Analyze up to 75 seconds from first non-silent region (skipping intro silence if any)
  const maxAnalyzeSamples = Math.min(samples.length, Math.floor(sampleRate * 75));
  let startSample = 0;
  if (samples.length > sampleRate * 30) {
    // Skip very quiet first 15% if long track
    const probeOffset = Math.floor(samples.length * 0.12);
    if (probeOffset + maxAnalyzeSamples <= samples.length) {
      startSample = probeOffset;
    }
  }

  // Envelope frame size ~ 10ms (100 Hz envelope rate)
  const hop = Math.max(64, Math.round(sampleRate / 100));
  const envRate = sampleRate / hop;
  const frameCount = Math.floor((Math.min(samples.length - startSample, maxAnalyzeSamples)) / hop);

  if (frameCount < 200) {
    return {
      bpm: 120,
      confidence: 0,
      beatOffsetSeconds: 0,
      beatIntervalSeconds: 0.5,
      estimatedKey: options?.skipKey ? 'Am (Est)' : estimateKeyFromPcm(samples, sampleRate),
    };
  }

  // Low-frequency emphasized RMS energy envelope (bass + kick transient sensitivity)
  const energy = new Float32Array(frameCount);
  let lp = 0;
  const lpAlpha = 0.25;
  for (let f = 0; f < frameCount; f++) {
    const base = startSample + f * hop;
    let sumSq = 0;
    for (let i = 0; i < hop; i++) {
      const x = samples[base + i] || 0;
      lp += lpAlpha * (x - lp);
      const weighted = lp * 0.7 + x * 0.3;
      sumSq += weighted * weighted;
    }
    energy[f] = Math.sqrt(sumSq / hop);
  }

  // Positive first-difference onset curve
  const onset = new Float32Array(frameCount);
  let meanOnset = 0;
  for (let f = 1; f < frameCount; f++) {
    const diff = energy[f] - energy[f - 1];
    onset[f] = diff > 0 ? diff : 0;
    meanOnset += onset[f];
  }
  meanOnset /= frameCount;
  for (let f = 0; f < frameCount; f++) {
    onset[f] = Math.max(0, onset[f] - meanOnset * 0.5);
  }

  // Autocorrelation across BPM 65..185
  const minBpm = 65;
  const maxBpm = 185;
  const minLag = Math.max(4, Math.floor((60 * envRate) / maxBpm));
  const maxLag = Math.min(frameCount - 1, Math.ceil((60 * envRate) / minBpm));

  let bestLag = Math.round((60 * envRate) / 120);
  let bestScore = -1;
  let totalScore = 0;
  let lagCount = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const limit = frameCount - lag;
    for (let i = 0; i < limit; i++) {
      sum += onset[i] * onset[i + lag];
    }
    // Check sub-harmonic (2*lag) reinforcement
    let harmonicBonus = 0;
    if (lag * 2 < frameCount) {
      const hLimit = frameCount - lag * 2;
      for (let i = 0; i < hLimit; i += 2) {
        harmonicBonus += onset[i] * onset[i + lag * 2];
      }
      harmonicBonus *= 0.35;
    }

    const candidateBpm = (60 * envRate) / lag;
    // Slight perceptual prior toward 90..145 BPM typical dance/music tempos
    const tempoPrior =
      candidateBpm >= 88 && candidateBpm <= 148 ? 1.1 : candidateBpm >= 72 && candidateBpm <= 165 ? 1.0 : 0.9;
    const score = ((sum + harmonicBonus) / Math.max(1, limit)) * tempoPrior;

    totalScore += score;
    lagCount += 1;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  let rawBpm = (60 * envRate) / bestLag;
  while (rawBpm < 75) rawBpm *= 2;
  while (rawBpm > 175) rawBpm /= 2;
  const bpm = Math.round(rawBpm * 10) / 10;

  const avgScore = lagCount > 0 ? totalScore / lagCount : 0;
  const confidence = avgScore > 0 ? Math.min(1, Math.max(0, (bestScore / avgScore - 1) / 3)) : 0;

  // Estimate first beat phase alignment from onset peaks modulo bestLag
  const beatIntervalSeconds = 60 / bpm;
  const phaseFrames = Math.max(1, Math.round(bestLag));
  let bestPhase = 0;
  let bestPhaseEnergy = -1;
  for (let p = 0; p < phaseFrames; p++) {
    let phaseSum = 0;
    for (let f = p; f < frameCount; f += phaseFrames) {
      phaseSum += onset[f];
    }
    if (phaseSum > bestPhaseEnergy) {
      bestPhaseEnergy = phaseSum;
      bestPhase = p;
    }
  }

  const rawOffset = (startSample / sampleRate + bestPhase / envRate) % beatIntervalSeconds;
  const beatOffsetSeconds = Math.round(rawOffset * 1000) / 1000;

  return {
    bpm,
    confidence: Math.round(confidence * 100) / 100,
    beatOffsetSeconds,
    beatIntervalSeconds,
    estimatedKey: options?.skipKey ? 'Am (Est)' : estimateKeyFromPcm(samples, sampleRate),
  };
}

export function analyzeAudioBufferBpmAndKey(buffer: AudioBuffer): BpmKeyAnalysis {
  if (buffer.numberOfChannels === 0 || buffer.length === 0) {
    return {
      bpm: 120,
      confidence: 0,
      beatOffsetSeconds: 0,
      beatIntervalSeconds: 0.5,
      estimatedKey: 'Am (Est)',
    };
  }
  const ch0 = buffer.getChannelData(0);
  if (buffer.numberOfChannels === 1) {
    return analyzePcmBpmAndKey(ch0, buffer.sampleRate);
  }
  const ch1 = buffer.getChannelData(1);
  // Downmix up to 90s for fast analysis
  const maxLen = Math.min(buffer.length, Math.floor(buffer.sampleRate * 90));
  const mono = new Float32Array(maxLen);
  for (let i = 0; i < maxLen; i++) {
    mono[i] = (ch0[i] + ch1[i]) * 0.5;
  }
  return analyzePcmBpmAndKey(mono, buffer.sampleRate);
}
