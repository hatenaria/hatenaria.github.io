// ホームアイランド v0.2
// 島を歩く・建物を調べる・掲示板・気球で島めぐり・島から戻ったときの「おかえり」

import * as store from '../common/store.js';
import * as books from '../common/books.js';
import { showPicker } from '../common/book-picker.js';
import { OBJECT_TYPES, DEFAULT_HOME, migrateHome, PATH_TILES, ISLANDS, SAMPLE_NOTICES, SUBJECT_LABELS, HERO_SHEETS, TEXTURES, ISLANDS_BG } from './data.js';

export const HOME_VERSION = '0.3.3';
const PREVIEW = !!window.GI_PREVIEW; // アーティファクトでの試作表示（島へは移動しない）

// 主人公の画像（仕様書2-4の規格：1コマ 384×512、足元 x=192, y=488。縮小した画像でも同じ比率で扱う）
const FOOT = { x: 192 / 384, y: 488 / 512 };
const sprites = {}; // 建物の画像（読み込めたものだけ）
const tex = {};     // 地面の模様（読み込めたものだけ）
// 地面の模様を、地図といっしょに動くように貼る
function texFill(name, cx, cy, drift = 0) {
  const t = tex[name];
  if (!t) return false;
  if (!t.pat) t.pat = ctx.createPattern(t.img, 'repeat');
  const sc = TEXTURES[name].tiles * T / t.img.width;
  t.pat.setTransform(new DOMMatrix().translate(-cx + drift, -cy).scale(sc));
  ctx.fillStyle = t.pat;
  return true;
}
const DIR_COL = { down: 0, left: 1, right: 2, up: 3 };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const STEP_MS = 190;

// ------------------------------------------------------------------ 状態
let book = null;
let home = null;          // p1/home の中身
let wallet = null;
let cls = null;           // p1/class（なければ null）
let T = 96;               // 1マスの大きさ（画面上の px）
const player = { x: 8, y: 7, dir: 'down', fx: 8, fy: 7, moving: false, from: null, t0: 0, step: 0 };
let heldDir = null;
let pathQueue = [];
let pendingInteract = null;
let modalOpen = false;
let heroImg = null;

const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');

// ------------------------------------------------------------------ マップ
// 陸のマス（home.map.land）から作る。土地が増えたら refreshLand() を呼ぶ
let landSet = new Set(), landTiles = [], landBox = { x0: 0, y0: 0, x1: 0, y1: 0 };
function refreshLand() {
  landSet = new Set(home.map.land);
  landTiles = home.map.land.map((k) => k.split(',').map(Number));
  const xs = landTiles.map((t) => t[0]), ys = landTiles.map((t) => t[1]);
  landBox = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  coast = buildCoast();
}

// 海岸線：陸のマスをぼかした「陸らしさ」の値から、なめらかな輪郭を作る（マーチングスクエア法）
// 同じ値の線をいくつか取り出し、外側から 白い泡 → 浅瀬 → 砂浜 → 草地 の順に重ねる
let coast = null;
const COAST_LEVELS = { foam: .1, shallow: .2, sand: .33, grass: .5 };
function buildCoast() {
  const SS = 8, M = 2;                       // 1マスを8つに分けて計算。島のまわり2マスまで
  const ox = landBox.x0 - M, oy = landBox.y0 - M;
  const nx = (landBox.x1 - landBox.x0 + 1 + M * 2) * SS + 1, ny = (landBox.y1 - landBox.y0 + 1 + M * 2) * SS + 1;
  let f = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const tx = Math.floor(ox + (i + .5) / SS), ty = Math.floor(oy + (j + .5) / SS);
    f[j * nx + i] = landSet.has(`${tx},${ty}`) ? 1 : 0;
  }
  // ガウスぼかし（横 → 縦）
  const sig = .38 * SS, R = Math.ceil(sig * 3), k = [];
  let ks = 0; for (let d = -R; d <= R; d++) { const v = Math.exp(-(d * d) / (2 * sig * sig)); k.push(v); ks += v; }
  for (let d = 0; d < k.length; d++) k[d] /= ks;
  const tmp = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let a = 0; for (let d = -R; d <= R; d++) { const ii = i + d; if (ii >= 0 && ii < nx) a += f[j * nx + ii] * k[d + R]; } tmp[j * nx + i] = a;
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let a = 0; for (let d = -R; d <= R; d++) { const jj = j + d; if (jj >= 0 && jj < ny) a += tmp[jj * nx + i] * k[d + R]; } f[j * nx + i] = a;
  }
  const out = {};
  for (const [name, th] of Object.entries(COAST_LEVELS)) out[name] = contourPath(f, nx, ny, th, ox, oy, SS);
  return out;
}
function contourPath(f, nx, ny, th, ox, oy, SS) {
  const pt = new Map(), link = new Map();
  const v = (i, j) => f[j * nx + i];
  const edgePoint = (key, i1, j1, i2, j2) => {
    if (!pt.has(key)) {
      const a = v(i1, j1), b = v(i2, j2), t = (th - a) / (b - a || 1e-6);
      pt.set(key, [ox + (i1 + (i2 - i1) * t + .5) / SS, oy + (j1 + (j2 - j1) * t + .5) / SS]);
    }
    return key;
  };
  const connect = (a, b) => { (link.get(a) || link.set(a, []).get(a)).push(b); (link.get(b) || link.set(b, []).get(b)).push(a); };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const c = (v(i, j) >= th ? 8 : 0) | (v(i + 1, j) >= th ? 4 : 0) | (v(i + 1, j + 1) >= th ? 2 : 0) | (v(i, j + 1) >= th ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const T_ = () => edgePoint(`h${i},${j}`, i, j, i + 1, j), B = () => edgePoint(`h${i},${j + 1}`, i, j + 1, i + 1, j + 1);
    const L = () => edgePoint(`v${i},${j}`, i, j, i, j + 1), Rr = () => edgePoint(`v${i + 1},${j}`, i + 1, j, i + 1, j + 1);
    switch (c) {
      case 1: case 14: connect(L(), B()); break;
      case 2: case 13: connect(B(), Rr()); break;
      case 3: case 12: connect(L(), Rr()); break;
      case 4: case 11: connect(T_(), Rr()); break;
      case 6: case 9: connect(T_(), B()); break;
      case 7: case 8: connect(L(), T_()); break;
      case 5: connect(L(), T_()); connect(B(), Rr()); break;
      case 10: connect(L(), B()); connect(T_(), Rr()); break;
    }
  }
  const path = new Path2D(), seen = new Set();
  for (const start of link.keys()) {
    if (seen.has(start)) continue;
    let prev = null, cur = start, first = true;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const [x, y] = pt.get(cur);
      if (first) { path.moveTo(x, y); first = false; } else path.lineTo(x, y);
      const nb = link.get(cur).find((n) => n !== prev && !seen.has(n));
      prev = cur; cur = nb;
    }
    path.closePath();
  }
  return path;
}
function isWater(x, y) { return !landSet.has(`${x},${y}`); }
function objectAt(x, y) {
  return home.objects.find((o) => {
    const t = OBJECT_TYPES[o.type];
    return x >= o.x && x < o.x + t.w && y >= o.y && y < o.y + t.h;
  }) || null;
}
function walkable(x, y) {
  if (isWater(x, y)) return false;
  const o = objectAt(x, y);
  return !(o && OBJECT_TYPES[o.type].solid);
}
const pathSet = new Set(PATH_TILES.map(([x, y]) => `${x},${y}`));

