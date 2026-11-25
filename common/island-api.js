// 学習アイランド 共通部品：島とアプリをつなぐ本体（island-api.js）
// 各アプリは直接これを読み込まず、つなぎ口（island-link.js の中身）から読み込む。
// つなぎ口がこのファイルを読み込めたら「連携モード」になる。

import * as store from './store.js?v=0.22.0';
import * as classroom from './classroom.js?v=0.22.0';
import * as books from './books.js?v=0.22.0';
import { readHatenariaCode, dayIndex } from './hatenaria-code.js?v=0.22.0';

export const COMMON_VERSION = '0.3.6';
/** 島から ふやせる めずらしい 素材（ホームの こうかんじょで つかう） */
export const RARE_MATERIALS = { 'fushigi-kakera': 'ふしぎの かけら', 'gacha-ticket': 'ガチャけん' };
const RARE_DAILY = { 'gacha-ticket': 3 }; // 1日の 上限が ちがう もの（ガチャけんは 島の たからばこから 1日 3まい）
const RARE_DAILY_MAX = 5;
export const HOME_URL = new URL('../index.html', import.meta.url).href;

const SESSIONS_MAX = 200; // 1件ごとの詳細を残す数（仕様書2-7）
const OUTBOX_MAX = 500;
const REWARD_MAX = 20;    // 1回で渡せるコインの上限（まちがった値で増えすぎないように）

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 冒険の書が選ばれていないときの案内（仕様書3-5：冒険の書はホームだけで作る・選ぶ）。
 * 島の画面全体をおおい、ホームへ戻るボタンだけを出す。
 */
function guideToHome() {
  if (document.querySelector('[data-island="need-book"]')) return;
  const wrap = document.createElement('div');
  wrap.setAttribute('data-island', 'need-book');
  wrap.setAttribute('role', 'dialog');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;'
    + 'background:rgba(40,60,80,.55);font-family:"Hiragino Maru Gothic ProN","BIZ UDPGothic","Meiryo",sans-serif';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fffaf0;border-radius:24px;padding:32px 36px;max-width:520px;margin:16px;text-align:left;'
    + 'box-shadow:0 8px 0 rgba(0,0,0,.15);color:#3a3226;line-height:1.8;word-break:keep-all;overflow-wrap:anywhere';
  const p = document.createElement('p');
  p.style.cssText = 'font-size:22px;margin:0 0 20px';
  p.textContent = 'ホームアイランドで ぼうけんの しょを えらんでから、この しまに きてね。';
  const a = document.createElement('a');
  a.href = HOME_URL;
  a.textContent = '🏝 ホームアイランドへ';
  a.style.cssText = 'display:inline-flex;align-items:center;min-height:64px;padding:0 24px;border-radius:16px;background:#ffd66b;'
    + 'color:#3a3226;font-size:22px;font-weight:bold;text-decoration:none;box-shadow:0 4px 0 #d9a93a;touch-action:manipulation;'
    + 'outline:5px solid #3b82f6;outline-offset:4px';
  box.append(p, a); wrap.append(box); document.body.append(wrap);
  a.focus({ preventScroll: true });
  // Enter・スペースでも ホームへ（2-8）
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); location.href = HOME_URL; }
  }, true);
}

/**
 * アプリを島につなぐ。冒険の書が選ばれていなければ、ホームへ案内する（島では選ばない）。
 * @param {{appId:string, subject:string}} opt  appId 例 'keisan-1min'、subject 例 'math'
 * @returns 連携用の命令のまとまり。冒険の書がなくホームへ案内した場合は null
 */
