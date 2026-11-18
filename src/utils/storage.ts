export interface StorageEstimateInfo {
  usageBytes: number | null;
  quotaBytes: number | null;
  persisted: boolean | null;
}

export async function getStorageEstimate(): Promise<StorageEstimateInfo> {
  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  let persisted: boolean | null = null;

  if (typeof navigator !== 'undefined' && navigator.storage) {
    try {
      if (typeof navigator.storage.estimate === 'function') {
        const est = await navigator.storage.estimate();
        usageBytes = typeof est.usage === 'number' ? est.usage : null;
        quotaBytes = typeof est.quota === 'number' ? est.quota : null;
      }
      if (typeof navigator.storage.persisted === 'function') {
        persisted = await navigator.storage.persisted();
      }
    } catch {
      // Storage API unavailable in restricted context
    }
  }

  return { usageBytes, quotaBytes, persisted };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.storage &&
    typeof navigator.storage.persist === 'function'
  ) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Materializes a browser File (which may be backed by a temporary OS handle,
 * directory-picker permission, or Android SAF content URI) into a standalone,
 * IndexedDB-owned Blob so audio data persists permanently across refreshes
 * and browser restarts in Chrome, Edge, Samsung Internet, and Opera.
 */
export async function materializeAudioBlob(
  source: Blob,
  fallbackMimeType = 'audio/mpeg'
): Promise<Blob> {
  if (!source || source.size <= 0) {
    throw new Error('Audio file is empty (0 bytes).');
  }

  const resolvedType = source.type || fallbackMimeType || 'audio/mpeg';
  const buffer = await source.arrayBuffer();

  if (buffer.byteLength <= 0 || buffer.byteLength !== source.size) {
    throw new Error('Failed to read complete audio file bytes.');
  }

  return new Blob([buffer], { type: resolvedType });
}

export async function verifyBlobReadable(blob: Blob | undefined | null): Promise<boolean> {
  if (!blob || blob.size <= 0) return false;
  try {
    const head = await blob.slice(0, 1).arrayBuffer();
    return head.byteLength === 1;
  } catch {
    return false;
  }
}