// ------------------------------------------------------------------ 保存
async function saveHome() {
  home.player = { x: player.x, y: player.y, dir: player.dir };
  await store.set(`${book.id}/home`, home);
}
let saveTimer = null;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveHome, 600); }

// ------------------------------------------------------------------ 移動
function tryStep(dir) {
  player.dir = dir;
  const [dx, dy] = DIRS[dir];
  const nx = player.x + dx, ny = player.y + dy;
  if (!walkable(nx, ny)) return false;
  player.from = [player.x, player.y];
  player.x = nx; player.y = ny;
  player.moving = true; player.t0 = performance.now();
  player.step ^= 1;
  return true;
}

function findPath(sx, sy, gx, gy) {
  const key = (x, y) => `${x},${y}`;
  const prev = new Map([[key(sx, sy), null]]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === gx && y === gy) break;
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (prev.has(k) || !walkable(nx, ny)) continue;
      prev.set(k, [x, y, d]);
      q.push([nx, ny]);
    }
  }
  if (!prev.has(key(gx, gy))) return null;
  const dirs = [];
  let cur = [gx, gy];
  while (true) {
    const p = prev.get(key(cur[0], cur[1]));
    if (!p) break;
    dirs.unshift(p[2]);
    cur = [p[0], p[1]];
  }
  return dirs;
}

// 建物の前（下の行）で、いちばん近いマス
function frontOf(o) {
  const t = OBJECT_TYPES[o.type];
  const cands = [];
  for (let x = o.x; x < o.x + t.w; x++) cands.push([x, o.y + t.h]);
  if (!t.solid) cands.push([o.x, o.y]); // あきちは中に入れる
  let best = null;
  for (const [x, y] of cands) {
    if (!walkable(x, y)) continue;
    const p = findPath(player.x, player.y, x, y);
    if (p && (!best || p.length < best.p.length)) best = { x, y, p };
  }
  return best;
}

function facingObject() {
  const [dx, dy] = DIRS[player.dir];
  const o = objectAt(player.x + dx, player.y + dy) || (objectAt(player.x, player.y)?.type === 'lot' ? objectAt(player.x, player.y) : null);
  return o && !OBJECT_TYPES[o.type].deco ? o : null;
}

function update(now) {
  if (player.moving) {
    const k = Math.min(1, (now - player.t0) / STEP_MS);
    player.fx = player.from[0] + (player.x - player.from[0]) * k;
    player.fy = player.from[1] + (player.y - player.from[1]) * k;
    if (k >= 1) { player.moving = false; player.fx = player.x; player.fy = player.y; saveSoon(); }
  }
  if (!player.moving && !modalOpen) {
    if (heldDir) { pathQueue = []; pendingInteract = null; tryStep(heldDir); }
    else if (pathQueue.length) {
      const d = pathQueue.shift();
      if (!tryStep(d)) pathQueue = [];
    } else if (pendingInteract) {
      const o = pendingInteract; pendingInteract = null;
      player.dir = (player.y >= o.y + OBJECT_TYPES[o.type].h) ? 'up' : player.dir;
      interact(o);
    }
  }
}

// ------------------------------------------------------------------ 描画
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  T = Math.max(56, Math.min(96, Math.floor(Math.min(w / 10, h / 7.5))));
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function camera() {
  const w = window.innerWidth, h = window.innerHeight;
  // 島（陸）のまわり1マスまでを、画面に映す範囲にする
  const left = (landBox.x0 - 1) * T, top = (landBox.y0 - 1) * T;
  const mw = (landBox.x1 - landBox.x0 + 3) * T, mh = (landBox.y1 - landBox.y0 + 3) * T;
  let cx = (player.fx + 0.5) * T - w / 2;
  let cy = (player.fy + 0.5) * T - h / 2;
  cx = mw <= w ? left + (mw - w) / 2 : Math.max(left, Math.min(left + mw - w, cx));
  cy = mh <= h ? top + (mh - h) / 2 : Math.max(top, Math.min(top + mh - h, cy));
  return [Math.round(cx), Math.round(cy)];
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// 海岸線の形（タイル単位の Path2D）を、画面の位置に合わせて塗る
function fillCoast(path, cx, cy, style) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dpr = canvas.width / window.innerWidth;
  ctx.setTransform(dpr * T, 0, 0, dpr * T, -cx * dpr, -cy * dpr);
  ctx.clip(path, 'evenodd');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (style === 'grass') { if (!texFill('grass', cx, cy)) ctx.fillStyle = '#8ccf77'; }
  else ctx.fillStyle = style;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.restore();
}

