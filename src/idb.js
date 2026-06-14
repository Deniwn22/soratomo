/**
 * SoraTomo — IndexedDB gallery store
 * Replaces the localStorage gallery to avoid the ~5MB quota limit.
 * Falls back to an in-memory array if IndexedDB is unavailable.
 *
 * Usage:
 *   import { loadGalleryIDB, saveGalleryIDB } from './idb.js';
 *   const photos = await loadGalleryIDB();
 *   await saveGalleryIDB(updatedPhotos);
 */

const DB_NAME    = 'soratomo_db';
const DB_VERSION = 1;
const STORE_NAME = 'gallery';
const MAX_PHOTOS = 20;

let _db = null;

function openDB() {
  if(_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains(STORE_NAME)){
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess  = e => { _db = e.target.result; resolve(_db); };
    req.onerror    = e => reject(e.target.error);
  });
}

export async function loadGalleryIDB() {
  // Migration: if localStorage still has photos, import them and clear
  try {
    const legacy = JSON.parse(localStorage.getItem('soratomo_gallery') || '[]');
    if(legacy.length > 0){
      await saveGalleryIDB(legacy);
      localStorage.removeItem('soratomo_gallery');
      return legacy.slice(0, MAX_PHOTOS);
    }
  } catch {}

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(
        (req.result||[]).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,MAX_PHOTOS)
      );
      req.onerror = e => reject(e.target.error);
    });
  } catch {
    return [];
  }
}

export async function saveGalleryIDB(photos) {
  const capped = (photos||[]).slice(0, MAX_PHOTOS);
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      // Clear and re-write so deletions propagate cleanly
      store.clear();
      capped.forEach(p => store.put(p));
      tx.oncomplete = () => resolve();
      tx.onerror    = e => reject(e.target.error);
    });
  } catch(e) {
    console.warn('SoraTomo: IndexedDB gallery save failed', e);
  }
}

export async function deletePhotoIDB(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME,'readwrite').objectStore(STORE_NAME).delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  } catch {}
}

export async function clearGalleryIDB() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME,'readwrite').objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  } catch {}
}
