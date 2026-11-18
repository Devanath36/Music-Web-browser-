import React, { useEffect, useState } from 'react';
import { Disc3, Pause, Sliders, Sparkles } from 'lucide-react';
import { djAudioEngine, type DeckId, type DjEngineSnapshot } from '../../audio/djAudioEngine';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { DjAutoMixRecorderPanel } from '../dj/DjAutoMixRecorderPanel';
import { DjDeckPanel } from '../dj/DjDeckPanel';
import { DjEffectsRack } from '../dj/DjEffectsRack';
import { DjMixerConsole } from '../dj/DjMixerConsole';

type MobileDjTab = 'decks' | 'mixer' | 'effects' | 'automix';

export const DjStudioView: React.FC = () => {
  const tracks = useLibraryStore((s) => s.tracks);
  const normalPlayerPlaying = usePlayerStore((s) => s.isPlaying);
  const toggleNormalPlayer = usePlayerStore((s) => s.togglePlayPause);

  const [snapshot, setSnapshot] = useState<DjEngineSnapshot>(() => djAudioEngine.getSnapshot());
  const [mobileDeck, setMobileDeck] = useState<DeckId>('A');
  const [mobileTab, setMobileTab] = useState<MobileDjTab>('decks');

  useEffect(() => {
    djAudioEngine.setAutoMixTrackResolver((id) =>
      useLibraryStore.getState().tracks.find((t) => t.id === id)
    );
    const unsub = djAudioEngine.subscribe((snap) => {
      setSnapshot(snap);
    });
    return unsub;
  }, []);

  // Auto-load first two local songs on initial open if decks are empty for quick session start
  useEffect(() => {
    const localTracks = tracks.filter((t) => t.sourceType === 'local');
    const cur = djAudioEngine.getSnapshot();
    if (!cur.deckA.track && !cur.deckA.isLoading && localTracks.length >= 1) {
      void djAudioEngine.loadTrack('A', localTracks[0]);
    }
    if (!cur.deckB.track && !cur.deckB.isLoading && localTracks.length >= 2) {
      void djAudioEngine.loadTrack('B', localTracks[1]);
    }
  }, [tracks]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1 pb-6 space-y-4">
      {/* Studio Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/35 flex items-center justify-center">
            <Disc3 className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight">
              SONORA DJ Mixing Studio
            </h1>
            <p className="text-xs text-gray-400">
              Dual-deck Web Audio mixer · BPM &amp; beat sync · 10 real-time effects · Auto Mix &amp; master recording
            </p>
          </div>
        </div>

        {normalPlayerPlaying && (
          <button
            type="button"
            onClick={() => void toggleNormalPlayer()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>Pause Main Player</span>
          </button>
        )}
      </header>

      {/* Mobile Simplified Tab Switcher (< lg) */}
      <div className="lg:hidden space-y-3">
        <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-white/[0.08] bg-[#08090C] p-1">
          {[
            { id: 'decks' as MobileDjTab, label: 'Decks' },
            { id: 'mixer' as MobileDjTab, label: 'Mixer' },
            { id: 'effects' as MobileDjTab, label: 'FX Rack' },
            { id: 'automix' as MobileDjTab, label: 'Auto/Rec' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMobileTab(tab.id)}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                mobileTab === tab.id
                  ? 'bg-red-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mobileTab === 'decks' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(['A', 'B'] as DeckId[]).map((id) => {
                const dk = id === 'A' ? snapshot.deckA : snapshot.deckB;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMobileDeck(id)}
                    className={`px-3 py-2 rounded-xl border text-left transition-colors ${
                      mobileDeck === id
                        ? 'border-red-500/50 bg-red-600/15 text-white'
                        : 'border-white/[0.07] bg-[#0B0C10] text-gray-400'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>DECK {id}</span>
                      <span className="font-mono">{dk.effectiveBpm.toFixed(1)} BPM</span>
                    </div>
                    <p className="text-[11px] truncate text-gray-300 mt-0.5">
                      {dk.track ? dk.track.title : 'Empty'}
                    </p>
                  </button>
                );
              })}
            </div>

            {mobileDeck === 'A' ? (
              <DjDeckPanel
                deck={snapshot.deckA}
                otherDeckLoaded={Boolean(snapshot.deckB.track)}
                tracks={tracks}
                compact
              />
            ) : (
              <DjDeckPanel
                deck={snapshot.deckB}
                otherDeckLoaded={Boolean(snapshot.deckA.track)}
                tracks={tracks}
                compact
              />
            )}

            {/* Quick Mobile Crossfader always handy under active deck */}
            <div className="rounded-xl border border-white/[0.08] bg-[#0B0C10] p-3 space-y-1.5">
              <div className="flex justify-between text-[11px] font-mono text-gray-300">
                <span className="text-red-400">DECK A</span>
                <span>CROSSFADER</span>
                <span className="text-orange-400">DECK B</span>
              </div>
              <input
                type="range"
                aria-label="Mobile DJ Crossfader"
                min={-1}
                max={1}
                step={0.01}
                value={snapshot.crossfader}
                onChange={(e) => djAudioEngine.setCrossfader(parseFloat(e.target.value), true)}
                className="sonora-range w-full h-2 rounded-full bg-gradient-to-r from-red-600/40 via-white/20 to-orange-500/40"
              />
            </div>
          </div>
        )}

        {mobileTab === 'mixer' && <DjMixerConsole snapshot={snapshot} />}
        {mobileTab === 'effects' && <DjEffectsRack snapshot={snapshot} />}
        {mobileTab === 'automix' && (
          <DjAutoMixRecorderPanel snapshot={snapshot} tracks={tracks} />
        )}
      </div>

      {/* Desktop Full Dual-Deck DJ Console (lg+) */}
      <div className="hidden lg:block space-y-4">
        <div className="grid grid-cols-12 gap-4 items-start">
          <div className="col-span-5">
            <DjDeckPanel
              deck={snapshot.deckA}
              otherDeckLoaded={Boolean(snapshot.deckB.track)}
              tracks={tracks}
            />
          </div>

          <div className="col-span-2">
            <DjMixerConsole snapshot={snapshot} />
          </div>

          <div className="col-span-5">
            <DjDeckPanel
              deck={snapshot.deckB}
              otherDeckLoaded={Boolean(snapshot.deckA.track)}
              tracks={tracks}
            />
          </div>
        </div>

        <DjEffectsRack snapshot={snapshot} />
        <DjAutoMixRecorderPanel snapshot={snapshot} tracks={tracks} />
      </div>

      <footer className="flex flex-wrap items-center gap-4 text-[11px] text-gray-500 pt-1">
        <span className="inline-flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5" />
          <span>2-Deck Web Audio DSP Graph</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          <span>100% Offline IndexedDB AudioBuffer Decoding</span>
        </span>
      </footer>
    </div>
  );
};