function drawGround(now, cx, cy) {
  // 海
  if (!texFill('sea', cx, cy, (now / 120) % (TEXTURES.sea.tiles * T))) ctx.fillStyle = '#5ec3e8';
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  // 打ち寄せる波（白い泡）→ 浅瀬 → 砂浜 → 草地
  fillCoast(coast.foam, cx, cy, `rgba(255,255,255,${.45 + .2 * Math.sin(now / 700)})`);
  fillCoast(coast.shallow, cx, cy, 'rgba(170,232,244,.9)');
  fillCoast(coast.sand, cx, cy, '#f1dca5');
  fillCoast(coast.grass, cx, cy, 'grass');
  // 道（となりの道とつながって見えるように描く）
  for (const [x, y] of PATH_TILES) {
    const px = x * T - cx, py = y * T - cy, m = T * .12;
    const L = pathSet.has(`${x - 1},${y}`), R = pathSet.has(`${x + 1},${y}`), U = pathSet.has(`${x},${y - 1}`), D = pathSet.has(`${x},${y + 1}`);
    if (!texFill('path', cx, cy)) ctx.fillStyle = '#e8d3a0';
    ctx.fillRect(px + (L ? 0 : m), py + (U ? 0 : m), T - (L ? 0 : m) - (R ? 0 : m) + 1, T - (U ? 0 : m) - (D ? 0 : m) + 1);
  }
}

// 名札はあとでまとめて描く（主人公に重なる名札はうすくして、主人公が見えるようにする）
let labelQueue = null;
function drawLabel(text, x, y, color = '#3a3226') {
  if (labelQueue) { labelQueue.push([text, x, y, color]); return; }
  drawLabelNow(text, x, y, color);
}
function drawLabelNow(text, x, y, color = '#3a3226', alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.font = `bold ${Math.round(T * .2)}px "Hiragino Maru Gothic ProN","BIZ UDPGothic",sans-serif`;
  const tw = ctx.measureText(text).width + T * .24;
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  roundRect(x - tw / 2, y - T * .17, tw, T * .34, T * .1); ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
  ctx.globalAlpha = 1;
}

function drawSprite(o, t, px, py, img) {
  const W = t.w * T, H = t.h * T;
  const iw = t.sprite.w * T, ih = img.height * iw / img.width;
  ctx.fillStyle = 'rgba(40,60,30,.2)'; // 地面の影
  ctx.beginPath(); ctx.ellipse(px + W / 2, py + H - T * .08, W * .55, T * .32, 0, 0, 7); ctx.fill();
  ctx.drawImage(img, px + W / 2 - iw / 2, py + H - ih, iw, ih);
  if (!t.noLabel) drawLabel(t.name, px + W / 2, py + H - ih - T * .12);
  if (t.soon) drawLabel('じゅんびちゅう', px + W / 2, py + H - ih + T * .26, '#9a6a1c'); // 名前のすぐ下（入口をかくさない）
  return ih;
}

function drawUnreadBadge(cx, top, now) {
  const bob = Math.sin(now / 250) * 4;
  ctx.fillStyle = '#e8483b'; ctx.beginPath(); ctx.arc(cx, top - T * .22 + bob, T * .2, 0, 7); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(T * .28)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('！', cx, top - T * .2 + bob);
}

function drawBuilding(o, t, px, py, now) {
  if (t.sprite && sprites[o.type]) return drawSprite(o, t, px, py, sprites[o.type]);
  const W = t.w * T, H = t.h * T;
  // 影
  ctx.fillStyle = 'rgba(40,60,30,.18)';
  roundRect(px + T * .1, py + H * .35, W - T * .1, H * .7, T * .2); ctx.fill();
  // 壁
  const wallTop = py + H * .38;
  ctx.fillStyle = t.wall; roundRect(px + T * .12, wallTop, W - T * .24, H * .58, T * .08); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2; ctx.stroke();
  // 屋根
  ctx.fillStyle = t.roof;
  ctx.beginPath();
  ctx.moveTo(px + T * .02, wallTop + T * .06); ctx.lineTo(px + T * .3, py + T * .1);
  ctx.lineTo(px + W - T * .3, py + T * .1); ctx.lineTo(px + W - T * .02, wallTop + T * .06); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(px + T * .3, py + T * .1, W - T * .6, T * .08);
  // 入口
  ctx.fillStyle = '#8a5a3b';
  roundRect(px + W / 2 - T * .22, py + H - T * .62, T * .44, T * .56, T * .12); ctx.fill();
  // 窓
  ctx.fillStyle = '#bfe4f6';
  if (t.w >= 3) { roundRect(px + T * .45, wallTop + T * .25, T * .4, T * .34, 6); ctx.fill(); roundRect(px + W - T * .85, wallTop + T * .25, T * .4, T * .34, 6); ctx.fill(); }
  if (o.type === 'school') { // 時計
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + W / 2, py + H * .28, T * .2, 0, 7); ctx.fill();
    ctx.strokeStyle = '#3a3226'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + W / 2, py + H * .28); ctx.lineTo(px + W / 2, py + H * .28 - T * .12); ctx.moveTo(px + W / 2, py + H * .28); ctx.lineTo(px + W / 2 + T * .09, py + H * .28); ctx.stroke();
  }
  drawLabel(t.name, px + W / 2, py + T * .05);
  if (t.soon) drawLabel('じゅんびちゅう', px + W / 2, py + H * .62, '#9a6a1c');
}

