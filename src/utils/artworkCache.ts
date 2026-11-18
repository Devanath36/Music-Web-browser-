import { sonoraDb } from '../db/sonoraDb';

const MAX_CACHE_SIZE = 150;

class ArtworkUrlCache {
  private cache = new Map<string, string>();
  private inFlight = new Map<string, Promise<string | null>>();

  getCached(artworkId: string): string | null {
    const existing = this.cache.get(artworkId);
    if (!existing) return null;
    // Refresh LRU order
    this.cache.delete(artworkId);
    this.cache.set(artworkId, existing);
    return existing;
  }

  async getOrLoad(artworkId: string): Promise<string | null> {
    const cached = this.getCached(artworkId);
    if (cached) return cached;

    const pending = this.inFlight.get(artworkId);
    if (pending) return pending;

    const promise = (async () => {
      try {
        const record = await sonoraDb.artworks.get(artworkId);
        if (!record) return null;
        const url = URL.createObjectURL(record.blob);
        this.set(artworkId, url);
        return url;
      } catch {
        return null;
      } finally {
        this.inFlight.delete(artworkId);
      }
    })();

    this.inFlight.set(artworkId, promise);
    return promise;
  }

  private set(artworkId: string, url: string) {
    if (this.cache.has(artworkId)) {
      const old = this.cache.get(artworkId)!;
      if (old !== url) URL.revokeObjectURL(old);
      this.cache.delete(artworkId);
    }
    this.cache.set(artworkId, url);

    while (this.cache.size > MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      const oldestUrl = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      if (oldestUrl) URL.revokeObjectURL(oldestUrl);
    }
  }

  revoke(artworkId: string) {
    const url = this.cache.get(artworkId);
    if (url) {
      URL.revokeObjectURL(url);
      this.cache.delete(artworkId);
    }
  }

  clearAll() {
    for (const url of this.cache.values()) {
      URL.revokeObjectURL(url);
    }
    this.cache.clear();
  }
}

export const artworkCache = new ArtworkUrlCache();
