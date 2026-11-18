import React from 'react';
import {
  Clock,
  Database,
  Disc3,
  HardDrive,
  Heart,
  ListMusic,
  Mic2,
  Music,
  Settings,
  Sliders,
  Upload,
  Wifi,
} from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import type { AppView } from '../../types/music';
import { formatBytes } from '../../utils/formatters';

interface NavItem {
  id: AppView;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const LIBRARY_ITEMS: NavItem[] = [
  { id: 'songs', label: 'All Songs', icon: Music },
  { id: 'albums', label: 'Albums', icon: Disc3 },
  { id: 'artists', label: 'Artists', icon: Mic2 },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'favorites', label: 'Favorites', icon: Heart },
  { id: 'recent', label: 'Recently Played', icon: Clock },
];

const UTILITY_ITEMS: NavItem[] = [
  { id: 'import', label: 'Import Music', icon: Upload },
  { id: 'transfer', label: 'Wi-Fi Transfer', icon: Wifi },
  { id: 'equalizer', label: 'Equalizer', icon: Sliders },
  { id: 'storage', label: 'Storage Manager', icon: Database },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const activeView = useLibraryStore((s) => s.activeView);
  const setActiveView = useLibraryStore((s) => s.setActiveView);
  const setSelectedPlaylistId = useLibraryStore((s) => s.setSelectedPlaylistId);
  const setSelectedAlbumKey = useLibraryStore((s) => s.setSelectedAlbumKey);
  const setSelectedArtistName = useLibraryStore((s) => s.setSelectedArtistName);
  const playlists = useLibraryStore((s) => s.playlists);
  const storageBreakdown = useLibraryStore((s) => s.storageBreakdown);
  const tracksCount = useLibraryStore((s) => s.tracks.length);
  const importJob = useLibraryStore((s) => s.importJob);

  const navigate = (view: AppView) => {
    setActiveView(view);
    if (view !== 'playlists') setSelectedPlaylistId(null);
    if (view !== 'albums') setSelectedAlbumKey(null);
    if (view !== 'artists') setSelectedArtistName(null);
  };

  const isImporting = importJob.status === 'scanning' || importJob.status === 'importing';

  return (
    <aside className="hidden md:flex flex-col w-[248px] shrink-0 border-r border-white/[0.07] bg-[#08080B] select-none">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/[0.06]">
        <img src="/icon.svg" alt="" className="w-7 h-7 rounded-md shrink-0" />
        <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap">
          SONORA
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <nav aria-label="Library navigation" className="space-y-1">
          {LIBRARY_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-red-600/15 text-red-400'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <nav aria-label="Tools and settings" className="space-y-1 pt-4 border-t border-white/[0.06]">
          {UTILITY_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-red-600/15 text-red-400'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.id === 'import' && isImporting && (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
                )}
              </button>
            );
          })}
        </nav>

        {playlists.length > 0 && (
          <div className="pt-4 border-t border-white/[0.06] space-y-1.5">
            <p className="px-3 text-[11px] font-semibold text-gray-500">Playlists</p>
            <div className="space-y-0.5 max-h-40 overflow-y-auto">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => {
                    setSelectedPlaylistId(pl.id);
                    setActiveView('playlists');
                  }}
                  className="w-full px-3 py-1.5 rounded-lg text-left text-xs text-gray-400 hover:text-white hover:bg-white/[0.04] truncate transition-colors"
                >
                  {pl.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dual Storage Summary Footer */}
      <button
        type="button"
        onClick={() => navigate('storage')}
        className="px-4 py-3.5 border-t border-white/[0.06] text-left text-xs text-gray-400 hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2 text-gray-300 font-medium">
          <HardDrive className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <span>Dual Vault (50 GB)</span>
        </div>
        <p className="mt-1 font-mono text-[11px] tabular-nums text-gray-500">
          {tracksCount} {tracksCount === 1 ? 'track' : 'tracks'}
          {storageBreakdown ? ` · ${formatBytes(storageBreakdown.audioBytes)}` : ''}
        </p>
        {storageBreakdown && (
          <p className="mt-0.5 font-mono text-[10px] tabular-nums text-gray-600">
            S1: {formatBytes(storageBreakdown.storage1.usedBytes)} · S2:{' '}
            {formatBytes(storageBreakdown.storage2.usedBytes)}
          </p>
        )}
      </button>
    </aside>
  );
};