function drawBoard(o, px, py, now) {
  const t = OBJECT_TYPES.board;
  if (t.sprite && sprites.board) {
    const ih = drawSprite(o, t, px, py, sprites.board);
    if (unreadCount() > 0) drawUnreadBadge(px + T / 2, py + T - ih, now);
    return;
  }
  ctx.fillStyle = 'rgba(40,60,30,.18)'; roundRect(px + T * .15, py + T * .72, T * .7, T * .2, T * .1); ctx.fill();
  ctx.fillStyle = '#8a5a3b'; ctx.fillRect(px + T * .2, py + T * .45, T * .08, T * .4); ctx.fillRect(px + T * .72, py + T * .45, T * .08, T * .4);
  ctx.fillStyle = '#b07a4f'; roundRect(px + T * .08, py + T * .1, T * .84, T * .5, 8); ctx.fill();
  ctx.fillStyle = '#fffaf0'; roundRect(px + T * .16, py + T * .17, T * .68, T * .36, 5); ctx.fill();
  ctx.fillStyle = '#d6cbb5'; for (let i = 0; i < 3; i++) ctx.fillRect(px + T * .24, py + T * (.24 + i * .09), T * .52, 3);
  if (unreadCount() > 0) { // 未読の「！」
    const bob = Math.sin(now / 250) * 4;
    ctx.fillStyle = '#e8483b'; ctx.beginPath(); ctx.arc(px + T * .5, py - T * .18 + bob, T * .2, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(T * .28)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('！', px + T * .5, py - T * .16 + bob);
  }
}

function drawBalloon(o, t, px, py, now) {
  const W = t.w * T, H = t.h * T;
  if (sprites.balloon && sprites.balloonAir) {
    const pad = sprites.balloon, air = sprites.balloonAir;
    const pw = t.sprite.w * T, ph = pad.height * pw / pad.width;
    ctx.fillStyle = 'rgba(40,60,30,.2)';
    ctx.beginPath(); ctx.ellipse(px + W / 2, py + H - T * .08, W * .55, T * .3, 0, 0, 7); ctx.fill();
    const padTop = py + H - ph;
    ctx.drawImage(pad, px + W / 2 - pw / 2, padTop, pw, ph);
    const aw = t.air.w * T, ah = air.height * aw / air.width;
    const bob = Math.sin(now / 600) * T * .05 - T * .06; // 少し浮かんで、ゆっくり上下する
    const deckY = padTop + ph * t.air.deck;
    ctx.drawImage(air, px + W / 2 - aw / 2, deckY - ah + bob, aw, ah);
    drawLabel(t.name, px + W / 2, deckY - ah + bob - T * .14);
    return;
  }
  ctx.fillStyle = '#c9b48a'; roundRect(px + T * .1, py + H * .55, W - T * .2, H * .4, T * .2); ctx.fill(); // 発着台
  ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2; ctx.stroke();
  const bob = Math.sin(now / 600) * 5;
  const bx = px + W / 2, by = py + H * .25 + bob;
  ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bx - T * .3, by + T * .35); ctx.lineTo(bx - T * .18, by + T * .78); ctx.moveTo(bx + T * .3, by + T * .35); ctx.lineTo(bx + T * .18, by + T * .78); ctx.stroke();
  const colors = ['#f26b5b', '#ffd66b', '#5ec3e8', '#8fd17a'];
  for (let i = 0; i < 4; i++) { // 気球（たてじまの球）
    ctx.fillStyle = colors[i];
    ctx.beginPath(); ctx.ellipse(bx, by, T * .55 * (1 - i * .22), T * .6, 0, 0, 7); ctx.fill();
  }
  ctx.fillStyle = '#a0703f'; roundRect(bx - T * .2, by + T * .74, T * .4, T * .26, 5); ctx.fill();
  drawLabel(t.name, bx, py + H * .82);
}

function drawLot(o, t, px, py) {
  if (sprites.lot) { drawSprite(o, { ...t, sprite: t.sprite }, px, py, sprites.lot); return; }
  const W = t.w * T, H = t.h * T;
  ctx.fillStyle = 'rgba(160,120,70,.18)'; roundRect(px + T * .1, py + T * .1, W - T * .2, H - T * .2, T * .15); ctx.fill();
  ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(120,85,50,.55)'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#8a5a3b'; ctx.fillRect(px + W / 2 - 3, py + H * .35, 6, H * .3);
  drawLabel('あきち', px + W / 2, py + H * .35);
}

