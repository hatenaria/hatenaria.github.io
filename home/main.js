// ホームアイランド v0.2
// 島を歩く・建物を調べる・掲示板・気球で島めぐり・島から戻ったときの「おかえり」

import * as store from '../common/store.js?v=0.17.3';
import * as books from '../common/books.js?v=0.17.3';
import { createHero, HAIRS, HAIR_COLORS, OUTFITS, ACCESSORIES, DEFAULTS, resolveHero } from '../common/hero/hero.js?v=0.17.3';
import * as classroom from '../common/classroom.js?v=0.17.3';
import { showPicker } from '../common/book-picker.js?v=0.17.3';
import { OBJECT_TYPES, DEFAULT_HOME, migrateHome, PATH_TILES, RESERVED, ISLANDS, SAMPLE_NOTICES, SUBJECT_LABELS, TEXTURES, ISLANDS_BG, MATERIALS, BUILDABLES, EXCHANGE_RATE, ROOM, ROOM_WALLS, FURNITURE, DEFAULT_ROOM, WARDROBE_KINDS, WARDROBE_COST, WARDROBE_PRICES, WARDROBE_FREE, WARDROBE_RELEASE, WARDROBE_SEASON, WARDROBE_REWARD, GACHA } from './data.js?v=0.17.3';

export const HOME_VERSION = '0.17.3';
const PREVIEW = !!window.GI_PREVIEW; // アーティファクトでの試作表示（島へは移動しない）

// 主人公の画像（仕様書2-4の規格：1コマ 384×512、足元 x=192, y=488。縮小した画像でも同じ比率で扱う）
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
let zoomed = false;
let T = 96;               // 1マスの大きさ（画面上の px）
const player = { x: 8, y: 7, dir: 'down', fx: 8, fy: 7, moving: false, from: null, t0: 0, step: 0 };
let heldDir = null;
let pathQueue = [];
let pendingInteract = null;
let modalOpen = false;
let heroParts = null; // 共通部品 /common/hero/ の主人公（体・髪・服を重ねる）

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
  const out = smoothShapes(landSet, landBox, .38, COAST_LEVELS);
  // 道も同じ方法で、角の丸い なめらかな形にする（少し内側の線を使って、道のふちを細くする）
  const pts = PATH_TILES.map(([x, y]) => `${x},${y}`);
  out.path = smoothShapes(new Set(pts), landBox, .22, { path: .56 }).path;
  return out;
}
// マスの集まり（set）をぼかして、指定した値の輪郭線を Path2D にする
function smoothShapes(set, box, sigma, levels) {
  const SS = 8, M = 2;                       // 1マスを8つに分けて計算。まわり2マスまで
  const ox = box.x0 - M, oy = box.y0 - M;
  const nx = (box.x1 - box.x0 + 1 + M * 2) * SS + 1, ny = (box.y1 - box.y0 + 1 + M * 2) * SS + 1;
  let f = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const tx = Math.floor(ox + (i + .5) / SS), ty = Math.floor(oy + (j + .5) / SS);
    f[j * nx + i] = set.has(`${tx},${ty}`) ? 1 : 0;
  }
  // ガウスぼかし（横 → 縦）
  const sig = sigma * SS, R = Math.ceil(sig * 3), k = [];
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
  for (const [name, th] of Object.entries(levels)) out[name] = contourPath(f, nx, ny, th, ox, oy, SS);
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
  if (scene === 'room') return roomWalkable(x, y);
  if (isWater(x, y)) return false;
  if (isGate(x, y)) return false;
  const o = objectAt(x, y);
  return !(o && OBJECT_TYPES[o.type].solid);
}
const pathSet = new Set(PATH_TILES.map(([x, y]) => `${x},${y}`));

// ------------------------------------------------------------------ 保存
async function saveHome() {
  if (scene !== 'room') home.player = { x: player.x, y: player.y, dir: player.dir }; // へやの中では 島の 場所を そのままに
  await store.set(`${book.id}/home`, home);
}
let saveTimer = null;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveHome, 600); }

// ------------------------------------------------------------------ 移動
function tryStep(dir) {
  player.dir = dir;
  const [dx, dy] = DIRS[dir];
  const nx = player.x + dx, ny = player.y + dy;
  if (scene === 'room' && dir === 'down' && isDoor(player.x, player.y) && ny >= ROOM.rows) { exitRoom(); return false; }
  if (scene === 'island' && dir === 'up' && settings?.autoDoor) { // とびらに ふれたら はいる（せってい）
    const o = objectAt(nx, ny);
    if (o && o.type === 'house' && ny === o.y + OBJECT_TYPES.house.h - 1) { enterRoom(); return false; }
  }
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
  if (scene === 'room') return roomFacing();
  const [dx, dy] = DIRS[player.dir];
  if (isGate(player.x + dx, player.y + dy)) return GATE;
  const here = objectAt(player.x, player.y);
  const o = objectAt(player.x + dx, player.y + dy) || (here && !OBJECT_TYPES[here.type].solid ? here : null);
  return o && !OBJECT_TYPES[o.type].deco && !OBJECT_TYPES[o.type].ground ? o : null;
}

function update(now) {
  if (player.moving) {
    const k = Math.min(1, (now - player.t0) / STEP_MS);
    player.fx = player.from[0] + (player.x - player.from[0]) * k;
    player.fy = player.from[1] + (player.y - player.from[1]) * k;
    if (k >= 1) { player.moving = false; player.fx = player.x; player.fy = player.y; saveSoon(); }
  }
  if (!player.moving && !modalOpen && !editMode && !roomEdit) {
    if (heldDir) { pathQueue = []; pendingInteract = null; tryStep(heldDir); }
    else if (pathQueue.length) {
      const d = pathQueue.shift();
      if (!tryStep(d)) pathQueue = [];
    } else if (pendingInteract) {
      const o = pendingInteract; pendingInteract = null;
      if (scene === 'room') { if (roomFaceDir) player.dir = roomFaceDir; roomInteract(o); }
      else if (o.gate) { player.dir = 'up'; interact(o); }
      else { player.dir = (player.y >= o.y + OBJECT_TYPES[o.type].h) ? 'up' : player.dir; interact(o); }
    }
  }
}

// ------------------------------------------------------------------ 描画
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  T = Math.max(56, Math.min(96, Math.floor(Math.min(w / 10, h / 7.5))));
  if (zoomed && landBox && scene !== 'room') { // 🔍 しま ぜんたい（v0.17.3）
    T = Math.max(16, Math.min(T, Math.floor(Math.min(w / (landBox.x1 - landBox.x0 + 3), (h - 60) / (landBox.y1 - landBox.y0 + 3)))));
  }
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function camera() {
  const w = window.innerWidth, h = window.innerHeight;
  // 島（陸）のまわり1マスまで（しまづくりの とちを ひろげる ときは4マスまで）を、画面に映す範囲にする
  const M = editMode?.kind === 'expand' ? 4 : 1;
  const left = (landBox.x0 - M) * T, top = (landBox.y0 - M) * T;
  const mw = (landBox.x1 - landBox.x0 + 1 + M * 2) * T, mh = (landBox.y1 - landBox.y0 + 1 + M * 2) * T;
  const f = editFocus() || [player.fx + .5, player.fy + .5];
  let cx = f[0] * T - w / 2;
  let cy = f[1] * T - h / 2;
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
  if (style === 'grass') { if (!texFill('grass', cx, cy)) ctx.fillStyle = '#a9d98f'; }
  else if (style === 'path') { if (!texFill('path', cx, cy)) ctx.fillStyle = '#ecdcb4'; }
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
  // 道（角の丸い なめらかな形）
  fillCoast(coast.path, cx, cy, 'path');
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
  if (o.type === 'school' && hwOpenCount() > 0) drawUnreadBadge(px + W / 2 + T * .9, py - T * .1, now);
  if (o.type === 'todo' && missionReady()) drawUnreadBadge(px + W / 2 + T * .5, py - T * .1, now);
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

function drawPlaza(o, t, px, py, now) {
  // いまは 石だたみの まるい ひろば（絵ができたら さしかえる）
  const W = t.w * T, H = t.h * T, cx = px + W / 2, cy = py + H / 2;
  ctx.fillStyle = 'rgba(70,60,40,.12)'; ctx.beginPath(); ctx.ellipse(cx, cy + T * .06, W * .49, H * .44, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#efe3cc'; ctx.beginPath(); ctx.ellipse(cx, cy, W * .48, H * .42, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#d8c6a4'; ctx.lineWidth = T * .07; ctx.stroke();
  ctx.fillStyle = '#e4d3b2';
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * W * .32, cy + Math.sin(a) * H * .28, T * .12, T * .08, a, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#f7c8d6'; ctx.beginPath(); ctx.ellipse(cx, cy, T * .32, T * .24, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff6d8'; ctx.font = `${Math.round(T * .3)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', cx, cy + 1);
  if (!gateTile()) drawLabel('イベントひろば', cx, py + H * .12); // もんが たつ あいだは もんの 名前を 出す
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
  if (heroParts) { heroParts.draw(ctx, px, py, player.dir, frame, T / 192); return; }
  // 予備の主人公（共通部品 /common/hero/ が読めないときだけ）
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
  if (scene === 'room') return drawRoom(now);
  const [cx, cy] = camera();
  drawGround(now, cx, cy);
  drawEditUnder(now, cx, cy);
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
    else if (o.type === 'lawn') { if (editMode?.kind === 'lawn') { ctx.setLineDash([10, 8]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)'; roundRect(px + 4, py + 4, t.w * T - 8, t.h * T - 8, T * .3); ctx.stroke(); ctx.setLineDash([]); } }
    else if (o.type === 'plaza') drawPlaza(o, t, px, py, now);
    else drawBuilding(o, t, px, py, now);
  }
  drawGate(now);
  drawEditOver(now, cx, cy);
  drawBuildFx(now, cx, cy);
  // 名札（主人公の体に重なるものはうすく）
  const hx = (player.fx + .5) * T - cx, hy = (player.fy + .92) * T - cy;
  const q = labelQueue; labelQueue = null;
  for (const [text, x, y, color] of q) {
    const over = Math.abs(x - hx) < T * 1.1 && y > hy - T * 1.45 && y < hy + T * .1;
    drawLabelNow(text, x, y, color, over ? .25 : 1);
  }
  // 調べられる建物の名前
  const f = !editMode && !player.moving && !modalOpen && facingObject();
  const hint = document.getElementById('hint');
  if (f) { hint.textContent = `${f.gate ? 'イベントの もん' : OBJECT_TYPES[f.type].name}を しらべる`; hint.classList.add('show'); }
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
function buttonsIn(m) { return [...m.querySelectorAll('button:not([disabled]), a.btn')]; }
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
  // 文字を入れているときは、矢印・スペース・Enter を 入力欄に まかせる（Esc だけ 小窓を とじる）
  if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.key !== 'Escape') return;
  const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape', 'Tab'];
  if (!keys.includes(e.key)) return;
  e.preventDefault(); // ボタンの二重決定やページのスクロールを防ぐ
  if (m._key && m._key(e)) return;
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key === 'Enter' || e.key === ' ') {
    if (e.repeat || performance.now() - modalOpenedAt < 250) return; // 開いた直後の押しっぱなしを無視
    const a = document.activeElement;
    (m.contains(a) && (a.tagName === 'BUTTON' || a.matches('a.btn')) ? a : (m.querySelector('[data-default]:not([disabled])') || buttonsIn(m).pop()))?.click();
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
    if (v == null || v === false) continue; // null・false の 属性は つけない
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) e.append(c);
  return e;
}
function message(title, body) {
  openModal((m) => m.append(h('h2', {}, title), h('p', { class: 'body' }, body),
    h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'とじる'))));
}

// 先生のお知らせ（クラスに入っていれば先生のシートから。なければ はじめの お知らせ）
function notices() { return cls?.notices?.length ? cls.notices : SAMPLE_NOTICES; }
function unreadCount() {
  return notices().filter((n) => !home.readNotices.includes(n.id)).length;
}

function openBoard() {
  openModal((m) => {
    m.append(h('h2', {}, '📌 けいじばん'));
    const list = h('div', { class: 'notices', 'data-scroll': '1' });
    if (cls?.className) m.append(h('p', { class: 'body small' }, `${cls.className}の おしらせ`));
    for (const n of notices()) {
      const unread = !home.readNotices.includes(n.id);
      list.append(h('article', { class: 'notice' + (unread ? ' unread' : '') },
        h('div', { class: 'ndate' }, n.date.replace(/^\d+-0?(\d+)-0?(\d+)$/, '$1がつ $2にち'), unread ? h('span', { class: 'new' }, 'あたらしい') : null),
        h('h3', {}, n.title), h('p', {}, ...linkify(n.body))));
    }
    const ev = activeEvent() || unclaimedEvent();
    if (ev) m.append(eventCard(ev));
    if (ev && ev.done >= ev.goal && !claimedEvents.includes(ev.id)) m.append(h('div', { class: 'row' }, h('button', { class: 'btn go', 'data-act': 'evclaim', onclick: () => { closeModal(); claimEvent(ev); } }, '🎁 ごほうびを うけとる')));
    if (cls?.timetable && !cls.invalid) m.append(h('div', { class: 'row' }, h('button', { class: 'btn go', 'data-act': 'timetable', onclick: openTimetable }, '📅 じかんわりを みる')));
    m.append(list, h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'とじる')));
    home.readNotices = [...new Set([...home.readNotices, ...notices().map((n) => n.id)])].slice(-200);
    saveHome();
  });
}

/** おしらせの 文の中の https:// を、押せる リンクにする（先生が 共有リンクを 書いたとき） */
function linkify(text) {
  const out = [];
  String(text || '').split(/(https:\/\/[^\s　]+)/).forEach((part, i) => {
    if (i % 2) out.push(h('a', { href: part, target: '_blank', rel: 'noopener noreferrer' }, 'ひらく 🔗'));
    else if (part) out.push(part);
  });
  return out;
}

/** じかんわり：画像は そのまま見せる。PDF は「ひらく」で べつの画面に ひらく */
function openTimetable() {
  openModal(async (m) => {
    m.className = 'modal build tt';
    const box = h('div', { class: 'ttbox', 'data-scroll': '1' }, h('p', { class: 'body' }, 'よみこんで いるよ…'));
    const close = h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'とじる');
    m.append(h('h2', {}, '📅 じかんわり'), box, h('div', { class: 'row end' }, close));
    try {
      const tt = await classroom.loadTimetable(book.id);
      if (!tt) throw new Error('まだ じかんわりが ないよ。');
      const bin = atob(tt.data), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: tt.mime }));
      const when = new Date(tt.updated);
      const stamp = isNaN(when) ? '' : `${when.getMonth() + 1}がつ ${when.getDate()}にちに せんせいが いれたよ`;
      box.replaceChildren(h('p', { class: 'body small' }, stamp));
      if (tt.mime.startsWith('image/')) box.append(h('img', { class: 'ttimg', src: url, alt: 'じかんわり' }));
      else {
        const a = h('a', { class: 'btn go', href: url, target: '_blank', rel: 'noopener', 'data-act': 'open-pdf' }, '📄 じかんわりを ひらく');
        box.append(a, h('p', { class: 'body small' }, 'べつの がめんで ひらくよ。みおわったら もどってきてね。'));
        requestAnimationFrame(() => focusButton(a));
      }
    } catch (e) {
      box.replaceChildren(h('p', { class: 'body' }, (e && e.message) || 'じかんわりを よみこめなかったよ。'));
    }
  });
}

function interact(o) {
  const t = OBJECT_TYPES[o.type];
  if (o.type === 'board') return openBoard();
  if (o.type === 'todo') return openTodo();
  if (o.type === 'balloon') return openIslands();
  if (o.type === 'school') return openSchool();
  if (o.gate) return openEvent();
  if (o.type === 'house') return enterRoom();
  if (o.type === 'kisekae') return openKisekae();
  if (o.type === 'lot') return openBuild(o);
  if (o.type === 'exchange') return openExchange();
  if (o.type === 'gacha') return openGacha();
  if (t.built) return message(t.name, BUILDABLES.find((b) => b.type === o.type)?.desc || '');
  if (t.soon) return message(t.name, 'いま じゅんびちゅう だよ。もうすこし まってね。');
}


// ------------------------------------------------------------------ 建物を建てる（空き地）・こうかんじょ
const costParts = (cost) => Object.entries(cost).map(([k, n]) => ({ k, n, have: k === 'coin' ? (wallet?.coin || 0) : (wallet?.materials?.[k] || 0) }));
const costLabel = (k) => (k === 'coin' ? '🪙' : MATERIALS[k]?.icon || k);
// 素材の小さな絵（絵がなければ絵文字）
function matIcon(k) {
  const m = MATERIALS[k];
  if (!m?.img) return document.createTextNode(costLabel(k));
  return h('img', { class: 'micon', src: m.img, alt: m.name });
}
const matIconHtml = (k) => (MATERIALS[k]?.img ? `<img class="micon" src="${MATERIALS[k].img}" alt="${MATERIALS[k].name}">` : (MATERIALS[k]?.icon || k));
const affordable = (cost) => costParts(cost).every((c) => c.have >= c.n);

