import { useEffect, useState } from 'react';
import { artworkCache } from '../utils/artworkCache';

export function useArtworkUrl(artworkId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    artworkId ? artworkCache.getCached(artworkId) : null
  );

  useEffect(() => {
    if (!artworkId) {
      setUrl(null);
      return;
    }

    const cached = artworkCache.getCached(artworkId);
    if (cached) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    artworkCache.getOrLoad(artworkId).then((loaded) => {
      if (!cancelled) {
        setUrl(loaded);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [artworkId]);

  return url;
}