function drawHero(px, py, now) {
  // px, py は足元の位置
  const walking = player.moving;
  const frame = walking ? 1 : 0;
  ctx.fillStyle = 'rgba(30,50,20,.25)'; ctx.beginPath(); ctx.ellipse(px, py, T * .28, T * .1, 0, 0, 7); ctx.fill();
  if (heroImg) {
    const fw = heroImg.width / 4, fh = heroImg.height / 2, s = T / fw; // 画面では横1マス
    ctx.drawImage(heroImg, DIR_COL[player.dir] * fw, frame * fh, fw, fh, px - fw * FOOT.x * s, py - fh * FOOT.y * s, fw * s, fh * s);
    return;
  }
  // 仮の主人公（正式な画像ができたら上の drawImage に切り替わる）
  const bob = walking ? -Math.abs(Math.sin((now - player.t0) / STEP_MS * Math.PI)) * T * .06 : 0;
  const lift = player.step ? 1 : -1;
  ctx.fillStyle = '#3b5998';
  if (walking) { ctx.fillRect(px - T * .14, py - T * .2 + lift * 2, T * .1, T * .18); ctx.fillRect(px + T * .04, py - T * .2 - lift * 2, T * .1, T * .18); }
  else { ctx.fillRect(px - T * .14, py - T * .2, T * .1, T * .18); ctx.fillRect(px + T * .04, py - T * .2, T * .1, T * .18); }
  ctx.fillStyle = '#f26b5b'; roundRect(px - T * .22, py - T * .62 + bob, T * .44, T * .46, T * .14); ctx.fill();
  ctx.fillStyle = '#ffe0bd'; ctx.beginPath(); ctx.arc(px, py - T * .82 + bob, T * .25, 0, 7); ctx.fill();
  ctx.fillStyle = '#4a3426'; ctx.beginPath(); ctx.arc(px, py - T * .9 + bob, T * .25, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#3a3226';
  const ex = { down: 0, up: 0, left: -.1, right: .1 }[player.dir];
  if (player.dir !== 'up') {
    if (player.dir !== 'right') { ctx.beginPath(); ctx.arc(px + (ex - .08) * T, py - T * .8 + bob, T * .03, 0, 7); ctx.fill(); }
    if (player.dir !== 'left') { ctx.beginPath(); ctx.arc(px + (ex + .08) * T, py - T * .8 + bob, T * .03, 0, 7); ctx.fill(); }
  }
}

function draw(now) {
  const [cx, cy] = camera();
  drawGround(now, cx, cy);
  // 奥から順に描く（足元の y が小さい順）
  const items = home.objects.map((o) => ({ o, z: o.y + OBJECT_TYPES[o.type].h - (OBJECT_TYPES[o.type].solid ? 0 : 5) }));
  items.push({ hero: true, z: player.fy + 1 - 0.01 });
  items.sort((a, b) => a.z - b.z);
  labelQueue = [];
  for (const it of items) {
    if (it.hero) { drawHero((player.fx + .5) * T - cx, (player.fy + .92) * T - cy, now); continue; }
    const o = it.o, t = OBJECT_TYPES[o.type];
    const px = o.x * T - cx, py = o.y * T - cy;
    if (o.type === 'board') drawBoard(o, px, py, now);
    else if (o.type === 'balloon') drawBalloon(o, t, px, py, now);
    else if (o.type === 'lot') drawLot(o, t, px, py);
    else drawBuilding(o, t, px, py, now);
  }
  // 名札（主人公の体に重なるものはうすく）
  const hx = (player.fx + .5) * T - cx, hy = (player.fy + .92) * T - cy;
  const q = labelQueue; labelQueue = null;
  for (const [text, x, y, color] of q) {
    const over = Math.abs(x - hx) < T * 1.1 && y > hy - T * 1.45 && y < hy + T * .1;
    drawLabelNow(text, x, y, color, over ? .25 : 1);
  }
  // 調べられる建物の名前
  const f = !player.moving && !modalOpen && facingObject();
  const hint = document.getElementById('hint');
  if (f) { hint.textContent = `${OBJECT_TYPES[f.type].name}を しらべる`; hint.classList.add('show'); }
  else hint.classList.remove('show');
}

function loop(now) {
  update(now);
  draw(now);
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ 画面（ダイアログ）
const layer = document.getElementById('layer');
let modalOpenedAt = 0;
function openModal(build) {
  modalOpen = true; heldDir = null; pathQueue = [];
  layer.replaceChildren();
  const box = document.createElement('div'); box.className = 'modal';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  layer.append(box); layer.classList.add('show');
  build(box);
  modalOpenedAt = performance.now();
  // はじめに選ばれているボタン（data-default があればそれ、なければ最後のボタン）
  requestAnimationFrame(() => focusButton(box.querySelector('[data-default]:not([disabled])') || buttonsIn(box).pop()));
}
function closeModal() {
  if (layer.querySelector('.lift')) return; // 気球が飛び立っているあいだは閉じない
  layer.classList.remove('show'); layer.replaceChildren(); modalOpen = false;
  document.activeElement?.blur?.();
}
function buttonsIn(m) { return [...m.querySelectorAll('button:not([disabled])')]; }
function focusButton(b) {
  if (!b) return;
  layer.querySelectorAll('.kfocus').forEach((x) => x.classList.remove('kfocus'));
  b.classList.add('kfocus');
  b.focus({ preventScroll: true });
}

// 小窓のキー操作：←→↑↓ でボタンを選ぶ／Enter・スペースで決定／Esc で閉じる
// 島めぐりなど、小窓ごとの操作（m._key）が先に受け取る
function modalKey(e) {
  const m = layer.querySelector('.modal');
  if (!m) return;
  const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape', 'Tab'];
  if (!keys.includes(e.key)) return;
  e.preventDefault(); // ボタンの二重決定やページのスクロールを防ぐ
  if (m._key && m._key(e)) return;
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key === 'Enter' || e.key === ' ') {
    if (e.repeat || performance.now() - modalOpenedAt < 250) return; // 開いた直後の押しっぱなしを無視
    const a = document.activeElement;
    (m.contains(a) && a.tagName === 'BUTTON' ? a : (m.querySelector('[data-default]:not([disabled])') || buttonsIn(m).pop()))?.click();
    return;
  }
  // 中身が長いとき（掲示板）は ↑↓ で読み進める
  const scroller = m.querySelector('[data-scroll]');
  if (scroller && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && scroller.scrollHeight > scroller.clientHeight + 4) {
    const before = scroller.scrollTop;
    scroller.scrollBy({ top: e.key === 'ArrowDown' ? 90 : -90, behavior: 'smooth' });
    if (Math.abs(before - (e.key === 'ArrowDown' ? scroller.scrollHeight - scroller.clientHeight : 0)) > 2) return;
  }
  const btns = buttonsIn(m);
  if (!btns.length) return;
  let i = btns.indexOf(document.activeElement);
  const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey);
  i = i < 0 ? 0 : (i + (back ? -1 : 1) + btns.length) % btns.length;
  focusButton(btns[i]);
}
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) e.append(c);
  return e;
}
function message(title, body) {
  openModal((m) => m.append(h('h2', {}, title), h('p', { class: 'body' }, body),
    h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'とじる'))));
}

function unreadCount() {
  return SAMPLE_NOTICES.filter((n) => !home.readNotices.includes(n.id)).length;
}