function openBuild(lot) {
  openModal((m) => {
    m.className = 'modal build';
    m.append(h('h2', {}, '🔨 なにを たてる？'),
      h('p', { class: 'body small' }, 'コインと しまで あつめた そざいで たてられるよ。'));
    const list = h('div', { class: 'blist', 'data-scroll': '1' });
    for (const b of BUILDABLES) {
      const t = OBJECT_TYPES[b.type];
      const ok = !t.artSoon && affordable(b.cost);
      const chips = h('div', { class: 'chips' }, ...costParts(b.cost).map((c) =>
        h('span', { class: 'chip' + (c.have >= c.n ? '' : ' short'), title: c.k === 'coin' ? 'コイン' : MATERIALS[c.k]?.name },
          c.k === 'coin' ? '🪙' : matIcon(c.k), ` ${c.n}`)));
      const pic = t.sprite ? h('img', { src: t.sprite.src, alt: '' }) : h('div', { class: 'nopic' }, '？');
      list.append(h('div', { class: 'brow' + (ok ? '' : ' no') },
        pic,
        h('div', { class: 'binfo' }, h('div', { class: 'bname' }, t.name), chips,
          t.artSoon ? h('div', { class: 'bnote' }, 'じゅんびちゅう') : (!ok ? h('div', { class: 'bnote' }, 'まだ たりないよ') : null)),
        h('button', { class: 'btn go', 'data-build': b.type, ...(ok ? {} : { disabled: '' }), onclick: () => confirmBuild(lot, b) }, 'たてる')));
    }
    m.append(list, h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', 'data-default': '', onclick: closeModal }, 'とじる')));
  });
}

function confirmBuild(lot, b) {
  const t = OBJECT_TYPES[b.type];
  const pay = costParts(b.cost).map((c) => `${costLabel(c.k)} ${c.n}`).join('　');
  openModal((m) => {
    m.append(h('h2', {}, `${t.name}を たてる？`),
      h('p', { class: 'body' }, `${pay}\nを つかうよ。`),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', 'data-act': 'back', onclick: () => openBuild(lot) }, 'やめる'),
        h('button', { class: 'btn go', 'data-act': 'yes', 'data-default': '', onclick: () => doBuild(lot, b) }, 'たてる！')));
  });
}

async function doBuild(lot, b) {
  try {
    // コインと素材をへらす（足りなければ取り消し。ほかの画面と同時でも数がずれない）
    wallet = await store.update(`${book.id}/wallet`, (w) => {
      const x = structuredClone(w || { coin: 0, materials: {} });
      x.materials = x.materials || {};
      for (const [k, n] of Object.entries(b.cost)) {
        const have = k === 'coin' ? (x.coin || 0) : (x.materials[k] || 0);
        if (have < n) throw new Error('たりない');
        if (k === 'coin') x.coin = have - n; else x.materials[k] = have - n;
      }
      return x;
    }, { fallback: { coin: 0, materials: {} } });
  } catch {
    return message('たりないよ', 'コインか そざいが たりないみたい。しまで あつめてこよう。');
  }
  lot.type = b.type;
  lot.builtAt = new Date().toISOString();
  // 主人公が建物の中に入ってしまわないよう、空き地の手前に出す
  if (player.x >= lot.x && player.x < lot.x + 2 && player.y >= lot.y && player.y < lot.y + 2) {
    const spots = [[player.x, lot.y + 2], [lot.x - 1, player.y], [lot.x + 2, player.y], [player.x, lot.y - 1]];
    const sp = spots.find(([x, y]) => walkable(x, y)) || spots[0];
    Object.assign(player, { x: sp[0], y: sp[1], fx: sp[0], fy: sp[1], dir: 'up' });
  }
  await saveHome();
  renderHud();
  buildFx = { x: lot.x + 1, y: lot.y + 1, t0: performance.now() };
  closeModal();
  setTimeout(() => message(`${OBJECT_TYPES[b.type].name}が できた！`, b.desc), 900);
}

// たてた ときの きらきら
let buildFx = null;
function drawBuildFx(now, cx, cy) {
  if (!buildFx) return;
  const k = (now - buildFx.t0) / 1200;
  if (k > 1) { buildFx = null; return; }
  const bx = buildFx.x * T - cx, by = buildFx.y * T - cy - T * .5;
  ctx.save();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + k * 2, r = T * (.3 + k * 1.2);
    const x = bx + Math.cos(a) * r, y = by + Math.sin(a) * r * .7, s = T * .12 * (1 - k * .6);
    ctx.globalAlpha = 1 - k; ctx.fillStyle = i % 2 ? '#ffe28a' : '#fff6c9';
    ctx.beginPath();
    for (let j = 0; j < 8; j++) { const rr = j % 2 ? s * .4 : s, aa = j / 8 * Math.PI * 2; ctx.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// こうかんじょ：ほかの素材3こ → ほしい素材1こ
// うる（v0.17.3）：そざいは 1こ 🪙2、服・アクセサリーは 店の ねだんの はんぶん（もっていて きていない もの。景品・ただの ものは うれない）
const SELL_MAT = 2;
const coinOf = (c) => (typeof c === 'number' ? c : (c && c.coin) || 0);
function sellableParts() {
  const worn = resolveHero(profile?.hero || {}), out = [];
  for (const key of wardrobe.owned || []) {
    const [kind, id] = key.split(':'); const P = PARTS[kind]?.[id];
    if (!P || isFreePart(kind, id) || WARDROBE_REWARD[key] || worn[kind] === id) continue;
    const v = Math.floor(coinOf(partCost(kind, id)) / 2); if (v > 0) out.push({ key, kind, id, name: P.name, coin: v });
  }
  return out;
}
function openSell() {
  const mats = Object.keys(MATERIALS).filter((k) => !MATERIALS[k].rare);
  const have = (k) => wallet?.materials?.[k] || 0;
  openModal((m) => {
    m.className = 'modal build';
    m.append(h('h2', {}, '⚖️ こうかんじょ'),
      h('div', { class: 'row', style: 'justify-content:center;gap:8px' }, h('button', { class: 'btn', onclick: () => openExchange() }, '🔁 こうかん'), h('button', { class: 'btn on', 'data-act': 'selltab' }, '🪙 うる')),
      h('p', { class: 'body small' }, `あまった そざいは 1こ 🪙${SELL_MAT}、つかわない 服や アクセサリーは おみせの ねだんの はんぶんで うれるよ。`),
      h('div', { class: 'xlabel' }, 'そざい（1こ うる）'),
      h('div', { class: 'xmats' }, ...mats.map((k) => h('button', { class: 'btn xmat', 'data-sell': k, ...(have(k) < 1 ? { disabled: '' } : {}), onclick: () => sellMat(k) }, matIcon(k), ` ${have(k)} → 🪙${SELL_MAT}`))));
    const ps = sellableParts();
    m.append(h('div', { class: 'xlabel' }, '服・アクセサリー'),
      ps.length ? h('div', { class: 'xmats', 'data-scroll': '1', style: 'max-height:24vh;overflow:auto' }, ...ps.map((x) => h('button', { class: 'btn xmat', 'data-sellpart': x.key, onclick: () => sellPart(x) }, `${x.name} → 🪙${x.coin}`)))
        : h('p', { class: 'body small' }, 'うれる 服は ないよ（きている 服・はじめの 服・ごほうびの 服は うれないよ）。'),
      h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', 'data-default': '', onclick: closeModal }, 'とじる')));
  });
}
async function sellMat(k) {
  try {
    wallet = await store.update(`${book.id}/wallet`, (w) => {
      const x = structuredClone(w || { coin: 0, materials: {} }); x.materials = x.materials || {};
      if ((x.materials[k] || 0) < 1) throw new Error('none');
      x.materials[k] -= 1; x.coin = (x.coin || 0) + SELL_MAT; return x;
    }, { fallback: { coin: 0, materials: {} } });
  } catch { return; }
  renderHud(); openSell();
}
function sellPart(x) {
  openModal((m) => {
    m.className = 'modal';
    m.append(h('h2', {}, '🪙 うる？'), h('p', { class: 'body' }, `「${x.name}」を 🪙${x.coin}で うるよ。うったら もう きられないよ。`),
      h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-default': '', onclick: openSell }, 'やめる'),
        h('button', { class: 'btn go', 'data-act': 'sellok', onclick: async () => {
          wardrobe = await store.update(`${book.id}/wardrobe`, (w) => ({ ...(w || {}), owned: (w?.owned || []).filter((k) => k !== x.key) }), { fallback: { owned: [] } });
          wallet = await store.update(`${book.id}/wallet`, (w) => ({ ...(w || { materials: {} }), coin: ((w && w.coin) || 0) + x.coin }), { fallback: { coin: 0, materials: {} } });
          renderHud(); openSell();
        } }, 'うる')));
  });
}
function openExchange(give = null, get = null) {
  const mats = Object.keys(MATERIALS).filter((k) => !MATERIALS[k].rare); // めずらしい 素材は ふつうの こうかんに つかわない
  const have = (k) => wallet?.materials?.[k] || 0;
  openModal((m) => {
    m.className = 'modal build';
    m.append(h('h2', {}, '⚖️ こうかんじょ'),
      h('div', { class: 'row', style: 'justify-content:center;gap:8px' }, h('button', { class: 'btn on' }, '🔁 こうかん'), h('button', { class: 'btn', 'data-act': 'selltab', onclick: openSell }, '🪙 うる')),
      h('p', { class: 'body small' }, `そざい ${EXCHANGE_RATE}こを、べつの そざい 1こと こうかんできるよ。`));
    const row = (label, pick, sel, isGive) => h('div', { class: 'xrow' }, h('div', { class: 'xlabel' }, label),
      h('div', { class: 'xmats' }, ...mats.map((k) => {
        const dis = isGive ? have(k) < EXCHANGE_RATE : k === give;
        return h('button', { class: 'btn xmat' + (sel === k ? ' on' : ''), 'data-mat': k, title: MATERIALS[k].name, ...(dis ? { disabled: '' } : {}),
          onclick: () => pick(k) }, matIcon(k), ` ${have(k)}`);
      })));
    m.append(row('わたす（3こ）', (k) => openExchange(k, get === k ? null : get), give, true),
      row('もらう（1こ）', (k) => openExchange(give, k), get, false));
    const ready = give && get && give !== get && have(give) >= EXCHANGE_RATE;
    m.append(h('p', { class: 'body small xsum' }, ready ? `${MATERIALS[give].name} 3こ → ${MATERIALS[get].name} 1こ` : 'わたす そざいと もらう そざいを えらんでね。'),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'とじる'),
        h('button', { class: 'btn go', 'data-act': 'trade', ...(ready ? { 'data-default': '' } : { disabled: '' }), onclick: () => doTrade(give, get) }, 'こうかんする')));
  });
}

async function doTrade(give, get) {
  try {
    wallet = await store.update(`${book.id}/wallet`, (w) => {
      const x = structuredClone(w || { coin: 0, materials: {} });
      x.materials = x.materials || {};
      if ((x.materials[give] || 0) < EXCHANGE_RATE) throw new Error('たりない');
      x.materials[give] -= EXCHANGE_RATE;
      x.materials[get] = (x.materials[get] || 0) + 1;
      return x;
    }, { fallback: { coin: 0, materials: {} } });
  } catch { return message('たりないよ', 'そざいが たりないみたい。'); }
  renderHud();
  openExchange(give, get);
}


// ------------------------------------------------------------------ しまづくり（とちを ひろげる・もようがえ）
let editMode = null;
const CHUNK = 3;                       // 3×3マスずつ ひろげる
const MAX_EXPANSIONS = 12;
const EXPAND_PAIRS = [['math', 'kokugo'], ['rika', 'shakai'], ['eigo', 'math'], ['kokugo', 'rika'], ['shakai', 'eigo']];
const WORLD = { x0: -9, y0: -9, x1: 26, y1: 22 };  // ここより外には ひろげない
const FIXED = new Set(['school', 'board', 'todo', 'plaza', 'house', 'balloon', 'exchange', 'kisekae', 'gacha']); // 大事な施設は うごかせない
const movable = (o) => !FIXED.has(o.type);

function expandCost() {
  const n = home.expansions || 0;
  const [a, b] = EXPAND_PAIRS[n % EXPAND_PAIRS.length];
  return { coin: 40 + 20 * n, [a]: 3, [b]: 3 };
}
function expandCandidates() {
  if ((home.expansions || 0) >= MAX_EXPANSIONS) return [];
  const out = [];
  const cx0 = Math.floor((landBox.x0 - CHUNK) / CHUNK), cx1 = Math.floor((landBox.x1 + CHUNK) / CHUNK);
  const cy0 = Math.floor((landBox.y0 - CHUNK) / CHUNK), cy1 = Math.floor((landBox.y1 + CHUNK) / CHUNK);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const x = cx * CHUNK, y = cy * CHUNK;
    if (x < WORLD.x0 || y < WORLD.y0 || x + CHUNK - 1 > WORLD.x1 || y + CHUNK - 1 > WORLD.y1) continue;
    let water = 0, touch = false;
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const tx = x + i, ty = y + j;
      if (isWater(tx, ty)) {
        water++;
        if (!isWater(tx - 1, ty) || !isWater(tx + 1, ty) || !isWater(tx, ty - 1) || !isWater(tx, ty + 1)) touch = true;
      }
    }
    if (water >= 6 && touch) out.push({ x, y }); // ほとんどが うみの ところだけ
  }
  return out;
}

function openIslandMenu() {
  if (modalOpen) return;
  if (!classroom.buildAllowed(cls)) return message('🛠 しまづくり', cls?.settings?.buildRule === 'off'
    ? 'いまは しまづくりが できないよ。（せんせいの せってい）' : 'がっこうの じかんは しまづくりが できないよ。\nいえに かえってから やってみてね。（せんせいの せってい）');
  openModal((m) => {
    m.append(h('h2', {}, '🛠 しまづくり'),
      h('p', { class: 'body small' }, 'しまを ひろげたり、たてものや かざりを うごかしたり、あきちを しばふに したり できるよ。'),
      h('div', { class: 'menu2' },
        h('button', { class: 'btn big', 'data-act': 'expand', onclick: () => { closeModal(); startEdit('expand'); } }, '🏝 とちを ひろげる'),
        h('button', { class: 'btn big', 'data-act': 'move', 'data-default': '', onclick: () => { closeModal(); startEdit('move'); } }, '🪴 もようがえ'),
        h('button', { class: 'btn big', 'data-act': 'lawn', onclick: () => { closeModal(); startEdit('lawn'); } }, '🌱 あきち ⇄ しばふ'),
        h('button', { class: 'btn big', 'data-act': 'decos', onclick: () => { closeModal(); startEdit('deco'); } }, '🪨 かざりを かたづける・おく')),
      h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'とじる')));
  });
}

function startEdit(kind) {
  pathQueue = []; pendingInteract = null; heldDir = null;
  if (kind === 'expand') {
    const c = expandCandidates();
    if (!c.length) return message('とちを ひろげる', (home.expansions || 0) >= MAX_EXPANSIONS ? 'これいじょう ひろげられないよ。' : 'ひろげられる ばしょが ないよ。');
    // 主人公に いちばん ちかい ばしょから
    c.sort((a, b) => Math.hypot(a.x + 1 - player.x, a.y + 1 - player.y) - Math.hypot(b.x + 1 - player.x, b.y + 1 - player.y));
    editMode = { kind, sel: c[0] };
  } else {
    editMode = { kind, cur: [player.x, player.y], picked: null };
  }
  document.body.classList.add('editing');
  updateEditBar();
}
function endEdit() {
  if (editMode?.picked) cancelPick();
  editMode = null;
  document.body.classList.remove('editing');
  document.getElementById('check').textContent = 'しらべる';
  // 主人公が ものの上に いたら、ちかくの あいている マスへ
  if (!walkable(player.x, player.y)) {
    const p = nearestWalkable(player.x, player.y);
    if (p) Object.assign(player, { x: p[0], y: p[1], fx: p[0], fy: p[1] });
  }
  saveHome();
}
function nearestWalkable(x, y) {
  for (let r = 1; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (walkable(x + dx, y + dy)) return [x + dx, y + dy];
  }
  return null;
}
function editFocus() {
  if (!editMode) return null;
  if (editMode.kind === 'expand') return [editMode.sel.x + CHUNK / 2, editMode.sel.y + CHUNK / 2];
  return [editMode.cur[0] + .5, editMode.cur[1] + .5];
}

function updateEditBar() {
  const text = document.getElementById('edittext'), check = document.getElementById('check');
  if (!editMode) return;
  if (editMode.kind === 'expand') {
    const parts = Object.entries(expandCost()).map(([k, n]) => `${k === 'coin' ? '🪙' : matIconHtml(k)} ${n}`).join('　');
    text.innerHTML = `🏝 ひろげる ばしょを えらんでね　<span class="cost">${parts}</span>`;
    check.textContent = 'ひろげる';
  } else if (editMode.kind === 'deco') {
    const st = home.decoStock || {}, n = Object.values(st).reduce((a, b) => a + b, 0);
    text.textContent = `🪨 かたづけたい かざり（いわ・はな・き）を えらんでね。あいた ところを えらぶと しまった かざりを おけるよ（しまってある：${n}こ）`;
    check.textContent = 'えらぶ';
  } else if (editMode.kind === 'lawn') {
    text.textContent = '🌱 しばふに したい あきち（または あきちに もどしたい しばふ）を えらんでね';
    check.textContent = 'かえる';
  } else {
    const p = editMode.picked;
    text.textContent = p ? `🪴 ${OBJECT_TYPES[p.o.type].name}を おく ばしょを えらんでね` : '🪴 うごかしたい ものを えらんでね';
    check.textContent = p ? 'ここに おく' : 'もつ';
  }
}

function editKey(e) {
  const k = e.key;
  const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }[k];
  if (k === 'Escape') { e.preventDefault(); if (editMode.picked) { cancelPick(); updateEditBar(); } else endEdit(); return; }
  if (editMode.kind === 'expand') {
    if (d) {
      e.preventDefault();
      // えらんでいる ばしょから、おした むきに いちばん ちかい こうほへ
      const c = expandCandidates(), s0 = editMode.sel;
      const ahead = c.filter((q) => (q.x - s0.x) * d[0] + (q.y - s0.y) * d[1] > 0);
      if (ahead.length) {
        ahead.sort((a, b) => score(a) - score(b));
        editMode.sel = ahead[0];
      }
      function score(q) { const along = (q.x - s0.x) * d[0] + (q.y - s0.y) * d[1]; const side = Math.abs((q.x - s0.x) * d[1]) + Math.abs((q.y - s0.y) * d[0]); return along + side * 2; }
      return;
    }
    if ((k === 'Enter' || k === ' ') && !e.repeat) { e.preventDefault(); confirmExpand(editMode.sel); }
    return;
  }
  // もようがえ
  if (d) {
    e.preventDefault();
    editMode.cur = [editMode.cur[0] + d[0], editMode.cur[1] + d[1]];
    if (editMode.picked) moveGhost();
    return;
  }
  if ((k === 'Enter' || k === ' ') && !e.repeat) { e.preventDefault(); editSelect(); }
}

