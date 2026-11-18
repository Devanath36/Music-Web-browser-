import React, { useMemo } from 'react';
import { ArrowLeft, Mic2, Play } from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { Track } from '../../types/music';
import { ArtworkThumb } from '../library/ArtworkThumb';
import { TrackList } from '../library/TrackList';

interface ArtistGroup {
  name: string;
  tracks: Track[];
  albumCount: number;
  artworkId: string | null;
}

export const ArtistsView: React.FC = () => {
  const tracks = useLibraryStore((s) => s.tracks);
  const searchQuery = useLibraryStore((s) => s.searchQuery);
  const selectedArtistName = useLibraryStore((s) => s.selectedArtistName);
  const setSelectedArtistName = useLibraryStore((s) => s.setSelectedArtistName);
  const setActiveView = useLibraryStore((s) => s.setActiveView);

  const playTrackList = usePlayerStore((s) => s.playTrackList);

  const artists = useMemo<ArtistGroup[]>(() => {
    const map = new Map<string, { name: string; tracks: Track[]; albums: Set<string>; artworkId: string | null }>();
    const q = searchQuery.trim().toLowerCase();

    for (const track of tracks) {
      const name = track.artist || 'Unknown Artist';
      const key = name.toLowerCase();
      let entry = map.get(key);
      if (!entry) {
        entry = {
          name,
          tracks: [],
          albums: new Set(),
          artworkId: track.artworkId,
        };
        map.set(key, entry);
      }
      if (!entry.artworkId && track.artworkId) entry.artworkId = track.artworkId;
      entry.tracks.push(track);
      entry.albums.add((track.album || 'Unknown Album').toLowerCase());
    }

    let result: ArtistGroup[] = Array.from(map.values()).map((e) => ({
      name: e.name,
      tracks: e.tracks.sort((a, b) => a.title.localeCompare(b.title)),
      albumCount: e.albums.size,
      artworkId: e.artworkId,
    }));

    if (q) {
      result = result.filter((a) => a.name.toLowerCase().includes(q));
    }

    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [tracks, searchQuery]);

  const selectedArtist = useMemo(
    () =>
      selectedArtistName
        ? artists.find((a) => a.name.toLowerCase() === selectedArtistName.toLowerCase()) || null
        : null,
    [artists, selectedArtistName]
  );

  if (selectedArtist) {
    return (
      <section className="flex flex-col flex-1 min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setSelectedArtistName(null)}
              aria-label="Back to artists"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <ArtworkThumb
              artworkId={selectedArtist.artworkId}
              alt={selectedArtist.name}
              sizeClass="w-16 h-16"
              roundedClass="rounded-full"
            />
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold text-white truncate">
                {selectedArtist.name}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
                {selectedArtist.albumCount} {selectedArtist.albumCount === 1 ? 'album' : 'albums'} ·{' '}
                {selectedArtist.tracks.length} {selectedArtist.tracks.length === 1 ? 'track' : 'tracks'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => playTrackList(selectedArtist.tracks.map((t) => t.id), 0)}
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Play Artist</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 pt-2 flex flex-col">
          <TrackList tracks={selectedArtist.tracks} />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">Artists</h1>
          <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
            {artists.length} {artists.length === 1 ? 'artist' : 'artists'}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-5">
        {artists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-white/[0.08] rounded-2xl bg-[#0B0C10]/80">
            <Mic2 className="w-10 h-10 text-gray-500 mb-3" />
            <p className="font-display text-lg font-semibold text-white">No artists yet</p>
            <p className="mt-1.5 max-w-md text-sm text-gray-400">
              Artists are automatically indexed from your imported audio files.
            </p>
            <button
              type="button"
              onClick={() => setActiveView('import')}
              className="mt-5 min-h-[44px] px-5 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-500"
            >
              Import Music
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {artists.map((artist) => (
              <button
                key={artist.name}
                type="button"
                onClick={() => setSelectedArtistName(artist.name)}
                className="group flex items-center gap-3.5 rounded-2xl border border-white/[0.06] bg-[#111216] p-3.5 text-left hover:border-red-500/30 transition-colors"
              >
                <ArtworkThumb
                  artworkId={artist.artworkId}
                  alt={artist.name}
                  sizeClass="w-14 h-14"
                  roundedClass="rounded-full"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate group-hover:text-red-400 transition-colors">
                    {artist.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
                    {artist.albumCount} {artist.albumCount === 1 ? 'album' : 'albums'} ·{' '}
                    {artist.tracks.length} {artist.tracks.length === 1 ? 'track' : 'tracks'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
