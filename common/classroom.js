// 先生とのつながり（共通仕様書 4章）
// 児童の端末 → 先生のGAS：参加の登録、学習の要約（片道）。先生のGAS → 端末：クラス設定とお知らせだけ。
// 児童の記録は先生から返ってこない。実名は送らない（出席番号とハンドルネームだけ）。
import * as store from './store.js?v=0.24.1';

const REFRESH_MS = 2 * 60 * 1000;   // クラス設定（おしらせ・宿題など）はホームを開くたびに読む。続けて開いたときだけ2分あける
const SEND_MAX = 50;                     // 1回に送る要約の数

/** 参加用リンクの GAS の場所。GAS の配置ID か、テスト用の localhost だけを受け付ける */
export function endpointOf(join) {
  if (!join) return null;
  if (/^[\w-]{20,}$/.test(join)) return `https://script.google.com/macros/s/${join}/exec`;
  try {
    const u = new URL(join);
    if (u.hostname === 'script.google.com' && u.protocol === 'https:') return u.href;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return u.href; // 開発・テスト用
  } catch { /* 形がおかしい */ }
  return null;
}

/** いまのページのアドレスから参加用リンクを読む（?join=…&c=クラスコード） */
export function readJoinLink(href = location.href) {
  const u = new URL(href);
  const join = u.searchParams.get('join'), code = u.searchParams.get('c');
  const url = endpointOf(join);
  if (!url || !code || !/^[A-Z0-9]{4,10}$/.test(code)) return null;
  return { url, code };
}
export function clearJoinLink() {
  const u = new URL(location.href);
  u.searchParams.delete('join'); u.searchParams.delete('c');
  history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
}

/** 先生用ページの「先生として ホームへ」から 来たとき（?teach=…）。{ url, code, token, grade, className } */
export function readTeacherLink(href = location.href) {
  const v = new URL(href).searchParams.get('teach'); if (!v) return null;
  try {
    const bin = atob(v.replace(/-/g, '+').replace(/_/g, '/'));
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    const url = endpointOf(d.j);
    if (!url || !d.c || !d.t) return null;
    const one = (x) => ({ code: String(x.c), token: String(x.t), grade: Number(x.g) || null, className: String(x.n || '') });
    // k：先生が もっている クラス ぜんぶ（v0.19.0。ホームの 画面から きりかえる）
    const classes = Array.isArray(d.k) ? d.k.filter((x) => x && x.c && x.t).map(one) : [];
    return { url, ...one(d), classes, teachPage: /^https:\/\/script\.google\.com\//.test(String(d.p || '')) ? String(d.p) : '' };
  } catch { return null; }
}
export function clearTeacherLink() {
  const u = new URL(location.href); u.searchParams.delete('teach');
  history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
}
/** 先生の 冒険の書に クラスを つける（出席番号 0。成績には 入らない） */
export async function setTeacher(bookId, t) {
  return await store.update(`${bookId}/class`, (c) => ({ ...(c && c.teacher && c.code === t.code ? c : {}), code: t.code, url: t.url, number: 0, handle: 'せんせい', token: t.token, teacher: true,
    teachClasses: (t.classes && t.classes.length ? t.classes : c?.teachClasses) || [],
    teachPage: t.teachPage || c?.teachPage || '', // 先生用ページの URL（v0.22.0）
    className: t.className, settings: { ...((c && c.code === t.code && c.settings) || {}), teacher: true, grade: t.grade }, fetchedAt: 0, joinedAt: c?.joinedAt || new Date().toISOString() }), { fallback: null });
}

async function post(url, body, timeoutMs = 20000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    // text/plain にすると、ブラウザの事前確認（preflight）なしで送れる
    const r = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ac.signal, redirect: 'follow' });
    return await r.json();
  } finally { clearTimeout(t); }
}
async function get(url, params, timeoutMs = 15000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const q = new URLSearchParams(params).toString();
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + q, { signal: ac.signal, redirect: 'follow' });
    return await r.json();
  } finally { clearTimeout(t); }
}

/** クラスに入る（出席番号とハンドルネームを登録） */
export async function join(bookId, { url, code }, { number, pin, handle, grade }) {
  const res = await post(url, { action: 'join', code, number: Number(number), pin: String(pin || ''), handle, grade }, 45000); // クラス全員が いっせいに 押しても まてるように（0.21.1）
  if (!res || !res.ok) throw new Error(res?.message || 'とうろく できなかったよ');
  const cls = { code, url, number: Number(number), handle, token: res.token, className: res.className || '',
    settings: res.settings || {}, notices: res.notices || [], timetable: res.timetable || null, events: res.events || [], homework: res.homework || [], grandprix: res.grandprix || [], skew: res.now ? res.now - Date.now() : 0, fetchedAt: Date.now(), joinedAt: new Date().toISOString() };
  await store.set(`${bookId}/class`, cls);
  return cls;
}

/** クラスを ぬける（この端末の記録だけ。先生のシートの記録は残る） */
export async function leave(bookId) {
  await store.remove(`${bookId}/class`);
  await store.remove(`${bookId}/outbox`);
}

