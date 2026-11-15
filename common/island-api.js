// 学習アイランド 共通部品：島とアプリをつなぐ本体（island-api.js）
// 各アプリは直接これを読み込まず、つなぎ口（island-link.js の中身）から読み込む。
// つなぎ口がこのファイルを読み込めたら「連携モード」になる。

import * as store from './store.js';
import * as books from './books.js';
import { showPicker } from './book-picker.js';

export const COMMON_VERSION = '0.1.2';
export const HOME_URL = new URL('../index.html', import.meta.url).href;

const SESSIONS_MAX = 200; // 1件ごとの詳細を残す数（仕様書2-7）
const OUTBOX_MAX = 500;
const REWARD_MAX = 20;    // 1回で渡せるコインの上限（まちがった値で増えすぎないように）

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * アプリを島につなぐ。冒険の書が選ばれていなければ選択画面を出す。
 * @param {{appId:string, subject:string}} opt  appId 例 'keisan-1min'、subject 例 'math'
 * @returns 連携用の命令のまとまり。ホームへ移る場合は null
 */
export async function connect({ appId, subject }) {
  if (!/^[a-z0-9-]+$/.test(appId || '')) throw new Error('appId は 半角英小文字・数字・ハイフンで');
  if (!/^[a-z]+$/.test(subject || '')) throw new Error('subject は 半角英小文字で（例 math, rika, kokugo, shakai, eigo）');

  store.requestPersist(); // 待たなくてよい

  let book = await books.getCurrent();
  if (!book) book = await showPicker({ mode: 'select', homeUrl: HOME_URL });
  if (!book) return null;

  const p = book.id;
  const profile = await store.get(`${p}/profile`, {});

  return {
    version: COMMON_VERSION,
    homeUrl: HOME_URL,
    book,
    profile,
    volatile: store.isVolatile,

    /**
     * 学習のひと区切りごとに呼ぶ。取り組んだ量（amount）に応じて
     * 共通コインと、この教科の素材を渡す。正答率では差をつけない（仕様書2-7）。
     * その日はじめての教科なら素材は2倍（設計書5-2）。
     */
    async reward(amount = 1) {
      const n = Math.max(0, Math.min(REWARD_MAX, Math.floor(Number(amount) || 0)));
      let granted = null;
      await store.update(`${p}/wallet`, (w) => {
        w = w || { coin: 0, materials: {}, firstOfDay: {} };
        w.materials = w.materials || {};
        w.firstOfDay = w.firstOfDay || {};
        const first = n > 0 && w.firstOfDay[subject] !== today();
        const material = first ? n * 2 : n;
        w.coin = (w.coin || 0) + n;
        w.materials[subject] = (w.materials[subject] || 0) + material;
        if (n > 0) w.firstOfDay[subject] = today();
        granted = { coin: n, material, subject, bonus: first };
        return w;
      }, { fallback: null });
      return granted;
    },

    /** いまの持ち物（コインと素材） */
    async wallet() {
      return store.get(`${p}/wallet`, { coin: 0, materials: {}, firstOfDay: {} });
    },

    /**
     * 学習のひと区切りの要約を残す。クラスに入っていれば、先生へ送る箱（outbox）にも入れる。
     * 送信そのものは GAS の部品ができてから（作業④）。
     * summary の例：{ minutes: 5, skills: [{id:'math.g1.A.compose10', self:4, hint:1, review:0}] }
     */
    async record(summary = {}) {
      const entry = { at: new Date().toISOString(), appId, subject, ...summary };
      await store.update(`${p}/learning/${appId}`, (L) => {
        L = L || { sessions: [] };
        L.sessions = [...(L.sessions || []), entry].slice(-SESSIONS_MAX);
        return L;
      }, { fallback: null });
      const cls = await store.get(`${p}/class`);
      if (cls && cls.code) {
        await store.update(`${p}/outbox`, (box) => [...(box || []), entry].slice(-OUTBOX_MAX), { fallback: [] });
      }
      return entry;
    },

    /** 先生のクラス設定でその技能が開いているか。クラスに入っていなければ常に開いている */
    async isUnitOpen(skillId) {
      const cls = await store.get(`${p}/class`);
      const closed = cls?.settings?.closedSkills || []; // 形式は作業④で確定（仮）
      return !closed.some((prefix) => String(skillId).startsWith(prefix));
    },

    /** このアプリ独自の状態（シール帳など）を冒険の書ごとに読み書きする */
    async loadState() { return store.get(`${p}/game/${appId}`, undefined); },
    async saveState(data) { await store.set(`${p}/game/${appId}`, data); return true; },
  };
}
