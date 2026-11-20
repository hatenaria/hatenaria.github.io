// ハテナリア 共通部品：主人公を描く（hero.js） 版 1.1.0
// ---------------------------------------------------------------------
// 使い方（ES モジュール）
//   import { createHero } from '/common/hero/hero.js';
//   const hero = await createHero(profile.hero, '/common/hero/');  // hero は {冒険の書}/profile の hero
//   hero.draw(ctx, x, y, dir, frame, scale);   // 足元が (x, y) になるように描く
//     dir   … 'down' | 'left' | 'right' | 'up'
//     frame … 0＝立ち、1＝踏み出し（歩くときは 0 と 1 を交互に）
//     scale … 1 のとき 1コマ 192×256px（配信画像の原寸）で描く。省略すると 1
//   準備（createHero）のときに、髪の色を変えた画像と 8コマ分の絵を作っておく。draw は描くだけ
//   見た目を変えたら createHero を呼び直す
//   （以前の書き方 draw(ctx, x, y, { dir, frame, width }) も使える）
//
// 重ねる順（共通仕様書 2-4）：奥の髪 → 体 → 服 → アクセサリー → 手前の髪
// 画像が読めないときは createHero が例外を投げる。呼ぶ側で仮の絵に切り替える
// =====================================================================
import { SHEET, BODY, HAIRS, HAIR_COLORS, HAIR_COLOR_STOPS, OUTFITS, ACCESSORIES, DEFAULTS } from './parts.js?v=0.15.1';

export const HERO_VERSION = '1.2.2';
const { cellW: CW, cellH: CH, footX: FX, footY: FY, dirs: DIRS } = SHEET;
const DEFAULT_BASE = new URL('./', import.meta.url).href;

const images = new Map();   // src → Promise<Image>
const measures = new Map(); // src → 計測結果
const tinted = new Map();   // 'hair|color' → canvas
const framesCache = new Map();

function loadImage(src, base) {
  const url = new URL(src, base).href;
  if (!images.has(url)) {
    images.set(url, new Promise((ok, ng) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => { images.delete(url); ng(new Error('画像を読み込めません：' + url)); };
      im.src = url;
    }));
  }
  return images.get(url);
}

function cellAlpha(img, col, row) {
  const c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, col * CW, row * CH, CW, CH, 0, 0, CW, CH);
  return x.getImageData(0, 0, CW, CH).data;
}
function topOf(al) {
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (al[(y * CW + x) * 4 + 3] > 128) return y;
  return -1;
}

/** 体の各コマの、頭のてっぺん・首の位置を測る（頭と胸の動きに部品を合わせるため） */
function measureBody(img) {
  const m = {};
  DIRS.forEach((d, col) => [0, 1].forEach((fr) => {
    const al = cellAlpha(img, col, fr);
    let top = -1, bot = -1;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (al[(y * CW + x) * 4 + 3] > 128) { if (top < 0) top = y; bot = y; }
    const h = bot - top;
    let neck = Math.round(top + h * 0.45), best = 1e9;
    for (let y = Math.round(top + h * 0.35); y <= Math.round(top + h * 0.65); y++) {
      let l = -1, r = -1;
      for (let x = 0; x < CW; x++) if (al[(y * CW + x) * 4 + 3] > 128) { if (l < 0) l = x; r = x; }
      const w = l < 0 ? 1e9 : r - l; if (w < best) { best = w; neck = y; }
    }
    let sx = 0, n = 0; // 頭の上の部分の左右の中心
    for (let y = top; y < top + 20; y++) for (let x = 0; x < CW; x++) if (al[(y * CW + x) * 4 + 3] > 128) { sx += x; n++; }
    m[d + fr] = { top, neck, cx: n ? sx / n : CW / 2 };
  }));
  // 踏み出しのとき、立ちと比べて頭・胸がどれだけ動くか（髪とアクセサリーをずらす量）
  DIRS.forEach((d) => {
    const a = m[d + 0], b = m[d + 1];
    m[d + 'head'] = [b.cx - a.cx, b.top - a.top];
    m[d + 'chest'] = [b.cx - a.cx, b.neck - a.neck];
  });
  return m;
}

function measureOutfit(img) {
  const m = {};
  DIRS.forEach((d, col) => [0, 1].forEach((fr) => { m[d + fr] = topOf(cellAlpha(img, col, fr)); }));
  return m;
}

/** 髪の色を変えた画像を作る（明るさの濃淡に4色を当てる） */
function tintHair(img, colorId) {
  const key = img.src + '|' + colorId;
  if (tinted.has(key)) return tinted.get(key);
  const stops = (HAIR_COLORS[colorId] || HAIR_COLORS[DEFAULTS.hairColor]).stops;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  const L = [];
  for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 20) L.push((0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255);
  L.sort((a, b) => a - b);
  const lo = L[Math.floor(L.length * 0.02)] || 0, hi = L[Math.floor(L.length * 0.98)] || 1;
  const S = HAIR_COLOR_STOPS;
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    let v = ((0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255 - lo) / (hi - lo || 1);
    v = Math.max(0, Math.min(1, v));
    let k = 0; while (k < S.length - 2 && v > S[k + 1]) k++;
    const t = (v - S[k]) / (S[k + 1] - S[k]);
    for (let ch = 0; ch < 3; ch++) p[i + ch] = stops[k][ch] + (stops[k + 1][ch] - stops[k][ch]) * t;
  }
  x.putImageData(d, 0, 0);
  tinted.set(key, c);
  return c;
}