function openBoard() {
  openModal((m) => {
    m.append(h('h2', {}, '📌 けいじばん'));
    const list = h('div', { class: 'notices', 'data-scroll': '1' });
    for (const n of SAMPLE_NOTICES) {
      const unread = !home.readNotices.includes(n.id);
      list.append(h('article', { class: 'notice' + (unread ? ' unread' : '') },
        h('div', { class: 'ndate' }, n.date.replace(/^\d+-0?(\d+)-0?(\d+)$/, '$1がつ $2にち'), unread ? h('span', { class: 'new' }, 'あたらしい') : null),
        h('h3', {}, n.title), h('p', {}, n.body)));
    }
    m.append(list, h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'とじる')));
    home.readNotices = [...new Set([...home.readNotices, ...SAMPLE_NOTICES.map((n) => n.id)])];
    saveHome();
  });
}

function interact(o) {
  const t = OBJECT_TYPES[o.type];
  if (o.type === 'board') return openBoard();
  if (o.type === 'balloon') return openIslands();
  if (o.type === 'school') return message('がっこう', 'せんせいからの おしらせは、がっこうの まえの けいじばんで よめるよ。');
  if (o.type === 'house') return message('じぶんの いえ', `${book.name}さんの いえだよ。\nいつか なかにも はいれるように なるよ。`);
  if (o.type === 'lot') return message('あきち', 'ここには たてものを たてられるよ。\nそざいを あつめて まっていてね。（じゅんびちゅう）');
  if (t.soon) return message(t.name, 'いま じゅんびちゅう だよ。もうすこし まってね。');
}

// ------------------------------------------------------------------ 島めぐり（気球）
function islandOpen(is) {
  if (!is.ready) return false;
  const closed = cls?.settings?.closedIslands || [];
  return !closed.includes(is.id);
}

function openIslands() {
  let idx = Math.max(0, ISLANDS.findIndex(islandOpen));
  openModal((m) => {
    m.className = 'modal islands';
    const sea = h('div', { class: 'sea' + (ISLANDS_BG ? ' has-bg' : '') });
    if (ISLANDS_BG) sea.style.backgroundImage = `url("${ISLANDS_BG}")`;
    const track = h('div', { class: 'track' });
    sea.append(h('div', { class: 'cloud c1' }), h('div', { class: 'cloud c2' }), track);
    const cards = ISLANDS.map((is, i) => {
      const open = islandOpen(is);
      const el = h('button', { class: 'isle' + (open ? '' : ' fog'), 'data-island': is.id, 'aria-label': is.name, onclick: () => { idx = i; render(); } },
        is.img ? h('img', { class: 'isle-img', src: is.img, alt: '' })
          : h('div', { class: 'land', style: `--c:${is.color}` }, h('span', { class: 'icon' }, is.icon)),
        h('div', { class: 'iname' }, is.name),
        open ? null : h('div', { class: 'soon' }, 'じゅんびちゅう'));
      track.append(el);
      return el;
    });
    const info = h('div', { class: 'info' });
    const go = h('button', { class: 'btn go', 'data-act': 'depart', 'data-default': '1' }, '🎈 しゅっぱつ');
    const back = h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'もどる');
    const prev = h('button', { class: 'btn arrow', 'aria-label': 'まえの しま', onclick: () => { idx = (idx + ISLANDS.length - 1) % ISLANDS.length; render(); } }, '◀');
    const next = h('button', { class: 'btn arrow', 'aria-label': 'つぎの しま', onclick: () => { idx = (idx + 1) % ISLANDS.length; render(); } }, '▶');
    go.addEventListener('click', () => depart(ISLANDS[idx]));
    m.append(h('h2', {}, '🎈 どの しまへ いく？'), sea,
      h('div', { class: 'row center' }, prev, info, next),
      h('div', { class: 'row between' }, back, go));

    function render() {
      const is = ISLANDS[idx], open = islandOpen(is);
      cards.forEach((c, i) => c.classList.toggle('sel', i === idx));
      const cw = cards[0].offsetWidth + 24;
      track.style.transform = `translateX(${sea.clientWidth / 2 - cw / 2 - idx * cw}px)`;
      const mat = wallet?.materials?.[is.subject] || 0;
      info.replaceChildren(h('div', { class: 'title' }, `${is.icon} ${is.name}`),
        h('div', { class: 'sub' }, open ? `${SUBJECT_LABELS[is.subject]}の そざい：${mat}こ` : 'まだ いけないよ（じゅんびちゅう）'));
      go.disabled = !open;
      if (!open && document.activeElement === go) focusButton(back);
    }
    // ←→ は島を選ぶ。↑↓ は下のボタン（もどる・しゅっぱつ）を選ぶ
    m._key = (e) => {
      if (e.key === 'ArrowLeft') { prev.click(); focusButton(go.disabled ? back : go); return true; }
      if (e.key === 'ArrowRight') { next.click(); focusButton(go.disabled ? back : go); return true; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { focusButton(document.activeElement === go || go.disabled ? back : go); return true; }
      return false;
    };
    // 海を左右にスワイプ（指・マウスのドラッグ）しても島を選べる
    let sx = null;
    sea.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    sea.addEventListener('pointerup', (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 40) { (dx < 0 ? next : prev).click(); }
    });
    sea.addEventListener('pointercancel', () => { sx = null; });
    requestAnimationFrame(render);
    window.addEventListener('resize', render);
  });
}

async function depart(is) {
  // 戻ってきたときに気球のりばの前に立てるようにする
  const b = home.objects.find((o) => o.type === 'balloon');
  if (b) { player.x = b.x; player.y = b.y + OBJECT_TYPES.balloon.h; player.dir = 'up'; player.fx = player.x; player.fy = player.y; }
  await saveHome();
  await store.set(`${book.id}/homeTrip`, { island: is.id, wallet: wallet || { coin: 0, materials: {} }, at: new Date().toISOString() });
  layer.querySelector('.modal')?.classList.add('lift');
  setTimeout(() => {
    if (PREVIEW) { layer.querySelector('.lift')?.classList.remove('lift'); closeModal(); message(`${is.name}へ`, 'ほんばんでは ここで しまへ いくよ。\n（アーティファクトの しさくばん なので、ここで とまります）'); return; }
    location.href = new URL(is.url, location.href).href;
  }, 900);
}