export async function connect({ appId, subject }) {
  if (!/^[a-z0-9-]+$/.test(appId || '')) throw new Error('appId は 半角英小文字・数字・ハイフンで');
  if (!/^[a-z]+$/.test(subject || '')) throw new Error('subject は 半角英小文字で（例 math, rika, kokugo, shakai, eigo）');

  store.requestPersist(); // 待たなくてよい

  const book = await books.getCurrent();
  if (!book) { guideToHome(); return null; }

  const p = book.id;
  const profile = await store.get(`${p}/profile`, {});
  const cls = await store.get(`${p}/class`);
  const settings = await store.get(`${p}/settings`, {});
  // 学校モード：クラスに入っている（先生の設定で単元が開く）／家庭モード：自習（全単元が開く）
  const mode = cls && cls.code ? 'school' : 'home';
  // 学年：クラスに入っていれば先生のクラス設定の学年、なければ冒険の書を作るときに選んだ学年
  const grade = (mode === 'school' && cls.settings && Number(cls.settings.grade)) || Number(profile.grade) || null;

  return {
    version: COMMON_VERSION,
    homeUrl: HOME_URL,
    book,
    profile,
    mode,
    grade,
    settings,
    // ふりがな（仕様書2-5）：true なら 習った漢字にも ふりがなを付ける。習っていない漢字（学年より上）は いつも付ける
    furigana: settings.furigana !== false,
    volatile: store.isVolatile,

    /**
     * 学習のひと区切りごとに呼ぶ。取り組んだ量（amount）に応じて
     * 共通コインと、この教科の素材を渡す。正答率では差をつけない（仕様書2-7）。
     * 素材は 5問で 1こ、その日はじめての教科なら ＋2こ（2026-11-20 に 2倍から かえた）。
     */
    async reward(amount = 1) {
      const n = Math.max(0, Math.min(REWARD_MAX, Math.floor(Number(amount) || 0)));
      let granted = null;
      await store.update(`${p}/wallet`, (w) => {
        w = w || { coin: 0, materials: {}, firstOfDay: {} };
        w.materials = w.materials || {};
        w.firstOfDay = w.firstOfDay || {};
        const first = n > 0 && w.firstOfDay[subject] !== today();
        const material = Math.floor(n / 5) + (first ? 2 : 0); // v0.3.5：5問で 1こ、その日 はじめての 教科は ＋2（建物 3〜5こと つりあう）
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
        classroom.flush(p); // 数秒あとに先生へ送る（送れなければ箱に残って、あとで送る）
      }
      return entry;
    },

    /** 先生のクラス設定でその技能が開いているか。クラスに入っていなければ常に開いている */
    async isUnitOpen(skillId) {
      const cls = await store.get(`${p}/class`);
      const closed = cls?.settings?.closedSkills || []; // 先生のシート「たんげん」で ✓を外した技能IDの はじめの部分
      // math.g1.C.clock は clock2 を ふくまない（つぎの 文字が # か . の ときだけ）。math.g4. の ように . で おわる ものは 前方一致
      const id = String(skillId || '');
      return !closed.some((p) => { p = String(p); if (!p || !id.startsWith(p)) return false; if (id === p || /[.#]$/.test(p)) return true; const c = id.charAt(p.length); return c === '#' || c === '.'; });
    },

    /**
     * バッジ・トロフィーを ホームの「かざりだな」に 届ける（仕様書10-3）。
     * 同じ id は 何度 呼んでも 1つだけ。起動のときに 持っている物を 送りなおしてもよい。
     * @param {{id:string, name:string, img:string, kind?:'badge'|'trophy'}} item
     *   img は サイトの いちばん上からの パス（例 'math/assets/island/badge_keisan.webp'）
     * @returns {Promise<boolean>} 新しく 届いたら true
     */
    async collect(item = {}) {
      const id = String(item.id || '').slice(0, 60), name = String(item.name || '').slice(0, 30);
      if (!id || !name) return false;
      const img = String(item.img || '').replace(/^\/+/, '').slice(0, 200);
      const kind = item.kind === 'trophy' ? 'trophy' : 'badge';
      let added = false;
      await store.update(`${p}/collection`, (list) => {
        list = Array.isArray(list) ? list : [];
        const old = list.find((x) => x.appId === appId && x.id === id);
        if (old) { old.name = name; old.img = img; old.kind = kind; return list; }
        added = true;
        return [...list, { appId, subject, id, name, img, kind, at: new Date().toISOString() }].slice(-300);
      }, { fallback: [] });
      return added;
    },

    /**
     * 単元ごとの 到達（☆クリア・★定着）を ホームの「まなびの きろく」に 届ける（仕様書2-7、10-1）。
     * star：0＝まだ、1＝☆、2＝★。下がることは ない（いちど ★なら ★のまま）。
     * @param {{id:string, name:string, star:0|1|2, area?:string}} unit
     */
    async progress(unit = {}) {
      const id = String(unit.id || '').slice(0, 60), name = String(unit.name || '').slice(0, 30);
      const star = Math.max(0, Math.min(2, Math.floor(Number(unit.star) || 0)));
      if (!id || !name) return false;
      await store.update(`${p}/progress/${appId}`, (m) => {
        m = m && typeof m === 'object' ? m : {};
        const old = m[id];
        const crowns = Math.max(0, Math.min(99, Math.floor(Number(unit.crowns) || 0))); // 王冠（へらない）
        m[id] = { name, area: String(unit.area || '').slice(0, 20), star: Math.max(star, old?.star || 0), crowns: Math.max(crowns, old?.crowns || 0), subject, at: new Date().toISOString() };
        return m;
      }, { fallback: {} });
      return true;
    },

    /**
     * めずらしい 素材を ふやす（こうかんじょで つかう）。きめられた 素材だけ・1日に 1つの 素材ごと 5こまで
     *   await Island.material({ id: 'fushigi-kakera', count: 1 })  // ふしぎの あなを クリアしたとき
     * @returns {Promise<number|null>} いまの 数（ふやせなかったら null）
     */
    async material(item = {}) {
      const id = String(item.id || '');
      if (!RARE_MATERIALS[id]) return null;
      const n = Math.max(1, Math.min(5, Math.floor(Number(item.count) || 1)));
      const d = new Date(), today = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      let ok = 0;
      await store.update(`${p}/materialLog`, (L) => {
        L = L && L.day === today ? L : { day: today, n: {} };
        ok = Math.max(0, Math.min(n, (RARE_DAILY[id] || RARE_DAILY_MAX) - (L.n[id] || 0)));
        L.n[id] = (L.n[id] || 0) + ok; return L;
      }, { fallback: null });
      if (!ok) return null;
      let total = 0;
      await store.update(`${p}/wallet`, (w) => {
        w = w && typeof w === 'object' ? w : { coin: 0, materials: {} }; w.materials = w.materials || {};
        total = w.materials[id] = (w.materials[id] || 0) + ok; return w;
      }, { fallback: { coin: 0, materials: {} } });
      return total;
    },

    /**
     * ハテナリアコード（理科クエスト など ほかの アプリの がんばり）を うけとる（v0.3.6）。
     * レベル×4 問ぶんの ごほうび（reward と おなじ ものさし）と、学習の きろく。発行から 3日・いちど つかった コードは 60日 つかえない
     * @returns {Promise<{ok:boolean, why?:'bad'|'old'|'used'|'off', level?:number, gain?:object}>}
     */
    async redeemCode(code) {
      const r = readHatenariaCode(code);
      if (!r) return { ok: false, why: 'bad' };
      const age = (dayIndex() - r.day + 4096) % 4096;
      if (age > 3) return { ok: false, why: 'old' };
      const cls = await store.get(`${p}/class`);
      if (cls?.settings?.rqLink === false) return { ok: false, why: 'off' };
      const now = dayIndex();
      const used = (await store.get(`${p}/codesUsed`)) || {};
      if (used[r.key] != null && (now - used[r.key] + 4096) % 4096 <= 60) return { ok: false, why: 'used' };
      if (cls && cls.code) {
        const res = await classroom.useCode(p, r.key);
        if (res === 'used') return { ok: false, why: 'used' };
        if (res === 'off') return { ok: false, why: 'off' };
      }
      await store.update(`${p}/codesUsed`, (u) => {
        u = u || {}; for (const [k, d] of Object.entries(u)) if ((now - d + 4096) % 4096 > 60) delete u[k];
        u[r.key] = now; return u;
      }, { fallback: {} });
      const gain = await this.reward(r.level * 4);
      await this.record({ minutes: r.level * 2, source: 'hatenaria-code', level: r.level });
      return { ok: true, level: r.level, gain };
    },

    /** このアプリ独自の状態（シール帳など）を冒険の書ごとに読み書きする */
    async loadState() { return store.get(`${p}/game/${appId}`, undefined); },
    async saveState(data) { await store.set(`${p}/game/${appId}`, data); return true; },
  };
}
