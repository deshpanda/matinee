// IndexedDB, promisified, two stores: `kv` for the computed dashboard
// (one JSON blob) and `tmdb` for the per-film enrichment cache.
// Everything the product knows about a viewer lives here — in their browser.

const DB = 'matinee';
const VERSION = 1;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('tmdb')) db.createObjectStore('tmdb');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function op(store, mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const kv = {
  get: (k) => op('kv', 'readonly', (s) => s.get(k)),
  put: (k, v) => op('kv', 'readwrite', (s) => s.put(v, k)),
  del: (k) => op('kv', 'readwrite', (s) => s.delete(k)),
};

export const tmdbCache = {
  get: (k) => op('tmdb', 'readonly', (s) => s.get(k)),
  put: (k, v) => op('tmdb', 'readwrite', (s) => s.put(v, k)),
};

export async function wipeAll() {
  await op('kv', 'readwrite', (s) => s.clear());
  await op('tmdb', 'readwrite', (s) => s.clear());
}
