// 先生とのつながり（共通仕様書 4章）
// 児童の端末 → 先生のGAS：参加の登録、学習の要約（片道）。先生のGAS → 端末：クラス設定とお知らせだけ。
// 児童の記録は先生から返ってこない。実名は送らない（出席番号とハンドルネームだけ）。
import * as store from './store.js?v=0.7.0';

const REFRESH_MS = 6 * 60 * 60 * 1000;   // クラス設定の読み込みは6時間に1回まで
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
export async function join(bookId, { url, code }, { number, handle, grade }) {
  const res = await post(url, { action: 'join', code, number: Number(number), handle, grade });
  if (!res || !res.ok) throw new Error(res?.message || 'とうろく できなかったよ');
  const cls = { code, url, number: Number(number), handle, token: res.token, className: res.className || '',
    settings: res.settings || {}, notices: res.notices || [], fetchedAt: Date.now(), joinedAt: new Date().toISOString() };
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
    const res = await get(cls.url, { action: 'config', c: cls.code, n: cls.number, t: cls.token });
    if (res && res.ok) {
      return await store.update(`${bookId}/class`, (c) => c && ({ ...c, className: res.className ?? c.className,
        settings: res.settings || {}, notices: res.notices || [], fetchedAt: Date.now() }));
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
