// Persistent audio blob storage: IndexedDB primary, OPFS fallback.
// Keys are track fileIds (imports) or `take-<id>` (recorder takes / offline exports).

interface BlobBackend {
  put(key: string, blob: Blob): Promise<void>;
  get(key: string): Promise<Blob | null>;
  del(key: string): Promise<void>;
}

const DB_NAME = "flux-db";
const STORE = "audio";

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbBackend(db: IDBDatabase): BlobBackend {
  const tx = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE);
  const wrap = <T>(req: IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  return {
    put: async (key, blob) => { await wrap(tx("readwrite").put(blob, key)); },
    get: async (key) => (await wrap(tx("readonly").get(key))) ?? null,
    del: async (key) => { await wrap(tx("readwrite").delete(key)); },
  };
}

function opfsBackend(): BlobBackend {
  const root = () => navigator.storage.getDirectory();
  return {
    put: async (key, blob) => {
      const dir = await root();
      const fh = await dir.getFileHandle(key, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
    },
    get: async (key) => {
      try {
        const dir = await root();
        const fh = await dir.getFileHandle(key);
        return await fh.getFile();
      } catch {
        return null;
      }
    },
    del: async (key) => {
      try {
        const dir = await root();
        await dir.removeEntry(key);
      } catch { /* already gone */ }
    },
  };
}

let backendPromise: Promise<BlobBackend> | null = null;

function backend(): Promise<BlobBackend> {
  if (!backendPromise) {
    backendPromise = openIdb()
      .then(idbBackend)
      .catch(() => opfsBackend());
    // Ask the browser not to evict the library under storage pressure.
    navigator.storage?.persist?.().catch(() => {});
  }
  return backendPromise;
}

export const blobStore = {
  put: async (key: string, blob: Blob) => (await backend()).put(key, blob),
  get: async (key: string) => (await backend()).get(key),
  del: async (key: string) => (await backend()).del(key),
};

// Runtime object-URL cache so each blob is materialized at most once per session.
const urlCache = new Map<string, string>();

export function cacheUrl(key: string, blob: Blob): string {
  const existing = urlCache.get(key);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

export async function getUrl(key: string): Promise<string | null> {
  const existing = urlCache.get(key);
  if (existing) return existing;
  const blob = await blobStore.get(key);
  if (!blob) return null;
  return cacheUrl(key, blob);
}

export function dropUrl(key: string) {
  const url = urlCache.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(key);
  }
}
