// storage.js — localStorage + IndexedDB dual-layer persistence

const DB_NAME = 'pdm_storage';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

let _db = null;

/** Open (or create) the IndexedDB database */
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = () => {
      console.warn('IndexedDB open failed, falling back to localStorage only');
      _db = null;
      resolve(null);
    };
  });
}

/** Get value from localStorage (primary read) */
function fromLS(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Set value to localStorage */
function toLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('localStorage write failed:', e);
    return false;
  }
}

/** Remove key from localStorage */
function removeLS(key) {
  try { localStorage.removeItem(key); return true; }
  catch { return false; }
}

/** Set value in IndexedDB (async, fire-and-forget) */
async function toIDB(key, value) {
  const db = await openDB();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
  } catch (e) { /* silent */ }
}

/** Get value from IndexedDB */
async function fromIDB(key) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

/** Get all keys with a given prefix from IndexedDB */
async function getAllFromIDB(prefix) {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      const keysReq = tx.objectStore(STORE_NAME).getAllKeys();
      const results = [];
      req.onsuccess = () => {
        const values = req.result || [];
        keysReq.onsuccess = () => {
          const keys = keysReq.result || [];
          for (let i = 0; i < keys.length; i++) {
            if (typeof keys[i] === 'string' && keys[i].startsWith(prefix)) {
              results.push({ key: keys[i], value: values[i] });
            }
          }
          resolve(results);
        };
      };
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}

/**
 * Load data for a key. Tries localStorage first, falls back to IndexedDB.
 * If localStorage is empty but IDB has data, restores localStorage.
 */
export async function load(key) {
  const lsVal = fromLS(key);
  if (lsVal !== null) return lsVal;

  // Attempt recovery from IndexedDB
  const idbVal = await fromIDB(key);
  if (idbVal !== null) {
    toLS(key, idbVal); // restore to localStorage
    return idbVal;
  }
  return null;
}

/** Load synchronously from localStorage only (for fast reads) */
export function loadSync(key) {
  return fromLS(key);
}

/**
 * Save data. Writes to BOTH localStorage and IndexedDB.
 */
export async function save(key, value) {
  const ok = toLS(key, value);
  toIDB(key, value); // fire-and-forget
  return ok;
}

/** Save synchronously to localStorage only */
export function saveSync(key, value) {
  toLS(key, value);
  toIDB(key, value); // fire-and-forget
}

/** Remove a key from both stores */
export async function remove(key) {
  removeLS(key);
  const db = await openDB();
  if (db) {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
    } catch { /* silent */ }
  }
}

/** Get all localStorage keys matching a prefix */
export function keys(prefix = '') {
  const result = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) result.push(key);
  }
  return result;
}

/**
 * Recover all data for a user prefix from IndexedDB to localStorage.
 * Called when localStorage may have been cleared.
 */
export async function recoverFromIDB(userPrefix) {
  const entries = await getAllFromIDB(userPrefix);
  let restored = 0;
  for (const { key, value } of entries) {
    if (value !== undefined && value !== null) {
      toLS(key, value);
      restored++;
    }
  }
  return restored;
}

/**
 * Bulk export all data for a user.
 */
export function exportAll(userPrefix) {
  const data = {};
  for (const key of keys(userPrefix)) {
    data[key] = fromLS(key);
  }
  // also include shared (non-user-specific) keys
  const sharedKeys = ['pdm_users'];
  for (const key of sharedKeys) {
    const val = fromLS(key);
    if (val !== null) data[key] = val;
  }
  return data;
}

/**
 * Bulk import data.
 * @param {Object} data - { key: value } map
 * @param {'merge'|'replace'} mode
 */
export async function importAll(data, mode = 'merge') {
  if (mode === 'replace') {
    // Clear all pdm_ keys
    for (const key of keys('pdm_')) {
      removeLS(key);
    }
    const db = await openDB();
    if (db) {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
      } catch { /* silent */ }
    }
  }
  for (const [key, value] of Object.entries(data)) {
    await save(key, value);
  }
}