function editTap(tx, ty) {
  if (editMode.kind === 'expand') {
    const c = expandCandidates().find((q) => tx >= q.x && tx < q.x + CHUNK && ty >= q.y && ty < q.y + CHUNK);
    if (c) { editMode.sel = c; confirmExpand(c); }
    return;
  }
  editMode.cur = [tx, ty];
  if (editMode.picked) moveGhost();
  editSelect();
}

// ---- とちを ひろげる
function confirmExpand(c) {
  const cost = expandCost();
  const ok = affordable(cost);
  openModal((m) => {
    m.className = 'modal build';
    m.append(h('h2', {}, 'ここを ひろげる？'),
      h('div', { class: 'chips big' }, ...costParts(cost).map((x) =>
        h('span', { class: 'chip' + (x.have >= x.n ? '' : ' short') }, x.k === 'coin' ? '🪙' : matIcon(x.k), ` ${x.n}`))),
      h('p', { class: 'body small' }, ok ? 'ひろげた とちには、あきちが ひとつ できるよ。' : 'コインか そざいが たりないよ。しまで あつめたり、こうかんじょで こうかん したり してね。'),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', 'data-act': 'back', ...(ok ? {} : { 'data-default': '' }), onclick: closeModal }, 'やめる'),
        h('button', { class: 'btn go', 'data-act': 'yes', ...(ok ? { 'data-default': '' } : { disabled: '' }), onclick: () => doExpand(c) }, 'ひろげる！')));
  });
}
async function doExpand(c) {
  const cost = expandCost();
  try {
    wallet = await store.update(`${book.id}/wallet`, (w) => {
      const x = structuredClone(w || { coin: 0, materials: {} }); x.materials = x.materials || {};
      for (const [k, n] of Object.entries(cost)) {
        const have = k === 'coin' ? (x.coin || 0) : (x.materials[k] || 0);
        if (have < n) throw new Error('たりない');
        if (k === 'coin') x.coin = have - n; else x.materials[k] = have - n;
      }
      return x;
    }, { fallback: { coin: 0, materials: {} } });
  } catch { return message('たりないよ', 'コインか そざいが たりないみたい。'); }
  const land = new Set(home.map.land);
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) land.add(`${c.x + i},${c.y + j}`);
  home.map.land = [...land];
  home.expansions = (home.expansions || 0) + 1;
  refreshLand();
  // あたらしい とちに あきちを ひとつ（2×2 が あいていれば）
  const spots = [];
  for (let y = c.y - 1; y <= c.y + CHUNK - 1; y++) for (let x = c.x - 1; x <= c.x + CHUNK - 1; x++) spots.push([x, y]);
  spots.sort((a, b) => Math.hypot(a[0] + 1 - (c.x + 1.5), a[1] + 1 - (c.y + 1.5)) - Math.hypot(b[0] + 1 - (c.x + 1.5), b[1] + 1 - (c.y + 1.5)));
  for (const [x, y] of spots) {
    let free = true;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (isWater(x + i, y + j) || objectAt(x + i, y + j) || (x + i === player.x && y + j === player.y)) free = false;
    if (free) { home.objects.push({ id: `lot-x${home.expansions}`, type: 'lot', x, y }); break; }
  }
  await saveHome();
  renderHud();
  closeModal();
  buildFx = { x: c.x + 1.5, y: c.y + 2, t0: performance.now() };
  const next = expandCandidates();
  if (next.length) { next.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y)); editMode.sel = next[0]; updateEditBar(); }
  else endEdit();
}

// ---- もようがえ
function editSelect() {
  const [x, y] = editMode.cur;
  if (editMode.kind === 'deco') {
    const DECO = ['rock', 'flowers', 'palm', 'tree'];
    const o = objectAt(x, y);
    if (o && DECO.includes(o.type)) {
      home.objects.splice(home.objects.indexOf(o), 1);
      home.decoStock = home.decoStock || {}; home.decoStock[o.type] = (home.decoStock[o.type] || 0) + 1;
      flashEdit(`${OBJECT_TYPES[o.type].name}を しまったよ`); saveHome(); updateEditBar(); return;
    }
    if (o) { flashEdit('いわ・はな・きを えらんでね'); return; }
    const stock = Object.entries(home.decoStock || {}).filter(([, n]) => n > 0);
    if (!stock.length) { flashEdit('しまってある かざりは ないよ'); return; }
    if (isWater(x, y) || (x === player.x && y === player.y)) { flashEdit('そこには おけないよ'); return; }
    openModal((m) => {
      m.className = 'modal';
      m.append(h('h2', {}, 'どれを おく？'), h('div', { class: 'row', style: 'justify-content:center;flex-wrap:wrap;gap:8px' }, ...stock.map(([t, n]) => h('button', { class: 'btn', 'data-deco': t, onclick: () => {
        const prob = placeProblem({ type: t, x, y }); if (prob) { closeModal(); flashEdit(prob); return; }
        home.objects.push({ id: 'd' + Date.now().toString(36), type: t, x, y }); home.decoStock[t]--; saveHome(); closeModal(); updateEditBar(); flashEdit(`${OBJECT_TYPES[t].name}を おいたよ`);
      } }, `${OBJECT_TYPES[t].name} ×${n}`))), h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-default': '', onclick: closeModal }, 'やめる')));
    });
    return;
  }
  if (editMode.kind === 'lawn') {
    const o = objectAt(x, y);
    if (!o || (o.type !== 'lot' && o.type !== 'lawn')) { flashEdit('あきちか しばふを えらんでね'); return; }
    o.type = o.type === 'lot' ? 'lawn' : 'lot';
    flashEdit(o.type === 'lawn' ? '🌱 しばふに したよ' : '🔨 あきちに もどしたよ（たてものが たてられるよ）');
    saveHome(); return;
  }
  if (!editMode.picked) {
    const o = objectAt(x, y);
    if (!o) return;
    if (!movable(o)) { flashEdit(`${OBJECT_TYPES[o.type].name}は うごかせないよ`); return; }
    editMode.picked = { o, ox: o.x, oy: o.y, dx: x - o.x, dy: y - o.y };
    updateEditBar();
    return;
  }
  const bad = placeProblem(editMode.picked.o);
  if (bad) { flashEdit(bad); return; }
  editMode.picked = null;
  saveHome();
  updateEditBar();
}
function moveGhost() {
  const p = editMode.picked;
  p.o.x = editMode.cur[0] - p.dx; p.o.y = editMode.cur[1] - p.dy;
}
function cancelPick() {
  const p = editMode.picked;
  p.o.x = p.ox; p.o.y = p.oy;
  editMode.picked = null;
}
// おけない りゆう（おけるなら null）
function placeProblem(o) {
  const t = OBJECT_TYPES[o.type];
  for (let y = o.y; y < o.y + t.h; y++) for (let x = o.x; x < o.x + t.w; x++) {
    if (isWater(x, y)) return 'うみの うえには おけないよ';
    const other = home.objects.find((q) => q !== o && x >= q.x && x < q.x + OBJECT_TYPES[q.type].w && y >= q.y && y < q.y + OBJECT_TYPES[q.type].h);
    if (other) return `${OBJECT_TYPES[other.type].name}と かさなるよ`;
    if (t.solid && x === player.x && y === player.y) return 'じぶんの いる ところには おけないよ';
    if (RESERVED.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) return 'そこは あとで あたらしい おみせが たつ ばしょだよ';
  }
  // どの たてものにも いけるか（とおれなく ならないか）
  const seen = new Set([`${player.x},${player.y}`]), q = [[player.x, player.y]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (!seen.has(k) && walkable(x + dx, y + dy)) { seen.add(k); q.push([x + dx, y + dy]); }
    }
  }
  for (const b of home.objects) {
    const bt = OBJECT_TYPES[b.type];
    if (bt.deco) continue;
    let ok = false;
    for (let y = b.y - 1; y <= b.y + bt.h && !ok; y++) for (let x = b.x - 1; x <= b.x + bt.w && !ok; x++) {
      const inside = x >= b.x && x < b.x + bt.w && y >= b.y && y < b.y + bt.h;
      if ((!inside || !bt.solid) && seen.has(`${x},${y}`)) ok = true;
    }
    if (!ok) return `そこに おくと、${bt.name}に いけなく なるよ`;
  }
  return null;
}
let editFlash = null;
// 画面の 上に 数秒 出る お知らせ（v0.17.3）
function note(text) {
  const el = h('div', { class: 'note', role: 'status' }, text); document.body.append(el);
  setTimeout(() => el.classList.add('out'), 4200); setTimeout(() => el.remove(), 4800);
}
function flashEdit(text) { editFlash = { text, t0: performance.now() }; }

