// 学習アイランド 共通部品：冒険の書（books.js）
// ・1台の端末に冒険の書を3冊まで（ID は p1〜p3）
// ・パスワードは付けない。消すときの確認は画面側（book-picker.js）で行う
// ・作成と削除はホームで行う。各島は「選ぶ」だけ（設計書5章）

import * as store from './store.js?v=0.17.2';

export const MAX_BOOKS = 3;
export const BOOK_IDS = ['p1', 'p2', 'p3'];
export const NAME_MAX = 10;

/** 冒険の書の一覧 [{id, name, createdAt}] */
export async function listBooks() {
  return store.get('meta/books', []);
}

export async function getBook(id) {
  return (await listBooks()).find((b) => b.id === id) || null;
}

export function cleanName(name) {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!n) throw new Error('なまえを いれてね');
  if ([...n].length > NAME_MAX) throw new Error(`なまえは ${NAME_MAX}もじ までだよ`);
  return n;
}

export const GRADES = [1, 2, 3, 4, 5, 6];
function cleanGrade(g) {
  const n = Number(g);
  if (!GRADES.includes(n)) throw new Error('がくねんを えらんでね');
  return n;
}

/** 新しい冒険の書を作る。name はハンドルネーム（実名は使わない）、grade は学年（1〜6） */
export async function createBook(name, grade) {
  const handle = cleanName(name);
  const g = cleanGrade(grade);
  let created = null;
  await store.update('meta/books', (books) => {
    books = books || [];
    if (books.length >= MAX_BOOKS) throw new Error('ぼうけんの しょは 3さつ までだよ');
    const id = BOOK_IDS.find((x) => !books.some((b) => b.id === x));
    created = { id, name: handle, createdAt: new Date().toISOString() };
    return [...books, created];
  }, { fallback: [] });
  await store.set(`${created.id}/profile`, {
    handle,
    grade: g, // 学年。進級したらホームの「せってい」で変える（仕様書3-5）
    hero: { gender: null, hair: null, hairColor: null, outfit: null, accessory: null, hat: null }, // 主人公はホームの作成画面で決める（仕様書3-5）
  });
  await store.set(`${created.id}/settings`, { speech: false, furigana: true }); // furigana：習った漢字にも ふりがなを付けるか（仕様書2-5。習っていない漢字は常に付ける）
  await store.set(`${created.id}/wallet`, { coin: 0, materials: {}, firstOfDay: {} });
  return created;
}

/** 学年を変える（進級したとき） */
export async function setGrade(id, grade) {
  const g = cleanGrade(grade);
  await store.update(`${id}/profile`, (p) => ({ ...(p || {}), grade: g }), { fallback: {} });
  return g;
}

/** ハンドルネームを変える */
export async function renameBook(id, name) {
  const handle = cleanName(name);
  await store.update('meta/books', (books) => (books || []).map((b) => (b.id === id ? { ...b, name: handle } : b)), { fallback: [] });
  await store.update(`${id}/profile`, (p) => ({ ...(p || {}), handle }), { fallback: {} });
}

/** 冒険の書を消す（中身もすべて消える） */
export async function deleteBook(id) {
  if (!BOOK_IDS.includes(id)) throw new Error('冒険の書の ID が正しくありません');
  await store.removePrefix(`${id}/`);
  await store.update('meta/books', (books) => (books || []).filter((b) => b.id !== id), { fallback: [] });
  if ((await store.get('meta/currentBook')) === id) await store.remove('meta/currentBook');
}

/** いま選ばれている冒険の書（なければ null） */
export async function getCurrent() {
  const id = await store.get('meta/currentBook');
  if (!id) return null;
  return getBook(id);
}

export async function setCurrent(id) {
  if (!(await getBook(id))) throw new Error('その冒険の書は ありません');
  await store.set('meta/currentBook', id);
}

export async function clearCurrent() {
  await store.remove('meta/currentBook');
}
