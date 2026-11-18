import React from 'react';
import { Keyboard, Mic, Radio, Search, WifiOff, X } from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

interface TopBarProps {
  onOpenVoice?: () => void;
  onOpenShortcuts?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenVoice, onOpenShortcuts }) => {
  const searchQuery = useLibraryStore((s) => s.searchQuery);
  const setSearchQuery = useLibraryStore((s) => s.setSearchQuery);
  const networkMode = useLibraryStore((s) => s.settings.networkMode);
  const setNetworkMode = useLibraryStore((s) => s.setNetworkMode);
  const activeView = useLibraryStore((s) => s.activeView);
  const setActiveView = useLibraryStore((s) => s.setActiveView);

  const showSearch =
    activeView === 'songs' ||
    activeView === 'favorites' ||
    activeView === 'albums' ||
    activeView === 'artists' ||
    activeView === 'genres' ||
    activeView === 'folders';

  return (
    <header className="flex items-center justify-between gap-3 sm:gap-5 px-4 sm:px-6 h-16 border-b border-white/[0.07] bg-[#050507]/90 backdrop-blur-md shrink-0">
      <div className="flex md:hidden items-center gap-2 shrink-0">
        <img src="/icon.svg" alt="" className="w-6 h-6 rounded" />
        <span className="font-display text-base font-bold tracking-tight text-white">SONORA</span>
      </div>

      <div className="flex-1 max-w-md min-w-0">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!showSearch && e.target.value.trim()) {
                setActiveView('songs');
              }
            }}
            placeholder="Search songs, artists, albums..."
            aria-label="Search music library"
            className="w-full min-h-[40px] rounded-xl border border-white/[0.08] bg-[#111216] pl-9 pr-8 py-1.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500/70 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2 p-1 text-gray-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {onOpenVoice && (
          <button
            type="button"
            onClick={onOpenVoice}
            aria-label="Open Voice Music Control"
            title="Voice Music Control"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-white/10 bg-[#111216] text-gray-300 hover:text-red-400 hover:border-red-500/40 transition-colors"
          >
            <Mic className="w-4 h-4" />
          </button>
        )}

        {onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            aria-label="Keyboard Shortcuts"
            title="Keyboard Shortcuts"
            className="hidden sm:flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border border-white/10 bg-[#111216] text-gray-300 hover:text-red-400 hover:border-red-500/40 transition-colors"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        )}

        <div
          role="group"
          aria-label="Playback network mode"
          className="inline-flex items-center rounded-xl border border-white/10 bg-[#111216] p-1"
        >
          <button
            type="button"
            onClick={() => setNetworkMode('offline')}
            aria-pressed={networkMode === 'offline'}
            className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              networkMode === 'offline'
                ? 'bg-red-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <WifiOff className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Offline</span>
          </button>
          <button
            type="button"
            onClick={() => setNetworkMode('online')}
            aria-pressed={networkMode === 'online'}
            className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              networkMode === 'online'
                ? 'bg-emerald-500 text-[#050507]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Online</span>
          </button>
        </div>

        <PWAInstallButton compact />
      </div>
    </header>
  );
};