function drawEditUnder(now, cx, cy) {
  if (editMode?.kind !== 'expand') return;
  const c = expandCandidates();
  for (const q of c) {
    const sel = editMode.sel && q.x === editMode.sel.x && q.y === editMode.sel.y;
    const px = q.x * T - cx, py = q.y * T - cy, W = CHUNK * T;
    ctx.fillStyle = sel ? 'rgba(255,226,138,.55)' : 'rgba(255,255,255,.28)';
    roundRect(px + 4, py + 4, W - 8, W - 8, T * .3); ctx.fill();
    ctx.setLineDash(sel ? [] : [10, 8]); ctx.lineWidth = sel ? 6 : 3;
    ctx.strokeStyle = sel ? '#f2a63a' : 'rgba(255,255,255,.9)'; ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = sel ? '#b86f12' : 'rgba(255,255,255,.95)';
    ctx.font = `bold ${Math.round(T * (sel ? .9 : .6))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('＋', px + W / 2, py + W / 2);
  }
}
function drawEditOver(now, cx, cy) {
  if (editMode?.kind === 'move' || editMode?.kind === 'lawn' || editMode?.kind === 'deco') {
    const p = editMode.picked;
    if (p) {
      const t = OBJECT_TYPES[p.o.type], bad = placeProblem(p.o);
      ctx.fillStyle = bad ? 'rgba(242,107,91,.35)' : 'rgba(110,200,120,.35)';
      roundRect(p.o.x * T - cx + 3, p.o.y * T - cy + 3, t.w * T - 6, t.h * T - 6, T * .2); ctx.fill();
    }
    const [x, y] = editMode.cur;
    ctx.lineWidth = 5; ctx.strokeStyle = '#3b82f6';
    roundRect(x * T - cx + 3, y * T - cy + 3, T - 6, T - 6, T * .18); ctx.stroke();
  }
  if (editFlash) {
    const k = (now - editFlash.t0) / 1800;
    if (k > 1) { editFlash = null; return; }
    ctx.globalAlpha = Math.min(1, (1 - k) * 3);
    const w = window.innerWidth;
    ctx.font = `bold ${Math.round(T * .26)}px "Hiragino Maru Gothic ProN","BIZ UDPGothic",sans-serif`;
    const tw = ctx.measureText(editFlash.text).width + 40;
    ctx.fillStyle = 'rgba(255,250,240,.96)'; roundRect(w / 2 - tw / 2, 130, tw, T * .6, 18); ctx.fill();
    ctx.fillStyle = '#b23a2b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(editFlash.text, w / 2, 130 + T * .3);
    ctx.globalAlpha = 1;
  }
}


// ------------------------------------------------------------------ クラスに はいる（参加用リンク）
function openJoin(link) {
  // 1. しゅっせきばんごう → 2. あいことば（数字4けた。せんせいの カード）
  let step = 'num', num = '', pin = '';
  openModal((m) => {
    m.className = 'modal build';
    const lead = h('p', { class: 'body small' });
    const disp = h('div', { class: 'numdisp', 'aria-live': 'polite' }, '　');
    const err = h('p', { class: 'body small err' });
    const back = h('button', { class: 'btn', 'data-act': 'back', onclick: () => { step = 'num'; pin = ''; err.textContent = ''; paint(); } }, 'もどる');
    const paint = () => {
      if (step === 'num') {
        lead.textContent = `ぼうけんの しょ：📖 ${book.name}　しゅっせきばんごうを いれてね。`;
        disp.textContent = num || '　'; go.textContent = 'つぎへ'; go.disabled = !num; back.hidden = back.disabled = true;
      } else {
        lead.textContent = `${num}ばん　せんせいから もらった カードの「あいことば」（すうじ 4つ）を いれてね。`;
        disp.textContent = pin ? '●'.repeat(pin.length) + '○'.repeat(4 - pin.length) : '○○○○'; go.textContent = 'はいる'; go.disabled = pin.length !== 4; back.hidden = back.disabled = false;
      }
    };
    const press = (d) => {
      if (step === 'num') { if (d === 'del') num = num.slice(0, -1); else if (num.length < 2) num = (num + d).replace(/^0+/, ''); }
      else if (d === 'del') pin = pin.slice(0, -1); else if (pin.length < 4) pin += d;
      paint();
    };
    const pad = h('div', { class: 'numpad' }, ...['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0'].map((d) =>
      h('button', { class: 'btn', 'data-num': d, onclick: () => press(d) }, d === 'del' ? 'けす' : d)));
    const go = h('button', { class: 'btn go', 'data-act': 'join', disabled: '', onclick: async () => {
      if (step === 'num') { step = 'pin'; err.textContent = ''; paint(); return; }
      go.disabled = true; err.textContent = 'とうろく しているよ…';
      try {
        cls = await classroom.join(book.id, link, { number: num, pin, handle: book.name, grade: profile?.grade });
        classroom.clearJoinLink();
        closeModal();
        message('クラスに はいったよ！', `${cls.className || ''}の ${cls.number}ばん ${book.name}さん、よろしくね。\nがくしゅうの きろくが せんせいに とどくように なったよ。`);
      } catch (e) { pin = ''; paint(); err.textContent = e.message || 'とうろく できなかったよ。もういちど ためしてね。'; }
    } }, 'つぎへ');
    m.append(h('h2', {}, '🏫 クラスに はいる'),
      ...(cls ? [h('p', { class: 'body small' }, `いまは ${cls.className || cls.code}に はいっているよ。あたらしい クラスに はいりなおすよ。`)] : []),
      lead, disp, pad, err,
      h('div', { class: 'row end' },
        h('button', { class: 'btn', 'data-act': 'cancel', onclick: () => { classroom.clearJoinLink(); closeModal(); } }, 'やめる'), back, go));
    m.addEventListener('keydown', (e) => {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); press('del'); }
      else if (e.key === 'Enter' && !go.disabled && !e.repeat) { e.preventDefault(); e.stopPropagation(); go.click(); }
    }, true);
    paint();
  });
}

function openClassInfo() {
  openModal((m) => {
    if (!cls) {
      m.append(h('h2', {}, '🏫 クラス'), h('p', { class: 'body' }, 'まだ クラスに はいっていないよ。\nせんせいから もらった リンクを ひらくと はいれるよ。'),
        h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'とじる')));
      return;
    }
    m.append(h('h2', {}, '🏫 クラス'),
      h('p', { class: 'body' }, cls.invalid ? 'クラスの とうろくが きれているよ。\nせんせいに もういちど リンクを もらってね。'
        : `${cls.className || cls.code}　${cls.number}ばん　${cls.handle}\nがくしゅうの きろくが せんせいに とどくよ。`),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', 'data-act': 'leave', onclick: () => openModal((m2) => {
          m2.append(h('h2', {}, 'クラスを ぬける？'), h('p', { class: 'body' }, 'ぬけると、きろくが せんせいに とどかなく なるよ。'),
            h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-default': '', onclick: closeModal }, 'やめる'),
              h('button', { class: 'btn', 'data-act': 'yes', onclick: async () => { await classroom.leave(book.id); cls = null; closeModal(); message('クラスを ぬけたよ', 'また はいるときは、せんせいの リンクを ひらいてね。'); } }, 'ぬける')));
        }) }, 'クラスを ぬける'),
        h('button', { class: 'btn', 'data-act': 'close', 'data-default': '', onclick: closeModal }, 'とじる')));
  });
}


// ------------------------------------------------------------------ ミッション（島で あつめた 王冠。仕様書10章）
// 島は Island.progress({ id, name, crowns }) で 王冠を おくる。ホームは 王冠の 合計で ミッションを はんていする
const MISSIONS = [
  { n: 1, coin: 50, outfit: 'rq-explorer', name: 'はじめての おうかん' },
  { n: 3, coin: 100, outfit: 'rq-forest', name: 'おうかん 3こ' },
  { n: 5, coin: 200, outfit: 'rq-autumn', name: 'おうかん 5こ' },
  { n: 10, coin: 500, outfit: 'rq-harvest', name: 'おうかん 10こ' },
];
const msReward = (x) => `🪙${x.coin}` + (x.outfit && OUTFITS[x.outfit] ? ` ＋ 👕${OUTFITS[x.outfit].name}` : '');
// ミッションの 服を もらう（前に たっせい した 子にも あとから わたす）
async function grantOutfits(list) {
  const keys = list.filter((x) => x.outfit && OUTFITS[x.outfit]).map((x) => `outfit:${x.outfit}`);
  if (!keys.length) return;
  wardrobe = await store.update(`${book.id}/wardrobe`, (w) => {
    const owned = Array.isArray(w?.owned) ? w.owned : [];
    return { ...(w || {}), owned: [...owned, ...keys.filter((k) => !owned.includes(k))] };
  }, { fallback: { owned: [] } });
}
let crownTotal = 0, missionsClaimed = [];
async function refreshCrowns() {
  let n = 0;
  for (const k of await store.list(`${book.id}/progress/`)) {
    const m = await store.get(k, {});
    for (const u of Object.values(m || {})) n += Math.max(0, Number(u?.crowns) || 0);
  }
  crownTotal = n;
  missionsClaimed = ((await store.get(`${book.id}/missions`, {})) || {}).claimed || [];
  const ownedNow = ((await store.get(`${book.id}/wardrobe`)) || {}).owned || [];
  const miss = MISSIONS.filter((x) => missionsClaimed.includes(x.n) && x.outfit && !ownedNow.includes(`outfit:${x.outfit}`));
  if (miss.length) await grantOutfits(miss);
  return n;
}
const missionReady = () => MISSIONS.some((x) => crownTotal >= x.n && !missionsClaimed.includes(x.n));
async function claimMission(ms) {
  if (missionsClaimed.includes(ms.n) || crownTotal < ms.n) return;
  const r = await store.update(`${book.id}/missions`, (x) => { x = x || { claimed: [] }; if (!x.claimed.includes(ms.n)) x.claimed.push(ms.n); return x; }, { fallback: { claimed: [] } });
  missionsClaimed = r.claimed;
  wallet = await store.update(`${book.id}/wallet`, (w) => { w = w || { coin: 0, materials: {} }; w.coin = (w.coin || 0) + ms.coin; return w; }, { fallback: { coin: 0, materials: {} } });
  await store.update(`${book.id}/collection`, (list) => {
    list = Array.isArray(list) ? list : [];
    if (list.some((x) => x.appId === 'mission' && x.id === `crown-${ms.n}`)) return list;
    return [...list, { appId: 'mission', subject: 'event', id: `crown-${ms.n}`, name: `👑 ${ms.name}`, img: '', kind: 'trophy', at: new Date().toISOString() }];
  }, { fallback: [] });
  await grantOutfits([ms]);
  renderHud();
  const fit = ms.outfit && OUTFITS[ms.outfit] ? `\nぼうけんふく「${OUTFITS[ms.outfit].name}」も もらったよ。きせかえやで きられるよ。` : '';
  message('👑 ミッション たっせい！', `${ms.name}\n🪙${ms.coin} もらったよ。かざりだなに きねんの トロフィーが ならんだよ。${fit}`);
}
async function openMissions() {
  await refreshCrowns();
  openModal((m) => {
    m.className = 'modal build missions';
    const next = MISSIONS.find((x) => crownTotal < x.n);
    m.append(h('h2', {}, '👑 ミッション'),
      h('p', { class: 'body' }, `しまで あつめた おうかん：${crownTotal}こ`),
      h('p', { class: 'body small' }, next ? `つぎの ミッションまで あと ${next.n - crownTotal}こ。しまの ワールドで スタンプを 10こ あつめると、おうかんが もらえるよ。` : 'ぜんぶの ミッションを たっせい したよ！'),
      h('div', { class: 'ms-list' }, ...MISSIONS.map((x) => {
        const got = missionsClaimed.includes(x.n), ok = crownTotal >= x.n;
        return h('div', { class: 'ms-row' + (got ? ' got' : ok ? ' ok' : ''), 'data-ms': String(x.n) },
          h('span', { class: 'ms-name' }, `${got ? '✅' : ok ? '🎁' : '👑'} ${x.name}`),
          h('span', { class: 'ms-bar' }, h('span', { style: `width:${Math.min(100, Math.round(crownTotal / x.n * 100))}%` })),
          got ? h('span', { class: 'ms-tag' }, 'もらった') : ok ? h('button', { class: 'btn go', 'data-act': 'ms-claim', onclick: () => { closeModal(); claimMission(x); } }, 'もらう') : h('span', { class: 'ms-tag' }, `${Math.min(crownTotal, x.n)} / ${x.n}`),
          h('span', { class: 'ms-reward' }, `ごほうび：${msReward(x)}`));
      })),
      h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', 'data-default': '', onclick: closeModal }, 'とじる')));
  });
}

// ------------------------------------------------------------------ がっこう（しゅくだい・〇〇グランプリ。仕様書11-6）
// しゅくだいの すすみは、この端末の 学習の きろく（learning/）から 数える。先生には 島から 送った 要約で つたわる
let hwProg = {}; // id → 自分で 正解した 数
const homeworks = () => (cls && !cls.invalid ? (cls.homework || []) : []);
const localYmd = (iso) => { const d = new Date(iso); if (isNaN(d)) return ''; return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
async function refreshHomework() {
  const list = homeworks(); hwProg = {};
  if (!list.length) return hwProg;
  const keys = await store.list(`${book.id}/learning/`);
  const sessions = [];
  for (const k of keys) { const L = await store.get(k); if (L && Array.isArray(L.sessions)) sessions.push(...L.sessions); }
  for (const hw of list) {
    let n = 0;
    for (const x of sessions) {
      const day = localYmd(x.at);
      if (!day || day < hw.start || day > hw.due) continue;
      if (hw.subject && (x.subject || '') !== hw.subject) continue;
      for (const sk of x.skills || []) if (skillIn(sk.id, hw.skill)) n += Number(sk.self) || 0;
    }
    hwProg[hw.id] = n;
  }
  return hwProg;
}
// 技能ID が 単元に 入るか（math.g1.C.clock は clock2 を ふくまない。#1 や .xxx の ステージは ふくむ）。GAS の skillIn_ と おなじ
function skillIn(id, p) {
  if (String(p || '').includes(',')) return String(p).split(',').some((q) => skillIn(id, q.trim())); // まとまり（くらべてみよう など）
  id = String(id || ''); p = String(p || '');
  if (!p || id === p) return true;
  if (!id.startsWith(p)) return false;
  if (/[.#]$/.test(p)) return true;
  const c = id.charAt(p.length); return c === '#' || c === '.';
}
const hwDone = (hw) => (hwProg[hw.id] || 0) >= hw.goal;
const hwOpenCount = () => homeworks().filter((hw) => !hwDone(hw) && (dueDiff(hw.due) ?? 0) >= 0).length;
function hwCard(hw) {
  const n = hwProg[hw.id] || 0, k = Math.min(1, n / hw.goal), done = hwDone(hw);
  const dl = dueLabel(hw.due);
  const is = ISLANDS.find((x) => x.id !== 'test' && x.subject === hw.subject && islandOpen(x));
  return h('div', { class: 'hw-card' + (done ? ' done' : ''), 'data-hw': hw.id },
    h('div', { class: 'hw-head' }, h('span', { class: 'hw-sub' }, SUBJECT_LABELS[hw.subject] || 'どの きょうかでも'), h('span', { class: 'todo-due ' + (done ? 'due-any' : dl.cls) }, done ? 'できた！' : dl.text)),
    h('h3', {}, (done ? '✅ ' : '📝 ') + hw.name),
    hw.desc ? h('p', { class: 'body small' }, hw.desc) : null,
    h('div', { class: 'ev-bar' }, h('div', { class: 'ev-fill', style: `width:${Math.round(k * 100)}%` })),
    h('p', { class: 'ev-num' }, done ? `${n}もん じぶんで とけたよ！` : `じぶんで とけた もんだい ${n} / ${hw.goal}`),
    !done && is ? h('div', { class: 'row' }, h('button', { class: 'btn go', 'data-act': 'hwgo', onclick: () => { closeModal(); openIslands(is.id); } }, `🎈 ${is.name}へ`)) : null);
}
async function openSchool() {
  await refreshHomework();
  openModal((m) => {
    m.className = 'modal build school';
    m.append(h('h2', {}, '🏫 がっこう'));
    if (!cls || cls.invalid) {
      m.append(h('p', { class: 'body' }, 'クラスに はいると、せんせいからの しゅくだいが ここに とどくよ。\n（せってい ⚙ の「クラスに はいる」から）'));
    } else {
      m.append(h('h3', { class: 'sec' }, '📚 しゅくだい'));
      const list = homeworks().slice().sort((a, b) => (hwDone(a) - hwDone(b)) || a.due.localeCompare(b.due));
      if (list.length) m.append(h('div', { class: 'hw-list', 'data-scroll': '1' }, ...list.map(hwCard)));
      else m.append(h('p', { class: 'body small' }, 'いまは しゅくだいは ないよ。'));
      m.append(h('p', { class: 'body small' }, 'ヒントなしで とけた もんだいを かぞえるよ。'));
    }
    m.append(h('h3', { class: 'sec' }, '🏆 グランプリ'),
      h('p', { class: 'body small' }, 'せんせいが ひらいた ときに、クラスの みんなで あそべるよ。（じゅんびちゅう）'),
      h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', 'data-default': '', onclick: closeModal }, 'とじる')));
  });
}

// ------------------------------------------------------------------ クラスイベント（みんなで もくひょう。仕様書11-3）
// 先生の シート「イベント」の 期間中は、イベントひろばの おくに「イベントの もん」が たつ
const activeEvent = () => (cls && !cls.invalid ? (cls.events || []).find((e) => e.open) : null);
const doneEvents = () => (cls && !cls.invalid ? (cls.events || []).filter((e) => e.done >= e.goal) : []);
let claimedEvents = [];
function gateTile() {
  if (scene !== 'island' || !activeEvent()) return null;
  const pz = home.objects.find((o) => o.type === 'plaza');
  return pz ? [pz.x + 1, pz.y] : null;
}
// ツリーの イベント（名前に「ツリー」「クリスマス」）は、ひろばに ツリーが たち、みんなの 数で かざりが ふえる
const isTreeEvent = (ev) => !!ev && /ツリー|クリスマス/.test(ev.name);
function treeTile() {
  const g = gateTile(); if (!g || !isTreeEvent(activeEvent())) return null;
  return [g[0] + 1, g[1] + 1];
}
const treeStage = (ev) => { const k = ev.done / ev.goal; return k >= 1 ? 3 : k >= .6 ? 2 : k >= .3 ? 1 : 0; };
const isGate = (x, y) => { const g = gateTile(); if (g && g[0] === x && g[1] === y) return true; const t = treeTile(); return !!t && t[0] === x && t[1] === y; };
const GATE = { type: 'gate', gate: true };
function unclaimedEvent() { return doneEvents().find((e) => !claimedEvents.includes(e.id)); }
const eventImgs = {};
for (const [k, src] of [['gate', 'assets/home/event_gate.webp?v=0.17.3'], ['t0', 'assets/home/xmas_tree0.webp?v=0.17.3'], ['t1', 'assets/home/xmas_tree1.webp?v=0.17.3'], ['t2', 'assets/home/xmas_tree2.webp?v=0.17.3'], ['t3', 'assets/home/xmas_tree3.webp?v=0.17.3']]) {
  const im = new Image(); im.onload = () => { eventImgs[k] = im; }; im.src = new URL('../' + src, import.meta.url).href;
}
function drawGate(now) {
  const g = gateTile(); if (!g) return;
  const [cx, cy] = camera();
  const x = g[0] * T - cx, y = g[1] * T - cy, w = T;
  const ev = activeEvent();
  const tt = treeTile();
  if (tt && eventImgs['t' + treeStage(ev)]) { // ツリー（もんの みぎ まえ）
    const im = eventImgs['t' + treeStage(ev)], tw = T * 1.15, th = im.height * tw / im.width;
    const tx = tt[0] * T - cx + (T - tw) / 2, ty = tt[1] * T - cy + T * .95 - th;
    ctx.fillStyle = 'rgba(60,40,20,.16)'; ctx.beginPath(); ctx.ellipse(tx + tw / 2, ty + th - T * .04, T * .45, T * .12, 0, 0, 7); ctx.fill();
    ctx.drawImage(im, tx, ty, tw, th);
  }
  ctx.fillStyle = 'rgba(60,40,20,.16)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + T * .92, T * .8, T * .14, 0, 0, 7); ctx.fill();
  const k = Math.min(1, ev.done / ev.goal);
  let barY = y + T * .5;
  if (eventImgs.gate) {
    const im = eventImgs.gate, gw = T * 1.9, gh = im.height * gw / im.width, gx = x + (w - gw) / 2, gy = y + T * .97 - gh;
    ctx.drawImage(im, gx, gy, gw, gh);
    // かんばんに イベントの 名前
    const sx = gx + gw * .5, sy = gy + gh * .245, maxW = gw * .74;
    let fs = Math.round(T * .3); ctx.font = `bold ${fs}px "Zen Maru Gothic", sans-serif`;
    while (ctx.measureText(ev.name).width > maxW && fs > 9) { fs--; ctx.font = `bold ${fs}px "Zen Maru Gothic", sans-serif`; }
    ctx.fillStyle = '#7a3e1c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ev.name, sx, sy);
    barY = gy + gh * .4;
  } else { // 絵が まだのときの かんたんな もん
    ctx.fillStyle = '#e8916f'; roundRect(x - T * .18, y - T * .55, T * .2, T * 1.45, T * .08); ctx.fill(); roundRect(x + w - T * .02, y - T * .55, T * .2, T * 1.45, T * .08); ctx.fill();
    ctx.fillStyle = '#f6c26b'; roundRect(x - T * .32, y - T * .78, w + T * .64, T * .3, T * .14); ctx.fill();
    drawLabelNow(ev.name, x + w / 2, y - T * 1.0, '#7a3e1c');
  }
  // すすみぐあいの バー
  ctx.fillStyle = 'rgba(255,255,255,.92)'; roundRect(x + T * .05, barY, w - T * .1, T * .16, T * .08); ctx.fill();
  ctx.fillStyle = '#7cc6a4'; roundRect(x + T * .05, barY, Math.max(T * .16, (w - T * .1) * k), T * .16, T * .08); ctx.fill();
  if (unclaimedEvent()) drawUnreadBadge(x + w / 2 + T * .8, y - T * 1.2, now);
}
function eventCard(ev) {
  const k = Math.min(1, ev.done / ev.goal);
  const tree = isTreeEvent(ev) ? h('img', { class: 'ev-tree', src: new URL(`../assets/home/xmas_tree${treeStage(ev)}.webp?v=${HOME_VERSION}`, import.meta.url).href, alt: '' }) : null;
  return h('div', { class: 'ev-card' + (tree ? ' has-tree' : ''), 'data-event': ev.id }, tree,
    h('h3', {}, `🎉 ${ev.name}`),
    ev.desc ? h('p', { class: 'body small' }, ev.desc) : null,
    h('div', { class: 'ev-bar' }, h('div', { class: 'ev-fill', style: `width:${Math.round(k * 100)}%` })),
    h('p', { class: 'ev-num' }, ev.done >= ev.goal ? `たっせい！ みんなで ${ev.done}もん` : `みんなで ${ev.done} / ${ev.goal}もん`),
    h('p', { class: 'body small' }, `${ev.start.slice(5).replace('-', '/')}〜${ev.end.slice(5).replace('-', '/')}　1人 1日 ${ev.cap}もんまで かぞえるよ`));
}
async function claimEvent(ev) {
  if (claimedEvents.includes(ev.id)) return;
  claimedEvents = [...claimedEvents, ev.id];
  await store.set(`${book.id}/eventsClaimed`, claimedEvents);
  const f = FURNITURE[ev.reward];
  if (f) {
    if (!room) await loadRoom();
    room.storage[ev.reward] = (room.storage[ev.reward] || 0) + 1; await saveRoom();
  }
  // かざりだなに 記念の トロフィー
  await store.update(`${book.id}/collection`, (list) => {
    list = Array.isArray(list) ? list : [];
    if (list.some((x) => x.appId === 'class-event' && x.id === ev.id)) return list;
    return [...list, { appId: 'class-event', subject: 'event', id: ev.id, name: ev.name.slice(0, 30), img: '', kind: 'trophy', at: new Date().toISOString() }];
  }, { fallback: [] });
  message('🎉 たっせい！', `${ev.name}\nクラスの みんなで がんばったね。\n${f ? `ごほうびの「${f.name}」が「しまってある かぐ」に とどいたよ。\n` : ''}かざりだなに きねんの トロフィーが ならんだよ。`);
}
function openEvent() {
  const ev = activeEvent() || unclaimedEvent();
  if (!ev) return;
  openModal((m) => {
    m.className = 'modal build ev';
    const canClaim = ev.done >= ev.goal && !claimedEvents.includes(ev.id);
    m.append(h('h2', {}, '🎪 イベントの もん'), eventCard(ev),
      h('p', { class: 'body small' }, canClaim ? 'みんなで たっせい した！ ごほうびを うけとろう。' : 'しまで もんだいを とくと、みんなの かずが ふえるよ。'),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'とじる'),
        canClaim ? h('button', { class: 'btn go', 'data-act': 'claim', 'data-default': '', onclick: () => { closeModal(); claimEvent(ev); } }, 'ごほうびを うけとる') : null));
  });
}

// ================================================================== 自分の家の中（v0.11.0、仕様書10章）
// 島と 同じ 主人公・同じ 操作で、へやの 中を 歩く。へやの マスは 遠近に あわせて 絵の 床に のせる
let scene = 'island';     // 'island' | 'room'
let room = null;          // p1/room の中身
let islandPos = null;     // へやに 入る まえに いた 島の 場所
let roomEdit = null;      // もようがえ中：{ cur:[x,y], move:{item, from:[x,y]} | null, place:{type} | null }
const roomImgs = {};      // 絵（へや・かぐ）
function loadRoomImages() {
  for (const [k, w] of Object.entries(ROOM_WALLS)) if (!roomImgs['wall:' + k]) { const im = new Image(); im.onload = () => { roomImgs['wall:' + k] = im; }; im.src = w.src; }
  for (const [k, f] of Object.entries(FURNITURE)) {
    if (!roomImgs[k]) { const im = new Image(); im.onload = () => { roomImgs[k] = im; }; im.src = f.src; }
    for (const [d, v] of Object.entries(f.views || {})) if (!roomImgs[k + ':' + d]) { const im = new Image(); im.onload = () => { roomImgs[k + ':' + d] = im; }; im.src = v.src; }
  }
}
// むきに あわせた 床の 大きさ（左右むきでは w と h が いれかわる）
const fsize = (it) => { const f = FURNITURE[it.type] || { w: 1, h: 1 }; return (it.dir === 'left' || it.dir === 'right') ? { w: f.h, h: f.w } : { w: f.w, h: f.h }; };
// その かぐが むける むき（絵が ある むきだけ）
function furnDirs(type) { const v = FURNITURE[type]?.views || {}; return ['down', ...(v.left ? ['left'] : []), ...(v.up ? ['up'] : []), ...(v.left ? ['right'] : [])]; }
function nextDir(type, d) { const a = furnDirs(type); return a[(a.indexOf(d || 'down') + 1) % a.length]; }
const inRoom = (x, y) => x >= 0 && y >= 0 && x < ROOM.cols && y < ROOM.rows;
const isDoor = (x, y) => ROOM.door.some(([a, b]) => a === x && b === y);
function roomItemsAt(x, y, items = room.items) {
  return items.filter((it) => { const f = fsize(it); return x >= it.x && x < it.x + f.w && y >= it.y && y < it.y + f.h; });
}
function roomItemAt(x, y) { const a = roomItemsAt(x, y); return a.find((it) => !FURNITURE[it.type].flat) || a[0] || null; }
function roomWalkable(x, y) { return inRoom(x, y) && !roomItemsAt(x, y).some((it) => !FURNITURE[it.type].flat); }

// へやの 絵を 画面に おさめる（よこ・たて どちらも はみださない）
function roomView() {
  const w = window.innerWidth, hh = window.innerHeight;
  const k = Math.min(w / ROOM.img.w, hh / ROOM.img.h);
  return { k, ox: (w - ROOM.img.w * k) / 2, oy: (hh - ROOM.img.h * k) / 2 };
}
// マスの 座標（u は よこ 0〜6、v は おく 0〜5）→ 画面の 位置
function roomPt(u, v) {
  const F = ROOM.floor, t = v / ROOM.rows;
  const y = F.y0 + (F.y1 - F.y0) * t;
  const L = F.back[0] + (F.front[0] - F.back[0]) * t, R = F.back[1] + (F.front[1] - F.back[1]) * t;
  const x = L + (R - L) * (u / ROOM.cols);
  const V = roomView();
  return [V.ox + x * V.k, V.oy + y * V.k];
}
function roomCellW(v) {
  const F = ROOM.floor, t = v / ROOM.rows, V = roomView();
  return ((F.back[1] - F.back[0]) + ((F.front[1] - F.front[0]) - (F.back[1] - F.back[0])) * t) / ROOM.cols * V.k;
}
function roomTileAt(sx, sy) {
  const V = roomView(), F = ROOM.floor;
  const y = (sy - V.oy) / V.k, x = (sx - V.ox) / V.k;
  const t = (y - F.y0) / (F.y1 - F.y0);
  if (t < 0 || t >= 1) return null;
  const L = F.back[0] + (F.front[0] - F.back[0]) * t, R = F.back[1] + (F.front[1] - F.back[1]) * t;
  const u = (x - L) / (R - L) * ROOM.cols;
  if (u < 0 || u >= ROOM.cols) return null;
  return [Math.floor(u), Math.floor(t * ROOM.rows)];
}

async function loadRoom() {
  room = await store.get(`${book.id}/room`);
  if (!room) { room = DEFAULT_ROOM(); await store.set(`${book.id}/room`, room); }
  room.storage = room.storage || {};
  if ((room.v || 1) < 2) { // v2：つくえの まえの いすを うしろむきに
    const ch = room.items.find((it) => it.type === 'chair' && it.x === 4 && it.y === 1 && !it.dir);
    if (ch) ch.dir = 'up';
    room.v = 2; saveRoom();
  }
  loadRoomImages();
}
async function saveRoom() { await store.set(`${book.id}/room`, room); }

async function enterRoom() {
  if (scene === 'room') return;
  if (!room) await loadRoom();
  pathQueue = []; pendingInteract = null; heldDir = null;
  islandPos = { x: player.x, y: player.y, dir: player.dir };
  await saveHome();
  scene = 'room';
  const [dx, dy] = ROOM.door[0];
  Object.assign(player, { x: dx, y: dy, fx: dx, fy: dy, dir: 'up', moving: false });
  document.body.classList.add('in-room');
}
async function exitRoom() {
  if (scene !== 'room') return;
  if (roomEdit) endRoomEdit();
  pathQueue = []; pendingInteract = null; heldDir = null;
  scene = 'island';
  document.body.classList.remove('in-room');
  // 家の まえ（入口）に 立つ
  const hs = home.objects.find((o) => o.type === 'house');
  const front = hs ? [hs.x + 1, hs.y + OBJECT_TYPES.house.h] : [islandPos?.x, islandPos?.y];
  const p = walkable(front[0], front[1]) ? front : (nearestWalkable(front[0], front[1]) || [islandPos.x, islandPos.y]);
  Object.assign(player, { x: p[0], y: p[1], fx: p[0], fy: p[1], dir: 'down', moving: false });
  await saveHome();
}

function roomFacing() {
  const [dx, dy] = DIRS[player.dir];
  const it = roomItemAt(player.x + dx, player.y + dy);
  return it && FURNITURE[it.type].act ? it : null;
}
function roomInteract(it) {
  const f = FURNITURE[it.type];
  if (f.act === 'desk') return openDesk();
  if (f.act === 'shelf') return openShelf();
  if (f.act === 'bed') return message('ベッド', `${book.name}さんの ベッド。\nよく ねると、あたまも からだも げんきに なるよ。`);
  if (f.act === 'books') return message('ほんだな', 'すきな ほんが ならんでいるよ。\nしまで しらべた ことも、ほんで たしかめてみよう。');
}
function roomFrontOf(it) {
  const f = fsize(it), cands = [];
  for (let x = it.x; x < it.x + f.w; x++) cands.push([x, it.y + f.h, 'up']);
  for (let y = it.y; y < it.y + f.h; y++) { cands.push([it.x - 1, y, 'right'], [it.x + f.w, y, 'left']); }
  let best = null;
  for (const [x, y, dir] of cands) {
    if (!roomWalkable(x, y)) continue;
    const p = findPath(player.x, player.y, x, y);
    if (p && (!best || p.length < best.p.length)) best = { x, y, p, dir };
  }
  return best;
}
let roomFaceDir = null;
function roomTap(e) {
  const tile = roomTileAt(e.clientX, e.clientY);
  if (roomEdit) { if (tile) { roomEdit.cur = tile; roomEditSelect(); } return; }
  if (!tile) return;
  const it = roomItemAt(tile[0], tile[1]);
  if (it && FURNITURE[it.type].act) {
    const f = roomFrontOf(it);
    if (f) { pathQueue = f.p; pendingInteract = it; roomFaceDir = f.dir; }
    return;
  }
  if (roomWalkable(tile[0], tile[1])) { pathQueue = findPath(player.x, player.y, tile[0], tile[1]) || []; pendingInteract = null; }
}

function drawRoom(now) {
  const w = window.innerWidth, hh = window.innerHeight;
  ctx.fillStyle = '#f3e3c8'; ctx.fillRect(0, 0, w, hh);
  const V = roomView();
  const wall = roomImgs['wall:' + room.wall] || roomImgs['wall:stripe'];
  if (wall) ctx.drawImage(wall, V.ox, V.oy, ROOM.img.w * V.k, ROOM.img.h * V.k);
  // もようがえ中：マス目
  if (roomEdit) {
    ctx.save(); ctx.strokeStyle = 'rgba(120,90,50,.25)'; ctx.lineWidth = 1.5;
    for (let v = 0; v <= ROOM.rows; v++) { const [a, b] = roomPt(0, v), [c, d] = roomPt(ROOM.cols, v); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
    for (let u = 0; u <= ROOM.cols; u++) { const [a, b] = roomPt(u, 0), [c, d] = roomPt(u, ROOM.rows); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
    ctx.restore();
  }
  const quad = (x, y, w2, h2, fill, stroke) => {
    const p = [roomPt(x, y), roomPt(x + w2, y), roomPt(x + w2, y + h2), roomPt(x, y + h2)];
    ctx.beginPath(); p.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke(); }
  };
  // 置こうとしている かぐの 場所
  const ghost = roomGhost();
  if (ghost) quad(ghost.x, ghost.y, ghost.w, ghost.h, ghost.ok ? 'rgba(90,190,120,.35)' : 'rgba(230,90,80,.35)', ghost.ok ? '#3a9a5a' : '#d0473b');
  if (roomEdit && !ghost) quad(roomEdit.cur[0], roomEdit.cur[1], 1, 1, 'rgba(255,214,107,.35)', '#e0a43a');
  // かぐと 主人公を 奥から じゅんに
  const list = room.items.filter((it) => !(roomEdit?.move && roomEdit.move.item === it));
  const items = list.map((it) => ({ it, z: FURNITURE[it.type].flat ? -1 : it.y + fsize(it).h }));
  items.push({ hero: true, z: player.fy + 0.99 });
  if (ghost) items.push({ ghostItem: ghost, z: ghost.flat ? -0.5 : ghost.y + ghost.h + 0.01 });
  items.sort((a, b) => a.z - b.z);
  for (const x of items) {
    if (x.hero) {
      const [px, py] = roomPt(player.fx + .5, player.fy + .82);
      const s = roomCellW(player.fy + .82) * 1.2 / 192;
      ctx.fillStyle = 'rgba(60,40,20,.18)'; ctx.beginPath(); ctx.ellipse(px, py, 60 * s, 18 * s, 0, 0, 7); ctx.fill();
      if (heroParts) heroParts.draw(ctx, px, py, player.dir, player.moving ? 1 : 0, s);
      continue;
    }
    const it = x.ghostItem || x.it, f = FURNITURE[it.type];
    const dir = it.dir || 'down', vk = dir === 'right' ? 'left' : dir;
    const view = vk !== 'down' && f.views?.[vk];
    const img = view ? roomImgs[it.type + ':' + vk] : roomImgs[it.type];
    if (!img) continue;
    const fz = fsize(it), vb = it.y + fz.h - (f.flat ? fz.h / 2 - 0.1 : 0.12);
    const [cx2, by] = roomPt(it.x + fz.w / 2, vb);
    const pw = (view ? view.sw : f.sw) * roomCellW(vb), ph = pw * img.height / img.width;
    ctx.globalAlpha = x.ghostItem ? 0.75 : 1;
    ctx.save();
    if (dir === 'right') { ctx.translate(cx2, 0); ctx.scale(-1, 1); ctx.translate(-cx2, 0); } // 右むきは 左むきの 絵を はんてん
    if (f.flat) ctx.drawImage(img, cx2 - pw / 2, by - ph / 2, pw, ph);
    else ctx.drawImage(img, cx2 - pw / 2, by - ph, pw, ph);
    ctx.restore();
    ctx.globalAlpha = 1;
    // かざりだなに バッジを ならべる
    if (f.act === 'shelf' && !x.ghostItem) drawShelfBadges(cx2 - pw / 2, by - ph, pw, ph);
  }
  // しらべられる かぐの 名前
  const hint = document.getElementById('hint');
  const fc = !roomEdit && !player.moving && !modalOpen && roomFacing();
  if (fc) { hint.textContent = `${FURNITURE[fc.type].name}を しらべる`; hint.classList.add('show'); } else hint.classList.remove('show');
}
let shelfCache = { at: 0, imgs: [] };
function drawShelfBadges(x, y, w, h2) {
  if (performance.now() - shelfCache.at > 3000) {
    shelfCache.at = performance.now();
    store.get(`${book.id}/collection`, []).then((list) => {
      shelfCache.imgs = (list || []).slice(-9).map((c) => { const im = new Image(); im.src = new URL(c.img || '', new URL('../', import.meta.url)).href; return im; });
    });
  }
  // 3だん × 3こ
  shelfCache.imgs.forEach((im, i) => {
    if (!im.complete || !im.naturalWidth) return;
    const row = Math.floor(i / 3), col = i % 3, s = w * 0.2;
    const bx = x + w * (0.22 + col * 0.28) - s / 2, by = y + h2 * (0.32 + row * 0.25) - s;
    ctx.drawImage(im, bx, by, s, s);
  });
}

// ---------------------------------------------------------------- もようがえ（へや）
function openRoomMenu() {
  openModal((m) => {
    m.className = 'modal menu2';
    const stored = Object.values(room.storage).reduce((a, b) => a + b, 0);
    m.append(h('h2', {}, '🛋 へやの もようがえ'),
      h('button', { class: 'btn', 'data-act': 'room-move', onclick: () => { closeModal(); startRoomEdit(); } }, '✋ かぐを うごかす・しまう'),
      h('button', { class: 'btn', 'data-act': 'room-put', disabled: stored ? null : '', onclick: openStorage }, `📦 しまってある かぐを おく（${stored}）`),
      h('button', { class: 'btn', 'data-act': 'room-shop', onclick: openFurnitureShop }, '🛒 かぐを かう'),
      h('button', { class: 'btn', 'data-act': 'room-wall', onclick: openWallPicker }, '🖼 かべと ゆかを かえる'),
      h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'とじる')));
  });
}
function openFurnitureShop() {
  openModal((m) => {
    m.className = 'modal build';
    m.append(h('h2', {}, '🛒 かぐを かう'), h('p', { class: 'body small' }, 'かった かぐは「しまってある かぐ」に はいるよ。'));
    const list = h('div', { class: 'blist', 'data-scroll': '1' });
    for (const [type, f] of Object.entries(FURNITURE)) {
      if (!f.cost) continue;
      const ok = affordable(f.cost);
      const chips = h('div', { class: 'chips' }, ...costParts(f.cost).map((c) =>
        h('span', { class: 'chip' + (c.have >= c.n ? '' : ' short') }, c.k === 'coin' ? '🪙' : matIcon(c.k), ` ${c.n}`)));
      list.append(h('div', { class: 'brow' + (ok ? '' : ' no') }, h('img', { src: f.src, alt: '' }),
        h('div', { class: 'binfo' }, h('div', { class: 'bname' }, f.name), chips, ok ? null : h('div', { class: 'bnote' }, 'まだ たりないよ')),
        h('button', { class: 'btn go', 'data-buy': type, disabled: ok ? null : '', onclick: () => buyFurniture(type) }, 'かう')));
    }
    m.append(list, h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'back', onclick: openRoomMenu }, 'もどる')));
  });
}
async function buyFurniture(type) {
  const f = FURNITURE[type];
  try {
    wallet = await store.update(`${book.id}/wallet`, (w) => {
      const x = structuredClone(w || { coin: 0, materials: {} }); x.materials = x.materials || {};
      for (const [k, n] of Object.entries(f.cost)) {
        const have = k === 'coin' ? (x.coin || 0) : (x.materials[k] || 0);
        if (have < n) throw new Error('たりない');
        if (k === 'coin') x.coin = have - n; else x.materials[k] = have - n;
      }
      return x;
    }, { fallback: { coin: 0, materials: {} } });
  } catch { return message('たりないよ', 'コインか そざいが たりないみたい。しまで あつめてこよう。'); }
  room.storage[type] = (room.storage[type] || 0) + 1;
  await saveRoom(); renderHud();
  openModal((m) => {
    m.append(h('h2', {}, `${f.name}を かったよ！`), h('p', { class: 'body' }, 'いますぐ へやに おく？'),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', 'data-act': 'later', onclick: closeModal }, 'あとで'),
        h('button', { class: 'btn go', 'data-act': 'place-now', 'data-default': '', onclick: () => { closeModal(); startRoomEdit({ type }); } }, 'おく')));
  });
}
function openStorage() {
  openModal((m) => {
    m.className = 'modal build';
    m.append(h('h2', {}, '📦 しまってある かぐ'));
    const list = h('div', { class: 'blist', 'data-scroll': '1' });
    for (const [type, n] of Object.entries(room.storage)) {
      if (!n) continue;
      const f = FURNITURE[type];
      list.append(h('div', { class: 'brow' }, h('img', { src: f.src, alt: '' }),
        h('div', { class: 'binfo' }, h('div', { class: 'bname' }, `${f.name}　×${n}`)),
        h('button', { class: 'btn go', 'data-place': type, onclick: () => { closeModal(); startRoomEdit({ type }); } }, 'おく')));
    }
    m.append(list, h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'back', onclick: openRoomMenu }, 'もどる')));
  });
}
function openWallPicker() {
  openModal((m) => {
    m.className = 'modal menu2';
    m.append(h('h2', {}, '🖼 かべと ゆか'),
      ...Object.entries(ROOM_WALLS).map(([k, w]) => h('button', { class: 'btn' + (room.wall === k ? ' on' : ''), 'data-wall': k,
        onclick: async () => { room.wall = k; await saveRoom(); closeModal(); } }, `${room.wall === k ? '✓ ' : ''}${w.name}`)),
      h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'back', onclick: openRoomMenu }, 'もどる')));
  });
}

function startRoomEdit(opt = {}) {
  pathQueue = []; pendingInteract = null; heldDir = null;
  roomEdit = { cur: [2, 2], move: null, place: opt.type ? { type: opt.type } : null };
  document.body.classList.add('editing');
  roomEditBar();
}
function endRoomEdit() {
  if (roomEdit?.move) { roomEdit.move.item.x = roomEdit.move.from[0]; roomEdit.move.item.y = roomEdit.move.from[1]; }
  roomEdit = null;
  document.body.classList.remove('editing');
  document.getElementById('editrot').hidden = true;
  document.getElementById('check').textContent = 'しらべる';
  if (!roomWalkable(player.x, player.y)) { const [dx, dy] = ROOM.door[0]; Object.assign(player, { x: dx, y: dy, fx: dx, fy: dy }); }
  saveRoom();
}
function roomEditBar() {
  const text = document.getElementById('edittext'), check = document.getElementById('check');
  const holding = roomEdit.move ? FURNITURE[roomEdit.move.item.type].name : roomEdit.place ? FURNITURE[roomEdit.place.type].name : null;
  text.textContent = holding ? `🛋 ${holding}を おく ばしょを えらんでね` : '🛋 うごかしたい かぐを えらんでね';
  check.textContent = holding ? 'ここに おく' : 'えらぶ';
  const type = roomEdit.move ? roomEdit.move.item.type : roomEdit.place?.type;
  document.getElementById('editrot').hidden = !(type && furnDirs(type).length > 1);
}
function roomGhost() {
  if (!roomEdit) return null;
  const type = roomEdit.move ? roomEdit.move.item.type : roomEdit.place?.type;
  if (!type) return null;
  const f = FURNITURE[type];
  const dir = (roomEdit.move ? roomEdit.move.dir : roomEdit.place?.dir) || 'down';
  const sz = fsize({ type, dir });
  const g = { type, dir, x: roomEdit.cur[0], y: roomEdit.cur[1], w: sz.w, h: sz.h, flat: !!f.flat };
  g.ok = !roomPlaceProblem(g);
  return g;
}
function roomPlaceProblem(g) {
  const others = room.items.filter((it) => !(roomEdit?.move && it === roomEdit.move.item));
  for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) {
    if (!inRoom(x, y)) return 'へやから はみだすよ';
    if (!g.flat && isDoor(x, y)) return 'でいりぐちには おけないよ';
    const hit = roomItemsAt(x, y, others).find((it) => !!FURNITURE[it.type].flat === g.flat);
    if (hit) return `${FURNITURE[hit.type].name}と かさなるよ`;
    if (!g.flat && x === player.x && y === player.y) return 'じぶんの いる ところには おけないよ';
  }
  if (g.flat) return null;
  // でいりぐちから、しらべる かぐと 主人公の ところへ いけるか
  const items = [...others, { type: g.type, x: g.x, y: g.y, dir: g.dir }];
  const solid = (x, y) => roomItemsAt(x, y, items).some((it) => !FURNITURE[it.type].flat);
  const seen = new Set(), q = [];
  for (const [x, y] of ROOM.door) if (!solid(x, y)) { seen.add(`${x},${y}`); q.push([x, y]); }
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (inRoom(nx, ny) && !seen.has(k) && !solid(nx, ny)) { seen.add(k); q.push([nx, ny]); }
    }
  }
  if (!seen.has(`${player.x},${player.y}`)) return 'そこに おくと、でぐちへ いけなく なるよ';
  for (const it of items) {
    if (!FURNITURE[it.type].act) continue;
    const f = fsize(it); let ok = false;
    for (let y = it.y - 1; y <= it.y + f.h && !ok; y++) for (let x = it.x - 1; x <= it.x + f.w && !ok; x++) if (seen.has(`${x},${y}`)) ok = true;
    if (!ok) return `そこに おくと、${FURNITURE[it.type].name}に いけなく なるよ`;
  }
  return null;
}
let roomFlash = null;
function roomEditSelect() {
  const g = roomGhost();
  if (g) {
    const why = roomPlaceProblem(g);
    if (why) { flashEdit(why); return; }
    if (roomEdit.move) { Object.assign(roomEdit.move.item, { x: g.x, y: g.y, dir: g.dir }); roomEdit.move = null; }
    else { room.items.push({ id: 'r' + Date.now().toString(36), type: g.type, x: g.x, y: g.y, dir: g.dir }); room.storage[g.type] = Math.max(0, (room.storage[g.type] || 1) - 1); roomEdit.place = null; }
    saveRoom(); roomEditBar();
    return;
  }
  const it = roomItemAt(roomEdit.cur[0], roomEdit.cur[1]);
  if (!it) return;
  const f = FURNITURE[it.type];
  openModal((m) => {
    m.className = 'modal menu2';
    m.append(h('h2', {}, f.name),
      h('button', { class: 'btn', 'data-act': 'move', 'data-default': '', onclick: () => { closeModal(); roomEdit.move = { item: it, from: [it.x, it.y], dir: it.dir || 'down' }; roomEdit.cur = [it.x, it.y]; roomEditBar(); } }, '✋ うごかす'),
      furnDirs(it.type).length > 1 ? h('button', { class: 'btn', 'data-act': 'rotate', onclick: () => {
        closeModal();
        roomEdit.move = { item: it, from: [it.x, it.y], dir: nextDir(it.type, it.dir) }; roomEdit.cur = [it.x, it.y];
        const why = roomPlaceProblem(roomGhost());
        if (why) { roomEdit.move = null; flashEdit(why.replace('そこに おくと', 'まわすと')); roomEditBar(); return; }
        roomEditSelect();
      } }, '🔄 まわす') : null,
      f.act === 'desk' || f.act === 'shelf' ? h('p', { class: 'body small' }, 'この かぐは だいじなので しまえないよ。') :
        h('button', { class: 'btn', 'data-act': 'store', onclick: () => { closeModal(); room.items = room.items.filter((x) => x !== it); room.storage[it.type] = (room.storage[it.type] || 0) + 1; saveRoom(); } }, '📦 しまう'),
      h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'やめる')));
  });
}
function roomEditKey(e) {
  const k = e.key;
  const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }[k];
  if (k === 'Escape') {
    e.preventDefault();
    if (roomEdit.move) { roomEdit.move.item.x = roomEdit.move.from[0]; roomEdit.move.item.y = roomEdit.move.from[1]; roomEdit.move = null; roomEditBar(); }
    else if (roomEdit.place) { roomEdit.place = null; roomEditBar(); }
    else endRoomEdit();
    return;
  }
  if (d) {
    e.preventDefault();
    const c = [Math.max(0, Math.min(ROOM.cols - 1, roomEdit.cur[0] + d[0])), Math.max(0, Math.min(ROOM.rows - 1, roomEdit.cur[1] + d[1]))];
    roomEdit.cur = c;
    return;
  }
  if ((k === 'r' || k === 'R') && !e.repeat) { e.preventDefault(); rotateHeld(); return; }
  if ((k === 'Enter' || k === ' ') && !e.repeat) { e.preventDefault(); roomEditSelect(); }
}
// もっている かぐを まわす（Rキー・「まわす」ボタン）
function rotateHeld() {
  const h2 = roomEdit?.move || roomEdit?.place;
  if (!h2) return;
  const type = roomEdit.move ? roomEdit.move.item.type : roomEdit.place.type;
  h2.dir = nextDir(type, h2.dir);
  // はみだすなら 左上へ よせる
  const sz = fsize({ type, dir: h2.dir });
  roomEdit.cur = [Math.min(roomEdit.cur[0], ROOM.cols - sz.w), Math.min(roomEdit.cur[1], ROOM.rows - sz.h)];
  roomEditBar();
}

// ------------------------------------------------------------------ 自分の家（へやの なかが できるまでの 入口）・かざりだな・まなびの きろく
function openHouseMenu() {
  openModal((m) => {
    m.className = 'modal menu2';
    m.append(h('h2', {}, '🏠 じぶんの いえ'),
      h('p', { class: 'body small' }, `${book.name}さんの いえだよ。へやの なかは じゅんびちゅう。`),
      h('button', { class: 'btn', 'data-act': 'shelf', onclick: openShelf }, '🏆 かざりだな'),
      h('button', { class: 'btn', 'data-act': 'desk', onclick: openDesk }, '📚 まなびの きろく'),
      h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'とじる')));
  });
}

const SUBJECT_ORDER = ['math', 'kokugo', 'rika', 'shakai', 'eigo'];
const subjectName = (s) => SUBJECT_LABELS[s] || s;
const subjectIcon = (s) => (ISLANDS.find((i) => i.subject === s && i.id !== 'test') || {}).icon || '📘';

async function openShelf() {
  const list = (await store.get(`${book.id}/collection`, [])) || [];
  openModal((m) => {
    m.className = 'modal build shelf';
    m.append(h('h2', {}, '🏆 かざりだな'));
    if (!list.length) {
      m.append(h('p', { class: 'body' }, 'まだ なにも ないよ。\nしまで がんばると、バッジや トロフィーが ここに ならぶよ。'));
    } else {
      const box = h('div', { class: 'shelf-box', 'data-scroll': '1' });
      for (const s of [...SUBJECT_ORDER, ...new Set(list.map((x) => x.subject))].filter((v, i, a) => a.indexOf(v) === i)) {
        const items = list.filter((x) => x.subject === s);
        if (!items.length) continue;
        box.append(h('div', { class: 'xlabel' }, `${subjectIcon(s)} ${subjectName(s)}（${items.length}）`),
          h('div', { class: 'shelf-row' }, ...items.map((x) => h('figure', { class: 'shelf-item' + (x.kind === 'trophy' ? ' trophy' : ''), title: x.name },
            x.img ? h('img', { src: new URL(x.img, new URL('../', import.meta.url)).href, alt: '', onerror: (e) => { e.target.replaceWith(h('span', { class: 'shelf-ph' }, x.kind === 'trophy' ? '🏆' : '🏅')); } })
              : h('span', { class: 'shelf-ph' }, x.kind === 'trophy' ? '🏆' : '🏅'),
            h('figcaption', {}, x.name)))));
      }
      m.append(box);
    }
    m.append(h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', 'data-default': '', onclick: closeModal }, 'とじる')));
  });
}

async function learningSummary() {
  const keys = await store.list(`${book.id}/learning/`);
  const sessions = [];
  for (const k of keys) { const L = await store.get(k); if (L && Array.isArray(L.sessions)) sessions.push(...L.sessions); }
  const pkeys = await store.list(`${book.id}/progress/`);
  const units = [];
  for (const k of pkeys) { const m = await store.get(k, {}); for (const [id, u] of Object.entries(m || {})) units.push({ id, ...u }); }
  const day = (iso) => { const d = new Date(iso); return isNaN(d) ? null : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const days = new Set(sessions.map((x) => day(x.at)).filter(Boolean));
  const weekAgo = Date.now() - 7 * 86400000;
  const weekDays = new Set(sessions.filter((x) => new Date(x.at) >= weekAgo).map((x) => day(x.at)).filter(Boolean));
  const bySub = {};
  const sub = (s) => (bySub[s] = bySub[s] || { minutes: 0, sessions: 0, star1: 0, star2: 0, units: [] });
  for (const x of sessions) { const b = sub(x.subject || 'math'); b.sessions++; b.minutes += Number(x.minutes) || 0; }
  for (const u of units) { const b = sub(u.subject || 'math'); if (u.star >= 1) b.star1++; if (u.star >= 2) b.star2++; b.units.push(u); }
  for (const b of Object.values(bySub)) b.units.sort((a, c) => String(c.at).localeCompare(String(a.at)));
  return { days: days.size, weekDays: weekDays.size, bySub };
}

async function openDesk() {
  const L = await learningSummary();
  openModal((m) => {
    m.className = 'modal build desk';
    m.append(h('h2', {}, '📚 まなびの きろく'),
      h('p', { class: 'body' }, L.days ? `これまでに ${L.days}にち がくしゅうしたよ。この 1しゅうかんでは ${L.weekDays}にち。` : 'まだ きろくが ないよ。しまで がくしゅうすると ここに のこるよ。'));
    const box = h('div', { class: 'desk-box', 'data-scroll': '1' });
    const subs = [...SUBJECT_ORDER, ...Object.keys(L.bySub)].filter((v, i, a) => a.indexOf(v) === i && L.bySub[v]);
    for (const s of subs) {
      const b = L.bySub[s];
      box.append(h('div', { class: 'desk-card' },
        h('h3', {}, `${subjectIcon(s)} ${subjectName(s)}`),
        h('p', { class: 'desk-stars' }, `☆ クリア ${b.star1}　★ ていちゃく ${b.star2}`),
        h('p', { class: 'body small' }, `${b.sessions}かい・${b.minutes}ぷん とりくんだよ`),
        b.units.length ? h('ul', { class: 'desk-units' }, ...b.units.slice(0, 3).map((u) => h('li', {}, `${u.star >= 2 ? '★' : u.star >= 1 ? '☆' : '・'} ${u.name}`))) : null));
    }
    if (subs.length) m.append(box);
    m.append(h('p', { class: 'body small' }, '★は、☆に なったあと べつの日に もういちど できた しるしだよ。じぶんの ペースで ふやしていこう。'),
      h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', 'data-default': '', onclick: closeModal }, 'とじる')));
  });
}

// ------------------------------------------------------------------ やることボード（自分の家の前。自分だけの やること。先生には 送らない）
const TODO_MAX = 10;
const TODO_PRESETS = [['📚', 'しゅくだい'], ['✏️', 'れんしゅう'], ['🎒', 'もちもの'], ['🧹', 'おてつだい']];
const todayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
// いつまで：'YYYY-MM-DD'（日づけの文字）か null（いつでも）
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
function dueDiff(due) { // きょうから 何日あとか（すぎていれば マイナス）
  if (!due) return null;
  const [y, m, d] = due.split('-').map(Number), t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - t) / 86400000);
}
function dueLabel(due) {
  const n = dueDiff(due);
  if (n === null) return { text: 'いつでも', cls: 'due-any' };
  if (n < 0) return { text: 'すぎたよ', cls: 'due-late' };
  if (n === 0) return { text: 'きょうまで', cls: 'due-today' };
  if (n === 1) return { text: 'あしたまで', cls: 'due-soon' };
  const [, m, d] = due.split('-').map(Number);
  return { text: `${m}/${d}まで`, cls: 'due-later' };
}
function todoSort(items) { // まだの ものを いつまでの はやい じゅんに、いつでもは そのあと、おわった ものは さいご
  const key = (it) => [it.done ? 1 : 0, it.due ? 0 : 1, it.due || '', it.at || 0];
  return [...items].sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; });
}
async function loadTodo() {
  // おわった ものは、つぎの日に 片づける（さいた はなは のこる）
  return store.update(`${book.id}/todo`, (t) => {
    t = t || { items: [], flowers: 0 };
    const today = todayKey();
    t.items = (t.items || []).filter((it) => !(it.done && it.doneOn !== today));
    return t;
  }, { fallback: null });
}
function openTodo() {
  let mode = 'list'; // 'list' | 'write' | 'due'
  let pending = null; // いつまでを えらんでいる やること（新しい ものは {icon,text}、すでに ある ものは {id}）
  openModal(async (m) => {
    m.className = 'modal build todo';
    let t = await loadTodo();
    const save = async (fn) => { t = await store.update(`${book.id}/todo`, (x) => { x = x || { items: [], flowers: 0 }; fn(x); return x; }, { fallback: null }); paint(); };
    const askDue = (p) => { pending = p; mode = 'due'; paint(); };
    const setDue = (due) => {
      const p = pending; pending = null; mode = 'list';
      if (p.id) return save((x) => { const y = x.items.find((z) => z.id === p.id); if (y) y.due = due; });
      return save((x) => {
        if (x.items.length >= TODO_MAX) return;
        x.items.push({ id: Math.random().toString(36).slice(2, 9), icon: p.icon, text: String(p.text).slice(0, 20), due, done: false, at: Date.now() });
      });
    };
    const head = () => [h('div', { class: 'row', style: 'justify-content:space-between;align-items:center' }, h('h2', {}, '📝 やることボード'), h('button', { class: 'btn' + (missionReady() ? ' go' : ''), 'data-act': 'missions', onclick: () => { closeModal(); openMissions(); } }, missionReady() ? '👑 ミッション 🎁' : '👑 ミッション')),
      h('p', { class: 'body small' }, `${book.name}さんの やること。ここに かいたことは、この たんまつの なかだけに のこるよ。`)];
    const paint = () => {
      const today = todayKey();
      if (mode === 'write') {
        const inp = h('input', { class: 'todo-input', type: 'text', maxlength: '20', placeholder: 'やることを かいてね（20もじまで）', 'aria-label': 'やること' });
        const ok = () => { const v = inp.value.trim(); if (v) askDue({ icon: '⭐', text: v }); };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ok(); } });
        m.replaceChildren(...head(), inp, h('div', { class: 'row end' },
          h('button', { class: 'btn', 'data-act': 'back', onclick: () => { mode = 'list'; paint(); } }, 'もどる'),
          h('button', { class: 'btn go', 'data-act': 'write-ok', onclick: ok }, 'つぎへ')));
        requestAnimationFrame(() => inp.focus());
        return;
      }
      if (mode === 'due') {
        const name = pending.id ? (t.items.find((z) => z.id === pending.id) || {}).text : pending.text;
        const pick = h('input', { class: 'todo-input todo-date', type: 'date', min: dayOffset(0), 'aria-label': 'ひにちを えらぶ' });
        pick.addEventListener('change', () => { if (pick.value) setDue(pick.value); });
        m.replaceChildren(...head(), h('h3', { class: 'todo-ask' }, `「${name}」は いつまで？`),
          h('div', { class: 'hopts' },
            h('button', { class: 'btn xmat', 'data-due': 'today', onclick: () => setDue(dayOffset(0)) }, '🔴 きょう'),
            h('button', { class: 'btn xmat', 'data-due': 'tomorrow', onclick: () => setDue(dayOffset(1)) }, '🟠 あした'),
            h('button', { class: 'btn xmat', 'data-due': 'any', onclick: () => setDue(null) }, '⚪ いつでも')),
          h('div', { class: 'xlabel' }, 'ひにちを えらぶ'), pick,
          h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'back', onclick: () => { pending = null; mode = 'list'; paint(); } }, 'もどる')));
        return;
      }
      const doneToday = t.items.filter((it) => it.done && it.doneOn === today).length;
      const list = h('div', { class: 'todo-list', 'data-scroll': '1' });
      if (!t.items.length) list.append(h('p', { class: 'body small' }, 'まだ なにも ないよ。したの ボタンで いれてみよう。'));
      for (const it of todoSort(t.items)) {
        const dl = dueLabel(it.due);
        list.append(h('div', { class: 'todo-row' + (it.done ? ' done' : '') },
          h('button', { class: 'btn todo-check', 'data-todo': it.id, 'aria-label': (it.done ? 'おわった：' : 'まだ：') + it.text, onclick: () => save((x) => {
            const y = x.items.find((z) => z.id === it.id); if (!y) return;
            y.done = !y.done; y.doneOn = y.done ? todayKey() : null;
            x.flowers = Math.max(0, (x.flowers || 0) + (y.done ? 1 : -1));
          }) }, it.done ? '✅' : '⬜'),
          h('span', { class: 'todo-text' }, `${it.icon || ''} ${it.text}`),
          it.done ? null : h('button', { class: 'btn todo-due ' + dl.cls, 'data-duefor': it.id, 'aria-label': `いつまで：${dl.text}（かえる）`, onclick: () => askDue({ id: it.id }) }, dl.text),
          h('button', { class: 'btn todo-del', 'data-del': it.id, 'aria-label': 'けす：' + it.text, onclick: () => save((x) => { x.items = x.items.filter((z) => z.id !== it.id); }) }, '🗑')));
      }
      const full = t.items.length >= TODO_MAX;
      const presets = h('div', { class: 'hopts' }, ...TODO_PRESETS.map(([ic, tx]) =>
        h('button', { class: 'btn xmat', 'data-preset': tx, disabled: full ? '' : null, onclick: () => askDue({ icon: ic, text: tx }) }, `${ic} ${tx}`)),
        h('button', { class: 'btn xmat', 'data-act': 'write', disabled: full ? '' : null, onclick: () => { mode = 'write'; paint(); } }, '✍️ じぶんで かく'));
      const garden = h('p', { class: 'body small todo-garden' },
        doneToday ? `きょう おわった こと：${doneToday}　${'🌸'.repeat(Math.min(doneToday, 10))}` : 'おわったら ⬜ を おしてね。はなが さくよ。',
        h('br'), `これまでに さいた はな：🌷 ${t.flowers || 0}`);
      m.replaceChildren(...head(), list, garden, h('div', { class: 'xlabel' }, full ? `いっぱいだよ（${TODO_MAX}こ まで）` : 'やることを いれる'), presets,
        h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'とじる')));
    };
    paint();
  });
}

// ------------------------------------------------------------------ きせかえや（服・髪型・アクセサリーを かう・きる）
let wardrobe = { owned: [] }; // `${book.id}/wardrobe`。'outfit:id' の 形で もっている ものを ならべる
const PARTS = { outfit: OUTFITS, hair: HAIRS, accessory: ACCESSORIES };
const FIRST_OUTFITS = ['casual-c', 'basic-d', 'dress-e']; // はじめに えらべる 服
const partCost = (kind, id) => WARDROBE_PRICES[`${kind}:${id}`] || WARDROBE_COST[kind];
const isFreePart = (kind, id) => kind === 'hair' || id === DEFAULTS[kind] || WARDROBE_FREE.includes(`${kind}:${id}`); // 髪型と はじめの服は ただ（仕様書 10-5）
const ownsPart = (kind, id) => isFreePart(kind, id) || wardrobe.owned.includes(`${kind}:${id}`);
const todayMd = () => { const d = new Date(); return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${todayMd()}`; };
const inSeason = ([a, b]) => { const t = todayMd(); return a <= b ? (t >= a && t <= b) : (t >= a || t <= b); };
// 店に 見せるか：もっていれば いつでも。景品は 見せない。ならぶ日の まえ・期間の そとは 見せない
function partVisible(kind, id) {
  const k = `${kind}:${id}`;
  if (wardrobe.owned.includes(k) || WARDROBE_FREE.includes(k) || id === DEFAULTS[kind]) return true;
  if (WARDROBE_REWARD[k]) return false;
  if (WARDROBE_RELEASE[k] && todayYmd() < WARDROBE_RELEASE[k]) return false;
  if (WARDROBE_SEASON[k] && !inSeason(WARDROBE_SEASON[k])) return false;
  return true;
}
// 期間限定の のこり日数（さいごの 7日だけ 見せる）
function seasonLeft(kind, id) {
  const p = WARDROBE_SEASON[`${kind}:${id}`]; if (!p || !inSeason(p)) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const [m, d] = p[1].split('-').map(Number);
  let end = new Date(now.getFullYear(), m - 1, d); if (end < now) end = new Date(now.getFullYear() + 1, m - 1, d);
  const left = Math.round((end - now) / 864e5) + 1; return left <= 7 ? left : null;
}
const isNewPart = (kind, id) => { const r = WARDROBE_RELEASE[`${kind}:${id}`]; return !!r && (Date.now() - new Date(r + 'T00:00:00')) < 7 * 864e5; };
const costText = (c) => Object.entries(c).map(([k, n]) => k === 'coin' ? `🪙${n}` : `${SUBJECT_LABELS[k] || k}の そざい ${n}`).join('　');
async function loadWardrobe() {
  const w = await store.get(`${book.id}/wardrobe`);
  wardrobe = { owned: Array.isArray(w?.owned) ? w.owned : [] };
}
async function wearParts(patch) {
  const next = { ...(profile?.hero || {}), ...patch };
  profile = { ...(profile || {}), hero: next };
  await store.update(`${book.id}/profile`, (p) => ({ ...(p || {}), hero: next }), { fallback: {} });
  loadHero(); // 島の 絵の 主人公は うしろで かきなおす（またない）
}
function openKisekae(state) {
  const worn = resolveHero(profile?.hero || {});
  const st = state || { kind: Object.keys(OUTFITS).length ? 'outfit' : 'hair', pick: null };
  const tryHero = { ...worn };
  if (st.pick) tryHero[st.kind] = st.pick.id;
  openModal((m) => {
    m.className = 'modal build hero-ed kisekae';
    const cv = h('canvas', { class: 'hero-pv', width: '384', height: '200', 'aria-label': 'きてみた みほん' });
    const tabs = h('div', { class: 'hopts tabs' }, ...WARDROBE_KINDS.map((k) =>
      h('button', { class: 'btn xmat' + (st.kind === k.kind ? ' on' : ''), 'data-tab': k.kind, onclick: () => openKisekae({ kind: k.kind, pick: null }) }, k.label)));
    const list = h('div', { class: 'hopts wlist', 'data-scroll': '1' });
    const items = Object.entries(PARTS[st.kind]).filter(([id]) => partVisible(st.kind, id) || worn[st.kind] === id);
    if (st.kind === 'accessory') {
      list.append(h('button', { class: 'btn xmat' + ((st.pick ? st.pick.id : worn[st.kind]) == null ? ' on' : ''), 'data-part': 'none',
        onclick: async () => { await wearParts({ accessory: null }); openKisekae({ kind: st.kind, pick: null }); } }, 'つけない'));
    }
    for (const [id, x] of items) {
      const on = (st.pick ? st.pick.id : worn[st.kind]) === id;
      // もっている ものは おすと すぐ きがえる。もっていない ものは みほんで きてみて「かう」
      const tap = ownsPart(st.kind, id) ? () => { if (worn[st.kind] !== id) { profile = { ...(profile || {}), hero: { ...(profile?.hero || {}), [st.kind]: id } }; wearParts({ [st.kind]: id }).catch((e) => logErr('wear ' + (e?.message || e))); } try { openKisekae({ kind: st.kind, pick: null }); } catch (e) { logErr('kisekae ' + (e?.stack || e)); throw e; } } : () => openKisekae({ kind: st.kind, pick: { id } });
      list.append(h('button', { class: 'btn xmat' + (on ? ' on' : ''), 'data-part': id, onclick: tap },
        (isNewPart(st.kind, id) && !ownsPart(st.kind, id) ? '🆕 ' : '') + x.name + (WARDROBE_SEASON[`${st.kind}:${id}`] && !ownsPart(st.kind, id) ? (seasonLeft(st.kind, id) ? `（あと ${seasonLeft(st.kind, id)}日）` : '（きかんげんてい）') : ''), h('span', { class: 'wtag' }, ownsPart(st.kind, id) ? (worn[st.kind] === id ? 'きている' : 'もっている') : costText(partCost(st.kind, id)))));
    }
    if (!items.length) list.append(h('p', { class: 'body small' }, 'あたらしい しなものは もうすぐ とどくよ。たのしみに まってね。'));
    const pick = st.pick;
    let action = null;
    if (pick && pick.id !== worn[st.kind]) {
      if (pick.id == null || ownsPart(st.kind, pick.id)) action = h('button', { class: 'btn go', 'data-act': 'wear', 'data-default': '', onclick: async () => { await wearParts({ [st.kind]: pick.id }); openKisekae({ kind: st.kind, pick: null }); } }, 'これを きる');
      else action = h('button', { class: 'btn go', 'data-act': 'buy', 'data-default': '', onclick: () => buyPart(st.kind, pick.id) }, `かう（${costText(partCost(st.kind, pick.id))}）`);
    }
    m.append(h('h2', {}, '👗 きせかえや'), cv, tabs, list,
      h('p', { class: 'body small' }, pick ? 'みほんで きてみているよ。きにいったら「かう」を おしてね。' : '「もっている」ものは、おすと すぐ きがえるよ。ねだんの ある ものは、おすと みほんで きてみられるよ。'),
      ...(items.some(([id]) => WARDROBE_SEASON[`${st.kind}:${id}`] && !ownsPart(st.kind, id)) ? [h('p', { class: 'body small' }, '「きかんげんてい」は、かえば ずっと きられるよ。かいそびれても、らいねん また ならぶよ。')] : []),
      h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'close', ...(action ? {} : { 'data-default': '' }), onclick: closeModal }, 'とじる'), action));
    const x = cv.getContext('2d');
    createHero(tryHero).then((hp) => { ['down', 'left', 'right', 'up'].forEach((d, i) => hp.draw(x, 48 + i * 96, 190, d, 0, .7)); }).catch(() => {});
  });
}
async function buyPart(kind, id) {
  const cost = partCost(kind, id);
  try {
    wallet = await store.update(`${book.id}/wallet`, (w) => {
      const x = structuredClone(w || { coin: 0, materials: {} }); x.materials = x.materials || {};
      for (const [k, n] of Object.entries(cost)) {
        const have = k === 'coin' ? (x.coin || 0) : (x.materials[k] || 0);
        if (have < n) throw new Error('たりない');
        if (k === 'coin') x.coin = have - n; else x.materials[k] = have - n;
      }
      return x;
    }, { fallback: { coin: 0, materials: {} } });
  } catch { return message('たりないよ', 'コインか そざいが たりないみたい。しまで あつめてこよう。'); }
  const key = `${kind}:${id}`;
  wardrobe = await store.update(`${book.id}/wardrobe`, (w) => {
    const owned = Array.isArray(w?.owned) ? w.owned : [];
    return { owned: owned.includes(key) ? owned : [...owned, key] };
  }, { fallback: { owned: [] } });
  await wearParts({ [kind]: id });
  renderHud();
  message('かったよ！', `「${PARTS[kind][id].name}」を きたよ。\nほかの ものに きがえるときも、きせかえやで できるよ。`);
}

