import React, { useState } from 'react';
import {
  AlignLeft,
  AudioLines,
  BarChart3,
  Clock,
  Database,
  Disc,
  Disc3,
  Flame,
  Folder,
  Heart,
  ListMusic,
  Menu,
  Mic2,
  Music,
  Orbit,
  Radio,
  Settings,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Wand2,
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
  const deletedCount = useLibraryStore((s) => s.deletedTracks.length);
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
    activeView !== 'songs' &&
    activeView !== 'albums' &&
    activeView !== 'playlists' &&
    activeView !== 'import';

  const secondaryGroups: Array<{
    heading: string;
    items: Array<{ id: AppView; label: string; icon: React.FC<{ className?: string }>; count?: number }>;
  }> = [
    {
      heading: 'Library Views',
      items: [
        { id: 'favorites', label: 'Favorites', icon: Heart },
        { id: 'artists', label: 'Artists', icon: Mic2 },
        { id: 'genres', label: 'Genres', icon: Tag },
        { id: 'folders', label: 'Folders', icon: Folder },
        { id: 'smart_playlists', label: 'Smart Playlists', icon: SlidersHorizontal },
        { id: 'recent', label: 'Recently Played', icon: Clock },
        { id: 'most_played', label: 'Most Played', icon: Flame },
        { id: 'dj_mixes', label: 'Saved DJ Mixes', icon: Radio },
        { id: 'deleted', label: 'Recently Deleted', icon: Trash2, count: deletedCount },
      ],
    },
    {
      heading: 'Intelligence & Immersion',
      items: [
        { id: 'recommendations', label: 'For You', icon: Sparkles },
        { id: 'lyrics', label: 'Lyrics', icon: AlignLeft },
        { id: 'listening_room', label: 'Listening Room', icon: Wand2 },
        { id: 'analytics', label: 'Analytics', icon: BarChart3 },
        { id: 'vocal_isolation', label: 'Vocal Isolation', icon: AudioLines },
      ],
    },
    {
      heading: 'Audio & System',
      items: [
        { id: 'transfer', label: 'Wi-Fi Transfer', icon: Wifi },
        { id: 'equalizer', label: 'Equalizer', icon: Sliders },
        { id: 'spatial', label: 'Spatial Audio', icon: Orbit },
        { id: 'dj', label: 'DJ Studio', icon: Disc },
        { id: 'storage', label: 'Storage Manager', icon: Database },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  return (
    <>
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl border-t border-white/10 bg-[#111216] p-5 pb-8 space-y-4 max-h-[82vh] overflow-y-auto"
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

            {secondaryGroups.map((group) => (
              <div key={group.heading} className="space-y-1">
                <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  {group.heading}
                </p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => go(item.id)}
                      className={`w-full min-h-[46px] flex items-center justify-between gap-3 px-4 rounded-xl text-sm font-medium ${
                        active ? 'bg-red-600/15 text-red-400' : 'text-gray-200 hover:bg-white/5'
                      }`}
                    >
                      <span className="flex items-center gap-3.5">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </span>
                      {typeof item.count === 'number' && item.count > 0 && (
                        <span className="font-mono text-xs tabular-nums text-gray-400">
                          {item.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
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