// 島から戻ったとき：もらったコインと素材を見せる
async function welcomeBack() {
  const trip = await store.get(`${book.id}/homeTrip`);
  if (!trip) return;
  await store.remove(`${book.id}/homeTrip`);
  const before = trip.wallet || { coin: 0, materials: {} }, now = wallet || { coin: 0, materials: {} };
  const dc = (now.coin || 0) - (before.coin || 0);
  const parts = [];
  for (const [s, v] of Object.entries(now.materials || {})) {
    const d = v - ((before.materials || {})[s] || 0);
    if (d > 0) parts.push(`${SUBJECT_LABELS[s] || s}の そざい +${d}`);
  }
  const is = ISLANDS.find((x) => x.id === trip.island);
  if (dc > 0 || parts.length) {
    message('おかえり！', `${is ? is.name + 'で ' : ''}がんばったね。\nコイン +${dc}${parts.length ? '\n' + parts.join('\n') : ''}`);
  }
}

// ------------------------------------------------------------------ せってい
function openSettings() {
  openModal((m) => {
    m.append(h('h2', {}, '⚙ せってい'),
      h('p', { class: 'body' }, `いまの ぼうけんの しょ：📖 ${book.name}`),
      h('div', { class: 'col' },
        h('button', { class: 'btn', 'data-act': 'hero', onclick: async () => {
          profile = { ...(profile || {}), hero: { ...(profile?.hero || {}), gender: heroGender() === 'boy' ? 'girl' : 'boy' } };
          await store.set(`${book.id}/profile`, profile); loadHero(); closeModal();
        } }, `しゅじんこうを ${heroGender() === 'boy' ? 'おんなのこ' : 'おとこのこ'}に する（かり）`),
        h('button', { class: 'btn', 'data-act': 'furigana', onclick: async () => {
          const on = !(settings?.furigana !== false);
          settings = await store.update(`${book.id}/settings`, (st) => ({ ...(st || {}), furigana: on }), { fallback: {} }) || { ...(settings || {}), furigana: on };
          closeModal(); openSettings();
        } }, `ふりがな：${settings?.furigana !== false ? 'つける' : 'ならった かんじには つけない'}（かえる）`),
        h('button', { class: 'btn', 'data-act': 'grade', onclick: () => openGrade(false) }, profile?.grade ? `がくねん：${profile.grade}ねんせい（かえる）` : 'がくねんを えらぶ'),
        h('button', { class: 'btn', 'data-act': 'switch', onclick: async () => { closeModal(); await showPicker({ mode: 'manage' }); location.reload(); } }, 'ぼうけんの しょを かえる・つくる'),
        PREVIEW ? null : h('button', { class: 'btn', 'data-act': 'backup', onclick: backup }, 'バックアップを ほぞん（せんせい・おうちの ひと よう）')),
      h('p', { class: 'small' }, `ハテナリア ホームアイランド ${HOME_VERSION}${store.isVolatile ? '　※この ブラウザでは きろくが のこりません' : ''}`),
      h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'とじる')));
  });
}
// 学年を えらぶ（進級したとき・学年が入っていない古い冒険の書のとき）
function openGrade(first) {
  openModal((m) => {
    m.append(h('h2', {}, 'なんねんせい？'),
      h('p', { class: 'body' }, first ? 'いまの がくねんを えらんでね。\nしまで でる もんだいが、がくねんに あわせて かわるよ。' : 'しんきゅう したら、あたらしい がくねんを えらんでね。'),
      h('div', { class: 'grades' }, ...[1, 2, 3, 4, 5, 6].map((g) => h('button', {
        class: 'btn' + (profile?.grade === g ? ' on' : ''), 'data-grade': String(g),
        onclick: async () => { await books.setGrade(book.id, g); profile = { ...(profile || {}), grade: g }; closeModal(); },
      }, `${g}ねんせい`))),
      first ? null : h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'とじる')));
  });
}
async function backup() {
  const json = JSON.stringify(await store.exportBook(book.id), null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `home-island-${book.id}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

// ------------------------------------------------------------------ 持ち物の表示
function renderHud() {
  document.getElementById('who').textContent = `📖 ${book.name}`;
  const mats = Object.entries(wallet?.materials || {}).filter(([, v]) => v > 0)
    .map(([k, v]) => `<span class="mat">${SUBJECT_LABELS[k] || k} ${v}</span>`).join('');
  document.getElementById('coins').innerHTML = `<span class="coin">🪙 ${wallet?.coin || 0}</span>${mats}`;
}

// ------------------------------------------------------------------ 操作
function bindControls() {
  const keyDir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  const down = new Set();
  window.addEventListener('keydown', (e) => {
    if (document.querySelector('.gi-picker')) return; // 冒険の書の画面が自分で受け取る
    if (modalOpen) { heldDir = null; down.clear(); modalKey(e); return; }
    if (keyDir[e.key]) {
      e.preventDefault(); down.add(e.key); heldDir = keyDir[e.key];
      if (!player.moving && !e.repeat) { pathQueue = []; pendingInteract = null; tryStep(heldDir); } // 短く押しても1マス進む
    }
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); doCheck(); }
  });
  window.addEventListener('keyup', (e) => {
    down.delete(e.key);
    const last = [...down].pop();
    heldDir = last ? keyDir[last] : null;
  });
  // 十字ボタン（長押しで歩き続ける）
  document.querySelectorAll('[data-dir]').forEach((b) => {
    const start = (e) => {
      e.preventDefault(); heldDir = b.dataset.dir; b.setPointerCapture?.(e.pointerId);
      if (!player.moving) { pathQueue = []; pendingInteract = null; tryStep(heldDir); } // 短くタップしても1マス進む
    };
    const stop = () => { if (heldDir === b.dataset.dir) heldDir = null; };
    b.addEventListener('pointerdown', start);
    b.addEventListener('pointerup', stop); b.addEventListener('pointercancel', stop); b.addEventListener('lostpointercapture', stop);
  });
  document.getElementById('check').addEventListener('click', doCheck);
  document.getElementById('btn-balloon').addEventListener('click', openIslands);
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  // 地面や建物をタップ
  canvas.addEventListener('pointerdown', (e) => {
    if (modalOpen) return;
    const [cx, cy] = camera();
    const tx = Math.floor((e.clientX + cx) / T), ty = Math.floor((e.clientY + cy) / T);
    const o = objectAt(tx, ty);
    if (o && OBJECT_TYPES[o.type].deco) return; // 飾りをタップしても動かない
    if (o) {
      const f = frontOf(o);
      if (f) { pathQueue = f.p; pendingInteract = o; }
      return;
    }
    if (walkable(tx, ty)) { pathQueue = findPath(player.x, player.y, tx, ty) || []; pendingInteract = null; }
  });
  layer.addEventListener('pointerdown', (e) => { if (e.target === layer && !layer.querySelector('.lift')) closeModal(); });
}
function doCheck() {
  if (modalOpen || player.moving) return;
  const o = facingObject();
  if (o) interact(o);
}

function loadHero() {
  const src = HERO_SHEETS[heroGender()] || HERO_SHEETS.boy;
  const im = new Image(); im.onload = () => { heroImg = im; }; im.src = src;
}
let profile = null;
let settings = null; // 冒険の書の共通設定（ふりがな・読み上げ）
function heroGender() { return profile?.hero?.gender === 'girl' ? 'girl' : 'boy'; }

// ------------------------------------------------------------------ タイトル画面
// ブラウザを開いて最初の1回だけ出す（島から戻ったときや、同じタブで開き直したときは出さない）
const LOGO_SRC = 'assets/home/logo.webp';
function titleShownThisSession() { try { return sessionStorage.getItem('hatenaria-title') === '1'; } catch { return false; } }
function markTitleShown() { try { sessionStorage.setItem('hatenaria-title', '1'); } catch { /* 使えなくても動く */ } }
function showTitle(curBook) {
  return new Promise((resolve) => {
    const wrap = h('div', { class: 'tscreen', role: 'dialog', 'aria-label': 'ハテナリア' });
    const logo = h('img', { class: 'logo', src: LOGO_SRC, alt: 'ハテナリア', draggable: 'false' });
    const who = h('div', { class: 'who' }, curBook ? `📖 ${curBook.name} の ぼうけんの しょ` : '');
    const go = h('button', { class: 'go' }, 'はじめる');
    const sw = h('button', { class: 'sw' }, curBook ? 'ぼうけんの しょを かえる・つくる' : 'ぼうけんの しょを つくる');
    const btns = curBook ? [go, sw] : [go];
    wrap.append(logo, who, h('div', { class: 'tbtns' }, ...btns));
    document.body.append(wrap);
    let idx = 0, keyMode = false, done = false;
    const paint = () => btns.forEach((b, i) => b.classList.toggle('kfocus', keyMode && i === idx));
    const finish = (choice) => {
      if (done) return; done = true;
      document.removeEventListener('keydown', onKey, true);
      markTitleShown(); wrap.remove(); resolve(choice);
    };
    const onKey = (e) => {
      const k = e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
        e.preventDefault(); e.stopPropagation();
        if (!keyMode) keyMode = true; else idx = (idx + (k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : 1) + btns.length) % btns.length;
        paint(); btns[idx].focus({ preventScroll: true }); return;
      }
      if ((k === 'Enter' || k === ' ') && !e.repeat) {
        e.preventDefault(); e.stopPropagation();
        finish(btns[idx] === go ? 'start' : 'switch');
      }
    };
    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('pointerdown', () => { keyMode = false; paint(); }, true);
    go.addEventListener('click', () => finish('start'));
    sw.addEventListener('click', () => finish('switch'));
    go.focus({ preventScroll: true });
    // 最初から Enter だけで はじめられるよう、「はじめる」を選んだ状態にしておく（2-8）
    keyMode = true; paint();
  });
}

// ------------------------------------------------------------------ 起動
async function start() {
  store.requestPersist();
  book = await books.getCurrent();
  const returning = book && await store.get(`${book.id}/homeTrip`);
  if (!returning && !titleShownThisSession()) {
    const choice = await showTitle(book);
    if (choice === 'switch') book = await showPicker({ mode: 'manage' });
  } else markTitleShown();
  if (!book) book = await showPicker({ mode: 'manage' });
  home = await store.get(`${book.id}/home`);
  if (!home) { home = DEFAULT_HOME(); await store.set(`${book.id}/home`, home); }
  else if (migrateHome(home)) await store.set(`${book.id}/home`, home);
  refreshLand();
  wallet = await store.get(`${book.id}/wallet`, { coin: 0, materials: {} });
  profile = await store.get(`${book.id}/profile`, {});
  settings = await store.get(`${book.id}/settings`, {});
  cls = await store.get(`${book.id}/class`);
  Object.assign(player, home.player, { fx: home.player.x, fy: home.player.y });
  loadHero();
  for (const [type, t] of Object.entries(OBJECT_TYPES)) {
    if (!t.sprite) continue;
    const im = new Image(); im.onload = () => { sprites[type] = im; }; im.src = t.sprite.src;
    if (t.air) { const a = new Image(); a.onload = () => { sprites.balloonAir = a; }; a.src = t.air.src; }
  }
  for (const [name, t] of Object.entries(TEXTURES)) {
    const im = new Image(); im.onload = () => { tex[name] = { img: im }; }; im.src = t.src;
  }
  renderHud();
  resize();
  window.addEventListener('resize', resize);
  bindControls();
  document.body.classList.add('ready');
  requestAnimationFrame(loop);
  await welcomeBack();
  if (!profile?.grade && !modalOpen) openGrade(true); // 学年がない古い冒険の書
  // テスト用
  window.__home = { player, get home() { return home; }, get T() { return T; }, camera, version: HOME_VERSION };
}
start();