// ------------------------------------------------------------------ しゅじんこうを かえる（男女・髪型・髪の色）
const skipFirstHero = () => { try { return sessionStorage.getItem('hatenaria-skip-first-hero') === '1'; } catch { return false; } }; // テスト用
// first：あたらしい 冒険の書の はじめに 1回だけ（えらばずに とじても、いまの すがたで きまる）
async function openFirstHero() {
  const hero = { ...resolveHero(profile?.hero || {}) };
  profile = { ...(profile || {}), hero };
  await store.update(`${book.id}/profile`, (p) => ({ ...(p || {}), hero: { ...hero, ...(p?.hero || {}), gender: hero.gender } }), { fallback: {} });
  openHeroEditor(true);
}
function openHeroEditor(first) {
  if (first instanceof Event) first = false;
  const cur = () => resolveHero(profile?.hero || {});
  openModal((m) => {
    m.className = 'modal build hero-ed';
    const cv = h('canvas', { class: 'hero-pv', width: '384', height: '200', 'aria-label': 'しゅじんこうの みほん' });
    const save = async (patch) => {
      const next = { ...(profile?.hero || {}), ...patch };
      if (patch.gender && !patch.hair) next.hair = null; // 性別を かえたら、その性別の はじめの 髪型に
      profile = { ...(profile || {}), hero: next };
      await store.update(`${book.id}/profile`, (p) => ({ ...(p || {}), hero: next }), { fallback: {} });
      await loadHero();
      openHeroEditor(first); // ボタンの えらばれ方を かきなおす
    };
    const h0 = cur();
    const row = (label, items) => h('div', { class: 'xrow' }, h('div', { class: 'xlabel' }, label), h('div', { class: 'hopts' }, ...items));
    const opt = (text, on, act, onclick, style) => h('button', { class: 'btn xmat' + (on ? ' on' : ''), 'data-hero': act, ...(style ? { style } : {}), onclick }, text);
    m.append(h('h2', {}, first ? '👋 はじめまして！ しゅじんこうを えらぼう' : '🧒 しゅじんこう'), cv,
      row('おとこのこ・おんなのこ', [
        opt('おとこのこ', h0.gender === 'boy', 'boy', () => save({ gender: 'boy' })),
        opt('おんなのこ', h0.gender === 'girl', 'girl', () => save({ gender: 'girl' }))]),
      row('かみがた', Object.entries(HAIRS).filter(([id]) => ownsPart('hair', id)).map(([id, x]) => opt(x.name, h0.hair === id, 'hair-' + id, () => save({ hair: id })))),
      // はじめの 1回だけは Tシャツ・ワンピースも えらべる（えらんだ 服は もっている ことに なる）
      row('ふく', [...Object.entries(OUTFITS).filter(([id]) => ownsPart('outfit', id) || (first && FIRST_OUTFITS.includes(id))).map(([id, x]) => opt(x.name, h0.outfit === id, 'outfit-' + id, async () => {
        if (!ownsPart('outfit', id)) wardrobe = await store.update(`${book.id}/wardrobe`, (w) => { const o = Array.isArray(w?.owned) ? w.owned : []; return { ...(w || {}), owned: o.includes(`outfit:${id}`) ? o : [...o, `outfit:${id}`] }; }, { fallback: { owned: [] } });
        save({ outfit: id });
      }))]),
      h('p', { class: 'body small' }, first ? 'あとから「せってい」や しまの「きせかえや」で いつでも かえられるよ。' : 'あたらしい ふくや かみがたは、しまの「きせかえや」で てに はいるよ。'),
      row('かみの いろ', Object.entries(HAIR_COLORS).map(([id, x]) => {
        const c = x.stops[2]; return opt(x.name, h0.hairColor === id, 'color-' + id, () => save({ hairColor: id }), `border-left:14px solid rgb(${c.join(',')})`);
      })),
      h('div', { class: 'row end' }, h('button', { class: first ? 'btn go' : 'btn', 'data-act': 'close', 'data-default': '', onclick: closeModal }, first ? 'これで はじめる' : 'できた')));
    // みほん：4つの むきで 立つ
    const x = cv.getContext('2d');
    const paint = () => {
      x.clearRect(0, 0, cv.width, cv.height);
      if (!heroParts) return;
      ['down', 'left', 'right', 'up'].forEach((d, i) => heroParts.draw(x, 48 + i * 96, 190, d, 0, .7));
    };
    paint();
  });
}