/** クラス設定とお知らせを読み直す。通信できなければ、前に読んだ設定のまま */
export async function refresh(bookId, { force = false } = {}) {
  const cls = await store.get(`${bookId}/class`);
  if (!cls || !cls.url) return cls;
  if (!force && cls.fetchedAt && Date.now() - cls.fetchedAt < REFRESH_MS) return cls;
  try {
    // GET は 学校の端末で とどかない ことがあったので、すべて POST（text/plain）で 送る（2026-11-17）
    const res = await post(cls.url, { action: 'config', c: cls.code, n: cls.number, t: cls.token }, 15000);
    if (res && res.ok) {
      return await store.update(`${bookId}/class`, (c) => c && ({ ...c, className: res.className ?? c.className,
        settings: res.settings || {}, notices: res.notices || [], timetable: res.timetable || null, events: res.events || [], homework: res.homework || [], grandprix: res.grandprix || [], skew: res.now ? res.now - Date.now() : 0, fetchedAt: Date.now() }));
    }
    if (res && res.code === 'unknown') { // 先生が名簿から消した・クラスを作り直した
      return await store.update(`${bookId}/class`, (c) => c && ({ ...c, invalid: true, fetchedAt: Date.now() }));
    }
  } catch { /* 通信できない：前の設定で動く */ }
  return cls;
}

let flushing = false;
/** 先生にまだ送れていない要約を送る。数秒まってから送り、送れた分だけ箱から消す */
export async function flush(bookId, { delay = true } = {}) {
  if (flushing) return 0;
  flushing = true;
  try {
    const cls = await store.get(`${bookId}/class`);
    if (!cls || !cls.url || cls.invalid) return 0;
    const box = await store.get(`${bookId}/outbox`, []);
    if (!box.length) return 0;
    if (delay) await new Promise((r) => setTimeout(r, 500 + Math.random() * 4000)); // みんな同時に送らないように
    const batch = box.slice(0, SEND_MAX);
    const res = await post(cls.url, { action: 'report', code: cls.code, number: cls.number, token: cls.token, handle: cls.handle, entries: batch });
    if (!res || !res.ok) {
      if (res && res.code === 'unknown') await store.update(`${bookId}/class`, (c) => c && ({ ...c, invalid: true }));
      return 0;
    }
    const sent = new Set(batch.map((e) => e.at + '|' + e.appId));
    await store.update(`${bookId}/outbox`, (b) => (b || []).filter((e) => !sent.has(e.at + '|' + e.appId)), { fallback: [] });
    return batch.length;
  } catch { return 0; } finally { flushing = false; }
}

/**
 * じかんわり（先生の Google ドライブの フォルダの いちばん新しい PDF・画像）を読む。
 * 一度 読んだものは 端末に とっておき、先生が 新しくするまで 読みなおさない（通信できないときも 見られる）。
 */
export async function loadTimetable(bookId) {
  const cls = await store.get(`${bookId}/class`);
  const meta = cls?.timetable;
  const cached = await store.get(`${bookId}/timetable`);
  if (!cls || !meta) return cached || null;
  if (cached && cached.id === meta.id && cached.updated === meta.updated) return cached;
  try {
    const res = await post(cls.url, { action: 'timetable', c: cls.code, n: cls.number, t: cls.token }, 40000);
    if (res && res.ok) {
      const tt = { id: res.id, name: res.name, mime: res.mime, updated: res.updated, data: res.data };
      await store.set(`${bookId}/timetable`, tt);
      return tt;
    }
    if (!cached) throw new Error(res?.message || 'じかんわりを よみこめなかったよ');
  } catch (e) { if (!cached) throw e; }
  return cached; // 通信できない：前に読んだ じかんわり
}

/** しまづくりを いま使ってよいか（先生の設定：いつでも／がっこうの じかんは できない／できない） */
export function buildAllowed(cls, now = new Date()) {
  const rule = cls?.settings?.buildRule || 'free';
  if (!cls || cls.invalid || rule === 'free') return true;
  if (rule === 'off') return false;
  // 'school'：平日の学校の時間（先生の設定。なければ 8:00〜15:30）は できない
  const day = now.getDay();
  if (day === 0 || day === 6) return true;
  const [a, b] = String(cls.settings.schoolHours || '08:00-15:30').split('-').map((s) => s.trim());
  const m = now.getHours() * 60 + now.getMinutes();
  const toMin = (s) => { const [h, mm] = s.split(':').map(Number); return h * 60 + (mm || 0); };
  return !(m >= toMin(a) && m < toMin(b));
}

/**
 * ハテナリアコードを クラスで「つかった」ことに する（先生の シートで 60日 おぼえる）。
 * @returns {Promise<'ok'|'used'|'off'|'offline'>}
 */
/** グランプリ（v0.20.0）：k='read' で 自分の 記録と クラスの 合計、k='send' で 記録を おくる。とどかなければ null */
export async function grandprix(bookId, id, k, score = 0) {
  const cls = await store.get(`${bookId}/class`);
  if (!cls || !cls.url || cls.invalid) return null;
  try {
    const res = await post(cls.url, { action: 'gp', c: cls.code, n: cls.number, t: cls.token, id, k, score }, 15000);
    return res || null;
  } catch { return null; }
}

/** ともだちの しま（v0.21.0）：k = put（じぶんの しまを あずける）・list・get（who の しま）・stamp（who に すてき！） */
export async function visit(bookId, k, extra = {}) {
  const cls = await store.get(`${bookId}/class`);
  if (!cls || !cls.url || cls.invalid) return null;
  try { return (await post(cls.url, { action: 'visit', c: cls.code, n: cls.number, t: cls.token, k, ...extra }, 15000)) || null; } catch { return null; }
}

export async function useCode(bookId, key) {
  const cls = await store.get(`${bookId}/class`);
  if (!cls || !cls.url || cls.invalid) return 'offline';
  try {
    const res = await post(cls.url, { action: 'code', code: cls.code, number: cls.number, token: cls.token, key }, 15000);
    if (!res) return 'offline';
    if (res.ok) return 'ok';
    return res.code === 'used' ? 'used' : res.code === 'off' ? 'off' : 'offline';
  } catch { return 'offline'; }
}
