import React, { useMemo } from 'react';
import { ArrowLeft, Disc3, Play } from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { Track } from '../../types/music';
import { formatDuration } from '../../utils/formatters';
import { ArtworkThumb } from '../library/ArtworkThumb';
import { TrackList } from '../library/TrackList';

interface AlbumGroup {
  key: string;
  album: string;
  artist: string;
  year: number | null;
  artworkId: string | null;
  tracks: Track[];
  totalDuration: number;
}

export const AlbumsView: React.FC = () => {
  const tracks = useLibraryStore((s) => s.tracks);
  const searchQuery = useLibraryStore((s) => s.searchQuery);
  const selectedAlbumKey = useLibraryStore((s) => s.selectedAlbumKey);
  const setSelectedAlbumKey = useLibraryStore((s) => s.setSelectedAlbumKey);
  const setActiveView = useLibraryStore((s) => s.setActiveView);

  const playTrackList = usePlayerStore((s) => s.playTrackList);

  const albums = useMemo<AlbumGroup[]>(() => {
    const map = new Map<string, AlbumGroup>();
    const q = searchQuery.trim().toLowerCase();

    for (const track of tracks) {
      const albumName = track.album || 'Unknown Album';
      const artistName = track.albumArtist || track.artist || 'Unknown Artist';
      const key = `${albumName.toLowerCase()}::${artistName.toLowerCase()}`;

      let group = map.get(key);
      if (!group) {
        group = {
          key,
          album: albumName,
          artist: artistName,
          year: track.year,
          artworkId: track.artworkId,
          tracks: [],
          totalDuration: 0,
        };
        map.set(key, group);
      }

      if (!group.artworkId && track.artworkId) group.artworkId = track.artworkId;
      if (!group.year && track.year) group.year = track.year;
      group.tracks.push(track);
      group.totalDuration += track.duration || 0;
    }

    let result = Array.from(map.values());
    for (const grp of result) {
      grp.tracks.sort((a, b) => {
        const discDiff = (a.discNumber || 1) - (b.discNumber || 1);
        if (discDiff !== 0) return discDiff;
        const trackDiff = (a.trackNumber || 9999) - (b.trackNumber || 9999);
        if (trackDiff !== 0) return trackDiff;
        return a.title.localeCompare(b.title);
      });
    }

    if (q) {
      result = result.filter(
        (g) => g.album.toLowerCase().includes(q) || g.artist.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => a.album.localeCompare(b.album));
    return result;
  }, [tracks, searchQuery]);

  const selectedAlbum = useMemo(
    () => albums.find((a) => a.key === selectedAlbumKey) || null,
    [albums, selectedAlbumKey]
  );

  if (selectedAlbum) {
    return (
      <section className="flex flex-col flex-1 min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setSelectedAlbumKey(null)}
              aria-label="Back to albums"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <ArtworkThumb
              artworkId={selectedAlbum.artworkId}
              alt={selectedAlbum.album}
              sizeClass="w-16 h-16"
              roundedClass="rounded-xl"
            />
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold text-white truncate">
                {selectedAlbum.album}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5 truncate tabular-nums">
                {selectedAlbum.artist}
                {selectedAlbum.year ? ` · ${selectedAlbum.year}` : ''}
                {' · '}
                {selectedAlbum.tracks.length}{' '}
                {selectedAlbum.tracks.length === 1 ? 'track' : 'tracks'}
                {selectedAlbum.totalDuration > 0
                  ? ` · ${formatDuration(selectedAlbum.totalDuration)}`
                  : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => playTrackList(selectedAlbum.tracks.map((t) => t.id), 0)}
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Play Album</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 pt-2 flex flex-col">
          <TrackList tracks={selectedAlbum.tracks} />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">Albums</h1>
          <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
            {albums.length} {albums.length === 1 ? 'album' : 'albums'}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-5">
        {albums.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-white/[0.08] rounded-2xl bg-[#0B0C10]/80">
            <Disc3 className="w-10 h-10 text-gray-500 mb-3" />
            <p className="font-display text-lg font-semibold text-white">No albums found</p>
            <p className="mt-1.5 max-w-md text-sm text-gray-400">
              Import your music collection to browse albums with embedded artwork.
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {albums.map((album) => (
              <div
                key={album.key}
                className="group flex flex-col rounded-2xl border border-white/[0.06] bg-[#111216] p-3 hover:border-red-500/30 transition-colors"
              >
                <div className="relative aspect-square w-full">
                  <button
                    type="button"
                    onClick={() => setSelectedAlbumKey(album.key)}
                    className="w-full h-full block text-left"
                  >
                    <ArtworkThumb
                      artworkId={album.artworkId}
                      alt={album.album}
                      sizeClass="w-full h-full"
                      roundedClass="rounded-xl"
                      iconSizeClass="w-12 h-12"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => playTrackList(album.tracks.map((t) => t.id), 0)}
                    aria-label={`Play ${album.album}`}
                    className="absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-red-500"
                  >
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAlbumKey(album.key)}
                  className="mt-3 text-left min-w-0"
                >
                  <p className="text-sm font-semibold text-white truncate group-hover:text-red-400 transition-colors">
                    {album.album}
                  </p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {album.artist} · {album.tracks.length}
                  </p>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
