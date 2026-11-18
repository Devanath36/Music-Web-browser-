import { useEffect } from 'react';
import { History, Play, X } from 'lucide-react';
import { MobileNav } from './components/layout/MobileNav';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { ExpandedPlayer } from './components/player/ExpandedPlayer';
import { PlayerBar } from './components/player/PlayerBar';
import { QueueDrawer } from './components/player/QueueDrawer';
import { OfflineBanner } from './components/pwa/OfflineBanner';
import { AlbumsView } from './components/views/AlbumsView';
import { AllSongsView } from './components/views/AllSongsView';
import { ArtistsView } from './components/views/ArtistsView';
import { EqualizerView } from './components/views/EqualizerView';
import { FavoritesView } from './components/views/FavoritesView';
import { ImportMusicView } from './components/views/ImportMusicView';
import { PlaylistsView } from './components/views/PlaylistsView';
import { RecentlyPlayedView } from './components/views/RecentlyPlayedView';
import { SettingsView } from './components/views/SettingsView';
import { StorageManagerView } from './components/views/StorageManagerView';
import { WifiTransferView } from './components/views/WifiTransferView';
import { useLibraryStore } from './store/useLibraryStore';
import { usePlayerStore } from './store/usePlayerStore';
import { formatDuration } from './utils/formatters';

export default function App() {
  const isLoaded = useLibraryStore((s) => s.isLoaded);
  const activeView = useLibraryStore((s) => s.activeView);
  const setActiveView = useLibraryStore((s) => s.setActiveView);
  const initializeLibrary = useLibraryStore((s) => s.initializeLibrary);

  const initPlayer = usePlayerStore((s) => s.initPlayer);
  const pendingRestorePrompt = usePlayerStore((s) => s.pendingRestorePrompt);
  const applyRestoreChoice = usePlayerStore((s) => s.applyRestoreChoice);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await initializeLibrary();
      if (mounted) {
        await initPlayer();
      }
      const params = new URLSearchParams(window.location.search);
      if (params.get('pair')) {
        setActiveView('transfer');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [initializeLibrary, initPlayer, setActiveView]);

  const renderView = () => {
    if (!isLoaded) {
      return (
        <div className="flex-1 flex flex-col gap-3 py-6">
          <div className="h-8 w-44 rounded-lg bg-white/[0.06] animate-pulse" />
          <div className="h-4 w-72 rounded bg-white/[0.04] animate-pulse" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />
            ))}
          </div>
        </div>
      );
    }

    switch (activeView) {
      case 'playlists':
        return <PlaylistsView />;
      case 'favorites':
        return <FavoritesView />;
      case 'albums':
        return <AlbumsView />;
      case 'artists':
        return <ArtistsView />;
      case 'recent':
        return <RecentlyPlayedView />;
      case 'import':
        return <ImportMusicView />;
      case 'transfer':
        return <WifiTransferView />;
      case 'equalizer':
        return <EqualizerView />;
      case 'storage':
        return <StorageManagerView />;
      case 'settings':
        return <SettingsView />;
      case 'songs':
      default:
        return <AllSongsView />;
    }
  };

  return (
    <div className="h-dvh w-full flex flex-col overflow-hidden bg-[#050507] text-[#F3F4F6]">
      <OfflineBanner />

      <div className="flex-1 flex min-h-0">
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <TopBar />

          {pendingRestorePrompt && (
            <div className="mx-4 sm:mx-6 mt-3 rounded-xl border border-white/10 bg-[#111216] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <History className="w-4 h-4 text-red-400 shrink-0" />
                <div className="min-w-0 text-xs">
                  <p className="font-medium text-white truncate">
                    Previous session: {pendingRestorePrompt.trackTitle}
                  </p>
                  <p className="text-gray-400 truncate">
                    {pendingRestorePrompt.trackArtist}
                    {pendingRestorePrompt.positionSeconds > 0
                      ? ` · Paused at ${formatDuration(pendingRestorePrompt.positionSeconds)}`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {pendingRestorePrompt.trackId && (
                  <button
                    type="button"
                    onClick={() => applyRestoreChoice('resume_position')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Resume</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => applyRestoreChoice('restore_queue')}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-gray-200 hover:bg-white/5"
                >
                  Restore Queue
                </button>
                <button
                  type="button"
                  onClick={() => applyRestoreChoice('dismiss')}
                  aria-label="Dismiss restore prompt"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <main className="flex-1 flex flex-col min-h-0 px-4 sm:px-6 pt-5 pb-2 overflow-hidden">
            {renderView()}
          </main>
        </div>
      </div>

      <PlayerBar />
      <MobileNav />
      <QueueDrawer />
      <ExpandedPlayer />
    </div>
  );
}
