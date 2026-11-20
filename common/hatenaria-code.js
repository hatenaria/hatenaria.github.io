// ハテナリアコード（理科クエスト → ハテナリア）v1
// 形：HQ-XXXXX-XXXX（英数字9文字。まぎらわしい 0 O 1 I は使わない）
// 中身：レベル（1〜5）、発行日（2026-01-01 からの日数）、ランダム、チェック文字（打ちまちがい・手作りを見分ける）
const ABC = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32文字
const BASE = Date.UTC(2026, 0, 1);
function check10(n) { // 35ビットの中身から 10ビットの チェック値
  let h = 2166136261 >>> 0; const s = 'hatenaria:' + n.toString(36);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h & 1023;
}
function toChars(n, len) { let s = ''; for (let i = 0; i < len; i++) { s = ABC[n % 32] + s; n = Math.floor(n / 32); } return s; }
function fromChars(s) { let n = 0; for (const c of s) { const v = ABC.indexOf(c); if (v < 0) return null; n = n * 32 + v; } return n; }
/** コードを作る。level：1〜5（その日の がんばりの 大きさ） */
export function makeHatenariaCode(level, date = new Date()) {
  const lv = Math.max(1, Math.min(5, Math.round(level)));
  const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - BASE) / 86400000) & 4095;
  const rnd = Math.floor(Math.random() * 1048576);
  const n = (lv * 4096 + day) * 1048576 + rnd;                 // 3+12+20 = 35ビット
  const s = toChars(n, 7) + toChars(check10(n), 2);
  return `HQ-${s.slice(0, 5)}-${s.slice(5)}`;
}
/** コードを読む（ハテナリア側）。正しくなければ null */
export function readHatenariaCode(code) {
  const s = String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^HQ/, '');
  if (s.length !== 9) return null;
  const n = fromChars(s.slice(0, 7)), c = fromChars(s.slice(7));
  if (n == null || c == null || check10(n) !== c) return null;
  const lv = Math.floor(n / 1048576 / 4096), day = Math.floor(n / 1048576) % 4096;
  if (lv < 1 || lv > 5) return null;
  return { level: lv, day, key: s };
}
/** 発行日の 日数（readHatenariaCode の day と おなじ ものさし） */
export function dayIndex(date = new Date()) { return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - BASE) / 86400000) & 4095; }