// ------------------------------------------------------------------ 島めぐり（気球）
function islandOpen(is) {
  if (!is.ready) return false;
  const closed = cls?.settings?.closedIslands || [];
  return !closed.includes(is.id);
}

function openIslands(prefer) {
  let idx = Math.max(0, ISLANDS.findIndex(islandOpen));
  if (typeof prefer === 'string') { // しゅくだいから：その教科の しま（ためしの しまは のぞく）
    const j = ISLANDS.findIndex((is) => is.id !== 'test' && (is.id === prefer || is.subject === prefer) && islandOpen(is));
    if (j >= 0) idx = j;
  }
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
        h('div', { class: 'sub' }, open ? `${MATERIALS[is.subject]?.icon || ''} ${MATERIALS[is.subject]?.name || ''}：${mat}こ` : 'まだ いけないよ（じゅんびちゅう）'));
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
  // 島へ行く前に クラス設定を 読み直す（先生が 単元を 開けた すぐあとでも 島に とどくように）。待つのは 最大3秒（2026-11-19）
  const fresh = cls && !PREVIEW ? Promise.race([classroom.refresh(book.id, { force: true }).then((c) => { if (c) cls = c; }).catch(() => {}),
    new Promise((r) => setTimeout(r, 3000))]) : null;
  await Promise.all([fresh, new Promise((r) => setTimeout(r, 900))]);
  setTimeout(() => {
    if (PREVIEW) { layer.querySelector('.lift')?.classList.remove('lift'); closeModal(); message(`${is.name}へ`, 'ほんばんでは ここで しまへ いくよ。\n（アーティファクトの しさくばん なので、ここで とまります）'); return; }
    location.href = new URL(is.url, location.href).href;
  }, 0);
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
    if (d > 0) parts.push(`${MATERIALS[s]?.icon || ''} ${MATERIALS[s]?.name || s} +${d}`);
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
        h('button', { class: 'btn', 'data-act': 'hero', onclick: openHeroEditor }, '🧒 しゅじんこうを かえる'),
        h('button', { class: 'btn', 'data-act': 'furigana', onclick: async () => {
          const on = !(settings?.furigana !== false);
          settings = await store.update(`${book.id}/settings`, (st) => ({ ...(st || {}), furigana: on }), { fallback: {} }) || { ...(settings || {}), furigana: on };
          closeModal(); openSettings();
        } }, `ふりがな：${settings?.furigana !== false ? 'つける' : 'ならった かんじには つけない'}（かえる）`),
        h('button', { class: 'btn', 'data-act': 'autodoor', onclick: async () => {
          const on = !settings?.autoDoor;
          settings = await store.update(`${book.id}/settings`, (st) => ({ ...(st || {}), autoDoor: on }), { fallback: {} }) || { ...(settings || {}), autoDoor: on };
          closeModal(); openSettings();
        } }, `いえに はいる：${settings?.autoDoor ? 'とびらに ふれたら はいる' : 'しらべて はいる'}（かえる）`),
        h('button', { class: 'btn', 'data-act': 'class', onclick: openClassInfo }, cls ? `クラス：${cls.className || cls.code}（${cls.number}ばん）` : 'クラス：はいっていない'),
        h('button', { class: 'btn', 'data-act': 'grade', onclick: () => openGrade(false) }, profile?.grade ? `がくねん：${profile.grade}ねんせい（かえる）` : 'がくねんを えらぶ'),
        h('button', { class: 'btn', 'data-act': 'switch', onclick: async () => { closeModal(); await showPicker({ mode: 'manage' }); location.reload(); } }, 'ぼうけんの しょを かえる・つくる'),
        PREVIEW ? null : h('button', { class: 'btn', 'data-act': 'backup', onclick: backup }, 'バックアップを ほぞん（せんせい・おうちの ひと よう）')),
      ...(errLog.length ? [h('p', { class: 'small errlog', style: 'color:#b44;word-break:break-all;user-select:text;white-space:pre-line;text-align:left' }, 'きろく（せんせい よう）：\n' + errLog.slice(-4).join('\n'))] : []),
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
  const wm = document.getElementById('whoami');
  if (wm) { // 画面の 下：どの クラスの しまか（v0.17.3）
    // 学年で ならった 漢字だけ つかう（年・生・子＝1年、組・用＝2年、島＝3年）
    const g = Number(cls?.settings?.grade || book.grade) || 1;
    const cname = (cls?.className || '').replace(/(\d+)\s*(?:ねん|年)\s*(\d+)\s*(?:くみ|組)/, (m, a, b) => `${a}年${b}${g >= 2 || cls?.teacher ? '組' : 'くみ'}`).replace(/(\d+)\s*ねん/, '$1年');
    if (cls?.teacher) wm.textContent = `🏝 ${cname || g + '年'}の島　👩‍🏫 先生の試し（成績には入りません）`;
    else {
      const isle = g >= 3 ? '島' : 'しま', kid = g >= 2 ? '子ども用' : '子ども よう';
      wm.textContent = `🏝 ${cname || g + '年生'}の ${isle}　🧒 ${kid}`;
    }
  }
  document.getElementById('who').textContent = cls?.teacher ? `👩‍🏫 先生（${(cls.className || '').replace(/(\d+)\s*ねん\s*(\d+)\s*くみ/, '$1年$2組')}）` : `📖 ${book.name}`;
  const mats = Object.entries(wallet?.materials || {}).filter(([, v]) => v > 0)
    .map(([k, v]) => `<span class="mat" title="${MATERIALS[k]?.name || k}">${matIconHtml(k)} ${v}</span>`).join('');
  document.getElementById('coins').innerHTML = `<span class="coin">🪙 ${wallet?.coin || 0}</span>${mats}`;
}

