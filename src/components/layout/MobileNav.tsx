import React, { useState } from 'react';
import {
  Clock,
  Database,
  Disc3,
  Heart,
  ListMusic,
  Menu,
  Mic2,
  Music,
  Settings,
  Sliders,
  Upload,
  Wifi,
  X,
} from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import type { AppView } from '../../types/music';

export const MobileNav: React.FC = () => {
  const activeView = useLibraryStore((s) => s.activeView);
  const setActiveView = useLibraryStore((s) => s.setActiveView);
  const setSelectedPlaylistId = useLibraryStore((s) => s.setSelectedPlaylistId);
  const setSelectedAlbumKey = useLibraryStore((s) => s.setSelectedAlbumKey);
  const setSelectedArtistName = useLibraryStore((s) => s.setSelectedArtistName);
  const [moreOpen, setMoreOpen] = useState(false);

  const go = (view: AppView) => {
    setActiveView(view);
    if (view !== 'playlists') setSelectedPlaylistId(null);
    if (view !== 'albums') setSelectedAlbumKey(null);
    if (view !== 'artists') setSelectedArtistName(null);
    setMoreOpen(false);
  };

  const primaryTabs: { id: AppView; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'songs', label: 'Songs', icon: Music },
    { id: 'albums', label: 'Albums', icon: Disc3 },
    { id: 'playlists', label: 'Playlists', icon: ListMusic },
    { id: 'import', label: 'Import', icon: Upload },
  ];

  const isSecondaryActive =
    activeView === 'favorites' ||
    activeView === 'artists' ||
    activeView === 'recent' ||
    activeView === 'transfer' ||
    activeView === 'equalizer' ||
    activeView === 'storage' ||
    activeView === 'settings';

  return (
    <>
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl border-t border-white/10 bg-[#111216] p-5 pb-8 space-y-1.5 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <span className="font-display text-base font-semibold text-white">
                Library &amp; Studio Tools
              </span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {[
              { id: 'favorites' as AppView, label: 'Favorites', icon: Heart },
              { id: 'artists' as AppView, label: 'Artists', icon: Mic2 },
              { id: 'recent' as AppView, label: 'Recently Played', icon: Clock },
              { id: 'transfer' as AppView, label: 'Wi-Fi Transfer', icon: Wifi },
              { id: 'equalizer' as AppView, label: 'Equalizer', icon: Sliders },
              { id: 'storage' as AppView, label: 'Storage Manager', icon: Database },
              { id: 'settings' as AppView, label: 'Settings', icon: Settings },
            ].map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  className={`w-full min-h-[48px] flex items-center gap-3.5 px-4 rounded-xl text-sm font-medium ${
                    active ? 'bg-red-600/15 text-red-400' : 'text-gray-200 hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <nav
        aria-label="Mobile navigation"
        className="md:hidden grid grid-cols-5 border-t border-white/[0.08] bg-[#08080B]/95 backdrop-blur-md"
      >
        {primaryTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => go(tab.id)}
              className={`min-h-[54px] flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
                active ? 'text-red-400' : 'text-gray-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{tab.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`min-h-[54px] flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
            isSecondaryActive ? 'text-red-400' : 'text-gray-400'
          }`}
        >
          <Menu className="w-5 h-5" />
          <span>More</span>
        </button>
      </nav>
    </>
  );
};
