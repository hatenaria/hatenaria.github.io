// 学習アイランド 共通部品：保存の土台（store.js）
// 端末の中（IndexedDB）にデータを保存する。
// ・データベース名は gakushu-island、保存場所は kv の1つだけ（設計書3章）
// ・値はすべて { v: 形式の版番号, updatedAt: 更新日時, data: 中身 } の形で保存する
// ・localStorage は使わない（同じオリジンの理科クエストとぶつからないようにするため）

export const DB_NAME = 'gakushu-island';
export const DB_VERSION = 1; // ← 保存場所を増やさない限り、ここは変えない
const STORE = 'kv';

let dbPromise = null;
let memoryFallback = null; // IndexedDB が使えない環境（一部のプライベートモードなど）用

/** IndexedDB が使えず、データが一時的にしか残らない状態なら true */
export let isVolatile = false;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      useMemory(); resolve(null); return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { useMemory(); resolve(null); };
    req.onblocked = () => { /* 別のタブが古い版で開いている。待つ */ };
  });
  return dbPromise;
}

function useMemory() {
  isVolatile = true;
  memoryFallback = new Map();
  console.warn('[学習アイランド] IndexedDB が使えないため、データは一時的にしか保存されません');
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 保存されている記録（{v, updatedAt, data}）をそのまま返す。なければ null */
export async function getRecord(key) {
  const db = await openDB();
  if (!db) return memoryFallback.has(key) ? structuredClone(memoryFallback.get(key)) : null;
  const rec = await tx(db, 'readonly', (s) => reqToPromise(s.get(key)));
  return rec ?? null;
}

/** 中身（data）だけを返す。なければ fallback */
export async function get(key, fallback = null) {
  const rec = await getRecord(key);
  return rec ? rec.data : fallback;
}

/** 中身を保存する。v は形式の版番号 */
export async function set(key, data, v = 1) {
  const rec = { v, updatedAt: new Date().toISOString(), data };
  const db = await openDB();
  if (!db) { memoryFallback.set(key, structuredClone(rec)); return rec; }
  await tx(db, 'readwrite', (s) => reqToPromise(s.put(rec, key)));
  return rec;
}

/** 読んで、書きかえて、保存する（同じ鍵を安全に更新するため） */
export async function update(key, fn, { v = 1, fallback = null } = {}) {
  const db = await openDB();
  if (!db) {
    const cur = memoryFallback.has(key) ? memoryFallback.get(key).data : fallback;
    const next = await fn(structuredClone(cur));
    memoryFallback.set(key, { v, updatedAt: new Date().toISOString(), data: next });
    return next;
  }
  // 1つの処理の中で読み書きすると、同時に更新しても数がずれない
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    let next;
    const r = s.get(key);
    let failure = null;
    r.onsuccess = () => {
      const cur = r.result ? r.result.data : fallback;
      try {
        next = fn(cur);
        if (next instanceof Promise) throw new Error('update の関数は同期にしてください');
      } catch (e) {
        failure = e; t.abort(); return;
      }
      s.put({ v, updatedAt: new Date().toISOString(), data: next }, key);
    };
    t.oncomplete = () => resolve(next);
    t.onerror = () => reject(failure || t.error);
    t.onabort = () => reject(failure || t.error);
  });
}

export async function remove(key) {
  const db = await openDB();
  if (!db) { memoryFallback.delete(key); return; }
  await tx(db, 'readwrite', (s) => reqToPromise(s.delete(key)));
}

function prefixRange(prefix) {
  return IDBKeyRange.bound(prefix, prefix + '￿');
}

/** 頭の文字が prefix の鍵をすべて返す */
export async function list(prefix = '') {
  const db = await openDB();
  if (!db) return [...memoryFallback.keys()].filter((k) => k.startsWith(prefix)).sort();
  return tx(db, 'readonly', (s) => reqToPromise(s.getAllKeys(prefix ? prefixRange(prefix) : undefined)));
}

/** 頭の文字が prefix の鍵をすべて消す（冒険の書の削除などで使う） */
export async function removePrefix(prefix) {
  if (!prefix) throw new Error('prefix が空です（全部消すことはできません）');
  const db = await openDB();
  if (!db) { for (const k of [...memoryFallback.keys()]) if (k.startsWith(prefix)) memoryFallback.delete(k); return; }
  await tx(db, 'readwrite', (s) => reqToPromise(s.delete(prefixRange(prefix))));
}

/** ブラウザに「このデータを消さないで」と頼む（iPad の Safari 対策） */
export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (e) { /* 対応していない環境 */ }
  return false;
}

/** 冒険の書1冊分を JSON にして返す（非常用のバックアップ） */
export async function exportBook(bookId) {
  const keys = await list(`${bookId}/`);
  const entries = {};
  for (const k of keys) entries[k.slice(bookId.length + 1)] = await getRecord(k);
  const books = await get('meta/books', []);
  return {
    format: 'gakushu-island-backup',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    book: books.find((b) => b.id === bookId) || { id: bookId },
    entries,
  };
}

/** バックアップを冒険の書 targetId に戻す（中身はいったん全部入れかえる） */
export async function importBook(backup, targetId) {
  if (!backup || backup.format !== 'gakushu-island-backup') throw new Error('学習アイランドのバックアップではありません');
  if (!/^p[1-3]$/.test(targetId)) throw new Error('戻し先の冒険の書が正しくありません');
  await removePrefix(`${targetId}/`);
  const db = await openDB();
  for (const [sub, rec] of Object.entries(backup.entries || {})) {
    const key = `${targetId}/${sub}`;
    if (!db) memoryFallback.set(key, rec);
    else await tx(db, 'readwrite', (s) => reqToPromise(s.put(rec, key)));
  }
}