// ------------------------------------------------------------------ ガチャ「ふしぎの たまご」（v0.17.3）
const TICKET = 'gacha-ticket';
const gDay = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const tickets = () => wallet?.materials?.[TICKET] || 0;
async function addWallet(fn) { wallet = await store.update(`${book.id}/wallet`, (w) => { w = w && typeof w === 'object' ? w : { coin: 0, materials: {} }; w.materials = w.materials || {}; fn(w); return w; }, { fallback: { coin: 0, materials: {} } }); }
// きょう 島で 学習した／しゅくだいを おえた → ガチャけん（それぞれ 1日 1まい）。ホームを ひらくたびに たしかめる
async function grantDailyTickets() {
  const today = gDay(); let studied = false;
  for (const k of await store.list(`${book.id}/learning/`)) {
    const L = await store.get(k); if (L && Array.isArray(L.sessions) && L.sessions.some((x) => { const d = new Date(x.at); return !isNaN(d) && gDay(d) === today; })) { studied = true; break; }
  }
  const hwDoneNow = homeworks().filter(hwDone).map((hw) => hw.id);
  const hwToday = homeworks().some((hw) => (dueDiff(hw.due) ?? -1) >= 0 && (!hw.start || (dueDiff(hw.start) ?? 0) <= 0));
  let got = []; let add = 0;
  await store.update(`${book.id}/gachaDaily`, (g) => {
    g = g && g.day === today ? g : { day: today, study: false, hw: false, hwSeen: g?.hwSeen || [] };
    if (studied && !g.study) { g.study = true; add += GACHA.daily.study; got.push('しまで がくしゅう'); }
    // しゅくだいが ない日は、ログインボーナスで 1まい（2026-11-20）
    if (!hwToday && !g.hw) { g.hw = true; add += GACHA.daily.homework; got.push('きょうの ログイン'); }
    const fresh = hwDoneNow.filter((id) => !g.hwSeen.includes(id));
    if (fresh.length) { g.hwSeen = [...g.hwSeen, ...fresh].slice(-200); if (!g.hw) { g.hw = true; add += GACHA.daily.homework; got.push('しゅくだいを おえた'); } }
    return g;
  }, { fallback: null });
  if (add) { await addWallet((w) => { w.materials[TICKET] = (w.materials[TICKET] || 0) + add; }); renderHud(); }
  return got;
}
const gachaOwned = (it) => it.kind === 'outfit' ? wardrobe.owned.includes(`outfit:${it.id}`)
  : it.kind === 'furniture' ? (gachaLog.got || []).includes(`furniture:${it.id}`) : false;