/** profile.hero の null や知らないIDを、使える値にそろえる */
export function resolveHero(hero = {}) {
  const gender = hero && hero.gender === 'girl' ? 'girl' : 'boy';
  return {
    gender,
    hair: HAIRS[hero?.hair] ? hero.hair : DEFAULTS.hair[gender],
    hairColor: HAIR_COLORS[hero?.hairColor] ? hero.hairColor : DEFAULTS.hairColor,
    outfit: OUTFITS[hero?.outfit] ? hero.outfit : DEFAULTS.outfit,
    accessory: ACCESSORIES[hero?.accessory] ? hero.accessory : DEFAULTS.accessory,
  };
}

/** 主人公1人分を用意する。返したものの draw() で描く */
export async function createHero(hero = {}, basePath) {
  const base = basePath ? new URL(basePath.endsWith('/') ? basePath : basePath + '/', location.href).href : DEFAULT_BASE;
  const h = resolveHero(hero);
  const list = { body: BODY.src, hair: HAIRS[h.hair].src };
  if (h.outfit) list.outfit = OUTFITS[h.outfit].src;
  if (h.accessory) list.accessory = ACCESSORIES[h.accessory].src;
  const img = {};
  await Promise.all(Object.entries(list).map(async ([k, src]) => { img[k] = await loadImage(src, base); }));
  if (!measures.has(BODY.src)) measures.set(BODY.src, measureBody(img.body));
  const bm = measures.get(BODY.src);
  let om = null;
  if (img.outfit) { if (!measures.has(list.outfit)) measures.set(list.outfit, measureOutfit(img.outfit)); om = measures.get(list.outfit); }
  const hairImg = tintHair(img.hair, h.hairColor);
  const id = [h.hair, h.hairColor, h.outfit, h.accessory].join('|');

  function frameCanvas(dir, fr) {
    const k = id + '|' + dir + fr;
    if (framesCache.has(k)) return framesCache.get(k);
    const col = Math.max(0, DIRS.indexOf(dir));
    const c = document.createElement('canvas'); c.width = CW; c.height = CH;
    const x = c.getContext('2d');
    const [hx, hy] = fr ? bm[dir + 'head'] : [0, 0];
    const [ax, ay] = fr ? bm[dir + 'chest'] : [0, 0];
    x.drawImage(hairImg, col * CW, CH, CW, CH, hx, hy, CW, CH);                       // 奥の髪
    if (img.outfit) {                                                                   // 体（首より下は服で描くので切る）
      const clipY = Math.max(bm[dir + fr].neck - 4, om[dir + fr] + 3);
      x.save(); x.beginPath(); x.rect(0, 0, CW, clipY); x.clip();
      x.drawImage(img.body, col * CW, fr * CH, CW, CH, 0, 0, CW, CH); x.restore();
      x.drawImage(img.outfit, col * CW, fr * CH, CW, CH, 0, 0, CW, CH);                 // 服
    } else {
      x.drawImage(img.body, col * CW, fr * CH, CW, CH, 0, 0, CW, CH);
    }
    const onHead = img.accessory && ACCESSORIES[h.accessory]?.at === 'head';
    if (img.accessory && !onHead) x.drawImage(img.accessory, col * CW, 0, CW, CH, ax, ay, CW, CH); // アクセサリー（胸）
    x.drawImage(hairImg, col * CW, 0, CW, CH, hx, hy, CW, CH);                          // 手前の髪
    if (onHead) x.drawImage(img.accessory, col * CW, 0, CW, CH, hx, hy, CW, CH);        // アクセサリー（頭：ぼうし・めがね など）
    framesCache.set(k, c);
    return c;
  }

  DIRS.forEach((d) => { frameCanvas(d, 0); frameCanvas(d, 1); });   // 8コマを先に作っておく

  return {
    hero: h,
    frameCanvas,
    /** 足元 (x, y) を基準に描く。draw(ctx, x, y, dir, frame, scale) */
    draw(ctx, x, y, dir = 'down', frame = 0, scale = 1) {
      if (dir && typeof dir === 'object') { const o = dir; dir = o.dir || 'down'; frame = o.frame || 0; scale = (o.width || CW) / CW; }
      const s = scale || 1;
      ctx.drawImage(frameCanvas(DIRS.includes(dir) ? dir : 'down', frame ? 1 : 0), x - FX * s, y - FY * s, CW * s, CH * s);
    },
  };
}

export { SHEET, HAIRS, HAIR_COLORS, OUTFITS, ACCESSORIES, DEFAULTS };
