import React, { useEffect, useMemo, useRef } from 'react';
import {
  CloudRain,
  Disc3,
  Headphones,
  Moon,
  Pause,
  Play,
  Sliders,
  Sparkles,
  Trees,
  Waves,
} from 'lucide-react';
import { audioEngine } from '../../audio/audioEngine';
import { DEFAULT_LISTENING_ROOM_SETTINGS } from '../../db/sonoraDb';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { ListeningRoomId, SpatialAudioMode } from '../../types/music';
import { ArtworkThumb } from '../library/ArtworkThumb';

interface RoomEnvironmentDef {
  id: ListeningRoomId;
  name: string;
  subtitle: string;
  accentHex: string;
  bgFrom: string;
  bgTo: string;
  suggestedSpatialMode: SpatialAudioMode;
  icon: React.ComponentType<{ className?: string }>;
}

const ROOM_ENVIRONMENTS: RoomEnvironmentDef[] = [
  {
    id: 'minimal',
    name: 'Minimal Dark Studio',
    subtitle: 'Clean matte obsidian acoustic room with subtle pulse ring',
    accentHex: '#ef4444',
    bgFrom: '#09090d',
    bgTo: '#050507',
    suggestedSpatialMode: 'studio',
    icon: Disc3,
  },
  {
    id: 'rain',
    name: 'Rainy Night Cafe',
    subtitle: 'Falling acoustic raindrops reacting smoothly to treble and beat',
    accentHex: '#60a5fa',
    bgFrom: '#070b14',
    bgTo: '#040509',
    suggestedSpatialMode: 'wide_stereo',
    icon: CloudRain,
  },
  {
    id: 'night_drive',
    name: 'Midnight Highway Drive',
    subtitle: 'Perspective horizon streaks accelerated by bass energy',
    accentHex: '#f43f5e',
    bgFrom: '#14060b',
    bgTo: '#050507',
    suggestedSpatialMode: 'virtual_surround',
    icon: Sparkles,
  },
  {
    id: 'space',
    name: 'Deep Space Nebula',
    subtitle: 'Zero-gravity starfield expanding cleanly with midrange transients',
    accentHex: '#a855f7',
    bgFrom: '#0b0614',
    bgTo: '#040407',
    suggestedSpatialMode: '3d_spatial',
    icon: Moon,
  },
  {
    id: 'ocean',
    name: 'Midnight Ocean',
    subtitle: 'Layered harmonic tide waves driven by live FFT spectrum',
    accentHex: '#14b8a6',
    bgFrom: '#051214',
    bgTo: '#040608',
    suggestedSpatialMode: 'headphone_spatial',
    icon: Waves,
  },
  {
    id: 'concert_hall',
    name: 'Symphonic Concert Hall',
    subtitle: 'Warm stage spotlights synchronized to dynamic loudness',
    accentHex: '#f59e0b',
    bgFrom: '#140d05',
    bgTo: '#050507',
    suggestedSpatialMode: 'concert_hall',
    icon: Headphones,
  },
  {
    id: 'sunset',
    name: 'Crimson Sunset Horizon',
    subtitle: 'Solar horizon bands breathing gently with bass warmth',
    accentHex: '#fb7185',
    bgFrom: '#1a0808',
    bgTo: '#050507',
    suggestedSpatialMode: 'cinema',
    icon: Sparkles,
  },
  {
    id: 'forest',
    name: 'Forest Dusk Canopy',
    subtitle: 'Floating firefly particles swaying to tempo and highs',
    accentHex: '#22c55e',
    bgFrom: '#051209',
    bgTo: '#040605',
    suggestedSpatialMode: 'wide_stereo',
    icon: Trees,
  },
];