let gachaLog = { pulls: 0, got: [] };
function gachaName(it) {
  if (it.kind === 'outfit') return `👕 ${OUTFITS[it.id]?.name}`;
  if (it.kind === 'accessory') return `🎀 ${ACCESSORIES[it.id]?.name}`;
  if (it.kind === 'furniture') return `🛋️ ${FURNITURE[it.id]?.name}`;
  if (it.kind === 'material') return `${MATERIALS[it.id]?.icon || ''} ${MATERIALS[it.id]?.name} ×${it.count}`;
  return `🪙 ${it.coin}`;
}
function rollGacha() {
  let r = Math.random() * 100, rank = GACHA.ranks[GACHA.ranks.length - 1];
  for (const x of GACHA.ranks) { if (r < x.rate) { rank = x; break; } r -= x.rate; }
  const pool = GACHA.pool[rank.id];
  let it = { ...pool[Math.floor(Math.random() * pool.length)] };
  if (it.kind === 'shop') { // 店の アクセサリーで まだ もっていない もの（なければ コイン）
    const cand = Object.keys(ACCESSORIES).filter((id) => !ownsPart('accessory', id) && partVisible('accessory', id) && !WARDROBE_SEASON[`accessory:${id}`]);
    it = cand.length ? { kind: 'accessory', id: cand[Math.floor(Math.random() * cand.length)] } : { kind: 'coin', min: 20, max: 50 };
  }
  if (it.kind === 'coin') it = { kind: 'coin', coin: Math.round((it.min + Math.random() * (it.max - it.min)) / 5) * 5 };
  return { rank, it };
}
async function pullGacha() {
  if (tickets() < 1) return null;
  const { rank, it } = rollGacha();
  const dup = gachaOwned(it);
  await addWallet((w) => {
    w.materials[TICKET] = Math.max(0, (w.materials[TICKET] || 0) - 1);
    if (dup) w.coin = (w.coin || 0) + (rank.dup || 0);
    else if (it.kind === 'coin') w.coin = (w.coin || 0) + it.coin;
    else if (it.kind === 'material') w.materials[it.id] = (w.materials[it.id] || 0) + it.count;
  });
  if (!dup && (it.kind === 'outfit' || it.kind === 'accessory')) await grantParts([`${it.kind}:${it.id}`]);
  if (!dup && it.kind === 'furniture') { if (!room) await loadRoom(); room.storage[it.id] = (room.storage[it.id] || 0) + 1; await saveRoom(); }
  gachaLog = await store.update(`${book.id}/gacha`, (g) => {
    g = g || { pulls: 0, got: [] }; g.pulls++;
    if (it.kind !== 'coin' && it.kind !== 'material' && !g.got.includes(`${it.kind}:${it.id}`)) g.got.push(`${it.kind}:${it.id}`);
    return g;
  }, { fallback: { pulls: 0, got: [] } });
  renderHud();
  return { rank, it, dup };
}
async function grantParts(keys) {
  wardrobe = await store.update(`${book.id}/wardrobe`, (w) => { const o = Array.isArray(w?.owned) ? w.owned : []; return { ...(w || {}), owned: [...o, ...keys.filter((k) => !o.includes(k))] }; }, { fallback: { owned: [] } });
}
const gachaImg = (n) => new URL(`../assets/gacha/${n}.webp?v=${HOME_VERSION}`, import.meta.url).href;
async function openGacha(view) {
  gachaLog = (await store.get(`${book.id}/gacha`)) || { pulls: 0, got: [] };
  wallet = await store.get(`${book.id}/wallet`, { coin: 0, materials: {} }); renderHud();
  const got = await grantDailyTickets();
  openModal((m) => {
    m.className = 'modal build gacha';
    m.append(h('h2', {}, '🥚 ふしぎの たまごや'));
    if (view === 'dex') {
      m.append(h('p', { class: 'body small' }, 'でる ものと でる わりあい（100かい ひくと だいたい この かず）'));
      for (const r of GACHA.ranks) {
        const list = r.id === 'normal' ? ['🪙 20〜50', `${MATERIALS['fushigi-kakera'].icon} ${MATERIALS['fushigi-kakera'].name}`, '🎀 おみせの アクセサリー（もっていない もの）']
          : GACHA.pool[r.id].map((it) => (gachaOwned(it) ? '✅ ' : '❔ ') + gachaName(it));
        m.append(h('div', { class: 'gx-rank gx-' + r.id }, h('b', {}, `${r.name}　${r.rate}%`), h('div', { class: 'small gx-items' }, ...list.map((x) => h('span', {}, x))),
          r.dup ? h('div', { class: 'small' }, `もっている ものが でたら 🪙${r.dup} に かわるよ`) : ''));
      }
      m.append(h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => openGacha() }, 'もどる'), h('button', { class: 'btn', 'data-default': '', onclick: closeModal }, 'とじる')));
      return;
    }
    const egg = h('div', { class: 'gx-stage' }, h('img', { class: 'gx-egg idle', src: gachaImg('egg_normal'), alt: '' }));
    m.append(egg,
      h('p', { class: 'body' }, h('img', { class: 'micon', src: MATERIALS[TICKET].img, alt: '' }), ` ガチャけん ${tickets()}まい`),
      got.length ? h('p', { class: 'body small' }, `きょうの ごほうび：${got.join('・')}で ガチャけんを もらったよ！`) : '',
      h('p', { class: 'body small' }, 'ガチャけんは、しまで がくしゅうした日と、しゅくだいを おえた日（しゅくだいが ない日は ログインで）に 1まいずつ もらえるよ。しまの たからばこから でることも あるよ。'),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', 'data-act': 'dex', onclick: () => openGacha('dex') }, '📖 ずかん'),
        h('button', { class: 'btn', 'data-act': 'pull', 'data-default': '', disabled: tickets() < 1 ? '' : null, onclick: (e) => playGacha(m, e.currentTarget) }, '🥚 ひく'),
        h('button', { class: 'btn', 'data-act': 'close', onclick: closeModal }, 'とじる')));
  });
}
async function playGacha(m, btn) {
  m.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  const res = await pullGacha(); if (!res) return openGacha();
  const stage = m.querySelector('.gx-stage'), egg = stage.querySelector('.gx-egg');
  const eggName = `egg_${res.rank.id}`;
  egg.src = gachaImg(eggName); egg.className = 'gx-egg shake';
  await new Promise((r) => setTimeout(r, res.rank.id === 'normal' ? 900 : 1500));
  if (res.rank.id !== 'normal') stage.prepend(h('img', { class: 'gx-fx rays', src: gachaImg('fx_rays'), alt: '' }));
  stage.prepend(h('img', { class: 'gx-fx sparkle', src: gachaImg('fx_sparkle'), alt: '' }));
  egg.src = gachaImg(eggName + '_open'); egg.className = 'gx-egg open';
  await new Promise((r) => setTimeout(r, 700));
  const prize = res.dup ? `${gachaName(res.it)}\n（もう もっているので 🪙${res.rank.dup} に かわったよ）` : gachaName(res.it);
  const where = res.dup ? '' : res.it.kind === 'furniture' ? '\n「しまってある かぐ」に とどいたよ。' : (res.it.kind === 'outfit' || res.it.kind === 'accessory') ? '\nきせかえやで きられるよ。' : '';
  stage.after(h('div', { class: 'gx-prize gx-' + res.rank.id }, h('div', { class: 'small' }, res.rank.name), h('div', { class: 'gx-pname' }, prize + where)));
  m.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  const pull = m.querySelector('[data-act=pull]'); pull.textContent = tickets() > 0 ? `🥚 もういちど（のこり ${tickets()}）` : '🥚 ひく'; pull.disabled = tickets() < 1;
  pull.onclick = () => openGacha().then(() => { const b = document.querySelector('.gacha [data-act=pull]'); if (b && !b.disabled) b.click(); });
  m.querySelector('.body').textContent = '';
}

// ------------------------------------------------------------------ 操作
function bindControls() {
  const keyDir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  const down = new Set();
  window.addEventListener('keydown', (e) => {
    if (document.querySelector('.gi-picker')) return; // 冒険の書の画面が自分で受け取る
    if (modalOpen) { heldDir = null; down.clear(); modalKey(e); return; }
    if (editMode) { heldDir = null; editKey(e); return; }
    if (roomEdit) { heldDir = null; roomEditKey(e); return; }
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
      e.preventDefault();
      const ek = { key: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[b.dataset.dir], preventDefault() {} };
      if (editMode) { editKey(ek); return; }
      if (roomEdit) { roomEditKey(ek); return; }
      heldDir = b.dataset.dir; b.setPointerCapture?.(e.pointerId);
      if (!player.moving) { pathQueue = []; pendingInteract = null; tryStep(heldDir); } // 短くタップしても1マス進む
    };
    const stop = () => { if (heldDir === b.dataset.dir) heldDir = null; };
    b.addEventListener('pointerdown', start);
    b.addEventListener('pointerup', stop); b.addEventListener('pointercancel', stop); b.addEventListener('lostpointercapture', stop);
  });
  document.getElementById('check').addEventListener('click', () => (editMode ? editKey({ key: 'Enter', preventDefault() {} }) : roomEdit ? roomEditKey({ key: 'Enter', preventDefault() {} }) : doCheck()));
  document.getElementById('btn-build').addEventListener('click', openIslandMenu);
  document.getElementById('editdone').addEventListener('click', () => (roomEdit ? endRoomEdit() : endEdit()));
  document.getElementById('btn-room').addEventListener('click', openRoomMenu);
  document.getElementById('editrot').addEventListener('click', rotateHeld);
  document.getElementById('btn-out').addEventListener('click', exitRoom);
  document.getElementById('btn-balloon').addEventListener('click', openIslands);
  document.getElementById('btn-zoom').addEventListener('click', () => { zoomed = !zoomed; document.body.classList.toggle('zoomed', zoomed); resize(); });
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  // 地面や建物をタップ
  canvas.addEventListener('pointerdown', (e) => {
    if (modalOpen) return;
    if (scene === 'room') { roomTap(e); return; }
    const [cx, cy] = camera();
    const tx = Math.floor((e.clientX + cx) / T), ty = Math.floor((e.clientY + cy) / T);
    if (editMode) { editTap(tx, ty); return; }
    if (isGate(tx, ty)) { const g = gateTile(), fr = [g[0], g[1] + 1]; pathQueue = findPath(player.x, player.y, fr[0], fr[1]) || []; pendingInteract = GATE; return; }
    let o = objectAt(tx, ty);
    if (o && OBJECT_TYPES[o.type].ground) o = null; // ひろばは 地面と同じ
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
  if (o) (scene === 'room' ? roomInteract(o) : interact(o));
}

async function loadHero() {
  try { heroParts = await createHero(profile?.hero || {}); } catch { heroParts = null; }
}
let profile = null;
// エラーの きろく（⚙ に 出す。ためしに あそんだ ときの 不具合を 見つけるため）
const errLog = [];
const logErr = (m) => { errLog.push(String(m).slice(0, 200)); if (errLog.length > 10) errLog.shift(); };
window.addEventListener('error', (e) => logErr(`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => logErr(`${e.reason?.message || e.reason} ${(e.reason?.stack || '').split('\n')[1] || ''}`));
let settings = null; // 冒険の書の共通設定（ふりがな・読み上げ）
function heroGender() { return profile?.hero?.gender === 'girl' ? 'girl' : 'boy'; }

// ------------------------------------------------------------------ タイトル画面
// ブラウザを開いて最初の1回だけ出す（島から戻ったときや、同じタブで開き直したときは出さない）
const LOGO_SRC = 'assets/home/logo.webp?v=0.17.3';
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
  // 先生用ページの「先生として ホームへ」（v0.17.3）：先生の 冒険の書を つかう（なければ つくる）
  const tl = classroom.readTeacherLink();
  if (tl) {
    classroom.clearTeacherLink();
    let tb = null;
    for (const b of await books.listBooks()) { const c = await store.get(`${b.id}/class`); if (c?.teacher) { tb = b; break; } }
    if (!tb) { try { tb = await books.createBook('せんせい', tl.grade || 3); } catch { tb = null; } }
    if (tb) {
      await classroom.setTeacher(tb.id, tl);
      if (tl.grade) await books.setGrade(tb.id, tl.grade);
      await books.setCurrent(tb.id); book = await books.getCurrent(); markTitleShown();
    } else alert('ぼうけんの しょが いっぱい（3さつ）なので、先生の ぼうけんの しょを つくれませんでした。1さつ けしてから もういちど ためしてください。');
  }
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
  claimedEvents = (await store.get(`${book.id}/eventsClaimed`, [])) || [];
  await loadWardrobe();
  await refreshHomework();
  await refreshCrowns();
  const gotTickets = await grantDailyTickets();
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
  if (gotTickets.length) note(`🎟️ ガチャけんを ${gotTickets.length}まい もらったよ（${gotTickets.join('・')}）。ふしぎの たまごやで ひけるよ`);
  if (!profile?.grade && !modalOpen) openGrade(true); // 学年がない古い冒険の書
  else if (!profile?.hero?.gender && !modalOpen && !skipFirstHero()) await openFirstHero(); // まだ しゅじんこうを えらんでいない
  // 参加用リンクから来たとき
  const link = classroom.readJoinLink();
  if (link) {
    if (modalOpen) { const wait = setInterval(() => { if (!modalOpen) { clearInterval(wait); openJoin(link); } }, 300); } else openJoin(link);
  }
  // 先生の設定とお知らせを読み直し、送れていない要約を送る（待たずに うしろで）
  classroom.refresh(book.id).then((c) => { if (c) { cls = c; refreshHomework(); } });
  classroom.flush(book.id);
  // テスト用
  window.__home = { player, get home() { return home; }, get T() { return T; }, camera, version: HOME_VERSION, get editMode() { return editMode; }, expandCandidates, get scene() { return scene; }, get room() { return room; }, get roomEdit() { return roomEdit; }, enterRoom, exitRoom, roomPt, roomTileAt, walkable, openEvent, gateTile, treeTile, openKisekae, openSchool, refreshHomework, openMissions, refreshCrowns, get crownTotal() { return crownTotal; }, get hwProg() { return hwProg; }, get wardrobe() { return wardrobe; }, openGacha, pullGacha, grantDailyTickets, openExchange, openSell };
}
start();
