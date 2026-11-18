import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../../audio/audioEngine';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { VisualizerStyle } from '../../types/music';

interface AudioReactiveCanvasProps {
  variant: 'background' | 'stage';
  style: VisualizerStyle;
  enabled: boolean;
  isPlaying: boolean;
  animationIntensity: number;
  backgroundIntensity: number;
  threeDEnabled: boolean;
  performanceMode: boolean;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hueShift: number;
  alpha: number;
}

const PARTICLE_COUNT_NORMAL = 54;
const PARTICLE_COUNT_PERF = 26;

function createParticles(count: number, width: number, height: number): Particle[] {
  const list: Particle[] = [];
  for (let i = 0; i < count; i++) {
    list.push({
      x: Math.random() * Math.max(1, width),
      y: Math.random() * Math.max(1, height),
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      radius: 1.2 + Math.random() * 2.6,
      hueShift: Math.random(),
      alpha: 0.25 + Math.random() * 0.55,
    });
  }
  return list;
}

export const AudioReactiveCanvas: React.FC<AudioReactiveCanvasProps> = ({
  variant,
  style,
  enabled,
  isPlaying,
  animationIntensity,
  backgroundIntensity,
  threeDEnabled,
  performanceMode,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!enabled) return;
    if (variant === 'background' && backgroundIntensity <= 0.01) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let rafId = 0;
    let lastDrawTs = 0;
    let phase = 0;
    let smoothedBass = 0;
    let smoothedMid = 0;
    let smoothedTreble = 0;
    let smoothedBeat = 0;
    let smoothedLeft = 0;
    let smoothedRight = 0;
    let smoothedSpread = 0;
    const peakHolds = new Float32Array(64);
    let particles = createParticles(
      performanceMode ? PARTICLE_COUNT_PERF : PARTICLE_COUNT_NORMAL,
      800,
      600
    );

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      const targetDpr = performanceMode ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      dpr = targetDpr;
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const desiredCount = performanceMode ? PARTICLE_COUNT_PERF : PARTICLE_COUNT_NORMAL;
      if (particles.length !== desiredCount) {
        particles = createParticles(desiredCount, width, height);
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(canvas);

    const drawBackground = (
      freq: Uint8Array,
      time: Uint8Array,
      bass: number,
      mid: number,
      treble: number,
      beat: number
    ) => {
      const bgAlpha = Math.max(0.05, Math.min(1, backgroundIntensity));
      ctx.clearRect(0, 0, width, height);

      // Bass-synchronized radial crimson ambient glow
      const cx = width * 0.5;
      const cy = height * 0.45;
      const maxR = Math.max(width, height) * (0.48 + bass * 0.28 + beat * 0.12);
      const rad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      const redCoreAlpha = Math.min(0.45, (0.08 + bass * 0.26 + beat * 0.14) * bgAlpha);
      const warmAlpha = Math.min(0.24, (mid * 0.14 + beat * 0.1) * bgAlpha);

      rad.addColorStop(0, `rgba(239, 68, 68, ${redCoreAlpha.toFixed(3)})`);
      rad.addColorStop(0.45, `rgba(127, 29, 29, ${(redCoreAlpha * 0.72).toFixed(3)})`);
      rad.addColorStop(0.72, `rgba(180, 60, 20, ${warmAlpha.toFixed(3)})`);
      rad.addColorStop(1, 'rgba(5, 5, 7, 0)');
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, width, height);

      if (reducedMotion) return;

      // Flowing music-reactive waveform bands behind player UI
      const waveLayers = performanceMode ? 2 : 3;
      const samples = time.length;

      for (let layer = 0; layer < waveLayers; layer++) {
        const yBase = height * (0.48 + (layer - 1) * 0.11);
        const ampScale =
          (28 + layer * 14) *
          (0.35 + bass * 1.15 + mid * 0.65) *
          bgAlpha *
          animationIntensity;

        ctx.beginPath();
        const step = performanceMode ? 4 : 2;
        for (let i = 0; i < samples; i += step) {
          const x = (i / (samples - 1)) * width;
          const pcm = (time[i] - 128) / 128;
          const freqVal = (freq[Math.min(freq.length - 1, Math.floor((i / samples) * 64))] || 0) / 255;
          const flow =
            Math.sin(i * 0.045 + phase * (1.1 + layer * 0.35) + layer * 1.9) *
            (0.25 + freqVal * 0.9);
          const y = yBase + (pcm * 0.7 + flow * 0.5) * ampScale;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        const strokeAlpha =
          layer === 0
            ? Math.min(0.42, (0.12 + bass * 0.25) * bgAlpha)
            : layer === 1
              ? Math.min(0.32, (0.08 + mid * 0.22) * bgAlpha)
              : Math.min(0.24, (0.05 + treble * 0.2) * bgAlpha);

        ctx.strokeStyle =
          layer === 2 && beat > 0.35
            ? `rgba(251, 146, 60, ${strokeAlpha.toFixed(3)})`
            : `rgba(239, 68, 68, ${strokeAlpha.toFixed(3)})`;
        ctx.lineWidth = layer === 0 ? 2 : 1.3;
        ctx.stroke();
      }
    };

    const drawWaveform = (freq: Uint8Array, time: Uint8Array, bass: number, beat: number) => {
      const cy = height * 0.5;
      const intensity = animationIntensity;
      const samples = time.length;

      // Subtle center guide
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(width, cy);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const layers = performanceMode ? 2 : 3;
      for (let l = 0; l < layers; l++) {
        ctx.beginPath();
        const layerAmp = height * (0.28 - l * 0.05) * intensity * (0.65 + bass * 0.8);
        const step = performanceMode ? 3 : 1;

        for (let i = 0; i < samples; i += step) {
          const t = i / (samples - 1);
          const x = t * width;
          const pcm = (time[i] - 128) / 128;
          const binIdx = Math.min(freq.length - 1, Math.floor(t * 48));
          const harmonic = ((freq[binIdx] || 0) / 255) * Math.sin(t * Math.PI * 6 + phase * (1.2 + l * 0.4));
          const env = Math.sin(t * Math.PI);
          const y = cy + (pcm * 0.8 + harmonic * 0.28) * layerAmp * (0.35 + env * 0.65);

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.strokeStyle =
          l === 0
            ? `rgba(239, 68, 68, ${Math.min(0.95, 0.55 + beat * 0.4).toFixed(2)})`
            : l === 1
              ? 'rgba(251, 146, 60, 0.42)'
              : 'rgba(153, 27, 27, 0.55)';
        ctx.lineWidth = l === 0 ? 2.6 : 1.4;
        ctx.stroke();
      }
    };

    const drawBars = (freq: Uint8Array, beat: number) => {
      const barCount = performanceMode ? 32 : 52;
      const gap = width < 420 ? 3 : 4;
      const totalWidth = width * 0.92;
      const startX = (width - totalWidth) * 0.5;
      const barW = Math.max(2, (totalWidth - gap * (barCount - 1)) / barCount);
      const maxH = height * 0.78;
      const baseline = height * 0.88;

      for (let i = 0; i < barCount; i++) {
        const binIdx = Math.min(freq.length - 1, Math.floor((i / barCount) * 72));
        const norm = ((freq[binIdx] || 0) / 255) * animationIntensity;
        const clamped = Math.min(1, norm);
        const h = Math.max(3, clamped * maxH);

        if (h > peakHolds[i]) {
          peakHolds[i] = h;
        } else {
          peakHolds[i] = Math.max(3, peakHolds[i] - (reducedMotion ? 8 : 2.1));
        }

        const x = startX + i * (barW + gap);
        const y = baseline - h;

        const grad = ctx.createLinearGradient(x, baseline, x, y);
        grad.addColorStop(0, 'rgba(127, 29, 29, 0.85)');
        grad.addColorStop(0.6, 'rgba(239, 68, 68, 0.92)');
        grad.addColorStop(1, beat > 0.4 ? 'rgba(253, 186, 116, 0.95)' : 'rgba(248, 113, 113, 0.95)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, h, [3, 3, 0, 0]);
        ctx.fill();

        // Peak cap
        const peakY = baseline - peakHolds[i] - 3;
        ctx.fillStyle = 'rgba(254, 202, 202, 0.75)';
        ctx.fillRect(x, peakY, barW, 2);
      }
    };

    const drawCircular = (
      freq: Uint8Array,
      time: Uint8Array,
      bass: number,
      beat: number,
      lrBias: number,
      spread: number
    ) => {
      const cx = width * 0.5 + lrBias * width * 0.04;
      const cy = height * 0.5;
      const minDim = Math.min(width, height);
      const innerR = minDim * (0.34 + spread * 0.03) + bass * 8 * animationIntensity;
      const bars = performanceMode ? 48 : 84;

      // Soft inner halo
      const halo = ctx.createRadialGradient(cx, cy, innerR * 0.7, cx, cy, innerR * 1.55);
      halo.addColorStop(0, `rgba(239, 68, 68, ${(0.08 + bass * 0.25 + beat * 0.15).toFixed(2)})`);
      halo.addColorStop(1, 'rgba(5, 5, 7, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, innerR * 1.55, 0, Math.PI * 2);
      ctx.fill();

      // Radial frequency spikes
      for (let i = 0; i < bars; i++) {
        const angle = (i / bars) * Math.PI * 2 + phase * 0.12;
        const binIdx = Math.min(freq.length - 1, Math.floor((i / bars) * 64));
        const amp = ((freq[binIdx] || 0) / 255) * (minDim * 0.17) * animationIntensity;

        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle) * (innerR + Math.max(3, amp));
        const y2 = cy + Math.sin(angle) * (innerR + Math.max(3, amp));

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle =
          amp > minDim * 0.1 && beat > 0.35
            ? 'rgba(251, 146, 60, 0.92)'
            : 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = performanceMode ? 2 : 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Outer waveform ring
      const ringSamples = 96;
      ctx.beginPath();
      for (let i = 0; i <= ringSamples; i++) {
        const idx = i % ringSamples;
        const angle = (idx / ringSamples) * Math.PI * 2 - phase * 0.18;
        const pcm = (time[Math.min(time.length - 1, idx * 2)] - 128) / 128;
        const r = innerR * 1.06 + pcm * (14 + bass * 18) * animationIntensity;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    };

    const drawParticles = (
      bass: number,
      mid: number,
      treble: number,
      beat: number,
      lrBias: number,
      spread: number
    ) => {
      const cx = width * (0.5 + lrBias * 0.12);
      const cy = height * 0.5;
      const speedMult = reducedMotion
        ? 0
        : (0.55 + bass * 2.4 + beat * 1.6 + spread * 0.65) * animationIntensity;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.max(20, Math.hypot(dx, dy));

        if (!reducedMotion) {
          p.x += (p.vx * speedMult + (dx / dist) * beat * 1.4 * animationIntensity + lrBias * 0.55);
          p.y += p.vy * speedMult + (dy / dist) * beat * 1.4 * animationIntensity;

          if (p.x < -12) p.x = width + 12;
          if (p.x > width + 12) p.x = -12;
          if (p.y < -12) p.y = height + 12;
          if (p.y > height + 12) p.y = -12;
        }

        const r = p.radius * (1 + mid * 1.1 + beat * 0.75 * animationIntensity);
        const alpha = Math.min(0.92, p.alpha * (0.45 + treble * 0.6 + bass * 0.55));
        const isWarm = p.hueShift > 0.78 && (beat > 0.25 || treble > 0.35);

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isWarm
          ? `rgba(251, 146, 60, ${alpha.toFixed(2)})`
          : `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
        ctx.fill();

        if (!performanceMode && i > 0 && i % 3 === 0) {
          const prev = particles[i - 1];
          const linkDist = Math.hypot(p.x - prev.x, p.y - prev.y);
          if (linkDist < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(prev.x, prev.y);
            ctx.strokeStyle = `rgba(239, 68, 68, ${((1 - linkDist / 120) * 0.22 * (0.4 + mid)).toFixed(3)})`;
            ctx.lineWidth = 0.9;
            ctx.stroke();
          }
        }
      }
    };

    const draw3D = (freq: Uint8Array, bass: number, beat: number) => {
      const cx = width * 0.5;
      const cy = height * 0.56;
      const count = performanceMode ? 24 : 36;
      const orbitRadius = Math.min(width, height) * 0.28;
      const rotY = reducedMotion ? 0.5 : phase * (threeDEnabled ? 0.42 : 0);
      const tilt = threeDEnabled ? 0.42 + bass * 0.14 : 0.15;
      const fov = 360;

      interface ProjectedBar {
        sx: number;
        sy: number;
        sz: number;
        barH: number;
        scale: number;
        norm: number;
      }

      const projected: ProjectedBar[] = [];
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + rotY;
        const x3d = Math.cos(angle) * orbitRadius;
        const z3d = Math.sin(angle) * orbitRadius;
        const y3d = z3d * Math.sin(tilt);
        const depth = z3d * Math.cos(tilt) + fov;
        const scale = fov / Math.max(80, depth);
        const binIdx = Math.min(freq.length - 1, Math.floor((i / count) * 60));
        const norm = Math.min(1, ((freq[binIdx] || 0) / 255) * animationIntensity);
        const barH = (12 + norm * Math.min(height * 0.36, 130)) * scale;

        projected.push({
          sx: cx + x3d * scale,
          sy: cy + y3d * scale,
          sz: depth,
          barH,
          scale,
          norm,
        });
      }

      // Painter's algorithm depth sort (back to front)
      projected.sort((a, b) => b.sz - a.sz);

      for (const bar of projected) {
        const w = Math.max(3, 8 * bar.scale);
        const alpha = Math.max(0.22, Math.min(0.95, (1.2 - (bar.sz - fov) / (orbitRadius * 2)) * 0.78));
        const yTop = bar.sy - bar.barH;

        const grad = ctx.createLinearGradient(bar.sx, bar.sy, bar.sx, yTop);
        grad.addColorStop(0, `rgba(127, 29, 29, ${(alpha * 0.85).toFixed(2)})`);
        grad.addColorStop(1, bar.norm > 0.72 && beat > 0.3 ? `rgba(253, 186, 116, ${alpha.toFixed(2)})` : `rgba(239, 68, 68, ${alpha.toFixed(2)})`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(bar.sx - w * 0.5, yTop, w, bar.barH, 3);
        ctx.fill();
      }
    };

    const drawSpectrum = (freq: Uint8Array, beat: number) => {
      const bins = performanceMode ? 42 : 76;
      const bottomY = height * 0.88;
      const usableH = height * 0.68;

      ctx.beginPath();
      ctx.moveTo(0, bottomY);

      for (let i = 0; i < bins; i++) {
        const t = i / (bins - 1);
        const x = t * width;
        const norm = Math.min(1, ((freq[i] || 0) / 255) * animationIntensity);
        const y = bottomY - norm * usableH;

        if (i === 0) {
          ctx.lineTo(x, y);
        } else {
          const prevT = (i - 1) / (bins - 1);
          const prevX = prevT * width;
          const prevNorm = Math.min(1, ((freq[i - 1] || 0) / 255) * animationIntensity);
          const prevY = bottomY - prevNorm * usableH;
          const midX = (prevX + x) * 0.5;
          ctx.quadraticCurveTo(prevX, prevY, midX, (prevY + y) * 0.5);
        }
      }

      ctx.lineTo(width, bottomY);
      ctx.closePath();

      const fillGrad = ctx.createLinearGradient(0, bottomY - usableH, 0, bottomY);
      fillGrad.addColorStop(0, beat > 0.4 ? 'rgba(251, 146, 60, 0.55)' : 'rgba(239, 68, 68, 0.58)');
      fillGrad.addColorStop(0.65, 'rgba(153, 27, 27, 0.30)');
      fillGrad.addColorStop(1, 'rgba(5, 5, 7, 0.04)');
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // Contour highlight stroke
      ctx.beginPath();
      for (let i = 0; i < bins; i++) {
        const t = i / (bins - 1);
        const x = t * width;
        const norm = Math.min(1, ((freq[i] || 0) / 255) * animationIntensity);
        const y = bottomY - norm * usableH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.92)';
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    const drawAmbient = (bass: number, mid: number, treble: number, beat: number) => {
      const shiftX = reducedMotion ? 0 : Math.sin(phase * 0.45) * width * 0.14;
      const shiftY = reducedMotion ? 0 : Math.cos(phase * 0.35) * height * 0.12;

      const g1 = ctx.createRadialGradient(
        width * 0.36 + shiftX,
        height * 0.44 + shiftY,
        10,
        width * 0.36 + shiftX,
        height * 0.44 + shiftY,
        Math.max(width, height) * (0.45 + bass * 0.25)
      );
      g1.addColorStop(0, `rgba(239, 68, 68, ${(0.22 + bass * 0.35 + beat * 0.18).toFixed(2)})`);
      g1.addColorStop(1, 'rgba(5, 5, 7, 0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, width, height);

      const g2 = ctx.createRadialGradient(
        width * 0.65 - shiftX * 0.8,
        height * 0.56 - shiftY * 0.8,
        10,
        width * 0.65 - shiftX * 0.8,
        height * 0.56 - shiftY * 0.8,
        Math.max(width, height) * (0.4 + mid * 0.22)
      );
      g2.addColorStop(0, `rgba(251, 146, 60, ${(0.1 + treble * 0.22 + beat * 0.12).toFixed(2)})`);
      g2.addColorStop(1, 'rgba(5, 5, 7, 0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, width, height);
    };

    const drawSpatial3D = (
      freq: Uint8Array,
      leftLevel: number,
      rightLevel: number,
      spread: number,
      bass: number,
      mid: number,
      beat: number
    ) => {
      const cx = width * 0.5;
      const cy = height * 0.52;
      const minDim = Math.min(width, height);
      const baseRx = minDim * (0.32 + spread * 0.08);
      const baseRy = baseRx * 0.48;
      const lrDiff = rightLevel - leftLevel;

      // Concentric spatial azimuth rings
      const rings = performanceMode ? 2 : 3;
      for (let rIdx = 0; rIdx < rings; rIdx++) {
        const ratio = 0.55 + rIdx * 0.28 + bass * 0.06 * animationIntensity;
        ctx.beginPath();
        ctx.ellipse(
          cx + lrDiff * 14 * animationIntensity,
          cy,
          baseRx * ratio,
          baseRy * ratio,
          lrDiff * 0.14,
          0,
          Math.PI * 2
        );
        ctx.strokeStyle =
          rIdx === rings - 1
            ? `rgba(239, 68, 68, ${(0.18 + spread * 0.35 + beat * 0.15).toFixed(2)})`
            : 'rgba(255, 255, 255, 0.09)';
        ctx.lineWidth = rIdx === rings - 1 ? 1.8 : 1;
        ctx.stroke();
      }

      // Live Left & Right channel energy arcs
      const leftArcRadius = baseRx * (0.95 + leftLevel * 0.28 * animationIntensity);
      ctx.beginPath();
      ctx.arc(cx - minDim * 0.06, cy, leftArcRadius, Math.PI * 0.68, Math.PI * 1.32);
      ctx.strokeStyle = `rgba(239, 68, 68, ${(0.35 + leftLevel * 0.6).toFixed(2)})`;
      ctx.lineWidth = 3 + leftLevel * 3;
      ctx.lineCap = 'round';
      ctx.stroke();

      const rightArcRadius = baseRx * (0.95 + rightLevel * 0.28 * animationIntensity);
      ctx.beginPath();
      ctx.arc(cx + minDim * 0.06, cy, rightArcRadius, -Math.PI * 0.32, Math.PI * 0.32);
      ctx.strokeStyle = `rgba(251, 146, 60, ${(0.35 + rightLevel * 0.6).toFixed(2)})`;
      ctx.lineWidth = 3 + rightLevel * 3;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Projected 3D orbital surround nodes synchronized with frequency bins & stereo spread
      const nodes = performanceMode ? 20 : 32;
      const fov = 340;
      const orbitY = reducedMotion ? 0 : phase * 0.55;
      for (let i = 0; i < nodes; i++) {
        const theta = (i / nodes) * Math.PI * 2 + orbitY;
        const binIdx = Math.min(freq.length - 1, Math.floor((i / nodes) * 56));
        const energy = ((freq[binIdx] || 0) / 255) * animationIntensity;
        const ringR = baseRx * (0.88 + spread * 0.24 + energy * 0.22);
        const x3d = Math.cos(theta) * ringR + lrDiff * 24;
        const z3d = Math.sin(theta) * ringR;
        const y3d = Math.sin(theta * 2 + phase) * (14 + mid * 28) * animationIntensity;
        const depth = z3d * 0.65 + fov;
        const scale = fov / Math.max(90, depth);
        const sx = cx + x3d * scale;
        const sy = cy + (z3d * 0.32 - y3d) * scale;
        const dotR = Math.max(1.8, (2.4 + energy * 4.2) * scale);
        const alpha = Math.max(0.2, Math.min(0.95, 0.35 + energy * 0.65));

        ctx.beginPath();
        ctx.arc(sx, sy, dotR, 0, Math.PI * 2);
        ctx.fillStyle =
          energy > 0.65 && beat > 0.3
            ? `rgba(253, 186, 116, ${alpha.toFixed(2)})`
            : `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
        ctx.fill();
      }
    };

    const renderFrame = (ts: number) => {
      rafId = requestAnimationFrame(renderFrame);

      const minInterval = performanceMode ? 33 : 16;
      if (ts - lastDrawTs < minInterval) return;
      lastDrawTs = ts;

      const frame = audioEngine.sampleAudioAnalysis();

      // Smooth energy decay so visuals settle cleanly when paused
      const lerpFactor = frame.active ? 0.32 : 0.12;
      smoothedBass += (frame.bass - smoothedBass) * lerpFactor;
      smoothedMid += (frame.mid - smoothedMid) * lerpFactor;
      smoothedTreble += (frame.treble - smoothedTreble) * lerpFactor;
      smoothedBeat += (frame.beatPulse - smoothedBeat) * 0.38;
      smoothedLeft += (frame.leftLevel - smoothedLeft) * lerpFactor;
      smoothedRight += (frame.rightLevel - smoothedRight) * lerpFactor;
      smoothedSpread += (frame.stereoSpread - smoothedSpread) * lerpFactor;

      if (frame.active && !reducedMotion) {
        phase += (0.018 + smoothedOverallOrBass(smoothedBass, smoothedMid) * 0.04) * animationIntensity;
      }

      if (variant === 'background') {
        drawBackground(
          frame.frequencyData,
          frame.timeDomainData,
          smoothedBass,
          smoothedMid,
          smoothedTreble,
          smoothedBeat
        );
        return;
      }

      const lrBias = smoothedRight - smoothedLeft;

      ctx.clearRect(0, 0, width, height);
      switch (style) {
        case 'waveform':
          drawWaveform(frame.frequencyData, frame.timeDomainData, smoothedBass, smoothedBeat);
          break;
        case 'bars':
          drawBars(frame.frequencyData, smoothedBeat);
          break;
        case 'circular':
          drawCircular(
            frame.frequencyData,
            frame.timeDomainData,
            smoothedBass,
            smoothedBeat,
            lrBias,
            smoothedSpread
          );
          break;
        case 'particles':
          drawParticles(
            smoothedBass,
            smoothedMid,
            smoothedTreble,
            smoothedBeat,
            lrBias,
            smoothedSpread
          );
          break;
        case '3d':
          draw3D(frame.frequencyData, smoothedBass, smoothedBeat);
          break;
        case 'spatial_3d':
          drawSpatial3D(
            frame.frequencyData,
            smoothedLeft,
            smoothedRight,
            smoothedSpread,
            smoothedBass,
            smoothedMid,
            smoothedBeat
          );
          break;
        case 'spectrum':
          drawSpectrum(frame.frequencyData, smoothedBeat);
          break;
        case 'ambient':
          drawAmbient(smoothedBass, smoothedMid, smoothedTreble, smoothedBeat);
          break;
      }
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [
    variant,
    style,
    enabled,
    isPlaying,
    animationIntensity,
    backgroundIntensity,
    threeDEnabled,
    performanceMode,
    reducedMotion,
  ]);

  if (!enabled) return null;
  if (variant === 'background' && backgroundIntensity <= 0.01) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none block w-full h-full ${className}`}
    />
  );
};

function smoothedOverallOrBass(bass: number, mid: number): number {
  return bass * 0.65 + mid * 0.35;
}