export const ListeningRoomView: React.FC = () => {
  const settings = useLibraryStore((s) => s.settings);
  const tracks = useLibraryStore((s) => s.tracks);
  const updateAppSettings = useLibraryStore((s) => s.updateAppSettings);
  const selectSpatialAudioMode = useLibraryStore((s) => s.selectSpatialAudioMode);

  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);

  const room = settings.listeningRoom ?? DEFAULT_LISTENING_ROOM_SETTINGS;
  const activeDef = useMemo(
    () => ROOM_ENVIRONMENTS.find((r) => r.id === room.environment) || ROOM_ENVIRONMENTS[0],
    [room.environment]
  );

  const currentTrack = useMemo(
    () => tracks.find((t) => t.id === currentTrackId) || null,
    [tracks, currentTrackId]
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particles = Array.from({ length: 75 }, (_, idx) => ({
      x: (idx * 73) % 1000 / 1000,
      y: (idx * 137) % 1000 / 1000,
      speed: 0.25 + ((idx * 19) % 10) / 15,
      size: 1.2 + (idx % 3) * 0.9,
    }));

    let rafId = 0;
    let phase = 0;

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth || 640;
      const height = canvas.clientHeight || 340;
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const frame = audioEngine.sampleAudioAnalysis();
      const intensity = room.visualEffectsEnabled ? room.backgroundIntensity : 0.15;
      const bass = frame.active ? frame.bass : 0.08;
      const mid = frame.active ? frame.mid : 0.05;
      const treble = frame.active ? frame.treble : 0.04;
      const pulse = frame.active ? frame.beatPulse : 0;

      phase += 0.015 + bass * 0.04 * intensity;

      // Ambient gradient backdrop
      const grad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.48,
        16,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.7
      );
      grad.addColorStop(0, `${activeDef.accentHex}${Math.round(28 + pulse * 55).toString(16).padStart(2, '0')}`);
      grad.addColorStop(0.55, activeDef.bgFrom);
      grad.addColorStop(1, activeDef.bgTo);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      if (room.visualEffectsEnabled) {
        // Music-reactive waves / environment horizon
        const waveCount = activeDef.id === 'ocean' || activeDef.id === 'sunset' ? 4 : 2;
        for (let w = 0; w < waveCount; w++) {
          ctx.beginPath();
          const baseY = height * (0.58 + w * 0.09);
          for (let x = 0; x <= width; x += 12) {
            const normX = x / width;
            const binIdx = Math.min(frame.frequencyData.length - 1, Math.floor(normX * 48));
            const freqAmp = frame.active ? (frame.frequencyData[binIdx] || 0) / 255 : 0.05;
            const yOffset =
              Math.sin(normX * 6 + phase + w * 1.1) * (14 + bass * 38 * intensity) +
              freqAmp * 26 * intensity;
            if (x === 0) ctx.moveTo(x, baseY + yOffset);
            else ctx.lineTo(x, baseY + yOffset);
          }
          ctx.strokeStyle = activeDef.accentHex;
          ctx.globalAlpha = 0.22 + mid * 0.35;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Environment particles (Rain streaks / Stars / Fireflies / Drive streaks)
        if (room.particlesEnabled) {
          ctx.fillStyle = activeDef.accentHex;
          ctx.strokeStyle = activeDef.accentHex;
          for (const p of particles) {
            if (activeDef.id === 'rain') {
              p.y = (p.y + 0.012 * p.speed * (1 + treble * 1.6)) % 1;
              const px = p.x * width;
              const py = p.y * height;
              ctx.globalAlpha = 0.35 * intensity;
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(px - 2, py + 12 + treble * 10);
              ctx.lineWidth = 1;
              ctx.stroke();
            } else if (activeDef.id === 'night_drive') {
              p.x = (p.x + 0.009 * p.speed * (1 + bass * 2)) % 1;
              const px = p.x * width;
              const py = height * 0.45 + (p.y - 0.5) * height * 0.7;
              ctx.globalAlpha = 0.4 * intensity;
              ctx.fillRect(px, py, 14 + bass * 18, 1.5);
            } else {
              p.y = (p.y - 0.0025 * p.speed * (1 + mid) + 1) % 1;
              p.x = (p.x + Math.sin(phase + p.y * 5) * 0.0008 + 1) % 1;
              ctx.globalAlpha = (0.25 + pulse * 0.45) * intensity;
              ctx.beginPath();
              ctx.arc(p.x * width, p.y * height, p.size * (1 + bass * 0.6), 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.globalAlpha = 1;
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [activeDef, room.backgroundIntensity, room.particlesEnabled, room.visualEffectsEnabled]);

  const updateRoom = async (patch: Partial<typeof room>) => {
    const nextRoom = { ...room, ...patch };
    await updateAppSettings({ listeningRoom: nextRoom });
    if (nextRoom.syncSpatialPreset && patch.environment) {
      const targetEnv = ROOM_ENVIRONMENTS.find((r) => r.id === patch.environment);
      if (targetEnv) {
        await selectSpatialAudioMode(targetEnv.suggestedSpatialMode);
      }
    }
  };

  return (
    <section className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-5 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            Virtual Listening Room
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Audio-reactive ambient visual environments with optional Spatial Audio room acoustic pairing
          </p>
        </div>
      </div>

      {/* Live Reactive Room Viewport */}
      <div className="relative rounded-2xl border border-white/[0.1] overflow-hidden min-h-[300px] sm:min-h-[340px] flex flex-col justify-between p-6">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-mono text-gray-300 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
            ENV: {activeDef.name.toUpperCase()}
          </div>
          <div className="text-[11px] text-gray-300 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
            Visual ambience layer · {room.syncSpatialPreset ? `Linked DSP: ${activeDef.suggestedSpatialMode.replace('_', ' ')}` : 'Audio DSP independent'}
          </div>
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4 mt-16">
          <div className="flex items-center gap-4 min-w-0">
            <ArtworkThumb
              artworkId={currentTrack?.artworkId || null}
              alt={currentTrack?.album || 'Listening Room'}
              sizeClass="w-20 h-20"
              roundedClass="rounded-xl"
              sourceType={currentTrack?.sourceType}
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-red-400 uppercase tracking-wider">
                {isPlaying ? 'Live Session Active' : 'Session Ready'}
              </p>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-white truncate mt-0.5">
                {currentTrack ? currentTrack.title : 'Select a Song to Enter Room'}
              </h2>
              <p className="text-sm text-gray-300 truncate">
                {currentTrack ? `${currentTrack.artist} · ${currentTrack.album}` : activeDef.subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={!currentTrack}
            onClick={() => void togglePlayPause()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-semibold text-white shadow-lg disabled:opacity-40 self-start sm:self-end"
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Play</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
        <label className="flex items-center justify-between gap-3 text-xs text-gray-200 cursor-pointer">
          <span>Visual Effects</span>
          <input
            type="checkbox"
            checked={room.visualEffectsEnabled}
            onChange={(e) => void updateRoom({ visualEffectsEnabled: e.target.checked })}
            className="accent-red-600 w-4 h-4"
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-xs text-gray-200 cursor-pointer">
          <span>Ambient Particles</span>
          <input
            type="checkbox"
            checked={room.particlesEnabled}
            onChange={(e) => void updateRoom({ particlesEnabled: e.target.checked })}
            className="accent-red-600 w-4 h-4"
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-xs text-gray-200 cursor-pointer">
          <span>Pair Room Spatial Acoustics</span>
          <input
            type="checkbox"
            checked={room.syncSpatialPreset}
            onChange={(e) => void updateRoom({ syncSpatialPreset: e.target.checked })}
            className="accent-red-600 w-4 h-4"
          />
        </label>

        <label className="space-y-1 text-xs">
          <div className="flex items-center justify-between text-gray-400">
            <span className="inline-flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5" /> Motion Intensity
            </span>
            <span className="font-mono text-white tabular-nums">
              {Math.round(room.backgroundIntensity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.2}
            max={1.5}
            step={0.05}
            value={room.backgroundIntensity}
            onChange={(e) =>
              void updateRoom({ backgroundIntensity: parseFloat(e.target.value) })
            }
            className="sonora-range w-full h-1.5 rounded-full bg-white/10"
          />
        </label>
      </div>

      {/* Environment Selector Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ROOM_ENVIRONMENTS.map((env) => {
          const Icon = env.icon;
          const active = room.environment === env.id;
          return (
            <button
              key={env.id}
              type="button"
              onClick={() => void updateRoom({ environment: env.id })}
              className={`rounded-2xl border p-4 text-left transition-colors space-y-2 ${
                active
                  ? 'border-red-500/60 bg-red-600/10'
                  : 'border-white/[0.07] bg-[#111216] hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <Icon className={`w-4 h-4 ${active ? 'text-red-400' : 'text-gray-400'}`} />
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: env.accentHex }}
                />
              </div>
              <p className="text-sm font-semibold text-white">{env.name}</p>
              <p className="text-xs text-gray-400 line-clamp-2">{env.subtitle}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
};
